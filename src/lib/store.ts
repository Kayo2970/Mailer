/**
 * store.ts — tiny file-backed database. Each collection is one JSON file under
 * the data directory (./data by default, or MAILER_DATA_DIR), read-modify-written
 * behind a per-collection async mutex so concurrent writes queue instead of
 * clobbering each other.
 *
 * Everything stays on this machine. The files are written with owner-only
 * permissions because settings.json holds the SMTP password.
 */
import fs from 'fs/promises';
import path from 'path';

export const DATA_DIR = process.env.MAILER_DATA_DIR
  ? path.resolve(process.env.MAILER_DATA_DIR)
  : path.join(process.cwd(), 'data');

export type CollectionKey = 'settings' | 'emails';

// Shared via globalThis: Next.js can load this module once per route chunk, and
// separate copies would each have their own cache and mutex.
const g = globalThis as unknown as {
  __mailerStoreCache?: Map<string, unknown[]>;
  __mailerStoreLocks?: Map<string, Promise<unknown>>;
};
const cache: Map<string, unknown[]> = (g.__mailerStoreCache ??= new Map());
const locks: Map<string, Promise<unknown>> = (g.__mailerStoreLocks ??= new Map());

const fileFor = (key: CollectionKey) => path.join(DATA_DIR, `${key}.json`);

async function load<T>(key: CollectionKey): Promise<T[]> {
  const cached = cache.get(key);
  if (cached) return cached as T[];
  let rows: T[] = [];
  try {
    const parsed = JSON.parse(await fs.readFile(fileFor(key), 'utf8'));
    if (Array.isArray(parsed)) rows = parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      // A corrupt file must not be silently replaced by an empty collection on the next write.
      throw new Error(`Could not read ${fileFor(key)}: ${(err as Error).message}`);
    }
  }
  cache.set(key, rows);
  return rows;
}

async function persist<T>(key: CollectionKey, rows: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = fileFor(key);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows), { mode: 0o600 });
  await fs.rename(tmp, target); // atomic: a crash mid-write never leaves a half-written file
  cache.set(key, rows);
}

/** A snapshot of the collection. Treat it as read-only; change it through mutateCollection. */
export async function readCollection<T>(key: CollectionKey): Promise<T[]> {
  // Wait for any write in flight so a read never sees a stale snapshot.
  await (locks.get(key) || Promise.resolve()).catch(() => {});
  return load<T>(key);
}

/** Read-modify-write. The mutator returns the new collection (never mutate the array it is given). */
export async function mutateCollection<T>(key: CollectionKey, mutator: (current: T[]) => T[]): Promise<T[]> {
  const previous = locks.get(key) || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(async () => {
      const next = mutator(await load<T>(key));
      await persist(key, next);
      return next;
    });
  locks.set(key, run);
  return run;
}
