# Mailer

A local mail-merge and email dispatch app that runs on your own computer: connect a mail account (SMTP), compose a message, personalise it for a list of recipients, and send. Nothing is uploaded anywhere — your settings, recipient lists, queued attachments, embedded images, and history stay in a `data/` folder next to the app.

The mail engine (SMTP providers, direct-send transport, queue, HTML template, mail merge, attachments) was extracted from the ERP dashboard's email module and made standalone.

## Run it

Needs [Node.js](https://nodejs.org) 20 or newer (Node.js 22.6+ is required to run `npm test` with `--experimental-strip-types`).

```bash
npm install
npm run build
npm start
```

Then open <http://127.0.0.1:3040>. For development with live reload, run `npm run dev` instead.

## Using it

1. **Settings** — configure your account, sender details, sending behaviour, and letterhead appearance:
   - **Mail account** — choose from:
     - **Gmail** — requires 2-Step Verification and an *App Password* (Google Account → Security → App passwords), not your normal password.
     - **Outlook / Microsoft 365** (`smtp.office365.com`) — requires *Authenticated SMTP* enabled on the mailbox (and an app password if MFA is enabled).
     - **Other SMTP** — any SMTP host, port, username, and password (587 for STARTTLS, 465 for SSL/TLS, or explicit SSL/TLS toggle on custom ports).
     - **Local relay** — hands mail to an unauthenticated local/LAN SMTP server (e.g. Postfix on `localhost:25`).
     - **Direct send** — resolves each recipient's MX records and delivers straight to their mail server; only works from a machine with a static public IP, outbound port 25 open, and valid PTR/SPF/DKIM DNS records (not from a home or office internet connection).
   - **Sender & Sending** — set `From name`, `From address`, optional `Reply-To`, a cancel-window delay before sending (minutes), pause between messages (seconds, default `2`), an optional `Unsubscribe` footer + `List-Unsubscribe` headers on multi-recipient batches, and optional **DKIM signing** (domain, selector, PEM private key).
   - **Email look** is your letterhead: a logo, a full-width banner and footer image, name and tagline, alignment, colours, font, text size, and width, or a **Plain message** style. The preview shows the result as you change it.
   - Press **Send test** to verify delivery with the current form values, then **Save settings**.
2. **Compose** — paste recipients or upload a `.csv`, `.tsv`, or `.txt` file, write the subject and message, inspect the live preview, and send.
   - A plain list of addresses works. So does `Name, email` per line, or rows pasted straight from a spreadsheet.
   - With a header row containing an `email` column, every other column becomes a `{{placeholder}}` you can use in the subject and message.
   - Switch between plain text (URLs automatically become clickable) and raw HTML (`I'm writing HTML`), and step through individual recipients in the preview pane.
   - Each recipient gets their own separate e-mail; nobody sees the rest of the list.
   - **Insert image** puts a picture in the message itself (PNG, JPEG or GIF). In a plain-text message it appears as `[[image:…]]`; write `[[image:…|300]]` to make it 300 pixels wide.
   - Attach files (15 MB in total, embedded images included), give the batch a name, or schedule it for later.
3. **Queue** — live view of `Queued` and `Sending` messages in send order. Inspect message details, **Send now**, or **Cancel** individually or all at once.
4. **History** — filter (`All`, `Sent`, `Failed`, `Cancelled`) and search past messages, view SMTP responses or failure reasons, **Retry** failed messages, or remove entries.

Keep the app running until the queue is empty. If you close it mid-batch nothing is lost: queued messages remain on disk and resume the next time it starts (any row interrupted mid-send is marked failed rather than sent twice).

## Good to know

- **Images are inside the e-mail, not on your computer.** The logo, letterhead strips and any picture you insert are embedded in each message, so recipients see them after the queue has emptied and you have closed the app. Nothing in a sent message points back to `127.0.0.1`.
- **"Sent" means the mail server accepted the message.** Whether it reaches the inbox or the spam folder is decided by the recipient's provider.
- **Sending limits are your provider's.** Gmail allows roughly 500 recipients a day (2,000 on Workspace); others differ. The pause between messages (Settings → Sending) spreads a batch out but does not raise the limit.
- **Local-only access by default.** The server binds to `127.0.0.1:3040` and refuses cross-site requests or unfamiliar `Host` headers. There is no login, so do not expose it to an untrusted network.
- **Secrets stay local.** SMTP passwords and DKIM private keys are stored in `data/settings.json` (written with `0o600` permissions) and are never sent back to the browser. Delete the `data/` folder to wipe everything.
- **Environment variables:**
  - `MAILER_DATA_DIR` — store `settings.json`, `emails.json`, and `uploads/` in a custom directory instead of `./data`.
  - `MAILER_ALLOWED_HOSTS` — comma-separated extra hostnames allowed by the local-request guard if you intentionally expose the app under another host name.

## For developers

```bash
npm run dev        # dev server on http://127.0.0.1:3040
npm run build      # production build
npm start          # production server on http://127.0.0.1:3040
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript type-check
npm test           # node:test unit tests (Node 22.6+)
```

| Path | Purpose |
|------|---------|
| `src/instrumentation.ts` | Starts the in-process send-queue worker when the Next.js server boots |
| `src/lib/email-service.ts` | Settings, transport, HTML template, send queue + worker, history |
| `src/lib/direct-smtp-transport.ts` | Built-in "direct send" Nodemailer transport (MX lookup → deliver) |
| `src/lib/mail-merge.ts` | Recipient-list parsing and `{{placeholder}}` substitution (shared by browser and server) |
| `src/lib/email-attachments.ts` | Client-side attachment encoding, notice text, and 15 MB limit checks |
| `src/lib/store.ts` | JSON-file collections (`settings.json`, `emails.json`) with a per-collection write mutex |
| `src/lib/inline-images.ts` | How a message refers to an embedded image (`cid:` references, `[[image:…]]` tokens) — shared by browser and server |
| `src/lib/images.ts` | The image library on disk, and turning `cid:` references into data URIs for on-screen previews |
| `src/lib/file-storage.ts` | Queued attachments, embedded-image copies and the image library on disk |
| `src/lib/api.ts` | Local-only request guard (`assertLocalRequest` / `handle`) for every API route |
| `src/lib/client.ts` | Browser API wrapper, shared types, and date/countdown formatters |
| `src/app/api/*` | `settings`, `test`, `preview`, `send`, `queue`, `logs`, `logs/[id]`, `images`, `images/[id]` |
| `src/components/*` | Compose, Queue/History and Settings screens, image library picker, shared UI (`ui.tsx`) |
| `src/components/GhostFibers.jsx` | Animated full-page background scene, vendored unmodified from [React Bits](https://reactbits.dev/backgrounds/ghost-fibers) (`ghost-fibers-bg.tsx` configures it for light/dark mode and reduced motion) |
| `src/components/SpecularButton.jsx` | WebGL2 specular-rim button from [React Bits](https://reactbits.dev/components/specular-button) (updated for React StrictMode `<canvas>` lifecycle; `ActionButton` in `ui.tsx` wraps it for primary, secondary and danger actions) |
| `src/components/PillNav.jsx` | Animated pill navigation bar, vendored unmodified from [React Bits](https://reactbits.dev/components/pill-nav) (used in `src/app/page.tsx` for tab switching) |

Every message goes through the queue: `/api/send` writes one `QUEUED` row per recipient to `data/emails.json`, and a single in-process worker (started from `src/instrumentation.ts`) claims each row as `SENDING` and sends them in order.
