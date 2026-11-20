/**
 * social-png.ts — converts SVG social icons into email-safe PNG buffers.
 *
 * Major email clients (Gmail, Outlook, Yahoo, Thunderbird) strip inline <svg>
 * elements entirely from email bodies. To ensure social icons appear reliably in
 * all inboxes, we rasterize each platform icon into an alpha-transparent, high-DPI
 * PNG buffer and embed it as a standard cid: inline attachment (multipart/related).
 */
import sharp from 'sharp';
import { getSocialSvg, type SocialLink } from './social-icons-data.ts';

export interface SocialPngAttachment {
  id: string;
  filename: string;
  contentType: 'image/png';
  content: Buffer;
  cid: string;
}

const pngCache = new Map<string, Buffer>();

export function normalizeHexColor(color?: string): string {
  if (!color) return '475569';
  const c = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^[0-9a-fA-F]{3}$/.test(c)) {
    return (c[0] + c[0] + c[1] + c[1] + c[2] + c[2]).toLowerCase();
  }
  return '475569';
}

export function socialCidId(platform: string, color?: string): string {
  const cleanPlatform = (platform || 'custom').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'custom';
  const cleanColor = normalizeHexColor(color);
  return `soc_${cleanPlatform}_${cleanColor}`;
}

export function socialCid(platform: string, color?: string): string {
  return `${socialCidId(platform, color)}@mailer`;
}

export const SOCIAL_CID_REF = /cid:(soc_[a-z0-9_]{3,50})@mailer/g;

export function findSocialCidIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(SOCIAL_CID_REF)) ids.add(m[1]);
  return Array.from(ids);
}

export function replaceSocialCidRefs(html: string, resolve: (id: string) => string | undefined): string {
  return html.replace(SOCIAL_CID_REF, (m, id: string) => resolve(id) ?? m);
}

/**
 * Returns an alpha-transparent PNG buffer for the given social platform and color.
 * Rendered at 32x32 for 2x retina sharpness when displayed at 13x13 or 14x14 in email clients.
 */
export async function getSocialPngBuffer(platform: string, color = '#475569'): Promise<Buffer> {
  const normPlatform = (platform || 'custom').toLowerCase().trim();
  const hex = normalizeHexColor(color);
  const normColor = `#${hex}`;
  const cacheKey = `${normPlatform}:${normColor}`;

  const cached = pngCache.get(cacheKey);
  if (cached) return cached;

  const svg = getSocialSvg(normPlatform, normColor, 32);
  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toBuffer();

  pngCache.set(cacheKey, pngBuffer);
  return pngBuffer;
}

/**
 * Returns a data: URI for instant display in browser previews (where cid: is unresolvable).
 */
export async function getSocialPngDataUri(platform: string, color = '#475569'): Promise<string> {
  const buf = await getSocialPngBuffer(platform, color);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * Prepares inline attachments for all unique social platforms configured in the template.
 */
export async function getSocialAttachmentsForLinks(
  links: SocialLink[] = [],
  color = '#475569'
): Promise<SocialPngAttachment[]> {
  const valid = links.filter((s) => s && s.url && /^https?:\/\//i.test(s.url));
  const seen = new Set<string>();
  const out: SocialPngAttachment[] = [];
  const hex = normalizeHexColor(color);
  const resolvedColor = `#${hex}`;

  for (const s of valid) {
    const p = (s.platform || 'custom').toLowerCase().trim();
    const id = socialCidId(p, resolvedColor);
    if (seen.has(id)) continue;
    seen.add(id);

    const content = await getSocialPngBuffer(p, resolvedColor);
    out.push({
      id,
      filename: `social-${p}.png`,
      contentType: 'image/png',
      content,
      cid: socialCid(p, resolvedColor),
    });
  }

  return out;
}
