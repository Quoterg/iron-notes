// Shared app state as Preact signals. Screens read these; writes go through the functions here so the
// day view, records and the open exercise stay in step.
import { computed, signal } from '@preact/signals';
import { byOrder, isoDate, recordIds } from './lib/calc';
import * as db from './lib/db';
import { DEFAULT_SETTINGS, type Category, type Exercise, type Routine, type Settings, type WorkoutSet } from './lib/model';

export type View = 'log' | 'calendar' | 'routines' | 'body' | 'settings';
export const view = signal<View>('log');

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const categories = signal<Category[]>([]);
export const exercises = signal<Exercise[]>([]);
export const catById = computed(() => new Map(categories.value.map((c) => [c.id, c])));
export const exById = computed(() => new Map(exercises.value.map((e) => [e.id, e])));

export const date = signal(isoDate(new Date()));
export const daySets = signal<WorkoutSet[]>([]);
/** The date `daySets` belong to: while another day loads, the log shows nothing stale to tap. */
export const dayLoaded = signal('');
export const dayComment = signal('');
/** Record-holding set ids per exercise, for the exercises loaded so far. */
export const records = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
/** Bumped after every set write: open exercise screens reload. */
export const setsVersion = signal(0);
export const updateReady = signal(false);

export async function loadSettings(): Promise<void> {
  settings.value = await db.getSettings();
}
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings.value = { ...settings.value, ...patch };
  await db.putSettings(settings.value);
}

const byCatOrder = (a: Category, b: Category) => a.order - b.order || a.name.localeCompare(b.name);
const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);

export async function loadLibrary(): Promise<void> {
  let lib = await db.getLibrary();
  // Seed once per device: a user who deleted every exercise and category keeps an empty library.
  if (!lib.categories.length && !(await db.isSeeded())) {
    const { starterLibrary } = await import('./lib/seed');
    lib = starterLibrary();
    await db.putLibrary(lib.categories, lib.exercises);
    await db.markSeeded();
  } else if (lib.categories.length) void db.isSeeded().then((s) => (s ? undefined : db.markSeeded())); // installs from before the flag
  categories.value = lib.categories.sort(byCatOrder);
  exercises.value = lib.exercises.sort(byName);
  void mapMusclesOnce();
}

/** Installs from before the muscle map: give known exercises their muscles, once (never overwrites). */
async function mapMusclesOnce() {
  if (await db.getFlag('musclesMapped')) return;
  const { withDefaultMuscles } = await import('./lib/muscles');
  const mapped = withDefaultMuscles(exercises.value);
  if (mapped.length) {
    await db.putLibrary([], mapped);
    const byId = new Map(mapped.map((e) => [e.id, e]));
    exercises.value = exercises.value.map((e) => byId.get(e.id) ?? e);
  }
  await db.setFlag('musclesMapped');
}

/** Stars or unstars an exercise: one write, no records refresh (the sets didn't change). */
export async function setFavorite(e: Exercise, favorite: boolean): Promise<void> {
  const next = { ...e, favorite: favorite || undefined };
  await db.putExercise(next);
  exercises.value = exercises.value.map((x) => (x.id === e.id ? next : x));
}

export async function saveExercise(e: Exercise): Promise<void> {
  await db.putExercise(e);
  exercises.value = [...exercises.value.filter((x) => x.id !== e.id), e].sort(byName);
  await refreshRecords(e.id); // the type may have changed
}
export async function removeExercise(id: string): Promise<void> {
  await db.deleteExercise(id); // also its sets and stored records
  exercises.value = exercises.value.filter((x) => x.id !== id);
  cache.delete(id);
  dropRecords(id);
  setsVersion.value++;
  await loadDay(date.value);
}
export async function saveCategory(c: Category): Promise<void> {
  await db.putCategory(c);
  categories.value = [...categories.value.filter((x) => x.id !== c.id), c].sort(byCatOrder);
}
export async function removeCategory(id: string): Promise<void> {
  await db.deleteCategory(id);
  categories.value = categories.value.filter((x) => x.id !== id);
}

// ---- Days and sets ----
let dayReq = 0;
export async function loadDay(d: string): Promise<void> {
  date.value = d;
  const req = ++dayReq;
  const [sets, comment] = await Promise.all([db.setsOn(d), db.getComment(d)]);
  if (req !== dayReq) return; // a newer day was asked for meanwhile
  daySets.value = sets.sort(byOrder);
  dayLoaded.value = d;
  dayComment.value = comment;
  void loadRecords([...new Set(sets.map((s) => s.exerciseId))]);
}

/** All sets of an exercise (cached until one of them changes). */
const cache = new Map<string, Promise<WorkoutSet[]>>();
export function allSetsOf(exerciseId: string): Promise<WorkoutSet[]> {
  let c = cache.get(exerciseId);
  if (!c) {
    c = db.setsOf(exerciseId).then((s) => s.sort(byOrder));
    cache.set(exerciseId, c);
  }
  return c;
}

function dropRecords(exerciseId: string) {
  if (!records.value.has(exerciseId)) return;
  const m = new Map(records.value);
  m.delete(exerciseId);
  records.value = m;
}

/**
 * Records of exercises not loaded yet: from the stored records (one small read each); only an
 * exercise without stored records (older installs, after a restore) reads its history, once.
 */
export async function loadRecords(ids: string[]): Promise<void> {
  const todo = ids.filter((id) => !records.value.has(id) && exById.value.has(id));
  if (!todo.length) return;
  const found = await Promise.all(
    todo.map(async (id) => {
      const stored = await db.getRecords(id);
      if (stored) return [id, new Set(stored.ids)] as const;
      const r = recordIds(await allSetsOf(id), exById.value.get(id)!.type, true);
      void db.putRecordsIfAbsent({ exerciseId: id, ids: [...r] }); // never over a fresher refresh
      return [id, r] as const;
    }),
  );
  const m = new Map(records.value);
  for (const [id, r] of found) m.set(id, r);
  records.value = m;
}

/** Recomputes an exercise's records from its (cached) history and stores them: after any write. */
async function refreshRecords(exerciseId: string): Promise<void> {
  const ex = exById.value.get(exerciseId);
  if (!ex) return;
  const r = recordIds(await allSetsOf(exerciseId), ex.type, true);
  await db.putRecords({ exerciseId, ids: [...r] });
  records.value = new Map(records.value).set(exerciseId, r);
}

let orderSeq = 0;
/** A unique, increasing order key for a new set. */
export function nextOrder(): number {
  orderSeq = Math.max(orderSeq + 1, Date.now());
  return orderSeq;
}
/** `n` consecutive order keys (an import); returns the first. */
export function reserveOrders(n: number): number {
  const start = nextOrder();
  orderSeq = start + Math.max(0, n - 1);
  return start;
}

/** The cached history with one set inserted/replaced (kept in order) or removed: no re-read, no re-sort. */
export function upsertSorted(list: readonly WorkoutSet[], s: WorkoutSet, remove: boolean): WorkoutSet[] {
  const out = list.filter((x) => x.id !== s.id);
  if (remove) return out;
  let i = out.length;
  while (i > 0 && byOrder(out[i - 1], s) > 0) i--; // new sets usually go last: O(1)
  out.splice(i, 0, s);
  return out;
}

/** Applies written (or removed) sets to the cached histories that are loaded: no re-read, no re-sort. */
export function applyToCache(changed: readonly WorkoutSet[], removed: boolean) {
  const byEx = new Map<string, WorkoutSet[]>();
  for (const s of changed) byEx.get(s.exerciseId)?.push(s) ?? byEx.set(s.exerciseId, [s]);
  for (const [id, list] of byEx) {
    const c = cache.get(id);
    if (c) cache.set(id, c.then((a) => list.reduce((acc, s) => upsertSorted(acc, s, removed), a)));
  }
  return [...byEx.keys()];
}

/** After writes: the screen first (day, open exercise), then the touched exercises' records. */
export async function afterWrite(changed: readonly WorkoutSet[], removed = false) {
  const ids = applyToCache(changed, removed);
  setsVersion.value++;
  if (changed.some((s) => s.date === date.value)) await loadDay(date.value);
  await Promise.all(ids.map(refreshRecords));
}
const afterSetWrite = (s: WorkoutSet, removed = false) => afterWrite([s], removed);

export async function saveSet(s: WorkoutSet): Promise<void> {
  await db.putSet(s);
  await afterSetWrite(s);
}
export async function removeSet(s: WorkoutSet): Promise<void> {
  await db.deleteSet(s.id);
  await afterSetWrite(s, true);
}

export async function saveComment(d: string, text: string): Promise<void> {
  await db.putComment(d, text);
  if (d === date.value) dayComment.value = text.trim();
}

// ---- Routines (loaded when first needed, not at start) ----
export const routines = signal<Routine[] | null>(null);
// ---- Toast ----
export const toastText = signal('');
/** Optional button on the toast (e.g. Undo); it stays a little longer then. */
export const toastAction = signal<{ label: string; run: () => void } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, action?: { label: string; run: () => void }): void {
  toastText.value = text;
  toastAction.value = action ?? null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastText.value = '';
    toastAction.value = null;
  }, action ? 6000 : 2500);
}

/** After a restore: everything from storage again. */
export async function reloadAll(): Promise<void> {
  cache.clear();
  records.value = new Map();
  routines.value = null;
  await Promise.all([loadSettings(), loadLibrary()]);
  setsVersion.value++;
  await loadDay(date.value);
}
