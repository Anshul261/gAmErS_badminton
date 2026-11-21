<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Merge gate

`main` moves only when all of this passes on the PR's latest commit, run locally (there is no CI):

```sh
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm run db:start && npm run db:test && npm run db:test:concurrency && npm run test:e2e; npm run db:stop
```

- e2e runs against the local Docker Supabase stack only, never the hosted project. It starts its own dev server on port 3001, so run one e2e at a time.
- UI changes: attach before/after screenshots of each changed screen at 360×800 and 1280×800 to the PR.
- e2e finds elements by role and accessible name (`tests/game-flow.spec.ts`). Keep those names unless the PR updates the test in the same commit and says why.
