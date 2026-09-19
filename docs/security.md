# Database security

The schema lives in `supabase/migrations/`. It creates five public tables (`profiles`, `players`, `sessions`, `session_players`, `games`) with RLS and explicit client grants. Every application client uses a publishable key. There are no `SECURITY DEFINER` functions.

## Access model

There is one court. Every `authenticated` account can read and write the four court tables; `profiles` is readable by everyone but each account may insert or update only its own row, and nobody can delete one. `anon` has no table or RPC privileges. The only gate is Supabase Auth: whoever can create an account is on the court. Keep the address private, and once your friends have accounts, close sign-ups:

```sh
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run auth:configure https://your-app.vercel.app -- --close-signups
```

You can reopen sign-ups from the Supabase dashboard (Authentication → Sign In / Providers → Allow new users to sign up) when someone new joins the crew.

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

`game_values()` walks every game in play order and prices it Elo-style: each side's strength is the average running score of its players, the expected result comes from the strength gap (`scale` = 10 points for a ~91% favourite), and each player on a side receives `2 × (result − expected)`, so an even game is worth ±1 and an upset up to ±2. In a 1v2 the pair is priced like any game; the solo player's expectation is computed as if the opponents were `solo_handicap` (2.7) points stronger, so a solo win is worth about +1.3 and a solo loss about −0.7. Margin of victory is ignored. Both knobs are constants at the top of the function. `player_stats()` sums these values into `score` and adds format counts; the client ranks by score, then win %, then points difference. The functions are read-only, `SECURITY INVOKER`, and run under the caller's RLS.

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

`db:test` runs `supabase/tests/security.sql` in one rolled-back transaction: RLS on all tables, no definer functions, pinned search paths, anonymous denials, author spoofing, immutable identities, score rules, duplicates, closed-session behaviour, and cascades. `db:test:concurrency` exercises both insert/end lock orderings on two connections. `test:e2e` covers sign-up, two-browser syncing, conflicting corrections, and the Data API from an anonymous client.

RLS protects client roles, not database owners or service-role credentials. Keep those server-only. There is no database rate limiter; Supabase Auth rate limits apply to sign-up and sign-in.
