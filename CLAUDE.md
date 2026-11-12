# CLAUDE.md

Local mail-merge / dispatch app (Next.js App Router, React, Tailwind v4, Nodemailer). See README.md for the user-facing description and the file map.

## Commands

```bash
npm run dev        # dev server on http://127.0.0.1:3040
npm run build      # production build
npx tsc --noEmit   # type-check
npm run lint       # ESLint
npm test           # node:test unit tests (src/lib/__tests__)
```

Lint, type-check, tests and build must all pass before pushing.

## Things to keep true

- This Next.js version has breaking changes versus older ones — read the relevant guide under `node_modules/next/dist/docs/` before using an API you haven't checked.
- Every API route goes through `handle()` in `src/lib/api.ts` (local-only guard). The app has no login and can send mail from the user's account, so never add a route that bypasses it.
- Secrets (`authPass`, `dkimPrivateKey`) never go to the browser: return `toPublicSettings()`, and treat an empty incoming value as "keep the stored one".
- All sends go through the queue (`enqueueBatch`). The worker claims a row as `SENDING` before sending so a message can never go out twice; a row found `SENDING` at startup is marked failed, not re-sent.
- `src/lib/mail-merge.ts` runs in both the browser and the server — keep it free of Node-only imports.
- Runtime data lives in `data/` (gitignored). Never commit it.
