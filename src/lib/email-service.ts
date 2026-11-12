/**
 * email-service.ts — the mail engine: SMTP settings, the HTML template, the send
 * queue and its worker, and the history log.
 *
 * Every message goes through the queue. A batch (one message, or a whole mail
 * merge) is written to the `emails` collection as QUEUED rows; a single
 * in-process worker then sends them one at a time, pausing between messages so
 * a large merge doesn't trip the provider's rate limits. Because the queue is
 * on disk, closing the app mid-batch loses nothing — the remaining messages go
 * out the next time it runs.
 */
import nodemailer, { Transporter } from 'nodemailer';
import crypto from 'crypto';
import { mutateCollection, readCollection } from './store';
import { saveFile, readStoredFile, deleteStoredFilesForRecord } from './file-storage';
import { DirectSendTransport } from './direct-smtp-transport';
import { ImageError, deleteImage, loadImagesFor } from './images';
import { cidFor, findImageIds, imageTag, imageTokensToHtml, isImageId, stripImageTokens } from './inline-images';
import { MAX_TOTAL_ATTACHMENT_BYTES } from './email-attachments';

// ── Types ────────────────────────────────────────────────────────────────────

export type EmailStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  status: EmailStatus;
  createdAt: string;
  /** Earliest time the worker may send it. */
  sendAfter: string;
  /** When it was actually sent, failed or cancelled. */
  sentAt?: string;
  /** Messages queued together (one mail merge) share a batch. */
  batchId: string;
  batchLabel?: string;
  /** Part of a multi-recipient batch: gets List-Unsubscribe headers and the unsubscribe line. */
  bulk?: boolean;
  attachmentsMeta?: Array<{ filename: string; contentType?: string }>;
  /** Storage keys of the batch's attachment files, kept on disk until the batch is finished. */
  attachmentKeys?: string[];
  attachmentFolder?: string;
  /**
   * The batch's own copies of the images embedded in the HTML (`cid:` references),
   * stored in the same folder as the attachments. They are sent inside the message.
   */
  inlineImages?: Array<{ id: string; filename: string; contentType: string; storageKey: string }>;
  // A resolved sendMail() only means the SMTP server ACCEPTED the message, not
  // that it reached the inbox. These surface what the server actually said.
  errorMessage?: string;
  smtpResponse?: string;
  rejectedRecipients?: string[];
}

export type EmailProvider = 'gmail' | 'outlook' | 'custom' | 'local_relay' | 'direct_send';

export interface EmailTemplateSettings {
  /** 'branded' = header banner + card + footer; 'plain' = just the message, like a hand-written e-mail. */
  style: 'branded' | 'plain';
  brandName: string;
  tagline: string;
  footerText: string;
  accentColor: string;
  // ── Letterhead. Image fields hold an image-library id ('' = none); the picture is embedded in every message. ──
  /** Logo shown in the header band, above the banner name. */
  logoImageId: string;
  /** Displayed logo width in pixels. */
  logoWidth: number;
  /** Full-width picture across the top of the card (a letterhead strip). */
  bannerImageId: string;
  /** Full-width picture above the footer text (a footer strip or signature). */
  footerImageId: string;
  /** Show the banner name as text. Turn off when the logo already carries the name. */
  showBrandName: boolean;
  headerAlign: 'left' | 'center' | 'right';
  headerBackground: string;
  headerTextColor: string;
  pageBackground: string;
  /** Width of the message card in pixels. */
  contentWidth: number;
  fontFamily: 'sans' | 'serif';
  /** Body text size in pixels. */
  fontSize: number;
}

export const TEMPLATE_IMAGE_FIELDS = ['logoImageId', 'bannerImageId', 'footerImageId'] as const;

export interface EmailSettings {
  // 'direct_send' is the built-in outbound engine (direct-smtp-transport.ts): the
  // app resolves each recipient's MX records and delivers straight to their mail
  // server, with no relay in between.
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  // HELO/EHLO identity used only by 'direct_send' — must match the reverse-DNS
  // (PTR) record of this machine's public IP, or most mail servers reject it.
  heloHostname: string;
  // Optional DKIM signing (nodemailer signs the message itself). Requires the
  // matching public key as a DNS TXT record at <selector>._domainkey.<domain>;
  // skipped entirely unless all three fields are set.
  dkimDomain: string;
  dkimSelector: string;
  dkimPrivateKey: string;
  template: EmailTemplateSettings;
  /** Minutes a new message waits in the queue before sending — a window to cancel a mistake. 0 = send straight away. */
  sendDelayMinutes: number;
  /** Pause between two messages, so a large merge stays under the provider's rate limits. */
  throttleSeconds: number;
  /** Add an "Unsubscribe" line + List-Unsubscribe headers to multi-recipient batches. */
  unsubscribeFooter: boolean;
  updatedAt?: string;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  provider: 'gmail',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  secure: false,
  authUser: '',
  authPass: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  heloHostname: '',
  dkimDomain: '',
  dkimSelector: '',
  dkimPrivateKey: '',
  template: {
    style: 'branded', brandName: '', tagline: '', footerText: '', accentColor: '#0284c7',
    logoImageId: '', logoWidth: 140, bannerImageId: '', footerImageId: '', showBrandName: true,
    headerAlign: 'center', headerBackground: '#0f172a', headerTextColor: '#ffffff', pageBackground: '#f1f5f9',
    contentWidth: 580, fontFamily: 'sans', fontSize: 14,
  },
  sendDelayMinutes: 0,
  throttleSeconds: 2,
  unsubscribeFooter: true,
};

/** What the browser gets: the secrets are never sent back, only whether one is stored. */
export type PublicEmailSettings = Omit<EmailSettings, 'authPass' | 'dkimPrivateKey'> & {
  authPass: '';
  dkimPrivateKey: '';
  hasPassword: boolean;
  hasDkimKey: boolean;
  configured: boolean;
};

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getEmailSettings(): Promise<EmailSettings> {
  const list = await readCollection<Partial<EmailSettings>>('settings');
  const stored = list[0] || {};
  return { ...DEFAULT_EMAIL_SETTINGS, ...stored, template: { ...DEFAULT_EMAIL_SETTINGS.template, ...(stored.template || {}) } };
}

/** Enough is filled in to attempt a send. */
export function isConfigured(s: EmailSettings): boolean {
  if (!s.fromEmail.trim()) return false;
  if (s.provider === 'gmail' || s.provider === 'outlook') return Boolean(s.authUser.trim() && s.authPass);
  if (s.provider === 'custom') return Boolean(s.smtpHost.trim());
  return true;
}

export function toPublicSettings(s: EmailSettings): PublicEmailSettings {
  return {
    ...s,
    authPass: '',
    dkimPrivateKey: '',
    hasPassword: Boolean(s.authPass),
    hasDkimKey: Boolean(s.dkimPrivateKey),
    configured: isConfigured(s),
  };
}

/**
 * Nodemailer's DKIM signer silently drops the signature — no error, no log — if
 * the key is malformed (e.g. a paste where real line breaks became literal "\n").
 * The message still sends, unsigned. Validating here turns that into an
 * immediate, specific error at save time instead.
 */
function normalizeAndValidateDkimKey(rawKey: string): string {
  let key = rawKey.trim();
  if (!key.includes('\n') && key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  try {
    crypto.createPrivateKey(key);
  } catch {
    throw new SettingsError(
      'DKIM Private Key is not a valid PEM private key. Paste the whole block, including the ' +
      '-----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines, with real line breaks.'
    );
  }
  return key;
}

export class SettingsError extends Error {}

const str = (v: unknown, max = 500): string | undefined => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const PROVIDERS: EmailProvider[] = ['gmail', 'outlook', 'custom', 'local_relay', 'direct_send'];

/**
 * Applies a settings form (untrusted JSON from the browser) on top of `current`.
 * An empty password / DKIM key means "keep the stored one" — the browser never
 * receives them, so it can't send them back; `clearPassword` / `clearDkimKey` remove them.
 */
export function mergeSettings(current: EmailSettings, raw: unknown): EmailSettings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const next: EmailSettings = { ...current, template: { ...current.template } };

  if (PROVIDERS.includes(input.provider as EmailProvider)) next.provider = input.provider as EmailProvider;
  for (const key of ['smtpHost', 'authUser', 'fromName', 'fromEmail', 'replyTo', 'heloHostname', 'dkimDomain', 'dkimSelector'] as const) {
    const v = str(input[key]);
    if (v !== undefined) next[key] = v;
  }
  if (input.smtpPort !== undefined) {
    const port = Number(input.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SettingsError('SMTP port must be a number between 1 and 65535.');
    next.smtpPort = port;
  }
  if (typeof input.secure === 'boolean') next.secure = input.secure;
  if (typeof input.unsubscribeFooter === 'boolean') next.unsubscribeFooter = input.unsubscribeFooter;
  if (input.sendDelayMinutes !== undefined) next.sendDelayMinutes = clampNumber(input.sendDelayMinutes, 0, 24 * 60, current.sendDelayMinutes);
  if (input.throttleSeconds !== undefined) next.throttleSeconds = clampNumber(input.throttleSeconds, 0, 600, current.throttleSeconds);

  if (typeof input.authPass === 'string' && input.authPass !== '') next.authPass = input.authPass;
  else if (input.clearPassword === true) next.authPass = '';

  if (typeof input.dkimPrivateKey === 'string' && input.dkimPrivateKey.trim() !== '') {
    next.dkimPrivateKey = normalizeAndValidateDkimKey(input.dkimPrivateKey);
  } else if (input.clearDkimKey === true) next.dkimPrivateKey = '';

  const t = (input.template && typeof input.template === 'object' ? input.template : {}) as Record<string, unknown>;
  if (t.style === 'branded' || t.style === 'plain') next.template.style = t.style;
  for (const key of ['brandName', 'tagline'] as const) {
    const v = str(t[key], 120);
    if (v !== undefined) next.template[key] = v;
  }
  const footer = str(t.footerText, 600);
  if (footer !== undefined) next.template.footerText = footer;
  for (const key of ['accentColor', 'headerBackground', 'headerTextColor', 'pageBackground'] as const) {
    const v = t[key];
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) next.template[key] = v;
  }
  for (const key of TEMPLATE_IMAGE_FIELDS) {
    if (t[key] === '' || isImageId(t[key])) next.template[key] = t[key] as string;
  }
  if (typeof t.showBrandName === 'boolean') next.template.showBrandName = t.showBrandName;
  if (t.headerAlign === 'left' || t.headerAlign === 'center' || t.headerAlign === 'right') next.template.headerAlign = t.headerAlign;
  if (t.fontFamily === 'sans' || t.fontFamily === 'serif') next.template.fontFamily = t.fontFamily;
  if (t.logoWidth !== undefined) next.template.logoWidth = Math.round(clampNumber(t.logoWidth, 24, 600, current.template.logoWidth));
  if (t.contentWidth !== undefined) next.template.contentWidth = Math.round(clampNumber(t.contentWidth, 420, 800, current.template.contentWidth));
  if (t.fontSize !== undefined) next.template.fontSize = Math.round(clampNumber(t.fontSize, 12, 20, current.template.fontSize));

  if (next.fromEmail && !/^[^\s@<>]+@[^\s@<>]+$/.test(next.fromEmail)) throw new SettingsError('"From" e-mail address is not valid.');
  if (next.replyTo && !/^[^\s@<>]+@[^\s@<>]+$/.test(next.replyTo)) throw new SettingsError('"Reply-To" address is not valid.');
  return next;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export async function updateEmailSettings(raw: unknown): Promise<EmailSettings> {
  const updated = { ...mergeSettings(await getEmailSettings(), raw), updatedAt: new Date().toISOString() };
  await mutateCollection<EmailSettings>('settings', () => [updated]);
  return updated;
}

/** Deletes an image from the library and takes it off the letterhead if it was used there. */
export async function removeLibraryImage(id: string): Promise<boolean> {
  const removed = await deleteImage(id);
  const settings = await getEmailSettings();
  if (TEMPLATE_IMAGE_FIELDS.some((f) => settings.template[f] === id)) {
    const template = { ...settings.template };
    for (const f of TEMPLATE_IMAGE_FIELDS) if (template[f] === id) template[f] = '';
    await mutateCollection<EmailSettings>('settings', () => [{ ...settings, template, updatedAt: new Date().toISOString() }]);
  }
  return removed;
}

// ── Transport ────────────────────────────────────────────────────────────────

function buildTransporter(settings: EmailSettings): { transporter: Transporter; effectiveHost: string; effectivePort: number } {
  const dkim = settings.dkimDomain && settings.dkimSelector && settings.dkimPrivateKey
    ? { domainName: settings.dkimDomain.trim(), keySelector: settings.dkimSelector.trim(), privateKey: settings.dkimPrivateKey }
    : undefined;

  if (settings.provider === 'direct_send') {
    // Built-in engine: no host/port/auth — it connects straight to each recipient's
    // mail server. DKIM still applies, since Nodemailer signs before any transport.
    const heloHostname = (settings.heloHostname || settings.dkimDomain || settings.fromEmail.split('@')[1] || 'localhost').trim();
    const transporter = nodemailer.createTransport(new DirectSendTransport({ heloHostname }), dkim ? { dkim } : undefined);
    return { transporter, effectiveHost: `direct send as ${heloHostname}`, effectivePort: 25 };
  }

  let host = settings.smtpHost.trim();
  let port = settings.smtpPort || 587;
  let secure = settings.secure;
  // App passwords are shown in groups of four with spaces; the spaces aren't part of the password.
  const pass = settings.provider === 'gmail' ? settings.authPass.replace(/\s+/g, '') : settings.authPass;
  let auth: { user: string; pass: string } | undefined =
    settings.authUser && settings.authPass ? { user: settings.authUser.trim(), pass } : undefined;

  if (settings.provider === 'gmail') {
    host = 'smtp.gmail.com';
  } else if (settings.provider === 'outlook') {
    host = 'smtp.office365.com';
  } else if (settings.provider === 'local_relay') {
    host = host || 'localhost';
    port = settings.smtpPort || 25;
    secure = false;
    auth = undefined;
  }
  // Port 465 is implicit TLS; everything else upgrades with STARTTLS.
  if (settings.provider !== 'local_relay') secure = port === 465 ? true : secure && port !== 587;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    dkim,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    family: 4, // Force IPv4: Microsoft/Gmail reject IPv6 senders without matching SPF/PTR (450 4.7.26)
  } as nodemailer.TransportOptions);

  return { transporter, effectiveHost: host, effectivePort: port };
}

/**
 * Turns a raw Nodemailer/SMTP failure into a plain-English diagnosis. The #1
 * real-world cause of "the password is right but Outlook won't send" is that
 * Microsoft 365 disables SMTP AUTH tenant-wide by default — Nodemailer surfaces
 * Microsoft's rejection verbatim, which reads like a generic auth error.
 */
export function diagnoseSmtpFailure(err: unknown, provider: string): string {
  const e = err as { message?: string; code?: string; responseCode?: number } | undefined;
  const raw = e?.message || String(err);
  const code = String(e?.code || e?.responseCode || '');
  let diagnosis = '';

  if (/SmtpClientAuthentication is disabled/i.test(raw) || /5\.7\.139/.test(raw)) {
    diagnosis =
      'Microsoft 365 has SMTP AUTH (username/password sign-in) turned OFF for this mailbox — a tenant setting, not a wrong password. ' +
      'An admin must enable it: Microsoft 365 admin center → Users → Active users → this mailbox → Mail → "Manage email apps" → ' +
      'turn on Authenticated SMTP. Re-entering the password will not help until that switch is flipped.';
  } else if (provider === 'outlook' && /535|Invalid login|Username and Password not accepted/i.test(raw)) {
    diagnosis =
      'Outlook/Microsoft 365 rejected the sign-in. If the account has multi-factor authentication, the normal password will not ' +
      'work over SMTP — create an app password for the mailbox, or have an admin enable Authenticated SMTP. Also check for typos.';
  } else if (provider === 'gmail' && /535|Invalid login|Username and Password not accepted/i.test(raw)) {
    diagnosis =
      'Gmail rejected the sign-in. Gmail does not accept your normal password over SMTP: turn on 2-Step Verification, then create ' +
      'an App Password (Google Account → Security → App passwords) and use that 16-character code here.';
  } else if (/535|Invalid login|Username and Password not accepted/i.test(raw)) {
    diagnosis = 'The mail server rejected the username/password — check for typos, and whether an app-specific password is required.';
  } else if (/ETIMEDOUT|ESOCKET|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|EDNS/i.test(code + raw)) {
    diagnosis =
      'Could not reach the mail server at all — a network problem, not a credentials problem. Check the host name and port, your ' +
      'internet connection, and whether a firewall, VPN or your internet provider blocks outbound SMTP ' +
      (provider === 'direct_send' ? '(port 25 is blocked on most home and office connections — use an SMTP account instead).' : '(ports 587/465).');
  } else if (/STARTTLS|wrong version number|SSL routines/i.test(raw)) {
    diagnosis = 'TLS could not be negotiated — use port 587 with "SSL/TLS" off (STARTTLS), or port 465 with it on.';
  }

  return diagnosis ? `${diagnosis}\n\nServer said: ${raw}` : raw;
}

// ── HTML template ────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Plain text → safe HTML: escaped, with bare URLs and e-mail addresses made clickable. */
export function textToHtml(text: string, linkColor: string): string {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    (m, url: string | undefined, mail: string | undefined) =>
      url
        ? `<a href="${url}" style="color:${linkColor};">${url}</a>`
        : `<a href="mailto:${mail}" style="color:${linkColor};">${mail}</a>`
  );
}

/** HTML → a readable plain-text alternative part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface MessageContent {
  subject: string;
  body: string;
  /** The body is HTML written by the sender (inserted as-is) rather than plain text. */
  bodyIsHtml?: boolean;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF_FONT = "Georgia, 'Times New Roman', Times, serif";

/**
 * The finished HTML of a message exactly as it will be sent — also used for the
 * live preview, so what you see is what goes out.
 *
 * The <title> matches the Subject on purpose: spam filters (SpamAssassin's
 * HTML_TITLE_SUBJ_DIFF) penalise a mismatch as a bulk-template fingerprint.
 */
export function renderEmailHtml(settings: EmailSettings, content: MessageContent): string {
  const t = settings.template;
  // A complete HTML document from the sender is sent untouched.
  if (content.bodyIsHtml && /<html[\s>]/i.test(content.body)) return content.body;

  // `[[image:…]]` tokens become <img> tags that point at the embedded copy (see inline-images.ts).
  const inner = content.bodyIsHtml
    ? imageTokensToHtml(content.body)
    : `<div style="white-space: pre-wrap;">${imageTokensToHtml(textToHtml(content.body, t.accentColor))}</div>`;
  const head = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(content.subject)}</title></head>`;
  const font = t.fontFamily === 'serif' ? SERIF_FONT : FONT;

  if (t.style === 'plain') {
    return `<!DOCTYPE html><html lang="en">${head}<body style="margin: 0; padding: 16px; font-family: ${font}; font-size: ${t.fontSize}px; line-height: 1.6; color: #1e293b;">${inner}</body></html>`;
  }

  const brand = escapeHtml(t.brandName || settings.fromName || '');
  const brandText = t.showBrandName ? brand : '';
  const strip = (id: string) => imageTag(id, { width: t.contentWidth, alt: brand, style: 'display: block;' });
  // Block images are aligned with margins: text-align does not move a display:block element.
  const logoMargin = t.headerAlign === 'left' ? '0 auto 0 0' : t.headerAlign === 'right' ? '0 0 0 auto' : '0 auto';

  const banner = t.bannerImageId ? strip(t.bannerImageId) : '';
  const band = t.logoImageId || brandText || t.tagline
    ? `<div style="background-color: ${t.headerBackground}; padding: 24px 32px; text-align: ${t.headerAlign};">
        ${t.logoImageId ? imageTag(t.logoImageId, { width: t.logoWidth, alt: brand, style: `display: block; margin: ${logoMargin};` }) : ''}
        ${brandText ? `<div style="display: inline-block; padding: 5px 12px; border: 1px solid ${t.accentColor}; border-radius: 6px;${t.logoImageId ? ' margin-top: 14px;' : ''}"><span style="color: ${t.headerTextColor}; font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">${brandText}</span></div>` : ''}
        ${t.tagline ? `<p style="color: ${t.headerTextColor}; opacity: 0.65; font-size: 12px; margin: 8px 0 0 0; font-weight: 500;">${escapeHtml(t.tagline)}</p>` : ''}
      </div>`
    : '';
  const header = banner || band
    ? `${banner}${band}`
    : `<div style="background-color: ${t.accentColor}; height: 6px; font-size: 0; line-height: 0;">&nbsp;</div>`;
  const footer = `${t.footerImageId ? strip(t.footerImageId) : ''}${t.footerText
    ? `<div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; text-align: center; font-size: 11px; color: #64748b; line-height: 1.6; white-space: pre-wrap;">${textToHtml(t.footerText, t.accentColor)}</div>`
    : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
${head}
<body style="background-color: ${t.pageBackground}; margin: 0; padding: 24px 12px; font-family: ${font}; color: #1e293b;">
  <div style="max-width: ${t.contentWidth}px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    ${header}
    <div style="padding: 28px 32px; color: #334155; font-size: ${t.fontSize}px; line-height: 1.65;">
      ${inner}
    </div>
    ${footer}
  </div>
</body>
</html>`;
}

// ── Sending one message ──────────────────────────────────────────────────────

/** `cid` set = an image embedded in the HTML (sent as a related part), not a file the recipient sees as an attachment. */
type OutgoingAttachment = { filename: string; content: Buffer; contentType?: string; cid?: string };

const asInline = (image: { id: string; filename: string; contentType: string; content: Buffer }): OutgoingAttachment => ({
  filename: image.filename,
  content: image.content,
  contentType: image.contentType,
  cid: cidFor(image.id),
});

interface SendResult {
  status: 'SENT' | 'FAILED';
  errorMessage?: string;
  smtpResponse?: string;
  rejectedRecipients?: string[];
}

function fromHeader(settings: EmailSettings): { name: string; address: string } | string {
  return settings.fromName ? { name: settings.fromName, address: settings.fromEmail } : settings.fromEmail;
}

async function executeSmtpSend(
  settings: EmailSettings,
  message: { to: string; subject: string; text: string; html: string; bulk?: boolean; attachments?: OutgoingAttachment[] }
): Promise<SendResult> {
  let transporter: Transporter | undefined;
  try {
    if (!isConfigured(settings)) throw new Error('Mail settings are incomplete — fill in the Settings tab first.');
    transporter = buildTransporter(settings).transporter;

    const domain = settings.fromEmail.split('@')[1] || 'localhost';
    const headers: Record<string, string> = {
      'Message-ID': `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${domain}>`,
    };

    let html = message.html;
    let text = message.text;
    const unsubscribeAddress = settings.replyTo || settings.fromEmail;
    if (message.bulk && settings.unsubscribeFooter && unsubscribeAddress) {
      const mailto = `mailto:${unsubscribeAddress}?subject=Unsubscribe`;
      headers['List-Unsubscribe'] = `<${mailto}>`;
      const line = `<div style="text-align:center;padding:12px 20px 4px;font-size:10px;color:#94a3b8;font-family:${FONT};">Don't want these emails? <a href="${mailto}" style="color:#64748b;">Unsubscribe</a>.</div>`;
      const idx = html.toLowerCase().lastIndexOf('</body>');
      html = idx === -1 ? `${html}${line}` : `${html.slice(0, idx)}${line}${html.slice(idx)}`;
      text = `${text}\n\n---\nDon't want these emails? Unsubscribe: ${mailto}`;
    }

    const info = await transporter.sendMail({
      from: fromHeader(settings),
      to: message.to,
      subject: message.subject,
      text,
      html,
      replyTo: settings.replyTo || undefined,
      xMailer: false,
      headers,
      // Parts with a cid are embedded pictures: Nodemailer puts them in a multipart/related
      // section beside the HTML, so they display in place and need nothing from this computer.
      attachments: message.attachments?.map((a) => (a.cid ? { ...a, contentDisposition: 'inline' as const } : a)),
    });

    const rejected = (info.rejected || []).map(String);
    if (rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
      return { status: 'FAILED', smtpResponse: info.response, rejectedRecipients: rejected, errorMessage: `The mail server rejected the recipient: ${rejected.join(', ')}` };
    }
    return { status: 'SENT', smtpResponse: info.response, rejectedRecipients: rejected.length ? rejected : undefined };
  } catch (err) {
    const errorMessage = diagnoseSmtpFailure(err, settings.provider);
    console.error(`[mailer] Failed to send to ${message.to}:`, errorMessage);
    return { status: 'FAILED', errorMessage };
  } finally {
    // A fresh transporter is built per send, so release it or its sockets leak.
    try { transporter?.close(); } catch { /* already closed */ }
  }
}

/**
 * Verifies the connection and sends one test message. `draft` lets the Settings
 * form test what is currently typed in — including unsaved changes — rather
 * than silently testing the last-saved config underneath.
 */
export async function testEmailConnection(testRecipient: string, draft?: unknown): Promise<{ success: boolean; message: string }> {
  let settings = await getEmailSettings();
  try {
    if (draft) settings = mergeSettings(settings, draft);
    if (!isConfigured(settings)) return { success: false, message: 'Fill in the account details (and the "From" address) first.' };
    const { transporter, effectiveHost, effectivePort } = buildTransporter(settings);
    try {
      await transporter.verify();
    } finally {
      try { transporter.close(); } catch { /* already closed */ }
    }

    const subject = 'Mailer test message';
    const body = `This is a test message from Mailer.\n\nYour mail settings work: ${settings.provider} via ${effectiveHost}:${effectivePort}, sending as ${settings.fromEmail}.\n\nSent ${new Date().toLocaleString()}`;
    const html = renderEmailHtml(settings, { subject, body });
    const attachments = (await loadImagesFor(html)).map(asInline); // the letterhead images, so the test shows the real look
    const result = await executeSmtpSend(settings, { to: testRecipient, subject, text: body, html, attachments });
    if (result.status === 'FAILED') return { success: false, message: result.errorMessage || 'The test message could not be sent.' };
    return {
      success: true,
      message: `The mail server accepted the test message for ${testRecipient} (it said: "${result.smtpResponse || 'OK'}"). Check that inbox — and its spam folder — to confirm it arrived.`,
    };
  } catch (err) {
    if (err instanceof SettingsError || err instanceof ImageError) return { success: false, message: err.message };
    return { success: false, message: diagnoseSmtpFailure(err, settings.provider) };
  }
}

// ── Queue ────────────────────────────────────────────────────────────────────

const ATTACHMENT_CATEGORY = 'attachments';
const OPEN_STATUSES: EmailStatus[] = ['QUEUED', 'SENDING', 'FAILED'];

export interface BatchInput {
  label?: string;
  bodyIsHtml?: boolean;
  /** One entry per recipient, already personalised. */
  messages: Array<{ to: string; subject: string; body: string }>;
  attachments?: OutgoingAttachment[];
  /** Hold the batch until this time instead of the default send delay. */
  sendAt?: Date;
}

/** Writes a batch to the queue and wakes the worker. Returns the queued rows. */
export async function enqueueBatch(input: BatchInput): Promise<EmailLog[]> {
  const settings = await getEmailSettings();
  const now = Date.now();
  const batchId = `b${now.toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  const sendAfter = new Date(input.sendAt ? Math.max(input.sendAt.getTime(), now) : now + settings.sendDelayMinutes * 60_000).toISOString();

  // Render first: the finished HTML says which images the batch embeds.
  const rendered = input.messages.map((m) => renderEmailHtml(settings, { subject: m.subject, body: m.body, bodyIsHtml: input.bodyIsHtml }));
  const images = await loadImagesFor(rendered);
  const files = input.attachments || [];
  const totalBytes = [...files, ...images].reduce((sum, f) => sum + f.content.length, 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new ImageError('The attachments and embedded images are too large together (15 MB per message at most).');
  }

  // One copy per batch, not per recipient: a 200-recipient merge with a 5 MB PDF stores 5 MB.
  // Images are copied too, so the batch no longer depends on the image library.
  const attachmentKeys: string[] = [];
  for (let i = 0; i < files.length; i++) {
    attachmentKeys.push(await saveFile(ATTACHMENT_CATEGORY, batchId, i, files[i].filename, files[i].content));
  }
  const inlineImages: NonNullable<EmailLog['inlineImages']> = [];
  for (let i = 0; i < images.length; i++) {
    const { id, filename, contentType, content } = images[i];
    inlineImages.push({ id, filename, contentType, storageKey: await saveFile(ATTACHMENT_CATEGORY, batchId, files.length + i, filename, content) });
  }

  const createdAt = new Date(now).toISOString();
  const rows: EmailLog[] = input.messages.map((m, i) => {
    const used = new Set(findImageIds(rendered[i]));
    const rowImages = inlineImages.filter((img) => used.has(img.id));
    return {
      // Sortable: batches by time, messages within a batch in list order.
      id: `em_${now.toString(36)}_${String(i).padStart(5, '0')}_${crypto.randomBytes(3).toString('hex')}`,
      to: m.to,
      subject: m.subject,
      bodyText: input.bodyIsHtml ? htmlToText(m.body) : stripImageTokens(m.body),
      bodyHtml: rendered[i],
      status: 'QUEUED',
      createdAt,
      sendAfter,
      batchId,
      batchLabel: input.label || undefined,
      bulk: input.messages.length > 1,
      ...(attachmentKeys.length > 0 || inlineImages.length > 0 ? { attachmentFolder: batchId } : {}),
      ...(attachmentKeys.length > 0
        ? { attachmentKeys, attachmentsMeta: files.map((f) => ({ filename: f.filename, contentType: f.contentType })) }
        : {}),
      ...(rowImages.length > 0 ? { inlineImages: rowImages } : {}),
    };
  });

  await mutateCollection<EmailLog>('emails', (current) => [...rows, ...current]);
  kickWorker();
  return rows;
}

async function loadAttachments(log: EmailLog): Promise<OutgoingAttachment[] | undefined> {
  const out: OutgoingAttachment[] = [];
  for (const image of log.inlineImages || []) {
    out.push(asInline({ ...image, content: await readStoredFile(image.storageKey) }));
  }
  for (let i = 0; i < (log.attachmentKeys?.length || 0); i++) {
    if (!log.attachmentKeys) break;
    out.push({
      filename: log.attachmentsMeta?.[i]?.filename || `attachment-${i + 1}`,
      contentType: log.attachmentsMeta?.[i]?.contentType,
      content: await readStoredFile(log.attachmentKeys[i]),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Deletes the attachment files of batches that have nothing left to send or retry. */
async function pruneAttachmentFolders(folders: Iterable<string | undefined>): Promise<void> {
  const candidates = new Set(Array.from(folders).filter((f): f is string => Boolean(f)));
  if (candidates.size === 0) return;
  for (const log of await readCollection<EmailLog>('emails')) {
    if (log.attachmentFolder && OPEN_STATUSES.includes(log.status)) candidates.delete(log.attachmentFolder);
  }
  for (const folder of candidates) await deleteStoredFilesForRecord(ATTACHMENT_CATEGORY, folder);
}

async function patchLog(id: string, patch: Partial<EmailLog>): Promise<void> {
  await mutateCollection<EmailLog>('emails', (current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
}

/** Atomically marks the next due message as SENDING and returns it, so it can never be picked up twice. */
async function claimNextDue(): Promise<EmailLog | null> {
  let claimed: EmailLog | null = null;
  const nowIso = new Date().toISOString();
  await mutateCollection<EmailLog>('emails', (current) => {
    const due = current
      .filter((l) => l.status === 'QUEUED' && l.sendAfter <= nowIso)
      .sort((a, b) => a.sendAfter.localeCompare(b.sendAfter) || a.id.localeCompare(b.id))[0];
    if (!due) return current;
    claimed = { ...due, status: 'SENDING' };
    return current.map((l) => (l.id === due.id ? claimed! : l));
  });
  return claimed;
}

const g = globalThis as unknown as {
  __mailerWorkerRunning?: boolean;
  __mailerWorkerTimer?: NodeJS.Timeout;
  __mailerRecovered?: Promise<void>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A message still marked SENDING at startup was in flight when the app last
 * stopped. It may or may not have gone out, so it is NOT re-sent automatically
 * (a duplicate is worse than a visible failure) — it is flagged for the user.
 */
function recoverInterrupted(): Promise<void> {
  return (g.__mailerRecovered ??= mutateCollection<EmailLog>('emails', (current) =>
    current.some((l) => l.status === 'SENDING')
      ? current.map((l) =>
          l.status === 'SENDING'
            ? { ...l, status: 'FAILED' as const, sentAt: new Date().toISOString(), errorMessage: 'The app stopped while this message was being sent, so it may or may not have gone out. Check with the recipient before retrying.' }
            : l
        )
      : current
  ).then(() => {}, (err) => console.error('[mailer] Could not recover the queue:', err)));
}

async function runWorker(): Promise<void> {
  if (g.__mailerWorkerRunning) return;
  g.__mailerWorkerRunning = true;
  try {
    await recoverInterrupted();
    for (;;) {
      const log = await claimNextDue();
      if (!log) break;

      const settings = await getEmailSettings();
      let result: SendResult;
      try {
        const attachments = await loadAttachments(log);
        result = await executeSmtpSend(settings, { to: log.to, subject: log.subject, text: log.bodyText, html: log.bodyHtml, bulk: log.bulk, attachments });
      } catch (err) {
        // A missing attachment or image file: never send the message without it.
        result = { status: 'FAILED', errorMessage: `An attachment or embedded image could not be read, so the message was not sent: ${(err as Error).message}` };
      }
      await patchLog(log.id, {
        status: result.status,
        sentAt: new Date().toISOString(),
        errorMessage: result.errorMessage,
        smtpResponse: result.smtpResponse,
        rejectedRecipients: result.rejectedRecipients,
      });
      await pruneAttachmentFolders([log.attachmentFolder]);
      if (settings.throttleSeconds > 0) await sleep(settings.throttleSeconds * 1000);
    }
  } catch (err) {
    console.error('[mailer] Queue worker error:', err);
  } finally {
    g.__mailerWorkerRunning = false;
  }
}

/** Starts the queue worker if it isn't running. Safe to call from anywhere, any number of times. */
export function kickWorker(): void {
  if (!g.__mailerWorkerTimer) {
    // Picks up messages whose send time arrives while nothing else is happening.
    g.__mailerWorkerTimer = setInterval(() => void runWorker(), 5000);
    g.__mailerWorkerTimer.unref?.();
  }
  void runWorker();
}

type Scope = { id: string } | { batchId: string } | { all: true };
const inScope = (l: EmailLog, scope: Scope) =>
  'all' in scope ? true : 'id' in scope ? l.id === scope.id : l.batchId === scope.batchId;

/** Skips the remaining wait of queued messages so the worker sends them next. */
export async function sendQueuedNow(scope: Scope): Promise<number> {
  let count = 0;
  const nowIso = new Date().toISOString();
  await mutateCollection<EmailLog>('emails', (current) =>
    current.map((l) => {
      if (l.status !== 'QUEUED' || !inScope(l, scope)) return l;
      count++;
      return { ...l, sendAfter: nowIso };
    })
  );
  kickWorker();
  return count;
}

export async function cancelQueued(scope: Scope): Promise<number> {
  const folders = new Set<string | undefined>();
  let count = 0;
  await mutateCollection<EmailLog>('emails', (current) =>
    current.map((l) => {
      if (l.status !== 'QUEUED' || !inScope(l, scope)) return l;
      count++;
      folders.add(l.attachmentFolder);
      return { ...l, status: 'CANCELLED' as const, sentAt: new Date().toISOString(), errorMessage: 'Cancelled before sending.' };
    })
  );
  await pruneAttachmentFolders(folders);
  return count;
}

/** Puts failed messages back in the queue. */
export async function retryFailed(scope: Scope): Promise<number> {
  let count = 0;
  const nowIso = new Date().toISOString();
  await mutateCollection<EmailLog>('emails', (current) =>
    current.map((l) => {
      if (l.status !== 'FAILED' || !inScope(l, scope)) return l;
      count++;
      return { ...l, status: 'QUEUED' as const, sendAfter: nowIso, sentAt: undefined, errorMessage: undefined, smtpResponse: undefined, rejectedRecipients: undefined };
    })
  );
  kickWorker();
  return count;
}

/** Removes finished messages (sent, failed, cancelled) from the history. Queued ones are never touched. */
export async function deleteHistory(scope: Scope): Promise<number> {
  const folders = new Set<string | undefined>();
  let count = 0;
  await mutateCollection<EmailLog>('emails', (current) =>
    current.filter((l) => {
      if (l.status === 'QUEUED' || l.status === 'SENDING' || !inScope(l, scope)) return true;
      count++;
      folders.add(l.attachmentFolder);
      return false;
    })
  );
  await pruneAttachmentFolders(folders);
  return count;
}
