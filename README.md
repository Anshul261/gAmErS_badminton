# gAmErS cOuRtSiDe

The badminton scorebook for one crew. Next.js, TypeScript, Tailwind, shadcn/ui, and Supabase Postgres + email/password Auth. Deployed on Vercel Hobby.

## How it works

- One court, no groups. Anyone who creates an account is in. Share the address only with friends, then close sign-ups (see below).
- Players are names on the score sheet, not accounts. Add them in **People**.
- Start a session with the people playing, log 1v1 / 1v2 / 2v2 games to 11 or 21 (win by two), add late arrivals, finish the session. Several courts can run at once; each phone picks which session it logs for.
- Other phones update every few seconds. Scores can be corrected or deleted from the session or from **History**; there a session can also be reopened for a forgotten game, have its date or target edited, or be deleted outright. **Stats** recalculates.
- **FAQ** tab explains all of this in plain terms.

## Roster backup

`supabase/roster.sql` is a local, gitignored snapshot of the players table (the repo is public). Re-run it in the Supabase SQL editor if the roster ever needs recreating; take a fresh copy after adding people.

## Run locally

```sh
cp .env.example .env.local   # hosted project keys, or use npm run dev:local against Docker
npm ci
npm run dev
```

`npm run dev:local` starts against the local Supabase stack from `npm run db:start` instead.

## Deploy

The Vercel project reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Apply `supabase/migrations/` to the hosted project, then:

```sh
vercel --prod
```

Point Supabase Auth at the deployed address (sets the site URL and callback allow-list; add `--close-signups` once everyone has an account):

```sh
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run auth:configure https://your-app.vercel.app
```

## Security

Four tables, all with RLS; `anon` can do nothing; every write is attributed to the signed-in user; no `SECURITY DEFINER` functions. Postgres enforces scores, attendance, and closed sessions. See [docs/security.md](docs/security.md).

## Verify

```sh
npm run lint && npm run typecheck && npm test && npm run build
npm run db:start && npm run db:test && npm run db:test:concurrency && npm run test:e2e && npm run db:stop
```

Database and browser tests only ever run against the local Docker stack.

## Limits

- No offline queue. Open sessions refresh about every four seconds.
- Password recovery emails need SMTP configured in Supabase. Email confirmation is off.
- Free tiers have quotas and Supabase pauses inactive projects.
