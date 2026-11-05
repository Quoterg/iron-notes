// Progress of one exercise over time: graph series, rep maxes, bests and workouts. Pure functions over
// an exercise's sets in byOrder order (as the state cache keeps them); every function is one pass.
import { addDays, oneRM } from './calc';
import { fieldsOf, type ExerciseType, type Field, type WorkoutSet } from './model';

export type Formula = 'epley' | 'brzycki';
export interface Point {
  date: string;
  value: number;
}

export type Metric = 'orm' | 'maxWeight' | 'maxReps' | 'volume' | 'totalReps' | 'maxDistance' | 'totalDistance' | 'maxTime' | 'totalTime' | 'pace';
export type Kind = 'weight' | 'reps' | 'distance' | 'time' | 'pace';

interface MetricDef {
  kind: Kind;
  needs: Field[];
  /** Folds one set into the day's value (`acc` undefined for the day's first set). */
  add: (acc: number | undefined, s: WorkoutSet, f: Formula) => number | undefined;
}

const max = (acc: number | undefined, v: number | undefined) => (v == null || !(v > 0) ? acc : acc == null ? v : Math.max(acc, v));
const sum = (acc: number | undefined, v: number | undefined) => (v == null || !(v > 0) ? acc : (acc ?? 0) + v);

export const METRICS: Record<Metric, MetricDef> = {
  orm: { kind: 'weight', needs: ['weight', 'reps'], add: (a, s, f) => max(a, oneRM(s.weight ?? 0, s.reps ?? 0, f)) },
  maxWeight: { kind: 'weight', needs: ['weight'], add: (a, s) => max(a, s.weight) },
  maxReps: { kind: 'reps', needs: ['reps'], add: (a, s) => max(a, s.reps) },
  // `vol`: the volume weight of a load-mapped copy (lib/load.ts): both dumbbells, no body weight.
  volume: { kind: 'weight', needs: ['weight', 'reps'], add: (a, s) => sum(a, ((s as { vol?: number }).vol ?? s.weight ?? 0) * (s.reps ?? 0)) },
  totalReps: { kind: 'reps', needs: ['reps'], add: (a, s) => sum(a, s.reps) },
  maxDistance: { kind: 'distance', needs: ['distance'], add: (a, s) => max(a, s.distance) },
  totalDistance: { kind: 'distance', needs: ['distance'], add: (a, s) => sum(a, s.distance) },
  maxTime: { kind: 'time', needs: ['time'], add: (a, s) => max(a, s.time) },
  totalTime: { kind: 'time', needs: ['time'], add: (a, s) => sum(a, s.time) },
  // Seconds per km; lower is better, so the day keeps its fastest set.
  pace: {
    kind: 'pace',
    needs: ['distance', 'time'],
    add: (a, s) => {
      if (!(s.distance! > 0) || !(s.time! > 0)) return a;
      const p = s.time! / s.distance!;
      return a == null ? p : Math.min(a, p);
    },
  },
};

export function metricsFor(type: ExerciseType): Metric[] {
  const f = fieldsOf(type);
  return (Object.keys(METRICS) as Metric[]).filter((m) => METRICS[m].needs.every((n) => f.includes(n)));
}

/** One point per workout day from `since` (inclusive) on. */
export function dailySeries(sets: readonly WorkoutSet[], metric: Metric, formula: Formula, since = ''): Point[] {
  const m = METRICS[metric];
  const out: Point[] = [];
  let date = '';
  let acc: number | undefined;
  const flush = () => {
    if (date && acc != null && Number.isFinite(acc) && acc > 0) out.push({ date, value: acc });
  };
  for (const s of sets) {
    if (s.date < since) continue;
    if (s.date !== date) {
      flush();
      date = s.date;
      acc = undefined;
    }
    acc = m.add(acc, s, formula);
  }
  flush();
  return out;
}

export type Range = '1m' | '3m' | '6m' | '1y' | 'all';
export function rangeStart(range: Range, today: string): string {
  const days = { '1m': 30, '3m': 91, '6m': 182, '1y': 365, all: 0 }[range];
  return days ? addDays(today, -days) : '';
}

export interface RepMax {
  reps: number;
  /** Heaviest weight lifted for at least `reps` reps, or null. */
  set: WorkoutSet | null;
}
/** Rep maxes for 1..maxReps: the heaviest (then earliest) set with at least that many reps. */
export function repMaxTable(sets: readonly WorkoutSet[], maxReps = 15): RepMax[] {
  // Best set per exact rep count (sets are in order, so ties keep the earliest).
  const exact: (WorkoutSet | undefined)[] = [];
  let top = 0;
  for (const s of sets) {
    if (!(s.weight! > 0) || !(s.reps! > 0)) continue;
    const r = s.reps!;
    const b = exact[r];
    if (!b || s.weight! > b.weight!) exact[r] = s;
    top = Math.max(top, r);
  }
  // Walk down from the highest rep count, carrying the heaviest set seen so far.
  const rows: RepMax[] = [];
  let best: WorkoutSet | undefined;
  for (let r = top; r >= 1; r--) {
    const e = exact[r];
    if (e && (!best || e.weight! > best.weight! || (e.weight === best.weight && earlier(e, best)))) best = e;
    if (r <= maxReps) rows[r - 1] = { reps: r, set: best ?? null };
  }
  for (let r = 1; r <= maxReps; r++) rows[r - 1] ??= { reps: r, set: null };
  return rows;
}
const earlier = (a: WorkoutSet, b: WorkoutSet) => a.date < b.date || (a.date === b.date && a.order < b.order);

/** The set with the best estimated 1RM. */
export function bestOrm(sets: readonly WorkoutSet[], formula: Formula): { value: number; set: WorkoutSet } | null {
  let best: { value: number; set: WorkoutSet } | null = null;
  for (const s of sets) {
    const v = oneRM(s.weight ?? 0, s.reps ?? 0, formula);
    if (v > 0 && (!best || v > best.value)) best = { value: v, set: s };
  }
  return best;
}

export interface Best {
  field: Field | 'pace';
  set: WorkoutSet;
  value: number;
}
/** Best (first-reached) value per field of the type, plus fastest pace for distance and time. */
export function bests(sets: readonly WorkoutSet[], type: ExerciseType): Best[] {
  const fields = fieldsOf(type);
  const found = new Map<Best['field'], Best>();
  for (const s of sets) {
    for (const f of fields) {
      const v = s[f];
      if (v != null && v > 0 && !(found.get(f)!?.value >= v)) found.set(f, { field: f, set: s, value: v });
    }
    if (fields.includes('distance') && fields.includes('time') && s.distance! > 0 && s.time! > 0) {
      const p = s.time! / s.distance!;
      const b = found.get('pace');
      if (!b || p < b.value) found.set('pace', { field: 'pace', set: s, value: p });
    }
  }
  return [...found.values()];
}

/** Workouts (days) with their sets, newest first. */
export function workouts(sets: readonly WorkoutSet[]): { date: string; sets: WorkoutSet[] }[] {
  const out: { date: string; sets: WorkoutSet[] }[] = [];
  for (const s of sets) {
    const last = out[out.length - 1];
    if (last && last.date === s.date) last.sets.push(s);
    else out.push({ date: s.date, sets: [s] });
  }
  return out.reverse();
}

/** Whole-second steps for time and pace axes (so labels never round to duplicates). */
export const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

/** Round axis bounds and 3–5 ticks covering [min, max]; `steps` restricts the tick step (e.g. TIME_STEPS). */
export function niceScale(min: number, max: number, steps?: number[]): { lo: number; hi: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.05 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = steps ? steps.find((s) => s >= raw) ?? steps[steps.length - 1] : [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}
