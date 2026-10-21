// User data lives on the device, in IndexedDB. Nothing is sent anywhere.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Category, type Routine, type DayComment, type Exercise, type Settings, type WorkoutSet } from './model';

interface Schema extends DBSchema {
  categories: { key: string; value: Category };
  exercises: { key: string; value: Exercise };
  sets: { key: string; value: WorkoutSet; indexes: { date: string; exercise: string } };
  comments: { key: string; value: DayComment };
  kv: { key: string; value: { key: string; value: unknown } };
  /** Record-holding set ids per exercise (v2): a day opens without reading each exercise's history. */
  records: { key: string; value: StoredRecords };
  /** v3 */
  routines: { key: string; value: Routine };
}

export interface StoredRecords {
  exerciseId: string;
  ids: string[];
}

export const DB_NAME = 'iron-notes';
let dbp: Promise<IDBPDatabase<Schema>> | undefined;

/**
 * Another tab (or the installed app) still has an older version of the database open, so this one
 * can't upgrade until it closes. The app shows a notice; set by main.tsx.
 */
let onBlocked: () => void = () => {};
export function setBlockedHandler(fn: () => void): void {
  onBlocked = fn;
}

export function db(): Promise<IDBPDatabase<Schema>> {
  return (dbp ??= openDB<Schema>(DB_NAME, 3, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('categories', { keyPath: 'id' });
        d.createObjectStore('exercises', { keyPath: 'id' });
        const sets = d.createObjectStore('sets', { keyPath: 'id' });
        sets.createIndex('date', 'date');
        sets.createIndex('exercise', 'exerciseId');
        d.createObjectStore('comments', { keyPath: 'date' });
        d.createObjectStore('kv', { keyPath: 'key' });
      }
      // v2: a cache only — filled lazily from the sets, so existing installs need no data migration.
      if (oldVersion < 2) d.createObjectStore('records', { keyPath: 'exerciseId' });
      if (oldVersion < 3) d.createObjectStore('routines', { keyPath: 'id' });
    },
    // A newer version opened elsewhere: step aside so it can upgrade, then start the new version here too.
    blocking(_current, _next, event) {
      dbp = undefined;
      (event.target as IDBDatabase).close();
      if (typeof location !== 'undefined' && typeof document !== 'undefined') location.reload();
    },
    blocked: () => onBlocked(),
    // The browser closed the connection (storage cleared, crash): reopen on next use.
    terminated() {
      dbp = undefined;
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
/** Whether the starter library was ever written (or a backup restored): seed only once per device. */
export async function isSeeded(): Promise<boolean> {
  return !!(await (await db()).get('kv', 'seeded'));
}
export async function markSeeded(): Promise<void> {
  await (await db()).put('kv', { key: 'seeded', value: true });
}

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
  const tx = d.transaction(['exercises', 'sets', 'records'], 'readwrite');
  const keys = await tx.objectStore('sets').index('exercise').getAllKeys(id);
  await Promise.all([
    ...keys.map((k) => tx.objectStore('sets').delete(k)),
    tx.objectStore('exercises').delete(id),
    tx.objectStore('records').delete(id),
    tx.done,
  ]);
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
/** Sets from `from` to `to` (inclusive), one index range read: a month for the calendar. */
export async function setsBetween(from: string, to: string): Promise<WorkoutSet[]> {
  return (await db()).getAllFromIndex('sets', 'date', IDBKeyRange.bound(from, to));
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
/** Writes several sets in one transaction (copy a workout, reorder). */
export async function putSets(sets: WorkoutSet[]): Promise<void> {
  const tx = (await db()).transaction('sets', 'readwrite');
  await Promise.all([...sets.map((s) => tx.store.put(s)), tx.done]);
}
/** Deletes a day's sets and comment in one transaction; returns them (for undo). */
export async function deleteDay(date: string): Promise<{ sets: WorkoutSet[]; comment?: DayComment }> {
  const tx = (await db()).transaction(['sets', 'comments'], 'readwrite');
  const [sets, comment] = await Promise.all([tx.objectStore('sets').index('date').getAll(date), tx.objectStore('comments').get(date)]);
  await Promise.all([...sets.map((s) => tx.objectStore('sets').delete(s.id)), tx.objectStore('comments').delete(date), tx.done]);
  return { sets, comment };
}
/** Puts back what deleteDay removed. */
export async function restoreDay(sets: WorkoutSet[], comment?: DayComment): Promise<void> {
  const tx = (await db()).transaction(['sets', 'comments'], 'readwrite');
  await Promise.all([...sets.map((s) => tx.objectStore('sets').put(s)), ...(comment ? [tx.objectStore('comments').put(comment)] : []), tx.done]);
}
/** The latest `limit` dates with sets, newest first, other than `except` (one key cursor, no set reads). */
export async function recentWorkoutDates(limit: number, except?: string): Promise<string[]> {
  const tx = (await db()).transaction('sets');
  const out: string[] = [];
  let cur = await tx.store.index('date').openKeyCursor(null, 'prevunique');
  while (cur && out.length < limit) {
    if (cur.key !== except) out.push(cur.key);
    cur = await cur.continue();
  }
  return out;
}

// ---- Routines ----
export async function getRoutines(): Promise<Routine[]> {
  return (await db()).getAll('routines');
}
export async function putRoutine(r: Routine): Promise<void> {
  await (await db()).put('routines', r);
}
export async function deleteRoutine(id: string): Promise<void> {
  await (await db()).delete('routines', id);
}

// ---- Stored records (a cache of recordIds per exercise) ----
export async function getRecords(exerciseId: string): Promise<StoredRecords | undefined> {
  return (await db()).get('records', exerciseId);
}
export async function putRecords(r: StoredRecords): Promise<void> {
  await (await db()).put('records', r);
}
/** Stores records only if none are stored yet (a lazy fill must never overwrite a fresher write). */
export async function putRecordsIfAbsent(r: StoredRecords): Promise<void> {
  const tx = (await db()).transaction('records', 'readwrite');
  if (!(await tx.store.get(r.exerciseId))) await tx.store.put(r);
  await tx.done;
}
export async function deleteRecords(exerciseId: string): Promise<void> {
  await (await db()).delete('records', exerciseId);
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
