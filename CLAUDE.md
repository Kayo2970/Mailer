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
- `src/lib/mail-merge.ts` and `src/lib/inline-images.ts` run in both the browser and the server — keep them free of Node-only imports.
- Images in a message are always embedded (`<img src="cid:img_…@mailer">` plus an inline part with that Content-ID), never linked to this app or any URL of it — the recipient must see them after the app is closed. `enqueueBatch` copies the images a batch uses next to its attachments, so the queue never depends on the image library. Only previews swap `cid:` for data URIs.
- Runtime data lives in `data/` (gitignored). Never commit it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
