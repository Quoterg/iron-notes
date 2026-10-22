// CSV export (FitNotes' column layout) and FitNotes CSV import. Pure; db/state do the writing.
// FitNotes exports: Date, Exercise, Category, Weight, Weight Unit, Reps, Distance, Distance Unit, Time
// (+ Comment). Older versions put the unit in the header ("Weight (kgs)"); both are read.
import { byOrder, fmtTime, uid } from './calc';
import { fieldsOf, type Category, type Exercise, type ExerciseType, type Field, type Settings, type WorkoutSet } from './model';
import { dToUser, KG_PER_LB, KM_PER_MI, num, wToUser } from './units';

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A text cell that a spreadsheet would run as a formula (=, +, -, @, tab, CR first) gets a leading
 * apostrophe, which spreadsheets show as text; the importer strips it again.
 */
export const safeText = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const unsafeText = (s: string): string => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF; blank lines dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER = ['Date', 'Exercise', 'Category', 'Weight', 'Weight Unit', 'Reps', 'Distance', 'Distance Unit', 'Time', 'Comment'];

/** All done sets as CSV in FitNotes' layout, in the user's units (kgs/lbs, km/mi/m). */
export function toCsv(sets: readonly WorkoutSet[], exercise: (id: string) => Exercise | undefined, category: (id: string) => Category | undefined, st: Settings): string {
  const lines = [HEADER.join(',')];
  const wUnit = st.unit === 'lb' ? 'lbs' : 'kgs';
  for (const s of [...sets].sort(byOrder)) {
    const ex = exercise(s.exerciseId);
    if (!ex || s.planned) continue;
    const f = fieldsOf(ex.type);
    lines.push(
      [
        s.date,
        safeText(ex.name),
        safeText(category(ex.categoryId)?.name ?? ''),
        f.includes('weight') && s.weight != null ? num(wToUser(s.weight, st.unit), 3) : '',
        f.includes('weight') ? wUnit : '',
        f.includes('reps') && s.reps != null ? s.reps : '',
        f.includes('distance') && s.distance != null ? num(dToUser(s.distance, st.dist), 3) : '',
        f.includes('distance') ? st.dist : '',
        f.includes('time') && s.time != null ? fmtTime(s.time) : '',
        safeText(s.comment ?? ''),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** "1:02:03", "02:03", "123" (seconds) → seconds; empty/invalid → undefined. */
function parseDuration(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const parts = s.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  return Math.round(parts.reduce((a, n) => a * 60 + n, 0));
}
const parseNum = (v: string | undefined): number | undefined => {
  if (v == null || !v.trim()) return undefined;
  const t = v.trim();
  const n = Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
/** Weight in a unit word (kgs, kg, lbs, lb) → kg. */
const toKg = (v: number, unit: string) => (/^lb/i.test(unit.trim()) ? v * KG_PER_LB : v);
/** Distance in a unit word (km, mi, miles, m, metres, ft, yd) → km. */
function toKm(v: number, unit: string): number {
  const u = unit.trim().toLowerCase();
  if (u.startsWith('mi')) return v * KM_PER_MI;
  if (u === 'm' || u.startsWith('met')) return v / 1000;
  if (u.startsWith('ft') || u.startsWith('feet')) return (v * 0.3048) / 1000;
  if (u.startsWith('yd') || u.startsWith('yard')) return (v * 0.9144) / 1000;
  return v; // km (default)
}

/** The exercise type that records exactly the fields that have values (weight and reps first). */
export function inferType(present: ReadonlySet<Field>): ExerciseType {
  const order: Field[] = ['weight', 'reps', 'distance', 'time'];
  const f = order.filter((x) => present.has(x));
  const prefs: ExerciseType[] = ['weight,reps', 'distance,time', 'weight,distance', 'weight,time', 'reps,distance', 'reps,time'];
  for (const p of prefs) if (fieldsOf(p).every((x) => f.includes(x)) && f.every((x) => fieldsOf(p).includes(x))) return p;
  for (const p of prefs) if (fieldsOf(p).every((x) => f.includes(x))) return p; // 3+ fields: the best pair
  return (f[0] as ExerciseType) ?? 'weight,reps';
}

export interface ImportPlan {
  categories: Category[];
  exercises: Exercise[];
  sets: WorkoutSet[];
  /** Rows identical to a set already stored (same date, exercise and values): left out. */
  duplicates: number;
  /** Rows that couldn't be read (no date, no exercise, no values). */
  skipped: number;
  first?: string;
  last?: string;
}

const COLORS = ['#3b8df5', '#8c5aff', '#e05fb8', '#f0566a', '#f29a38', '#e0c43a', '#2bd4e0', '#2bcf9a', '#9aa4b2'];
const key = (s: Pick<WorkoutSet, 'date' | 'exerciseId' | 'weight' | 'reps' | 'distance' | 'time'>) =>
  [s.date, s.exerciseId, s.weight?.toFixed(3) ?? '', s.reps ?? '', s.distance?.toFixed(4) ?? '', s.time ?? ''].join('|');

/**
 * What importing a FitNotes CSV would add: new categories and exercises (matched by name, case-
 * insensitive) and the sets, minus duplicates of `existing` sets. Throws if it isn't such a file.
 */
export function planImport(
  text: string,
  current: { categories: readonly Category[]; exercises: readonly Exercise[]; sets: readonly WorkoutSet[] },
  startOrder: number,
): ImportPlan {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 1) throw new Error('Empty file');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const c = {
    date: col(/^date$/),
    exercise: col(/^exercise( name)?$/),
    category: col(/^category$/),
    weight: col(/^weight( \(.*\))?$/),
    weightUnit: col(/^weight unit$/),
    reps: col(/^reps$/),
    distance: col(/^distance( \(.*\))?$/),
    distanceUnit: col(/^distance unit$/),
    time: col(/^(time|duration)( \(.*\))?$/),
    comment: col(/^(comment|notes?)$/),
  };
  if (c.date < 0 || c.exercise < 0) throw new Error('Not a FitNotes CSV (needs Date and Exercise columns)');
  // A unit in the header ("Weight (lbs)") applies to every row without a unit column.
  const headUnit = (i: number) => (i >= 0 ? head[i].match(/\((.*)\)/)?.[1] ?? '' : '');
  const wHead = headUnit(c.weight);
  const dHead = headUnit(c.distance);

  const cats = new Map(current.categories.map((x) => [x.name.toLowerCase(), x]));
  const exs = new Map(current.exercises.map((x) => [x.name.toLowerCase(), x]));
  const newCats: Category[] = [];
  let catOrder = Math.max(-1, ...current.categories.map((x) => x.order)) + 1;

  // First pass: read rows; collect which fields each new exercise uses (to choose its type).
  interface Row { date: string; name: string; cat: string; weight?: number; reps?: number; distance?: number; time?: number; comment?: string }
  const read: Row[] = [];
  const present = new Map<string, Set<Field>>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = (r[c.date] ?? '').trim().slice(0, 10);
    const name = unsafeText((r[c.exercise] ?? '').trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) {
      skipped++;
      continue;
    }
    const w = parseNum(r[c.weight]);
    const row: Row = {
      date,
      name,
      cat: c.category >= 0 ? unsafeText((r[c.category] ?? '').trim()) : '',
      weight: w != null ? toKg(w, c.weightUnit >= 0 ? r[c.weightUnit] ?? '' : wHead) : undefined,
      reps: parseNum(r[c.reps]) != null ? Math.round(parseNum(r[c.reps])!) : undefined,
      distance: parseNum(r[c.distance]) != null ? toKm(parseNum(r[c.distance])!, c.distanceUnit >= 0 ? r[c.distanceUnit] ?? '' : dHead) : undefined,
      time: c.time >= 0 ? parseDuration(r[c.time] ?? '') : undefined,
      comment: c.comment >= 0 ? unsafeText((r[c.comment] ?? '').trim()) || undefined : undefined,
    };
    const vals = (['weight', 'reps', 'distance', 'time'] as const).filter((f) => (row[f] ?? 0) > 0);
    if (!vals.length) {
      skipped++;
      continue;
    }
    read.push(row);
    const p = present.get(name.toLowerCase()) ?? present.set(name.toLowerCase(), new Set()).get(name.toLowerCase())!;
    for (const f of vals) p.add(f);
  }

  const newExs: Exercise[] = [];
  const exerciseFor = (row: Row): Exercise => {
    const k = row.name.toLowerCase();
    let ex = exs.get(k);
    if (ex) return ex;
    const catName = row.cat || 'Imported';
    let cat = cats.get(catName.toLowerCase());
    if (!cat) {
      cat = { id: uid(), name: catName, color: COLORS[(catOrder + newCats.length) % COLORS.length], order: catOrder++ };
      cats.set(catName.toLowerCase(), cat);
      newCats.push(cat);
    }
    ex = { id: uid(), name: row.name, categoryId: cat.id, type: inferType(present.get(k)!) };
    exs.set(k, ex);
    newExs.push(ex);
    return ex;
  };

  // Stored sets as a multiset: three identical sets in the file over two stored add one (a 3 × 5 day is
  // three sets, not one).
  const have = new Map<string, number>();
  for (const s of current.sets) have.set(key(s), (have.get(key(s)) ?? 0) + 1);
  const sets: WorkoutSet[] = [];
  let duplicates = 0;
  let order = startOrder;
  // Rows in file order within a date (FitNotes lists sets in the order they were done).
  for (const row of read) {
    const ex = exerciseFor(row);
    const f = fieldsOf(ex.type);
    const s: WorkoutSet = { id: uid(), date: row.date, exerciseId: ex.id, order: order++, comment: row.comment };
    for (const k of f) if (row[k] != null) s[k] = k === 'weight' ? Math.round(row[k]! * 1000) / 1000 : row[k];
    const k = key(s);
    if (!f.some((x) => (s[x] ?? 0) > 0)) {
      skipped++; // e.g. a time-only row for an existing reps exercise: nothing it records
      continue;
    }
    const left = have.get(k) ?? 0;
    if (left > 0) {
      have.set(k, left - 1);
      duplicates++;
      continue;
    }
    sets.push(s);
  }
  const dates = sets.map((s) => s.date).sort();
  return { categories: newCats, exercises: newExs, sets, duplicates, skipped, first: dates[0], last: dates[dates.length - 1] };
}
