// Cycle / block review (M27): what a Lyle cycle or the last weeks did — strength per exercise (first vs
// last session's best e1RM), readiness answers per muscle, and exercises to swap before the next cycle
// (stalled, weaker, or flagged for joint pain). Pure; the screen passes real-load sets (lib/load.ts).
import { sessions, trendOf, type Trend } from './feedback';
import type { Exercise, MuscleId, Routine, WorkoutSet } from './model';

export interface ExerciseChange {
  exerciseId: string;
  /** Best e1RM (or reps, body weight alone) of the first and the last session in the period. */
  first: number;
  last: number;
  /** last / first − 1, or null with one session. */
  change: number | null;
  sessions: number;
  trend: Trend;
}

/** Per exercise with sets in [from, to]: first vs last session and the trend over the period's sessions. */
export function exerciseChanges(
  byExercise: ReadonlyMap<string, readonly WorkoutSet[]>,
  from: string,
  to: string,
  formula: 'epley' | 'brzycki' = 'epley',
): ExerciseChange[] {
  const out: ExerciseChange[] = [];
  for (const [exerciseId, sets] of byExercise) {
    const list = sessions(sets.filter((s) => s.date >= from && s.date <= to), formula);
    if (!list.length) continue;
    const first = list[0].score;
    const last = list[list.length - 1].score;
    out.push({ exerciseId, first, last, change: list.length > 1 && first > 0 ? last / first - 1 : null, sessions: list.length, trend: trendOf(list) });
  }
  return out.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
}

/** Readiness answers per muscle in the period (from the first set of each muscle's day). */
export function soreness(
  sets: readonly WorkoutSet[],
  musclesOf: (exerciseId: string) => { primary: readonly MuscleId[] } | undefined,
  from: string,
  to: string,
): Map<MuscleId, [fresh: number, bitSore: number, stillSore: number]> {
  const out = new Map<MuscleId, [number, number, number]>();
  for (const s of sets) {
    if (s.sore == null || s.date < from || s.date > to) continue;
    for (const m of musclesOf(s.exerciseId)?.primary ?? []) {
      const c = out.get(m) ?? out.set(m, [0, 0, 0]).get(m)!;
      c[Math.max(0, Math.min(2, s.sore))]++;
    }
  }
  return out;
}

/** Exercises worth swapping before the next cycle: no progress, getting weaker, or joint pain flagged. */
export const toSwap = (c: ExerciseChange, ex: Exercise | undefined): boolean =>
  !!ex?.joint || c.trend === 'weaker' || c.trend === 'stalled' || (c.change != null && c.change <= 0 && c.sessions >= 3);

/** Alternatives for the same main muscle (the first primary), not already in use, favourites first. */
export function alternatives(ex: Exercise, library: readonly Exercise[], exclude: ReadonlySet<string>, n = 3): Exercise[] {
  const m = ex.muscles?.primary[0];
  if (!m) return [];
  return library
    .filter((x) => x.id !== ex.id && !exclude.has(x.id) && x.muscles?.primary[0] === m && x.type === ex.type)
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** The routine with `from` replaced by `to` in every day (its planned sets kept). */
export function swapInRoutine(r: Routine, from: string, to: string): Routine {
  return { ...r, days: r.days.map((d) => ({ ...d, items: d.items.map((i) => (i.exerciseId === from ? { ...i, exerciseId: to } : i)) })) };
}
