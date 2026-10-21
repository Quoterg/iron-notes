// Pure training maths: dates, time, 1RM and personal records. No DOM or storage access.
import { fieldsOf, type ExerciseType, type WorkoutSet } from './model';

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
export const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;

// ---- Dates (local YYYY-MM-DD) ----
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// ---- Time ----
export function fmtTime(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

// ---- Strength ----
export function oneRM(weight: number, reps: number, formula: 'epley' | 'brzycki' = 'epley'): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  if (formula === 'brzycki') return reps >= 37 ? weight : (weight * 36) / (37 - reps);
  return weight * (1 + reps / 30);
}

export const byOrder = (a: WorkoutSet, b: WorkoutSet): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order;

/**
 * IDs of the sets that currently hold a personal record, from all sets of one exercise.
 * Weight and reps: a set is a record when it is the first set with the heaviest weight for its rep
 * count, and no set with more reps was at least as heavy (a rep max nothing beats).
 * Other types: the first set with the best value of the type's first field (e.g. longest distance).
 */
export function recordIds(sets: readonly WorkoutSet[], type: ExerciseType): Set<string> {
  const out = new Set<string>();
  const chrono = [...sets].sort(byOrder);
  if (type === 'weight,reps') {
    const best = new Map<number, WorkoutSet>();
    for (const s of chrono) {
      if (!(s.weight! > 0) || !(s.reps! > 0)) continue;
      const b = best.get(s.reps!);
      if (!b || s.weight! > b.weight!) best.set(s.reps!, s);
    }
    let heavier = -Infinity;
    for (const r of [...best.keys()].sort((a, b) => b - a)) {
      const s = best.get(r)!;
      if (s.weight! > heavier) {
        out.add(s.id);
        heavier = s.weight!;
      }
    }
    return out;
  }
  const f = fieldsOf(type)[0];
  let top: WorkoutSet | undefined;
  for (const s of chrono) if ((s[f] ?? 0) > 0 && (!top || s[f]! > top[f]!)) top = s;
  if (top) out.add(top.id);
  return out;
}

/** The latest workout before `date` that has sets of the exercise, with those sets. */
export function previousWorkout(sets: readonly WorkoutSet[], date: string): WorkoutSet[] {
  let last = '';
  for (const s of sets) if (s.date < date && s.date > last) last = s.date;
  return last ? sets.filter((s) => s.date === last).sort(byOrder) : [];
}

/** Whether a set has something in every field its exercise type records. */
export function isComplete(s: Partial<WorkoutSet>, type: ExerciseType): boolean {
  return fieldsOf(type).every((f) => s[f] != null && Number.isFinite(s[f]) && s[f]! >= 0) && fieldsOf(type).some((f) => s[f]! > 0);
}

/** Totals of a day's sets (only sets with weight and reps count toward volume). */
export function dayTotals(sets: readonly WorkoutSet[]) {
  let reps = 0;
  let volume = 0;
  for (const s of sets) {
    reps += s.reps ?? 0;
    volume += (s.weight ?? 0) * (s.reps ?? 0);
  }
  return { sets: sets.length, reps, volume };
}
