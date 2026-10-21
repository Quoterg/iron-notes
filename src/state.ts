// Shared app state as Preact signals. Screens read these; writes go through the functions here so the
// day view, records and the open exercise stay in step.
import { computed, signal } from '@preact/signals';
import { byOrder, isoDate, recordIds, uid } from './lib/calc';
import * as db from './lib/db';
import { DEFAULT_SETTINGS, type Category, type Exercise, type Routine, type RoutineDay, type Settings, type WorkoutSet } from './lib/model';

export type View = 'log' | 'calendar' | 'routines' | 'settings';
export const view = signal<View>('log');

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const categories = signal<Category[]>([]);
export const exercises = signal<Exercise[]>([]);
export const catById = computed(() => new Map(categories.value.map((c) => [c.id, c])));
export const exById = computed(() => new Map(exercises.value.map((e) => [e.id, e])));

export const date = signal(isoDate(new Date()));
export const daySets = signal<WorkoutSet[]>([]);
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
function applyToCache(changed: readonly WorkoutSet[], removed: boolean) {
  const byEx = new Map<string, WorkoutSet[]>();
  for (const s of changed) byEx.get(s.exerciseId)?.push(s) ?? byEx.set(s.exerciseId, [s]);
  for (const [id, list] of byEx) {
    const c = cache.get(id);
    if (c) cache.set(id, c.then((a) => list.reduce((acc, s) => upsertSorted(acc, s, removed), a)));
  }
  return [...byEx.keys()];
}

/** After writes: the screen first (day, open exercise), then the touched exercises' records. */
async function afterWrite(changed: readonly WorkoutSet[], removed = false) {
  const ids = applyToCache(changed, removed);
  setsVersion.value++;
  if (changed.some((s) => s.date === date.value)) await loadDay(date.value);
  await Promise.all(ids.map(refreshRecords));
}
const afterSetWrite = (s: WorkoutSet, removed = false) => afterWrite([s], removed);

/** Copies sets to `to` (new ids, in their order, after anything already logged there; comments not copied). */
export async function copySets(sets: readonly WorkoutSet[], to: string): Promise<void> {
  const copies = [...sets].sort(byOrder).map(
    (s): WorkoutSet => ({ ...s, id: uid(), date: to, order: nextOrder(), comment: undefined, done: settings.value.markDone ? false : undefined }),
  );
  await db.putSets(copies);
  await afterWrite(copies);
}

/**
 * Moves one exercise of the shown day up (-1) or down (+1): the day's sets get new order keys in the
 * new exercise order, keeping each exercise's own set order (so records don't change).
 */
export async function moveExercise(exerciseId: string, dir: -1 | 1): Promise<void> {
  const groups = new Map<string, WorkoutSet[]>();
  for (const s of daySets.value) groups.get(s.exerciseId)?.push(s) ?? groups.set(s.exerciseId, [s]);
  const ids = [...groups.keys()];
  const i = ids.indexOf(exerciseId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const base = daySets.value[0].order; // reuse the day's own key range: other days are unaffected
  const moved = ids.flatMap((id) => groups.get(id)!).map((s, k) => ({ ...s, order: base + k }));
  await db.putSets(moved);
  applyToCache(moved, false); // order within each exercise is unchanged: records stay as they are
  setsVersion.value++;
  await loadDay(date.value);
}

/** Deletes a whole day (sets and comment); returns an undo. */
export async function deleteWorkout(d: string): Promise<() => Promise<void>> {
  const gone = await db.deleteDay(d);
  if (d === date.value) dayComment.value = '';
  await afterWrite(gone.sets, true);
  return async () => {
    await db.restoreDay(gone.sets, gone.comment);
    if (d === date.value) dayComment.value = gone.comment?.text ?? '';
    await afterWrite(gone.sets);
  };
}

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
const byRoutineOrder = (a: Routine, b: Routine) => a.order - b.order || a.name.localeCompare(b.name);

export async function loadRoutines(): Promise<Routine[]> {
  if (!routines.value) routines.value = (await db.getRoutines()).sort(byRoutineOrder);
  return routines.value;
}
export async function saveRoutine(r: Routine): Promise<void> {
  await db.putRoutine(r);
  routines.value = [...(routines.value ?? []).filter((x) => x.id !== r.id), r].sort(byRoutineOrder);
}
export async function removeRoutine(id: string): Promise<void> {
  await db.deleteRoutine(id);
  routines.value = (routines.value ?? []).filter((x) => x.id !== id);
}

/** Logs a routine day into `d` as planned (not yet done) sets, after anything already there. */
export async function logRoutineDay(day: RoutineDay, d: string): Promise<void> {
  const { plannedSets } = await import('./lib/routines');
  const items = day.items.filter((i) => exById.value.has(i.exerciseId));
  // Last done set per exercise: fills in weights the plan leaves open (e.g. "3 × 8" at last time's weight).
  const last = new Map<string, WorkoutSet | undefined>();
  await Promise.all(
    items.map(async (i) => {
      const all = await allSetsOf(i.exerciseId);
      let s: WorkoutSet | undefined;
      for (let k = all.length - 1; k >= 0 && !s; k--) if (all[k].done !== false) s = all[k];
      last.set(i.exerciseId, s);
    }),
  );
  const sets = plannedSets({ ...day, items }, d, (id) => last.get(id), nextOrder);
  if (!sets.length) return;
  await db.putSets(sets);
  if (d !== date.value) date.value = d;
  await afterWrite(sets);
}

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
