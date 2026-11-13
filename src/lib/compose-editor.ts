/**
 * compose-editor.ts — browser-safe helpers for the 2-pane email composer:
 * converting between rich editor HTML, email-safe cid: HTML, and plain text,
 * plus normalizing quick-typed comma-separated recipient entries.
 */
import { IMAGE_ID_PATTERN, imageTag, imageToken, stripImageTokens } from './inline-images.ts';
import { isValidEmail } from './mail-merge.ts';

const CID_SRC_RE = new RegExp(`cid:(${IMAGE_ID_PATTERN.source.slice(1, -1)})@mailer`, 'g');
const API_IMG_SRC_RE = new RegExp(`/api/images/(${IMAGE_ID_PATTERN.source.slice(1, -1)})`, 'g');
const TOKEN_RE = /\[\[image:(img_[a-z0-9]{8,40})(?:\|(\d{1,4}))?\]\]/g;

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlBasic(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Strips unsafe active tags/attributes when importing arbitrary HTML into the editor. */
export function sanitizeEditorHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

/** Converts email HTML (`cid:` images) into editor-displayable HTML (`/api/images/<id>`). */
export function emailHtmlToEditorHtml(html: string): string {
  const safe = sanitizeEditorHtml(html);
  return safe.replace(
    /<img\b([^>]*?)src=["']cid:(img_[a-z0-9]{8,40})@mailer["']([^>]*)>/gi,
    (_m, before: string, id: string, after: string) =>
      `<img${before}src="/api/images/${id}" data-mailer-image="${id}"${after}>`
  );
}

/** Extracts an `<img>` tag's attribute value if present. */
function readAttr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2]) : undefined;
}

/** Converts editor HTML (`/api/images/<id>`) into clean email-safe HTML (`cid:` images). */
export function editorHtmlToEmailHtml(html: string): string {
  const cleaned = sanitizeEditorHtml(html)
    .replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
      const id = readAttr(attrs, 'data-mailer-image') || (() => {
        const src = readAttr(attrs, 'src') || '';
        const m = API_IMG_SRC_RE.exec(src);
        API_IMG_SRC_RE.lastIndex = 0;
        return m?.[1];
      })();
      if (!id) return whole;
      const widthRaw = readAttr(attrs, 'width');
      const width = widthRaw && /^\d+$/.test(widthRaw) ? Number(widthRaw) : undefined;
      const alt = escapeAttr(readAttr(attrs, 'alt') || '');
      return imageTag(id, { width, alt, style: 'display: block;' });
    })
    .replace(/^(?:<p><br><\/p>|<br\s*\/?>|\s)+|(?:<p><br><\/p>|<br\s*\/?>|\s)+$/gi, '');

  return cleaned;
}

/** Returns true when rich HTML contains no visible text and no embedded images. */
export function isRichHtmlEmpty(html: string): boolean {
  if (CID_SRC_RE.test(html) || API_IMG_SRC_RE.test(html) || /<img\b/i.test(html) || /<hr\b/i.test(html)) {
    CID_SRC_RE.lastIndex = 0;
    API_IMG_SRC_RE.lastIndex = 0;
    return false;
  }
  CID_SRC_RE.lastIndex = 0;
  API_IMG_SRC_RE.lastIndex = 0;
  const text = (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return text.length === 0;
}

/** Converts plain text (with `[[image:id]]` tokens) into rich/HTML paragraphs. */
export function plainTextToHtml(text: string): string {
  const normalized = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const escaped = escapeHtmlBasic(block)
        .replace(TOKEN_RE, (_m, id: string, width?: string) =>
          imageTag(id, { width: width ? Number(width) : undefined, style: 'display: block; margin: 8px 0;' })
        )
        .replace(/\n/g, '<br>');
      return `<p>${escaped}</p>`;
    })
    .join('');
}

/** Converts email/editor HTML into readable plain text, preserving embedded images as `[[image:...]]` tokens. */
export function htmlToPlainText(html: string, opts: { preserveImageTokens?: boolean } = {}): string {
  const withImages = (html || '').replace(/<img\b([^>]*)>/gi, (_m, attrs: string) => {
    const src = readAttr(attrs, 'src') || '';
    const id = readAttr(attrs, 'data-mailer-image') || (() => {
      const cidMatch = /cid:(img_[a-z0-9]{8,40})@mailer/i.exec(src);
      if (cidMatch) return cidMatch[1];
      const apiMatch = /\/api\/images\/(img_[a-z0-9]{8,40})/i.exec(src);
      return apiMatch?.[1];
    })();
    if (!id || !opts.preserveImageTokens) return '';
    const widthRaw = readAttr(attrs, 'width');
    const width = widthRaw && /^\d+$/.test(widthRaw) ? Number(widthRaw) : undefined;
    return `\n${imageToken(id, width)}\n`;
  });

  const text = withImages
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return opts.preserveImageTokens ? text : stripImageTokens(text);
}

const ANGLE_EMAIL_RE = /^[^<>]*<([^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+)>$/;

function isAddressEntry(part: string): boolean {
  const trimmed = part.trim();
  return isValidEmail(trimmed) || ANGLE_EMAIL_RE.test(trimmed);
}

/**
 * Turns a single-line list of comma/semicolon-separated addresses like
 * `"alice@x.com, Bob <bob@x.com>"` into separate lines so `parseRecipients`
 * extracts every recipient instead of treating the 2nd address as a name column.
 * Leaves CSV / `Name, email` rows untouched.
 */
export function normalizeRecipientEntry(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('\t')) return input;
  const parts = trimmed.split(/[;,]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every(isAddressEntry)) {
    return parts.join('\n');
  }
  return input;
}

