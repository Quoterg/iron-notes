// User data lives on the device, in IndexedDB. Nothing is sent anywhere.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type BodyEntry, type BodyMetric, type Category, type Routine, type DayComment, type Exercise, type Settings, type WorkoutSet } from './model';

interface Schema extends DBSchema {
  categories: { key: string; value: Category };
  exercises: { key: string; value: Exercise };
  sets: { key: string; value: WorkoutSet; indexes: { date: string; exercise: string; exerciseOrder: [string, string, number] } };
  comments: { key: string; value: DayComment };
  kv: { key: string; value: { key: string; value: unknown } };
  /** Record-holding set ids per exercise (v2): a day opens without reading each exercise's history. */
  records: { key: string; value: StoredRecords };
  /** v3 */
  routines: { key: string; value: Routine };
  /** v4: body measures and their entries. */
  metrics: { key: string; value: BodyMetric };
  body: { key: string; value: BodyEntry; indexes: { metric: string; metricDate: [string, string, number] } };
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
  return (dbp ??= openDB<Schema>(DB_NAME, 4, {
    upgrade(d, oldVersion, _newVersion, tx) {
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
      if (oldVersion < 3) {
        d.createObjectStore('routines', { keyPath: 'id' });
        // An exercise's sets in date/order: its latest set is one reverse-cursor step away.
        tx.objectStore('sets').createIndex('exerciseOrder', ['exerciseId', 'date', 'order']);
      }
      if (oldVersion < 4) {
        d.createObjectStore('metrics', { keyPath: 'id' });
        const body = d.createObjectStore('body', { keyPath: 'id' });
        body.createIndex('metric', 'metricId');
        // A measure's entries by date (and entry time): its latest dates are a short reverse-cursor walk.
        body.createIndex('metricDate', ['metricId', 'date', 'at']);
      }
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
/** A stored number (e.g. the last What's new entry shown), or undefined. */
export async function getNumber(key: string): Promise<number | undefined> {
  const v = (await (await db()).get('kv', key))?.value;
  return typeof v === 'number' ? v : undefined;
}
export async function setNumber(key: string, value: number): Promise<void> {
  await (await db()).put('kv', { key, value });
}
/** A one-time flag (e.g. "body measures seeded"). */
export async function getFlag(key: string): Promise<boolean> {
  return !!(await (await db()).get('kv', key));
}
export async function setFlag(key: string): Promise<void> {
  await (await db()).put('kv', { key, value: true });
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
/** Gives these exercises their muscles only where the stored record still has none (one transaction). */
export async function putMusclesIfMissing(list: Exercise[]): Promise<Exercise[]> {
  const tx = (await db()).transaction('exercises', 'readwrite');
  const written: Exercise[] = [];
  for (const e of list) {
    const cur = await tx.store.get(e.id);
    if (cur && !cur.muscles && e.muscles) {
      const next = { ...cur, muscles: e.muscles };
      await tx.store.put(next);
      written.push(next);
    }
  }
  await tx.done;
  return written;
}
/** Writes load types (and the type a body-weight exercise gains) only where none is stored yet. */
export async function putLoadsIfMissing(list: Exercise[]): Promise<Exercise[]> {
  const tx = (await db()).transaction('exercises', 'readwrite');
  const written: Exercise[] = [];
  for (const e of list) {
    const cur = await tx.store.get(e.id);
    if (cur && cur.load == null && e.load) {
      const next = { ...cur, load: e.load, type: e.type };
      await tx.store.put(next);
      written.push(next);
    }
  }
  await tx.done;
  return written;
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

/** The exercise's latest set that isn't a routine's planned one: reads from the end, usually one row. */
export async function lastDoneSet(exerciseId: string): Promise<WorkoutSet | undefined> {
  const tx = (await db()).transaction('sets');
  // [id] sorts before every [id, date, order] key, [id, []] after them (arrays sort after strings).
  let cur = await tx.store.index('exerciseOrder').openCursor(IDBKeyRange.bound([exerciseId], [exerciseId, []]), 'prev');
  while (cur && cur.value.planned) cur = await cur.continue();
  return cur?.value;
}

/** The last `n` different exercises logged (newest first): a reverse walk of the date index, no full read. */
export async function recentExerciseIds(n: number): Promise<string[]> {
  const tx = (await db()).transaction('sets');
  const out: string[] = [];
  let cur = await tx.store.index('date').openCursor(null, 'prev');
  // Bounded: a few hundred rows at most, even if one exercise fills the latest days.
  for (let seen = 0; cur && out.length < n && seen < 500; seen++) {
    if (!cur.value.planned && !out.includes(cur.value.exerciseId)) out.push(cur.value.exerciseId);
    cur = await cur.continue();
  }
  return out;
}

/** The exercise's sets of its last workout (the day of its latest done set), in order; [] if none. */
export async function lastWorkoutSets(exerciseId: string): Promise<WorkoutSet[]> {
  const last = await lastDoneSet(exerciseId);
  if (!last) return [];
  const sets = await (await db()).getAllFromIndex('sets', 'exerciseOrder', IDBKeyRange.bound([exerciseId, last.date], [exerciseId, last.date, Infinity]));
  return sets.filter((s) => !s.planned);
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

// ---- Body measures ----
export async function getMetrics(): Promise<BodyMetric[]> {
  return (await db()).getAll('metrics');
}
export async function putMetrics(list: BodyMetric[]): Promise<void> {
  const tx = (await db()).transaction('metrics', 'readwrite');
  await Promise.all([...list.map((m) => tx.store.put(m)), tx.done]);
}
/** Deletes a measure and all its entries. */
export async function deleteMetric(id: string): Promise<void> {
  const tx = (await db()).transaction(['metrics', 'body'], 'readwrite');
  const keys = await tx.objectStore('body').index('metric').getAllKeys(id);
  await Promise.all([...keys.map((k) => tx.objectStore('body').delete(k)), tx.objectStore('metrics').delete(id), tx.done]);
}
export async function entriesOf(metricId: string): Promise<BodyEntry[]> {
  return (await db()).getAllFromIndex('body', 'metric', metricId);
}
/** A measure's entries of its latest `dates` dates (the newest entry of each date), oldest first. */
export async function latestEntries(metricId: string, dates: number): Promise<BodyEntry[]> {
  const tx = (await db()).transaction('body');
  const out: BodyEntry[] = [];
  let cur = await tx.store.index('metricDate').openCursor(IDBKeyRange.bound([metricId], [metricId, []]), 'prev');
  while (cur && out.length < dates) {
    if (!out.length || out[out.length - 1].date !== cur.value.date) out.push(cur.value);
    cur = await cur.continue();
  }
  return out.reverse();
}
export async function putEntry(e: BodyEntry): Promise<void> {
  await (await db()).put('body', e);
}
export async function deleteEntry(id: string): Promise<void> {
  await (await db()).delete('body', id);
}

// ---- Whole-database operations (Settings → Your data) ----
/** Whether anything was ever logged (one key read). */
export async function hasAnySets(): Promise<boolean> {
  return !!(await (await db()).getKey('sets', IDBKeyRange.lowerBound('')));
}
export async function allSets(): Promise<WorkoutSet[]> {
  return (await db()).getAll('sets');
}
/** Adds imported categories, exercises and sets in one transaction (all or nothing); records are refilled lazily. */
export async function importRows(categories: Category[], exercises: Exercise[], sets: WorkoutSet[]): Promise<void> {
  const tx = (await db()).transaction(['categories', 'exercises', 'sets', 'records'], 'readwrite');
  await Promise.all([
    ...categories.map((c) => tx.objectStore('categories').put(c)),
    ...exercises.map((e) => tx.objectStore('exercises').put(e)),
    tx.objectStore('records').clear(),
  ]);
  // In chunks: a big FitNotes history is tens of thousands of puts; the transaction stays open throughout.
  for (let i = 0; i < sets.length; i += 2000) await Promise.all(sets.slice(i, i + 2000).map((s) => tx.objectStore('sets').put(s)));
  await tx.done;
}
/** Deletes everything (one transaction). The next start is a first start: starter library and measures again. */
export async function clearAll(): Promise<void> {
  const names = ['categories', 'exercises', 'sets', 'comments', 'kv', 'records', 'routines', 'metrics', 'body'] as const;
  const tx = (await db()).transaction(names, 'readwrite');
  await Promise.all([...names.map((n) => tx.objectStore(n).clear()), tx.done]);
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
