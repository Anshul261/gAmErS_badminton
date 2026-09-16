# Courtside

Private badminton tracking for a friend group. Built with Next.js, TypeScript, Tailwind, shadcn/ui, and Supabase Postgres + email/password Auth.

[Open the Vercel preview](https://gamers-badminton-ph3062poc-rajs-projects-3341c1f6.vercel.app).

## Built

- Private groups with random, seven-day invite codes.
- Player rosters, session attendance, and late arrivals.
- Fast 1v1, 1v2, and 2v2 logging. Games to 11 or 21, win by two.
- Cross-phone updates, score corrections, session history, and player stats.
- Mobile-first UI with Geist fonts and Radix icons.
- Versioned migrations applied to Supabase; Vercel Hobby configuration included.

## Run

Set these in `.env.local`, using `.env.example` as the reference:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Create an account and group, add players, then start a session.

## Security

All six public tables have RLS. Membership comes from `auth.uid()`; joining requires the invite RPC. Postgres enforces scores, attendance, group isolation, and write attribution. The app uses no secret or legacy API keys. Environment files are excluded from Git and deployment uploads.

See [security details](docs/security.md). SQL changes live in `supabase/migrations/`.

## Verification

Verified the production build, 23 scoring tests, RLS and concurrency checks, and mobile/desktop flows including two-browser syncing and conflicting corrections.

```sh
npm run lint
npm test
npm run build
npm run db:start
npm run db:test
npm run db:test:concurrency
npm run test:e2e
npm run db:stop
```

Database and browser tests use local Docker containers, not hosted data. `db:stop` removes this project's containers and preserves its local data volume.

## Limits

- No offline queue. Open sessions refresh about every four seconds.
- Password recovery for friends needs SMTP configuration. Email confirmation is currently off.
- Free plans have quotas and may pause inactive projects.
- Moving away from Supabase requires replacing the small Data API adapter and migrating Auth, not just changing a connection string.
