// Backup export, validation and restore. Only Settings uses it: kept out of the first-paint bundle.
import { changeTime, db, getSettings, metaKey, type SyncStore } from './db';
import { MUSCLES, normalizeMuscles } from './muscles';
import { cleanPlates } from './tools';
import { DEFAULT_SETTINGS, TYPES, type BodyEntry, type BodyMetric, type Category, type Routine, type DayComment, type Exercise, type Settings, type WorkoutSet } from './model';

export interface Backup {
  app: 'iron-notes';
  version: 1;
  exported: string;
  categories: Category[];
  exercises: Exercise[];
  sets: WorkoutSet[];
  comments: DayComment[];
  settings: Settings;
  /**
   * Added with M5b; older backups have none. The format stays `version: 1` while changes are additive
   * (new optional fields/arrays that older files simply lack); bump it only for breaking changes.
   */
  routines: Routine[];
  /** Added with M7 (optional, like routines). */
  metrics: BodyMetric[];
  body: BodyEntry[];
}

export async function exportAll(): Promise<Backup> {
  const d = await db();
  const [categories, exercises, sets, comments, settings, routines, metrics, body] = await Promise.all([
    d.getAll('categories'), d.getAll('exercises'), d.getAll('sets'), d.getAll('comments'), getSettings(), d.getAll('routines'),
    d.getAll('metrics'), d.getAll('body'),
  ]);
  return { app: 'iron-notes', version: 1, exported: new Date().toISOString(), categories, exercises, sets, comments, settings, routines, metrics, body };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || (isNum(v) && v >= 0);
const optStr = (v: unknown) => v === undefined || typeof v === 'string';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const validCategory = (c: Category) => isStr(c?.id) && isStr(c.name) && typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) && isNum(c.order) && optNum(c.rest);
const optRep = (v: unknown) => v === undefined || (Number.isInteger(v) && (v as number) >= 1);
const validExercise = (e: Exercise) =>
  isStr(e?.id) && isStr(e.name) && isStr(e.categoryId) && TYPES.includes(e.type) && optStr(e.notes) && optNum(e.increment) && optNum(e.rest) && optRep(e.repTop) && optRep(e.repBottom) &&
  (e.favorite === undefined || typeof e.favorite === 'boolean') && (e.joint === undefined || typeof e.joint === 'boolean') && (e.plates === undefined || typeof e.plates === 'boolean') &&
  (e.load === undefined || e.load === 'total' || e.load === 'perHand' || e.load === 'bodyweight' || e.load === 'assisted') &&
  (e.muscles === undefined ||
    (!!e.muscles && Array.isArray(e.muscles.primary) && Array.isArray(e.muscles.secondary) &&
      [...e.muscles.primary, ...e.muscles.secondary].every((x) => MUSCLES.includes(x))));
const validSet = (s: WorkoutSet) =>
  isStr(s?.id) && typeof s.date === 'string' && DATE.test(s.date) && isStr(s.exerciseId) && isNum(s.order) &&
  optNum(s.weight) && optNum(s.reps) && optNum(s.distance) && optNum(s.time) && optStr(s.comment) && optStr(s.group) &&
  (s.done === undefined || typeof s.done === 'boolean') && (s.planned === undefined || s.planned === true) &&
  optNum(s.rir) && optNum(s.after) && (s.warmup === undefined || s.warmup === true) && (s.deload === undefined || s.deload === true) &&
  (s.sore === undefined || s.sore === 0 || s.sore === 1 || s.sore === 2);
const validPlanned = (p: Routine['days'][number]['items'][number]['sets'][number]) =>
  !!p && typeof p === 'object' && optNum(p.weight) && optNum(p.reps) && optNum(p.distance) && optNum(p.time);
const validRoutine = (r: Routine) =>
  isStr(r?.id) && isStr(r.name) && isNum(r.order) && Array.isArray(r.days) &&
  r.days.every((d) => isStr(d?.id) && typeof d.name === 'string' && Array.isArray(d.items) &&
    d.items.every((i) => isStr(i?.exerciseId) && Array.isArray(i.sets) && i.sets.every(validPlanned) && optStr(i.group)));
const validMetric = (m: BodyMetric) =>
  isStr(m?.id) && isStr(m.name) && ['weight', 'percent', 'length', 'number'].includes(m.kind) && isNum(m.order);
const validEntry = (e: BodyEntry) =>
  isStr(e?.id) && isStr(e.metricId) && typeof e.date === 'string' && DATE.test(e.date) && isNum(e.value) && isNum(e.at);
const validComment = (c: DayComment) => typeof c?.date === 'string' && DATE.test(c.date) && typeof c.text === 'string';

/** Settings from a backup or another device: known keys with valid values only, the rest defaults. */
export function cleanSettings(st: Partial<Settings> | undefined): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (st) {
    if (st.mode === 'standard' || st.mode === 'dorian' || st.mode === 'lyle') settings.mode = st.mode;
    if (st.unit === 'kg' || st.unit === 'lb') settings.unit = st.unit;
    if (st.dist === 'km' || st.dist === 'mi' || st.dist === 'm') settings.dist = st.dist;
    if (isNum(st.rest) && st.rest > 0) settings.rest = st.rest;
    if (st.formula === 'epley' || st.formula === 'brzycki') settings.formula = st.formula;
    if (st.weekStart === 0 || st.weekStart === 1) settings.weekStart = st.weekStart;
    for (const k of ['autoTimer', 'timerSound', 'markDone', 'keepScreenOn'] as const) if (typeof st[k] === 'boolean') settings[k] = st[k]!;
    const c = st.cycle;
    if (c && typeof c.start === 'string' && DATE.test(c.start) && (c.weeks === 6 || c.weeks === 8)) settings.cycle = { start: c.start, weeks: c.weeks };
    if (st.light && typeof st.light.start === 'string' && DATE.test(st.light.start)) settings.light = { start: st.light.start };
    if (st.diet === 'build' || st.diet === 'maintain' || st.diet === 'cut') settings.diet = st.diet;
    if (st.lang === 'en' || st.lang === 'sv') settings.lang = st.lang;
    if (typeof st.roundPlates === 'boolean') settings.roundPlates = st.roundPlates;
    if (typeof st.restNotify === 'boolean') settings.restNotify = st.restNotify;
    if (typeof st.gymEnglish === 'boolean') settings.gymEnglish = st.gymEnglish;
    const pr = st.program;
    if (pr && isStr(pr.routineId)) {
      const wd = Array.isArray(pr.weekdays) ? pr.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : undefined;
      settings.program = { routineId: pr.routineId, lastDayId: isStr(pr.lastDayId) ? pr.lastDayId : undefined, weekdays: wd?.length ? [...new Set(wd)].sort() : undefined };
    }
    const p = st.plates;
    // Same limits as the calculator's own editor (an absurd plate set could freeze it).
    const clean = p && (p.unit === 'kg' || p.unit === 'lb') && Array.isArray(p.sizes) && p.sizes.every(isNum) ? cleanPlates(p.bar, p.sizes) : null;
    if (p && clean) settings.plates = { unit: p.unit, ...clean };
  }
  return settings;
}

/** Checks a parsed backup file row by row. Throws on anything malformed: nothing is imported then. */
export function validateBackup(b: unknown): Backup {
  const x = b as Partial<Backup> | null;
  if (!x || typeof x !== 'object' || x.app !== 'iron-notes') throw new Error('Not an Iron Notes backup');
  if (x.version !== 1) throw new Error(`Unsupported backup version ${String(x.version)}`);
  if (!Array.isArray(x.categories) || !x.categories.every(validCategory)) throw new Error('Invalid categories');
  if (!Array.isArray(x.exercises) || !x.exercises.every(validExercise)) throw new Error('Invalid exercises');
  if (!Array.isArray(x.sets) || !x.sets.every(validSet)) throw new Error('Invalid sets');
  if (x.comments !== undefined && (!Array.isArray(x.comments) || !x.comments.every(validComment))) throw new Error('Invalid comments');
  if (x.routines !== undefined && (!Array.isArray(x.routines) || !x.routines.every(validRoutine))) throw new Error('Invalid routines');
  if (x.metrics !== undefined && (!Array.isArray(x.metrics) || !x.metrics.every(validMetric))) throw new Error('Invalid body measures');
  if (x.body !== undefined && (!Array.isArray(x.body) || !x.body.every(validEntry))) throw new Error('Invalid body entries');
  const st = x.settings as Partial<Settings> | undefined;
  if (st !== undefined && (typeof st !== 'object' || st === null)) throw new Error('Invalid settings');
  const settings = cleanSettings(st);
  // Muscles normalised (primary wins, no repeats, canonical order): effective reps must not double count.
  const exercises = x.exercises.map((e) => (e.muscles ? { ...e, muscles: normalizeMuscles(e.muscles) } : e));
  return { app: 'iron-notes', version: 1, exported: String(x.exported ?? ''), categories: x.categories, exercises, sets: x.sets, comments: x.comments ?? [], settings, routines: x.routines ?? [], metrics: x.metrics ?? [],
    // Entries of a measure that isn't in the file would be invisible orphans: left out.
    body: (x.body ?? []).filter((e) => (x.metrics ?? []).some((m) => m.id === e.metricId)) };
}

/** Replaces all data with a backup. Throws (and changes nothing) if the file isn't a valid one. */
export async function importAll(b: unknown): Promise<void> {
  const hasMetrics = Array.isArray((b as Partial<Backup> | null)?.metrics);
  const x = validateBackup(b);
  const d = await db();
  // `records` is a cache of the sets: cleared, refilled lazily.
  const stores = ['categories', 'exercises', 'sets', 'comments', 'kv', 'records', 'routines', 'metrics', 'body', 'meta'] as const;
  const tx = d.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  const ops: Promise<unknown>[] = [];
  for (const c of x.categories) ops.push(tx.objectStore('categories').put(c));
  for (const e of x.exercises) ops.push(tx.objectStore('exercises').put(e));
  for (const s of x.sets) ops.push(tx.objectStore('sets').put(s));
  for (const c of x.comments) ops.push(tx.objectStore('comments').put(c));
  for (const r of x.routines) ops.push(tx.objectStore('routines').put(r));
  for (const m of x.metrics) ops.push(tx.objectStore('metrics').put(m));
  for (const e of x.body) ops.push(tx.objectStore('body').put(e));
  ops.push(tx.objectStore('kv').put({ key: 'settings', value: x.settings }));
  // A restored library counts as seeded, even an empty one: never re-seed over the user's choice.
  ops.push(tx.objectStore('kv').put({ key: 'seeded', value: true }));
  // A backup with measures (even none) replaces the starter set; an older one without them keeps it coming.
  if (hasMetrics) ops.push(tx.objectStore('kv').put({ key: 'bodySeeded', value: true }));
  // Device sync: the restored data is this device's newest (records only another device has come back
  // at the next sync; nothing here deletes them there).
  const meta = tx.objectStore('meta');
  const stamp = (store: SyncStore, key: string) => ops.push(meta.put({ mt: changeTime() }, metaKey(store, key)));
  for (const c of x.categories) stamp('categories', c.id);
  for (const e of x.exercises) stamp('exercises', e.id);
  for (const st of x.sets) stamp('sets', st.id);
  for (const c of x.comments) stamp('comments', c.date);
  for (const r of x.routines) stamp('routines', r.id);
  for (const m of x.metrics) stamp('metrics', m.id);
  for (const e of x.body) stamp('body', e.id);
  stamp('kv', 'settings');
  await Promise.all([...ops, tx.done]);
}

/**
 * Per synced store: the record as it may be stored, or a throw. Used by device sync (lib/sync.ts): a
 * record from another device passes the same rules as a backup row.
 */
export const SYNC_VALIDATORS: Record<SyncStore, (v: unknown) => unknown> = {
  categories: (v) => ok(validCategory(v as Category), v),
  exercises: (v) => {
    const e = ok(validExercise(v as Exercise), v) as Exercise;
    return e.muscles ? { ...e, muscles: normalizeMuscles(e.muscles) } : e;
  },
  sets: (v) => ok(validSet(v as WorkoutSet), v),
  comments: (v) => ok(validComment(v as DayComment), v),
  routines: (v) => ok(validRoutine(v as Routine), v),
  metrics: (v) => ok(validMetric(v as BodyMetric), v),
  body: (v) => ok(validEntry(v as BodyEntry), v),
  kv: (v) => {
    const r = v as { key?: unknown; value?: unknown } | null;
    if (!r || r.key !== 'settings' || typeof r.value !== 'object' || r.value === null) throw new Error('invalid');
    return { key: 'settings', value: cleanSettings(r.value as Partial<Settings>) };
  },
};
function ok(valid: boolean, v: unknown): unknown {
  if (!valid) throw new Error('invalid');
  return v;
}

