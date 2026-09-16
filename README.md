# Courtside

A private badminton scorebook for a friend group. Next.js App Router, TypeScript, Tailwind, shadcn/ui, and Supabase Auth + Postgres.

## What works

- Create a group and share an expiring invite code.
- Add friends by display name. Players do not need an account to appear in games.
- Pick attendance and start a session. Add late arrivals without starting over.
- Log singles, doubles, or 1v2 games. Play to 11 or 21, always win by two.
- Correct or delete a result, browse session history, and compare player stats.
- Other phones pick up games within about four seconds while the page is visible.

There is no scheduler, offline queue, photo upload, or public group page.

## Run

Use Node 22. The only app environment variables are:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env.local` holds local configuration and is ignored by Git. `.env.example` is the committed template. The app rejects keys without the `sb_publishable_` prefix. It has no elevated Supabase client.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`, create an account, then create your group. Add the roster in People. Share the invite code privately; anyone holding a valid code can join. Codes expire after seven days. Generating a new code invalidates the old one.

The connected project's email confirmation is currently off. Email addresses are not verified identities and are never used to authorize group access. Account signup alone gives no access to existing groups.

## Local tests

Docker runs local Supabase, not the Next.js app and not the deployment. Ports start at 46321 to avoid reserved Windows ports. Local auth emails appear in Mailpit at `http://127.0.0.1:46324`.

```sh
npm run db:start
npm run dev:local
```

`dev:local` reads only the local API URL and publishable key from Supabase CLI and passes them to Next.js. It does not overwrite `.env.local`.

```sh
npm run lint
npm run typecheck
npm test
npm run db:test
npm run db:test:concurrency
npx playwright install chromium
npm run test:e2e
npm run build
```

Browser tests use local Supabase on port 46321 and a separate app server on port 3001. They create disposable local accounts and groups. They never use the hosted project. Stop a running local app before rebuilding or resetting its database.

Run `npm run db:stop` when finished. It removes this project's local containers and keeps its data volume for the next test run. It does not stop other Docker projects.

All SQL changes belong in `supabase/migrations/`. Create a migration with `npx supabase migration new descriptive_name`. Test it locally before pushing it. `npx supabase db reset --local` destroys local test data and reapplies migrations; do not use a linked or remote reset.

## Vercel Hobby

`vercel.json` puts server rendering in Mumbai, near the Supabase `ap-south-1` database. Browser data requests go directly to Supabase under RLS, so polling does not invoke a Vercel Function.

```sh
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel deploy --prod
```

Use the personal Hobby plan. Do not enable paid add-ons. No Storage, Edge Functions, Realtime subscriptions, cron jobs, or third-party analytics are required.

Apply future migrations from the terminal, with the Supabase CLI authenticated to the project:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Auth callback URLs need the deployed origin for confirmation and password reset links. With a Supabase management access token and project reference in your shell, configure them without the dashboard:

```sh
export SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
# Supply SUPABASE_ACCESS_TOKEN through your shell's secret manager.
npm run auth:configure -- https://YOUR_APP.vercel.app
```

This script does not change email confirmation or SMTP settings. After everyone has an account, run it with `--close-signups` to disable new account creation. Existing users can still sign in.

Supabase's built-in mail server restricts delivery to project team addresses and currently allows only two messages per hour. Password recovery for friends needs a configured SMTP service. The reset flow is implemented, but do not promise recovery until mail delivery is configured and tested. Auth settings can be updated with the [Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config); no schema edits or dashboard clicks are needed.

## Free tier limits

This workload fits the current free tiers at 8 to 12 weekly players, but "free forever" is not a provider guarantee. Supabase Free has finite database and egress quotas and may pause a project after low activity over seven days. Vercel Hobby also pauses features when usage limits are exceeded. Weekly play can sit close to Supabase's inactivity window.

Polling pauses in hidden tabs and when offline. Session history is paginated; stats load only while their tab is open and Postgres returns totals rather than the full game history. Games have no media attachments. Keep a database export outside Supabase, since Free does not provide downloadable managed backups. Data growth and usage still need occasional checks.

## Database portability

Business rules, membership, invites, constraints, and policies live in versioned Postgres SQL. There are no Supabase-only workers or subscriptions. UUID audit fields do not reference `auth.users`.

For v1, the chosen data adapter is Supabase's Data API. Moving to another Postgres host therefore requires restoring the database, replacing `src/lib/data.ts`, and replacing the small server-side group query. It is not a connection-string-only move. Supabase Auth also needs a separate migration or a self-hosted Auth service.

A replacement backend must verify each JWT, set the transaction-local identity read by `auth.uid()`, and execute queries as a non-bypass-RLS role. Never connect the replacement app as a superuser. Preserve role grants, RLS, the `pgcrypto` extension, and the identity function when restoring. Re-run the SQL security tests against the new host.

See [the security notes](docs/security.md) for policy behavior, audit fields, and invite handling.
