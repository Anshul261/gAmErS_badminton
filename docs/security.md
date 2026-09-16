# Database security

The migration is `supabase/migrations/20260916162004_badminton_security.sql`. Its version matches the hosted migration history. It creates six public tables with RLS and explicit client grants. Every application client uses a publishable key.

## Access rules

`authenticated` users can read only groups they belong to and those groups' members, players, sessions, attendance, and games. Membership checks read `group_members` in the database, not editable JWT metadata. An authenticated outsider gets no rows. `anon` has no table or RPC privileges.

Members can create, edit, and delete players, sessions, attendance, and games. Only the group admin can edit or delete the group or rotate its invite. A member can remove their own membership; the admin can remove any membership. Direct membership inserts and updates have neither grants nor policies. There is no promotion API.

Every client insert and update policy checks `created_by = auth.uid()`. On updates, send the current user's UUID in `created_by`, even when correcting another member's row. This column means the author of the current revision, not a permanent owner. The original `created_at` remains unchanged. These columns are not a revision history.

Groups are the exception to changing authorship because only their original creator can ever be admin. `groups.created_by` is immutable and identifies that creator. No client can change the group's bootstrap state. Record IDs, group/session assignments, attendance identities, and creation timestamps are immutable on updates. A game correction can change the players, target, and scores, but cannot move the game to another session.

## Bootstrap and invites

`create_group` is an invoker function. It generates 32 random bytes with `extensions.gen_random_bytes`, hex-encodes them into a 64-character code, inserts the group under RLS, and calls `join_group`. It does not use `INSERT RETURNING`, which would need member-only SELECT access before the creator has joined.

The database stores only a SHA-256 hash and expiry. Codes returned by `create_group` and `rotate_invite` must not go into analytics, application logs, or another database column. Treat a code as a bearer credential that permits membership. The RPCs issue seven-day codes, and the schema rejects expiry dates later than transaction time plus seven days. An admin may expire a code early. Rotation invalidates the previous code but does not remove existing members.

The invoker RPCs need the same insert/update permissions as their callers. A creator or admin can therefore submit a hash directly instead of using the random-code RPCs. The schema checks its format and expiry, not the entropy of its preimage. Use the RPCs in the application; a deliberately weak admin-chosen code weakens that group's invite security.

`join_group` requires an authenticated UUID and a nonempty code of at most 128 characters. It compares fixed-length SHA-256 hashes, locks the matching group row, and checks expiry again after acquiring the lock. It only inserts a membership for `auth.uid()` and sets its `created_by` to that same UUID. Repeated valid joins do not create duplicate rows or modify an existing role.

The one extra group column is `admin_bootstrapped boolean NOT NULL DEFAULT false`. Clients can read it but cannot insert or update it. The first creator join consumes it and receives `admin`; every other new membership receives `member`. Leaving or deleting a membership never resets the flag. A removed creator who still has a valid code can rejoin only as a member.

There is no last-admin safety net. If the admin leaves, the group has no admin and cannot rotate invites or delete itself through the client API. Recovery requires a reviewed database operation by the project operator. A removed member can rejoin with a still-valid invite, so rotate the invite when removal must prevent re-entry.

Only these three functions are `SECURITY DEFINER`:

- `public.is_group_member(gid uuid) returns boolean` reads membership without recursively invoking the membership SELECT policy.
- `public.is_group_admin(gid uuid) returns boolean` checks the caller's role without that same policy recursion.
- `public.join_group(invite_code text) returns uuid` validates a secret invite and inserts the caller's membership despite the deliberate ban on direct membership inserts.

They use `search_path = ''` and schema-qualified references. The two boolean helpers disclose only the caller's own membership or admin status. Their owner must own the tables or have `BYPASSRLS`; the migration is intended to run as the Supabase migration owner. `group_members` policies call those helpers rather than querying themselves, avoiding recursive RLS. The functions are public-schema RPCs by design, but PUBLIC and `anon` cannot execute them. Only `authenticated` receives a client execute grant.

Supabase's security advisor reports these three authenticated definer grants as warnings. They are intentional, reviewed exceptions required by the membership design. The hosted check found no anonymous function or table grants.

All other application functions, including triggers, are `SECURITY INVOKER` with an empty search path. Trigger functions have no client execute grant. The migration revokes default PUBLIC function execution and explicit client grants before granting the allowed RPCs. It also revokes client CREATE access on `public`. The hosted project's pre-existing `rls_auto_enable` event trigger is preserved, but its client execute grants are revoked. It is a platform DDL safeguard, not an application RPC.

## RPC contract

| RPC | Arguments | Return |
| --- | --- | --- |
| `create_group` | `group_name text` | JSON object with `group_id` UUID string and `invite_code` string |
| `join_group` | `invite_code text` | Group UUID |
| `rotate_invite` | `gid uuid` | New invite code string |
| `start_session` | `gid uuid`, `attendees uuid[]`, `points smallint DEFAULT 11` | Session UUID |
| `is_group_member` | `gid uuid` | Boolean for the current user |
| `is_group_admin` | `gid uuid` | Boolean for the current user |
| `player_stats` | `gid uuid` | Per-player game, win, and point totals, under the caller's RLS |

`start_session` atomically inserts the session and its attendance. It rejects fewer than two attendees, duplicate UUIDs, and null attendee entries. Invalid players or a group without membership fail under RLS or foreign keys and roll back the whole call. A partial unique index permits only one session with `ended_at IS NULL` per group, including concurrent calls. Direct session inserts remain available under RLS and do not require two attendance rows; use the RPC for a complete start operation.

## Column contract

All UUID audit columns are deliberately independent of `auth.users`. The API supplies a verified identity through Supabase Auth; clients never choose their database role or JWT claims. The absence of an Auth foreign key also allows portable SQL tests without fake Auth rows.

| Table | Columns |
| --- | --- |
| `groups` | `id uuid`, `name text`, `created_by uuid`, `created_at timestamptz`, `invite_hash text`, `invite_expires_at timestamptz`, `admin_bootstrapped boolean` |
| `group_members` | `group_id uuid`, `user_id uuid`, `role text`, `created_by uuid`, `created_at timestamptz` |
| `players` | `id uuid`, `group_id uuid`, `display_name text`, `archived boolean`, `created_by uuid`, `created_at timestamptz` |
| `sessions` | `id uuid`, `group_id uuid`, `session_date date`, `target_score smallint`, `ended_at timestamptz`, `created_by uuid`, `created_at timestamptz` |
| `session_players` | `session_id uuid`, `group_id uuid`, `player_id uuid`, `created_by uuid`, `created_at timestamptz` |
| `games` | `id uuid`, `session_id uuid`, `target_score smallint`, `side_a_player_1 uuid`, `side_a_player_2 uuid`, `side_b_player_1 uuid`, `side_b_player_2 uuid`, `score_a smallint`, `score_b smallint`, `created_by uuid`, `created_at timestamptz` |

Only `sessions.ended_at`, `games.side_a_player_2`, and `games.side_b_player_2` are nullable. All `created_by` columns default to `auth.uid()` and all `created_at` columns default to `now()`. Clients may specify creation timestamps on insert, so do not treat them as tamper-proof event times.

Group, player, and session IDs default to random UUIDs. Game IDs have no default: generate the UUID once on the client and reuse it for retries. A repeated insert with the same ID raises `23505`, not a second game. Confirm the existing row before treating that error as a successful retry. Do not use an update-on-conflict upsert as an automatic retry, because members are allowed to correct games and it could overwrite a later correction. A retry after session closure can fail the closed-session trigger before it reaches the unique constraint; read the existing game by ID in that case.

Group names have 1-60 characters, player names 1-32, and neither may contain only spaces. Player names are unique case-insensitively within a group, including archived players. Archiving defaults to false and does not remove attendance or historical games. It does not prohibit selecting that player through the database API.

Membership has primary key `group_id, user_id`; role is `admin` or `member`. Attendance has primary key `session_id, player_id`. Composite foreign keys tie both its session and player to the same group. Every game player has a composite foreign key to that game's session attendance. No player may appear twice in a game. Each second-player column is independently nullable.

Session dates default to the current date in `Asia/Dubai`. Session and game targets default to 11 and accept only 11 or 21. A session's target is a suggested default for its games, not a foreign-key-like requirement: send each game's actual target. Scores are required, nonnegative `smallint` values with no ties. A winner must reach the target with a loser at most target minus two, or exceed the target and lead by exactly two. Scores such as 12-10 at target 11 and 40-38 at target 21 are valid. There is no 30-point cap; the storage limit is the `smallint` maximum of 32767.

## Closed sessions

Ending a session is irreversible through normal updates. Members may correct or delete its existing games, but may not insert a new game. Updating a game's UUID or session ID is forbidden, so a correction cannot move an existing row into the closed session.

The invoker `guard_game_insert` trigger reads and locks the session `FOR SHARE`. This lock conflicts with the row lock taken by an update of `ended_at`. If an insert acquires its lock first, the end waits for the insert transaction to finish. If the end wins, the insert sees the closed session and fails. `FOR KEY SHARE` would not provide this guarantee.

Members may still adjust attendance or delete an entire session. Group, session, player, and attendance deletions cascade to their dependent data. This prevents foreign-key cleanup ordering from blocking group deletion. Deleting a player through the Data API removes their games too. The app only archives players, retaining attendance and historical results.

## Verification

Use a disposable local PostgreSQL database with the migration applied, `pgcrypto` installed in `extensions`, the Supabase roles `anon` and `authenticated`, and `auth.uid()` available. The standard local Supabase stack supplies these. A plain PostgreSQL fixture may implement `auth.uid()` from `request.jwt.claim.sub` and grant those roles access to the Auth schema and function. Never replace the hosted project's Auth functions with a test stub.

Run the suite as a database owner able to `SET ROLE`:

```sh
psql "$LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
```

The suite uses `SET LOCAL ROLE`, transaction-local JWT identities, DO assertions, and an invoker temporary exception helper. It requires no pgTAP or Auth user inserts. It checks all public tables for RLS, the exact definer function set, function privileges/search paths, anonymous denials, bootstrap, member and outsider access, membership escalation, author spoofing, immutable identities, cross-group attendance and games, score rules, duplicate records, invite expiry/rotation, closed-session corrections, and immediate loss of access after removal. Everything rolls back. This is a plain `psql` suite, not TAP output for `supabase test db`.

Run `npm run db:test:concurrency` to exercise both insert/end lock orderings with two local database connections. It confirms that each operation waits on the other, and that an insert fails after the end commits. Production uses normal READ COMMITTED semantics; an already-running transaction with an older repeatable-read snapshot can retain its earlier membership view until that transaction ends.

RLS protects client roles, not database owners or service-role credentials. Keep those credentials server-only. SQL access as an identity-setting privileged role is outside this threat model. If Supabase anonymous sign-in is enabled, those accounts also use `authenticated` and receive the same rules. Invite RPCs have no database rate limiter; use application or gateway rate limits to limit abuse. No remote migration should be applied until local tests and review pass.
