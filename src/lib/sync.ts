// Device-to-device sync engine (M21, as in Iron Log). Transport-agnostic: the pairing screen moves these
// messages over a direct, encrypted WebRTC connection; tests move them in memory. Loaded only when syncing.
//
// Protocol (both sides do the same, so it doesn't matter who started):
//   1. send `mine = await summarize()`                    — every record's key and last-change time
//   2. on their summary: send `await changesFor(it, mine)` — what they lack or have older (incl. deletions)
//   3. on their changes: `await applyChanges(them)`         — the newest change wins
// Ties (same change time) keep the local copy. Deletions travel as tombstones, kept for 90 days: a device
// that hasn't synced for longer may bring back records deleted elsewhere. Clocks only need to be roughly
// right; change times from the other device are capped at a few minutes ahead of ours.
import { SYNC_VALIDATORS } from './backup';
import { KEY_PATH, SYNC_STORES, type SyncStore } from './db';
import { applySynced, getAliases, libraryNames, putAliases, readForSync, summarizeMeta, type Aliases } from './db-sync';
import type { BodyEntry, BodyMetric, Category, Exercise, Routine, Settings, WorkoutSet } from './model';

export type { SyncStore };

/** metaKey → last change (ms). */
export type Summary = Record<string, number>;

/** One record to bring over: its new value, or a deletion. */
export interface Change {
  k: string;
  mt: number;
  del?: true;
  v?: unknown;
}

export interface Applied {
  /** Records changed on this device. */
  count: number;
  /** Which stores changed (the app reloads what's affected). */
  stores: SyncStore[];
}

export const TOMBSTONE_DAYS = 90;
const MAX_CLOCK_AHEAD = 5 * 60_000;
/** Kept per device, never taken from the other device's settings. */
export const DEVICE_LOCAL_SETTINGS = ['lang', 'gymEnglish', 'keepScreenOn', 'restNotify'] as const;

/** A sync failure. Its message may contain text from the other device: show it as plain text only. */
export class SyncError extends Error {}

/**
 * Store and key of a change-log key. A well-formed key of a store this version doesn't know (added by
 * a newer version on the other device) gives null: skipped, so the rest still syncs. Anything else
 * malformed is an error.
 */
function split(k: string): [SyncStore, string] | null {
  const i = k.indexOf(':');
  const store = k.slice(0, i) as SyncStore;
  if (i < 1 || !/^[a-z][A-Za-z]{0,39}$/.test(store)) throw new SyncError(`bad key ${k.slice(0, 40)}`);
  return SYNC_STORES.includes(store) ? [store, k.slice(i + 1)] : null;
}

const keyOf = (store: SyncStore, v: unknown): string => String((v as Record<string, unknown>)[KEY_PATH[store]]);

/** Every synced record (and tombstone) on this device with its last change; prunes old tombstones. */
export function summarize(now = Date.now()): Promise<Summary> {
  return summarizeMeta(now - TOMBSTONE_DAYS * 864e5);
}

/** What the other device lacks or has an older version of. Pass `mine` if already summarized. */
export async function changesFor(theirs: Summary, mine?: Summary): Promise<Change[]> {
  mine ??= await summarize();
  const wanted = Object.entries(mine).filter(([k, mt]) => mt > (theirs[k] ?? -1));
  if (!wanted.length) return [];
  const stores = [...new Set(wanted.flatMap(([k]) => split(k)?.[0] ?? []))];
  const { meta, records } = await readForSync(stores);
  const out: Change[] = [];
  // The library before what refers to it: the other device matches categories, exercises and measures
  // by name first (see applyChanges), then maps what refers to them.
  wanted.sort(([a], [b]) => ORDER.indexOf(a.slice(0, a.indexOf(':')) as SyncStore) - ORDER.indexOf(b.slice(0, b.indexOf(':')) as SyncStore));
  for (const [k, mt] of wanted) {
    if (meta.get(k)?.del) {
      out.push({ k, mt, del: true });
      continue;
    }
    const sk = split(k);
    if (!sk) continue;
    const v = records.get(sk[0])?.get(sk[1]);
    if (v !== undefined) out.push({ k, mt, v });
  }
  return out;
}

/** The order changes are sent and applied in: what's referred to first. */
const ORDER: SyncStore[] = ['categories', 'exercises', 'metrics', 'routines', 'sets', 'body', 'comments', 'kv'];
type Library = 'categories' | 'exercises' | 'metrics';
const nameKey = (store: Library, v: unknown): string =>
  store === 'categories'
    ? (v as Category).name.toLowerCase()
    : store === 'exercises'
      ? `${(v as Exercise).name.toLowerCase()}|${(v as Exercise).type}`
      : `${(v as BodyMetric).name.toLowerCase()}|${(v as BodyMetric).kind}`;

/** A record from the other device with its library references mapped to this device's ids. */
function mapRefs(store: SyncStore, v: unknown, a: Aliases): unknown {
  const ex = (id: string) => a.exercises?.[id] ?? id;
  if (store === 'sets') return { ...(v as WorkoutSet), exerciseId: ex((v as WorkoutSet).exerciseId) };
  if (store === 'exercises') return { ...(v as Exercise), categoryId: a.categories?.[(v as Exercise).categoryId] ?? (v as Exercise).categoryId };
  if (store === 'body') return { ...(v as BodyEntry), metricId: a.metrics?.[(v as BodyEntry).metricId] ?? (v as BodyEntry).metricId };
  if (store === 'routines') {
    const r = v as Routine;
    return { ...r, days: r.days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, exerciseId: ex(i.exerciseId) })) })) };
  }
  return v;
}

/** Settings from the other device, keeping this device's own (language, screen, notifications). */
function mergeSettings(incoming: { key: 'settings'; value: Settings }, local: { value?: Settings } | undefined) {
  const value: Record<string, unknown> = { ...incoming.value };
  for (const k of DEVICE_LOCAL_SETTINGS) {
    delete value[k];
    if (local?.value?.[k] !== undefined) value[k] = local.value[k];
  }
  return { key: 'settings', value };
}

/**
 * Apply the other device's changes where they are newer. Every record is validated with the same
 * rules as a backup import and must be stored under its own key; anything invalid aborts the whole
 * sync before writing (nothing half-applied).
 */
type Checked = { k: string; mt: number; del?: true; store: SyncStore; key: string; v?: unknown };

export async function applyChanges(changes: Change[], now = Date.now()): Promise<Applied> {
  const checked = changes.flatMap((c): Checked[] => {
    if (!c || typeof c.k !== 'string' || typeof c.mt !== 'number' || !Number.isFinite(c.mt) || c.mt < 0) throw new SyncError('bad change');
    const sk = split(c.k);
    if (!sk) return []; // a store from a newer version: skipped
    const [store, key] = sk;
    const mt = Math.min(c.mt, now + MAX_CLOCK_AHEAD);
    if (c.del) return [{ k: c.k, mt, del: true, store, key }];
    let v: unknown;
    try {
      v = SYNC_VALIDATORS[store](c.v);
    } catch {
      throw new SyncError(`invalid ${store} record`);
    }
    if (keyOf(store, v) !== key) throw new SyncError(`key mismatch in ${store}`);
    return [{ k: c.k, mt, store, key, v }];
  });

  // Each device seeded its own starter library (own ids): a category, exercise or measure the other
  // device has under another id but the same name (and type) is this device's one — remembered as an
  // alias, not added twice; whatever refers to it is mapped to the local id.
  const aliases = await getAliases();
  const names = await libraryNames();
  let aliased = false;
  const kept = checked.flatMap((c): Checked[] => {
    if (c.store === 'categories' || c.store === 'exercises' || c.store === 'metrics') {
      const lib = c.store;
      if (aliases[lib]?.[c.key]) return []; // already this device's other record: its changes stay there
      if (!c.del && !names[lib].has(c.key)) {
        const n = nameKey(lib, mapRefs(lib, c.v, aliases));
        const local = [...names[lib]].find(([, x]) => x === n)?.[0];
        if (local) {
          (aliases[lib] ??= {})[c.key] = local;
          aliased = true;
          return [];
        }
        names[lib].set(c.key, n); // new here: a later record of the same name maps to this one
      }
    }
    return [c.v === undefined ? c : { ...c, v: mapRefs(c.store, c.v, aliases) }];
  });
  if (aliased) await putAliases(aliases);
  const applied = await applySynced(kept, (store, v, local) => (store === 'kv' ? mergeSettings(v as { key: 'settings'; value: Settings }, local as { value?: Settings }) : v));
  return { count: applied.length, stores: [...new Set(applied.map((a) => a.store))] };
}
