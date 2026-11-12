/**
 * inline-images.ts — how a message refers to an embedded image. Pure string /
 * byte helpers shared by the browser and the server (no Node-only imports).
 *
 * An image is never linked to by URL: this app runs on the sender's own
 * computer, so a link to it would break the moment the app is closed (and
 * would never have worked for the recipient anyway). Instead the HTML says
 * `<img src="cid:img_abc123@mailer">` and the image file travels inside the
 * e-mail itself as a related part with that Content-ID. Once the message has
 * been handed to the mail server it is self-contained.
 *
 * In a plain-text message the writer places an image with a token,
 * `[[image:img_abc123]]` or `[[image:img_abc123|300]]` (width in pixels).
 */

export const IMAGE_ID_PATTERN = /^img_[a-z0-9]{8,40}$/;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CID_SUFFIX = '@mailer';
const CID_REF = /cid:(img_[a-z0-9]{8,40})@mailer/g;
const TOKEN = /\[\[image:(img_[a-z0-9]{8,40})(?:\|(\d{1,4}))?\]\]/g;

export const isImageId = (v: unknown): v is string => typeof v === 'string' && IMAGE_ID_PATTERN.test(v);

/** The Content-ID an image is attached under (and referenced by, after `cid:`). */
export const cidFor = (id: string): string => `${id}${CID_SUFFIX}`;

/** What the "insert image" button puts into a plain-text message. */
export const imageToken = (id: string, width?: number): string => (width ? `[[image:${id}|${width}]]` : `[[image:${id}]]`);

/** An e-mail-safe `<img>` for an embedded image. `alt` must already be HTML-escaped. */
export function imageTag(id: string, opts: { width?: number; alt?: string; style?: string } = {}): string {
  const width = opts.width ? Math.min(2000, Math.max(16, Math.round(opts.width))) : undefined;
  // The width attribute is for Outlook (which ignores max-width); the style keeps it fluid everywhere else.
  return `<img src="cid:${cidFor(id)}" alt="${opts.alt || ''}"${width ? ` width="${width}"` : ''} style="${width ? `width: ${width}px; ` : ''}max-width: 100%; height: auto; border: 0; ${opts.style || ''}">`;
}

/** What "insert image" puts into a message the sender is writing as HTML. */
export const imageHtmlSnippet = (id: string): string => imageTag(id, { style: 'display: block;' });

/** Replaces `[[image:…]]` tokens with `<img>` tags. Run on HTML (after escaping). */
export function imageTokensToHtml(html: string): string {
  return html.replace(TOKEN, (_m, id: string, width?: string) =>
    imageTag(id, { width: width ? Number(width) : undefined, style: 'display: block; margin: 8px 0;' })
  );
}

/** Removes `[[image:…]]` tokens, for the plain-text alternative part. */
export function stripImageTokens(text: string): string {
  return text.replace(TOKEN, '').replace(/\n{3,}/g, '\n\n');
}

/** Ids of every embedded image the HTML refers to, in first-seen order, without duplicates. */
export function findImageIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(CID_REF)) ids.add(m[1]);
  return Array.from(ids);
}

/** Swaps `cid:` references for other URLs (data: URIs, for on-screen previews). Unresolved ones are left alone. */
export function replaceImageRefs(html: string, resolve: (id: string) => string | undefined): string {
  return html.replace(CID_REF, (m, id: string) => resolve(id) ?? m);
}

export type ImageType = { contentType: 'image/png' | 'image/jpeg' | 'image/gif'; ext: 'png' | 'jpg' | 'gif' };

/**
 * Identifies an image by its first bytes rather than trusting the file name.
 * Only the formats every mail client displays: PNG, JPEG and GIF (no SVG or
 * WebP — Gmail and Outlook drop or mangle them).
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { contentType: 'image/png', ext: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { contentType: 'image/jpeg', ext: 'jpg' };
  if (starts(0x47, 0x49, 0x46, 0x38)) return { contentType: 'image/gif', ext: 'gif' };
  return null;
}
