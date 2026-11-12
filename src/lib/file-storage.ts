/**
 * file-storage.ts — on-disk storage for attachments waiting in the send queue.
 *
 * Files live under <data>/uploads/<category>/<recordId>/<index>__<name>; records
 * in the JSON store only ever hold the `storageKey` (the path under uploads),
 * never the bytes.
 */
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './store';

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

/** Strip anything that isn't a safe filename character, keep it short. */
function sanitizeFileName(name: string): string {
  const base = (name || 'file').split(/[/\\]/).pop() || 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (cleaned || 'file').slice(0, 120);
}

export async function saveFile(category: string, recordId: string, index: number, fileName: string, content: Buffer): Promise<string> {
  const safeName = sanitizeFileName(fileName);
  const storageKey = `${category}/${recordId}/${index}__${safeName}`;
  const target = path.join(UPLOADS_DIR, category, recordId, `${index}__${safeName}`);

  // path.join normalises '..', so verify the result stays inside the category folder before writing.
  const expectedPrefix = path.join(UPLOADS_DIR, category) + path.sep;
  if (!path.resolve(target).startsWith(expectedPrefix)) {
    throw new Error('Invalid file path.');
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, { mode: 0o600 });
  return storageKey;
}

/** Resolve a storageKey to an absolute path, refusing anything that escapes the uploads folder. */
function resolveStoragePath(storageKey: string): string {
  const resolved = path.resolve(UPLOADS_DIR, storageKey);
  const firstSegment = storageKey.split('/')[0];
  if (!firstSegment || !resolved.startsWith(path.join(UPLOADS_DIR, firstSegment) + path.sep)) {
    throw new Error('Invalid storage key.');
  }
  return resolved;
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(storageKey));
}

/** Best-effort recursive delete of every file stored for one record. */
export async function deleteStoredFilesForRecord(category: string, recordId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(recordId)) return;
  try {
    await fs.rm(path.join(UPLOADS_DIR, category, recordId), { recursive: true, force: true });
  } catch (err) {
    console.error('[file-storage] Failed to delete record folder', category, recordId, err);
  }
}
