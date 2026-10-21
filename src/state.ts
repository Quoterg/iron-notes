// Shared app state as Preact signals. Screens read these; writes go through the functions here so the
// day view, records and the open exercise stay in step.
import { computed, signal } from '@preact/signals';
import { byOrder, isoDate, recordIds } from './lib/calc';
import * as db from './lib/db';
import { DEFAULT_SETTINGS, type Category, type Exercise, type Settings, type WorkoutSet } from './lib/model';

export type View = 'log' | 'settings';
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
  if (!lib.categories.length) {
    const { starterLibrary } = await import('./lib/seed');
    lib = starterLibrary();
    await db.putLibrary(lib.categories, lib.exercises);
  }
  categories.value = lib.categories.sort(byCatOrder);
  exercises.value = lib.exercises.sort(byName);
}

export async function saveExercise(e: Exercise): Promise<void> {
  await db.putExercise(e);
  exercises.value = [...exercises.value.filter((x) => x.id !== e.id), e].sort(byName);
  dropRecords(e.id); // the type may have changed
  void loadRecords([e.id]);
}
export async function removeExercise(id: string): Promise<void> {
  await db.deleteExercise(id);
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

export async function loadRecords(ids: string[]): Promise<void> {
  const todo = ids.filter((id) => !records.value.has(id) && exById.value.has(id));
  if (!todo.length) return;
  const found = await Promise.all(todo.map(async (id) => [id, recordIds(await allSetsOf(id), exById.value.get(id)!.type)] as const));
  const m = new Map(records.value);
  for (const [id, r] of found) m.set(id, r);
  records.value = m;
}

let orderSeq = 0;
/** A unique, increasing order key for a new set. */
export function nextOrder(): number {
  orderSeq = Math.max(orderSeq + 1, Date.now());
  return orderSeq;
}

async function afterSetWrite(s: WorkoutSet) {
  cache.delete(s.exerciseId);
  dropRecords(s.exerciseId);
  setsVersion.value++;
  if (s.date === date.value) await loadDay(s.date);
  else await loadRecords([s.exerciseId]);
}

export async function saveSet(s: WorkoutSet): Promise<void> {
  await db.putSet(s);
  await afterSetWrite(s);
}
export async function removeSet(s: WorkoutSet): Promise<void> {
  await db.deleteSet(s.id);
  await afterSetWrite(s);
}

export async function saveComment(d: string, text: string): Promise<void> {
  await db.putComment(d, text);
  if (d === date.value) dayComment.value = text.trim();
}

// ---- Toast ----
export const toastText = signal('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string): void {
  toastText.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastText.value = ''), 2500);
}

/** After a restore: everything from storage again. */
export async function reloadAll(): Promise<void> {
  cache.clear();
  records.value = new Map();
  await Promise.all([loadSettings(), loadLibrary()]);
  setsVersion.value++;
  await loadDay(date.value);
}
