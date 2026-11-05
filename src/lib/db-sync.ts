// The database side of device sync (lib/sync.ts): reading the change log and the records to send,
// writing another device's changes, and the per-device aliases. A lazy module: only the sync screen
// loads it (every write's change-log stamp stays in db.ts).
import { db, KEY_PATH, SYNC_STORES, type Meta, type SyncStore } from './db';

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
/** The change log and the synced stores' records, for building what another device lacks. */
export async function readForSync(stores: SyncStore[]): Promise<{ meta: Map<string, Meta>; records: Map<SyncStore, Map<string, unknown>> }> {
  const tx = (await db()).transaction([...SYNC_STORES, 'meta']);
  const meta = new Map<string, Meta>();
  let cur = await tx.objectStore('meta').openCursor();
  while (cur) {
    meta.set(cur.key, cur.value);
    cur = await cur.continue();
  }
  const records = new Map<SyncStore, Map<string, unknown>>();
  for (const store of stores) {
    const all: unknown[] = store === 'kv' ? [await tx.objectStore('kv').get('settings')].filter((x) => x !== undefined) : await tx.objectStore(store).getAll();
    records.set(store, new Map(all.map((v) => [String((v as Record<string, unknown>)[KEY_PATH[store]]), v])));
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
  const applied: { k: string; store: SyncStore }[] = [];
  for (const c of changes) {
    const local = (await tx.objectStore('meta').get(c.k))?.mt ?? -1;
    if (c.mt <= local) continue;
    const os = tx.objectStore(c.store) as unknown as { get(k: string): Promise<unknown>; put(v: unknown): Promise<unknown>; delete(k: string): Promise<void> };
    if (c.del) await os.delete(c.key);
    else await os.put(merge(c.store, c.v, await os.get(c.key)));
    await tx.objectStore('meta').put(c.del ? { mt: c.mt, del: true } : { mt: c.mt }, c.k);
    applied.push({ k: c.k, store: c.store });
  }
  if (applied.some((a) => a.store === 'sets' || a.store === 'exercises')) await tx.objectStore('records').clear();
  await tx.done;
  return applied;
}
