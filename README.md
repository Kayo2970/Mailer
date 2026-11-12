# Mailer

A small app that runs on your own computer: connect a mail account (SMTP), write a message, personalise it for a list of people, and send. Nothing is uploaded anywhere — your settings, recipient lists and history stay in a `data/` folder next to the app.

The mail engine (SMTP providers, direct-send transport, queue, HTML template, mail merge, attachments) was extracted from the ERP dashboard's email module and made standalone.

## Run it

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Then open <http://127.0.0.1:3040>. (`npm run dev` runs the same thing with live reload for development.)

## Using it

1. **Settings** — pick your provider, enter the account details and the address to send from, press **Send test**, then **Save settings**.
   - **Gmail** needs an *App Password* (Google Account → Security → App passwords), not your normal password.
   - **Outlook / Microsoft 365** needs *Authenticated SMTP* enabled on the mailbox.
   - **Other SMTP** works with any provider that gives you a host, port, username and password.
   - **Local relay** and **Direct send** are for people running their own mail server; direct send does not work from a home or office internet connection.
   - **Email look** is your letterhead: a logo, a full-width banner and footer image, name and tagline, alignment, colours, font, text size and width. The preview shows the result as you change it.
2. **Compose** — paste recipients (or upload a CSV), write the subject and message, check the preview, send.
   - A plain list of addresses works. So does `Name, email` per line, or rows pasted straight from a spreadsheet.
   - With a header row containing an `email` column, every other column becomes a placeholder: a `company` column lets you write `{{company}}` in the subject or message.
   - Each recipient gets their own separate e-mail; nobody sees the rest of the list.
   - **Insert image** puts a picture in the message itself (PNG, JPEG or GIF). In a plain-text message it appears as `[[image:…]]`; write `[[image:…|300]]` to make it 300 pixels wide.
   - Attach files (15 MB in total, embedded images included), give the batch a name, or schedule it for later.
3. **Queue** — messages waiting to go out, sent one at a time. Send now or cancel, individually or all at once.
4. **History** — what was sent, what failed and why, with one-click retry.

Keep the app running until the queue is empty. If you close it mid-batch nothing is lost: the remaining messages are sent the next time it starts.

## Good to know

- **Images are inside the e-mail, not on your computer.** The logo, letterhead strips and any picture you insert are embedded in each message, so recipients see them after the queue has emptied and you have closed the app. Nothing in a sent message points back to `127.0.0.1`.
- **"Sent" means the mail server accepted the message.** Whether it reaches the inbox or the spam folder is decided by the recipient's provider.
- **Sending limits are your provider's.** Gmail allows roughly 500 recipients a day (2,000 on Workspace); others differ. The pause between messages (Settings → Sending) spreads a batch out but does not raise the limit.
- **The app is only reachable from this computer.** It listens on `127.0.0.1` and refuses requests that come from other websites. There is no login, so do not expose it to a network.
- **The SMTP password is stored in `data/settings.json`** in plain text, readable only by your user account. It is never sent back to the browser. Delete the `data/` folder to wipe everything.
- Set `MAILER_DATA_DIR` to keep the data somewhere else.

## For developers

```bash
npm run lint
```

```bash
npx tsc --noEmit
```

```bash
npm test
```

| Path | Purpose |
|------|---------|
| `src/lib/email-service.ts` | Settings, transport, HTML template, send queue + worker, history |
| `src/lib/direct-smtp-transport.ts` | Built-in "direct send" Nodemailer transport (MX lookup → deliver) |
| `src/lib/mail-merge.ts` | Recipient-list parsing and `{{placeholder}}` substitution (shared by browser and server) |
| `src/lib/store.ts` | JSON-file collections with a per-collection write mutex |
| `src/lib/inline-images.ts` | How a message refers to an embedded image (`cid:` references, `[[image:…]]` tokens) — shared by browser and server |
| `src/lib/images.ts` | The image library on disk, and turning `cid:` references into data URIs for on-screen previews |
| `src/lib/file-storage.ts` | Queued attachments, embedded-image copies and the image library on disk |
| `src/lib/api.ts` | Local-only request guard for every API route |
| `src/app/api/*` | `settings`, `test`, `preview`, `send`, `queue`, `logs`, `images` |
| `src/components/*` | Compose, Queue/History and Settings screens, image library picker |

Every message goes through the queue: `/api/send` writes one `QUEUED` row per recipient to `data/emails.json`, and a single in-process worker (started from `src/instrumentation.ts`) claims and sends them in order.
