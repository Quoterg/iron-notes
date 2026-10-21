// User data lives on the device, in IndexedDB. Nothing is sent anywhere.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Category, type DayComment, type Exercise, type Settings, type WorkoutSet } from './model';

interface Schema extends DBSchema {
  categories: { key: string; value: Category };
  exercises: { key: string; value: Exercise };
  sets: { key: string; value: WorkoutSet; indexes: { date: string; exercise: string } };
  comments: { key: string; value: DayComment };
  kv: { key: string; value: { key: string; value: unknown } };
}

export const DB_NAME = 'iron-notes';
let dbp: Promise<IDBPDatabase<Schema>> | undefined;

export function db(): Promise<IDBPDatabase<Schema>> {
  return (dbp ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('categories', { keyPath: 'id' });
      d.createObjectStore('exercises', { keyPath: 'id' });
      const sets = d.createObjectStore('sets', { keyPath: 'id' });
      sets.createIndex('date', 'date');
      sets.createIndex('exercise', 'exerciseId');
      d.createObjectStore('comments', { keyPath: 'date' });
      d.createObjectStore('kv', { keyPath: 'key' });
    },
  }));
}

/** Tests: forget the open connection (fake-indexeddb is reset between files). */
export function resetDbForTests(): void {
  dbp = undefined;
}

// ---- Settings ----
export async function getSettings(): Promise<Settings> {
  const row = await (await db()).get('kv', 'settings');
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) };
}
export async function putSettings(s: Settings): Promise<void> {
  await (await db()).put('kv', { key: 'settings', value: s });
}

// ---- Library ----
export async function getLibrary(): Promise<{ categories: Category[]; exercises: Exercise[] }> {
  const d = await db();
  const tx = d.transaction(['categories', 'exercises']);
  const [categories, exercises] = await Promise.all([tx.objectStore('categories').getAll(), tx.objectStore('exercises').getAll()]);
  return { categories, exercises };
}
export async function putCategory(c: Category): Promise<void> {
  await (await db()).put('categories', c);
}
export async function deleteCategory(id: string): Promise<void> {
  await (await db()).delete('categories', id);
}
export async function putExercise(e: Exercise): Promise<void> {
  await (await db()).put('exercises', e);
}
/** Deletes an exercise and every set logged for it. */
export async function deleteExercise(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['exercises', 'sets'], 'readwrite');
  const keys = await tx.objectStore('sets').index('exercise').getAllKeys(id);
  await Promise.all([...keys.map((k) => tx.objectStore('sets').delete(k)), tx.objectStore('exercises').delete(id), tx.done]);
}
export async function putLibrary(categories: Category[], exercises: Exercise[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(['categories', 'exercises'], 'readwrite');
  await Promise.all([
    ...categories.map((c) => tx.objectStore('categories').put(c)),
    ...exercises.map((e) => tx.objectStore('exercises').put(e)),
    tx.done,
  ]);
}

// ---- Sets ----
export async function setsOn(date: string): Promise<WorkoutSet[]> {
  return (await db()).getAllFromIndex('sets', 'date', date);
}
export async function setsOf(exerciseId: string): Promise<WorkoutSet[]> {
  return (await db()).getAllFromIndex('sets', 'exercise', exerciseId);
}
export async function countSetsOf(exerciseId: string): Promise<number> {
  return (await db()).countFromIndex('sets', 'exercise', exerciseId);
}
export async function putSet(s: WorkoutSet): Promise<void> {
  await (await db()).put('sets', s);
}
export async function deleteSet(id: string): Promise<void> {
  await (await db()).delete('sets', id);
}

// ---- Workout comments ----
export async function getComment(date: string): Promise<string> {
  return (await (await db()).get('comments', date))?.text ?? '';
}
export async function putComment(date: string, text: string): Promise<void> {
  const d = await db();
  if (text.trim()) await d.put('comments', { date, text: text.trim() });
  else await d.delete('comments', date);
}

// ---- Backup ----
export interface Backup {
  app: 'iron-notes';
  version: 1;
  exported: string;
  categories: Category[];
  exercises: Exercise[];
  sets: WorkoutSet[];
  comments: DayComment[];
  settings: Settings;
}

export async function exportAll(): Promise<Backup> {
  const d = await db();
  const [categories, exercises, sets, comments, settings] = await Promise.all([
    d.getAll('categories'), d.getAll('exercises'), d.getAll('sets'), d.getAll('comments'), getSettings(),
  ]);
  return { app: 'iron-notes', version: 1, exported: new Date().toISOString(), categories, exercises, sets, comments, settings };
}

/** Replaces all data with a backup. Throws (and changes nothing) if the file isn't one. */
export async function importAll(b: unknown): Promise<void> {
  const x = b as Partial<Backup> | null;
  if (!x || x.app !== 'iron-notes' || !Array.isArray(x.sets) || !Array.isArray(x.exercises) || !Array.isArray(x.categories)) {
    throw new Error('Not an Iron Notes backup');
  }
  const d = await db();
  const stores = ['categories', 'exercises', 'sets', 'comments', 'kv'] as const;
  const tx = d.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  const ops: Promise<unknown>[] = [];
  for (const c of x.categories) ops.push(tx.objectStore('categories').put(c));
  for (const e of x.exercises) ops.push(tx.objectStore('exercises').put(e));
  for (const s of x.sets) ops.push(tx.objectStore('sets').put(s));
  for (const c of x.comments ?? []) ops.push(tx.objectStore('comments').put(c));
  ops.push(tx.objectStore('kv').put({ key: 'settings', value: { ...DEFAULT_SETTINGS, ...x.settings } }));
  await Promise.all([...ops, tx.done]);
}
