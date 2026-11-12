/**
 * images.ts — the image library: pictures the user has uploaded for the
 * letterhead or for message bodies. The bytes live in data/uploads/images/,
 * the `images` collection holds one small record per picture.
 *
 * The library is only the working copy. When a batch is queued, every image it
 * uses is copied next to the batch's attachments, so deleting or replacing a
 * library image never changes mail that is already waiting to go out.
 */
import crypto from 'crypto';
import { mutateCollection, readCollection } from './store';
import { deleteStoredFilesForRecord, readStoredFile, saveFile } from './file-storage';
import { MAX_IMAGE_BYTES, findImageIds, isImageId, replaceImageRefs, sniffImageType } from './inline-images';

const IMAGE_CATEGORY = 'images';

export interface LibraryImage {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
  createdAt: string;
}

/** What the browser sees: everything but where the file sits on disk. */
export type PublicLibraryImage = Omit<LibraryImage, 'storageKey'>;
export const toPublicImage = ({ id, filename, contentType, size, createdAt }: LibraryImage): PublicLibraryImage => ({ id, filename, contentType, size, createdAt });

/** A problem with an image the user can fix (wrong format, too big, deleted). Reported as a 400. */
export class ImageError extends Error {}

export async function listImages(): Promise<LibraryImage[]> {
  return readCollection<LibraryImage>('images');
}

export async function getImage(id: string): Promise<LibraryImage | undefined> {
  if (!isImageId(id)) return undefined;
  return (await listImages()).find((i) => i.id === id);
}

export async function addImage(filename: string, content: Buffer): Promise<LibraryImage> {
  if (content.length === 0) throw new ImageError('That file is empty.');
  if (content.length > MAX_IMAGE_BYTES) throw new ImageError(`Images can be at most ${MAX_IMAGE_BYTES / (1024 * 1024)} MB each — resize or compress this one first.`);
  const type = sniffImageType(content);
  if (!type) throw new ImageError('Only PNG, JPEG and GIF images can be embedded — those are the formats every mail app displays.');

  const id = `img_${crypto.randomBytes(8).toString('hex')}`;
  const base = (filename || 'image').replace(/\.[^.]*$/, '').slice(0, 80) || 'image';
  const name = `${base}.${type.ext}`;
  const image: LibraryImage = {
    id,
    filename: name,
    contentType: type.contentType,
    size: content.length,
    storageKey: await saveFile(IMAGE_CATEGORY, id, 0, name, content),
    createdAt: new Date().toISOString(),
  };
  await mutateCollection<LibraryImage>('images', (current) => [image, ...current]);
  return image;
}

export async function deleteImage(id: string): Promise<boolean> {
  if (!isImageId(id)) return false;
  let found = false;
  await mutateCollection<LibraryImage>('images', (current) => current.filter((i) => (i.id === id ? ((found = true), false) : true)));
  if (found) await deleteStoredFilesForRecord(IMAGE_CATEGORY, id);
  return found;
}

export async function readImage(image: Pick<LibraryImage, 'storageKey'>): Promise<Buffer> {
  return readStoredFile(image.storageKey);
}

export interface ResolvedImage { id: string; filename: string; contentType: string; content: Buffer }

/** Loads every library image the HTML refers to. Throws if one is gone, so a message never goes out with a broken picture. */
export async function loadImagesFor(html: string | string[]): Promise<ResolvedImage[]> {
  const ids = new Set<string>();
  for (const h of Array.isArray(html) ? html : [html]) for (const id of findImageIds(h)) ids.add(id);
  if (ids.size === 0) return [];
  const library = await listImages();
  const out: ResolvedImage[] = [];
  for (const id of ids) {
    const image = library.find((i) => i.id === id);
    if (!image) throw new ImageError('The message uses an image that is no longer in your image library. Remove it from the message (or from the letterhead in Settings) or upload it again.');
    try {
      out.push({ id, filename: image.filename, contentType: image.contentType, content: await readImage(image) });
    } catch {
      throw new ImageError(`The image "${image.filename}" could not be read from disk. Delete it from the image library and upload it again.`);
    }
  }
  return out;
}

const dataUri = (contentType: string, content: Buffer) => `data:${contentType};base64,${content.toString('base64')}`;

/**
 * For showing a message on screen: swaps each `cid:` reference for a data: URI.
 * `extra` are stored copies to try first (a queued batch's own images); the
 * library is the fallback. Images that are gone are left as they are.
 */
export async function inlineImagesForDisplay(
  html: string,
  extra: Array<{ id: string; contentType: string; storageKey: string }> = []
): Promise<string> {
  const ids = findImageIds(html);
  if (ids.length === 0) return html;
  const library = await listImages();
  const resolved = new Map<string, string>();
  for (const id of ids) {
    for (const source of [extra.find((e) => e.id === id), library.find((i) => i.id === id)]) {
      if (!source) continue;
      try {
        resolved.set(id, dataUri(source.contentType, await readStoredFile(source.storageKey)));
        break;
      } catch { /* that copy is gone — try the next one */ }
    }
  }
  return replaceImageRefs(html, (id) => resolved.get(id));
}
