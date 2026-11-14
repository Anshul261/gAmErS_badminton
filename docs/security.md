# Database security

The schema lives in `supabase/migrations/`. It creates five public tables (`profiles`, `players`, `sessions`, `session_players`, `games`) with RLS and explicit client grants. Every application client uses a publishable key. Application RPCs use `SECURITY INVOKER`. Hosted Supabase may also have a `SECURITY DEFINER` event-trigger helper, `rls_auto_enable`; it is not an app RPC and client execution is revoked.

## Access model

There is one court. Every existing `authenticated` account can read and write the four court tables. `profiles` is readable by authenticated accounts, but each account may insert or update only its own row, and nobody can delete one. `anon` has no table or RPC privileges. Public registration is disabled in hosted Supabase Auth and the local configuration. The app only offers sign-in and password recovery.

The Auth configuration script also disables public registration:

```sh
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run auth:configure https://your-app.vercel.app
```

Existing users can still sign in and reset their passwords. Removing the signup button alone does not close the API; the hosted `disable_signup` setting is the registration gate. Administrative user creation remains restricted to trusted Supabase project administrators.

Every insert and update policy checks `created_by = auth.uid()`. On updates, send the current user's UUID in `created_by`, even when correcting another friend's row. This column means the author of the current revision, not a permanent owner. A JWT without a subject cannot write anything. Record IDs, session assignments, attendance identities, and creation timestamps are immutable on updates. A game correction can change the players, target, and scores, but cannot move the game to another session.

## RPC contract

| RPC | Arguments | Return |
| --- | --- | --- |
| `start_session` | `attendees uuid[] DEFAULT '{}'`, `points smallint DEFAULT 11`, `on_date date`, `at_time time`, `venue text`, `map_url text` | Session UUID |
| `player_stats` | none | Per-player wins, losses, format counts (1v1, 1v2 solo, 1v2 pair, 2v2), point totals, and Score |
| `game_values` | none | Score value of every game for every player, computed in play order |
| `session_game_values` | `sid uuid` | The same values for one session's games |

`start_session` atomically inserts the session and its attendance. Attendees may be empty (a planned session); duplicate UUIDs and null entries are rejected, and unknown players fail the foreign key and roll back the whole call. Blank place and link values are stored as null. Any number of sessions may be open at once (several courts), and a player may be on more than one.

## Leaderboard score

The current Stats tab uses `seasonPerformance()` in `src/lib/player-stats.ts`, after filtering games to the selected period. Season score is the lower bound of the Wilson interval with `z = 1.96`, multiplied by 100. Every format counts equally, without partner, opponent or margin weights. Players need 15 games to qualify. Full scores decide places, followed by win rate, games played and player ID for exact ties.

The browser computes the score from games loaded through the authenticated Data API. It does not grant access or change stored results. The older `game_values()` and `player_stats()` RPCs remain read-only, `SECURITY INVOKER`, and run under the caller's RLS, but do not determine the current leaderboard.

## Expired-token retries

`src/lib/supabase/session-fetch.ts` retries only a hosted Data API response with HTTP 401, code `PGRST303` and an expired-JWT message. It refreshes once, preserves the request body and game ID, and requires the renewed token to belong to the same user and Auth session as the rejected request. It never applies recovery to Auth endpoints or another host.

Decoded JWT claims only prevent a cross-session retry. They never authorize a request. Supabase verifies the token and applies RLS to the retry. Invalid signatures, permission denials, signed-out sessions and failed refreshes remain failures.

## Column contract

All UUID audit columns are deliberately independent of `auth.users`, so the SQL tests need no fake Auth rows.

| Table | Columns |
| --- | --- |
| `players` | `id uuid`, `display_name text`, `archived boolean`, `created_by uuid`, `created_at timestamptz` |
| `profiles` | `user_id uuid`, `display_name text`, `created_at timestamptz` |
| `sessions` | `id uuid`, `session_date date`, `start_time time`, `venue_name text`, `venue_url text`, `target_score smallint`, `ended_at timestamptz`, `created_by uuid`, `created_at timestamptz` |
| `session_players` | `session_id uuid`, `player_id uuid`, `created_by uuid`, `created_at timestamptz` |
| `games` | `id uuid`, `session_id uuid`, `target_score smallint`, `side_a_player_1 uuid`, `side_a_player_2 uuid`, `side_b_player_1 uuid`, `side_b_player_2 uuid`, `score_a smallint`, `score_b smallint`, `created_by uuid`, `created_at timestamptz` |

Only `sessions.ended_at`, `sessions.start_time`, `sessions.venue_name`, `sessions.venue_url`, `games.side_a_player_2`, and `games.side_b_player_2` are nullable. `venue_url` must start with `https://` (at most 500 characters), so a stored link can never be a `javascript:` or other non-web URL; the app renders it with `rel="noopener noreferrer"`. Profile and venue names are 1-32 and 1-80 characters and may not be blank. `created_by` defaults to `auth.uid()` and `created_at` to `now()`. Game IDs have no default: generate the UUID on the client and reuse it for retries. A repeated insert with the same ID raises `23505`, not a second game.

Player names have 1-32 characters, are unique case-insensitively across the court (including archived players), and may not be blank. Archiving hides a player from new sessions but keeps attendance and results. Every game player has a composite foreign key to that game's session attendance; no player may appear twice in a game. Session dates default to the current date in `Asia/Dubai`. Targets accept only 11 or 21. A winner must reach the target with the loser at most two behind, or exceed the target leading by exactly two.

## Closed sessions

While a session is finished, friends may correct or delete its existing games but may not insert a new game. Any friend can reopen it (set `ended_at` back to null) to log a forgotten game and then finish it again; the session's date and target can also be edited. The `guard_game_insert` trigger locks the session `FOR SHARE`, which conflicts with the row lock taken by an update of `ended_at`, so an insert and an end cannot interleave. Session and player deletions cascade to attendance and games; the app only archives players.

## Verification

```sh
npm run db:start
npm run db:test
npm run db:test:concurrency
npm run test:e2e
npm run db:stop
```

`db:test` runs `supabase/tests/security.sql` in one rolled-back transaction: RLS on all tables, no definer functions, pinned search paths, anonymous denials, author spoofing, immutable identities, score rules, duplicates, closed-session behaviour, and cascades. `db:test:concurrency` exercises both insert/end lock orderings on two connections. `test:e2e` covers existing-account login, blocked public signup, two-browser syncing, conflicting corrections and anonymous Data API denials. Fixture accounts are provisioned through the local admin API; the helper rejects hosted project URLs.

RLS protects client roles, not database owners or service-role credentials. Keep those server-only. There is no database rate limiter; Supabase Auth rate limits apply to sign-up and sign-in.
