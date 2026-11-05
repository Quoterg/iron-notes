// The database side of device sync (lib/sync.ts): reading the change log and the records to send,
// writing another device's changes, and the per-device aliases. A lazy module: only the sync screen
// loads it (every write's change-log stamp stays in db.ts).
import { db, KEY_PATH, sawChangeTime, SYNC_STORES, type Meta, type SyncStore } from './db';

/** Another device's library ids mapped to this device's (same name): per device, never synced. */
export type Aliases = Partial<Record<'categories' | 'exercises' | 'metrics', Record<string, string>>>;
export async function getAliases(): Promise<Aliases> {
  return ((await (await db()).get('kv', 'syncAliases'))?.value as Aliases | undefined) ?? {};
}
export async function putAliases(a: Aliases): Promise<void> {
  await (await db()).put('kv', { key: 'syncAliases', value: a });
}
/** The library's names by id (categories, exercises with their type, measures), for matching by name. */
export async function libraryNames(): Promise<Record<'categories' | 'exercises' | 'metrics', Map<string, string>>> {
  const tx = (await db()).transaction(['categories', 'exercises', 'metrics']);
  const [c, e, m] = await Promise.all([tx.objectStore('categories').getAll(), tx.objectStore('exercises').getAll(), tx.objectStore('metrics').getAll()]);
  return {
    categories: new Map(c.map((x) => [x.id, x.name.toLowerCase()])),
    exercises: new Map(e.map((x) => [x.id, `${x.name.toLowerCase()}|${x.type}`])),
    metrics: new Map(m.map((x) => [x.id, `${x.name.toLowerCase()}|${x.kind}`])),
  };
}
/** Every synced record's last change, pruning tombstones older than `cutoff` (one cursor walk). */
export async function summarizeMeta(cutoff: number): Promise<Record<string, number>> {
  const tx = (await db()).transaction('meta', 'readwrite');
  const out: Record<string, number> = {};
  let cur = await tx.store.openCursor();
  while (cur) {
    if (cur.value.del && cur.value.mt < cutoff) await cur.delete();
    else out[cur.key] = cur.value.mt;
    cur = await cur.continue();
  }
  await tx.done;
  return out;
}
/**
 * The change log and the wanted records (by store), for building what another device lacks: each record
 * read by key, or the whole store when most of it is wanted (a first sync).
 */
export async function readForSync(wanted: [SyncStore, string][]): Promise<{ meta: Map<string, Meta>; records: Map<SyncStore, Map<string, unknown>> }> {
  const tx = (await db()).transaction([...SYNC_STORES, 'meta']);
  const meta = new Map<string, Meta>();
  let cur = await tx.objectStore('meta').openCursor();
  while (cur) {
    meta.set(cur.key, cur.value);
    cur = await cur.continue();
  }
  const byStore = new Map<SyncStore, string[]>();
  for (const [store, key] of wanted) byStore.get(store)?.push(key) ?? byStore.set(store, [key]);
  const records = new Map<SyncStore, Map<string, unknown>>();
  for (const [store, keys] of byStore) {
    const os = tx.objectStore(store) as unknown as { get(k: string): Promise<unknown>; getAll(): Promise<unknown[]>; count(): Promise<number> };
    if (store !== 'kv' && keys.length > (await os.count()) / 3) {
      records.set(store, new Map((await os.getAll()).map((v) => [String((v as Record<string, unknown>)[KEY_PATH[store]]), v])));
    } else {
      const got = await Promise.all(keys.map((k) => os.get(k)));
      records.set(store, new Map(keys.flatMap((k, i) => (got[i] === undefined ? [] : [[k, got[i]] as [string, unknown]]))));
    }
  }
  await tx.done;
  return { meta, records };
}
/**
 * Writes another device's changes where they're newer than the local copy (one transaction); returns
 * the applied ones. `merge` adjusts a record against the local one (settings keep device-local keys).
 * The records cache is cleared when sets or exercises changed.
 */
export async function applySynced(
  changes: { k: string; mt: number; del?: true; store: SyncStore; key: string; v?: unknown }[],
  merge: (store: SyncStore, incoming: unknown, local: unknown) => unknown,
): Promise<{ k: string; store: SyncStore }[]> {
  const tx = (await db()).transaction([...SYNC_STORES, 'records', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  // All local times at once, then the writes queued without waiting on each other (a first sync is
  // thousands of records on a slow phone).
  const local = await Promise.all(changes.map((c) => meta.get(c.k)));
  const newer = changes.filter((c, i) => c.mt > (local[i]?.mt ?? -1));
  const settingsRow = newer.some((c) => c.store === 'kv') ? await tx.objectStore('kv').get('settings') : undefined;
  const ops: Promise<unknown>[] = [];
  for (const c of newer) {
    const os = tx.objectStore(c.store) as unknown as { put(v: unknown): Promise<unknown>; delete(k: string): Promise<void> };
    ops.push(c.del ? os.delete(c.key) : os.put(c.store === 'kv' ? merge(c.store, c.v, settingsRow) : merge(c.store, c.v, undefined)));
    ops.push(meta.put(c.del ? { mt: c.mt, del: true } : { mt: c.mt }, c.k));
    // A change seen from a clock ahead of this one: a later edit here must still be newer.
    sawChangeTime(c.mt);
  }
  if (newer.some((c) => c.store === 'sets' || c.store === 'exercises')) ops.push(tx.objectStore('records').clear());
  await Promise.all([...ops, tx.done]);
  return newer.map((c) => ({ k: c.k, store: c.store }));
}
