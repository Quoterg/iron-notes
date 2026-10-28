// Targets for the next session (docs/TRAINING-MODES.md). Dorian HIT: dynamic double progression — each
// working set climbs in reps against the same set last time until it reaches the top of the range, then
// that set's weight goes up one step and the reps restart wherever failure lands (no rep target).
import type { MuscleId, Muscles, WorkoutSet } from './model';
import { isMainSession, muscleTotals } from './effective';

/** Top of the rep range in Dorian HIT unless the exercise sets its own. */
export const DORIAN_TOP = 12;
/** Days a muscle should rest between main sessions in Dorian HIT before a "too soon" hint. */
export const DORIAN_REST_DAYS = 5;
/** Dorian's working-set goal per muscle (a main session reaches half). */
export const DORIAN_GOAL = 20;

export interface Target {
  /** Weight in kg (unchanged, or one step up). */
  weight: number;
  /** Reps to reach (one more than last time), or none right after a weight increase. */
  reps?: number;
  /** 'up': last time reached the top, so the weight goes up; 'beat': beat last time's reps; 'light': a
   *  lighter-week set (~10 % less, stop short of failure). */
  why: 'up' | 'beat' | 'light';
  /** The same set last time. */
  prev: WorkoutSet;
}

const working = (s: WorkoutSet) => !s.warmup && s.reps! > 0;

/** Target for one working set from the same set last time; `stepKg` is the exercise's weight step. */
export function dorianTarget(prev: WorkoutSet, stepKg: number, top = DORIAN_TOP): Target | null {
  if (!working(prev)) return null;
  const w = prev.weight ?? 0;
  // Body-weight sets (no weight) keep adding reps: there is no weight to put up.
  if (prev.reps! >= top && w > 0) return { weight: w + stepKg, why: 'up', prev };
  return { weight: w, reps: prev.reps! + 1, why: 'beat', prev };
}

/** Targets for this session's working sets in order (the n-th working set against last time's n-th). */
export function dorianTargets(lastWorkout: readonly WorkoutSet[], stepKg: number, top = DORIAN_TOP): Target[] {
  return lastWorkout.filter(working).flatMap((s) => dorianTarget(s, stepKg, top) ?? []);
}

/**
 * Last workout's sets as the starting point of a routine day in Dorian HIT: sets that reached the top
 * come with the weight one step up and no reps; the others with one rep more to beat.
 */
export function progressedSets(lastWorkout: readonly WorkoutSet[], stepKg: number, top = DORIAN_TOP): WorkoutSet[] {
  return lastWorkout.map((s) => {
    const t = dorianTarget(s, stepKg, top);
    return t ? { ...s, weight: t.weight, reps: t.reps } : s;
  });
}

/** Dorian's warm-ups before the first working set: ≈ 50 % × 10 and 75 % × 6, rounded down to the step. */
export function warmups(workKg: number, stepKg: number): { weight: number; reps: number }[] {
  if (!(workKg > 0)) return [];
  const down = (x: number) => (stepKg > 0 ? Math.floor(x / stepKg + 1e-9) * stepKg : x);
  return [
    { weight: down(workKg * 0.5), reps: 10 },
    { weight: down(workKg * 0.75), reps: 6 },
  ].filter((w) => w.weight > 0);
}

const dayMs = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00Z') - Date.parse(a + 'T00:00Z')) / dayMs);

/**
 * Muscles of `target` that had a main session (direct effective reps ≥ half the goal) less than
 * `restDays` before `date`, with how many days ago (the most recent). Extra work doesn't count.
 */
export function tooSoon(
  date: string,
  target: Muscles | undefined,
  earlier: readonly WorkoutSet[],
  musclesOf: (exerciseId: string) => Muscles | undefined,
  effective: (s: WorkoutSet) => number,
  restDays = DORIAN_REST_DAYS,
  goal = DORIAN_GOAL,
): { muscle: MuscleId; days: number }[] {
  if (!target?.primary.length) return [];
  const byDate = new Map<string, WorkoutSet[]>();
  for (const s of earlier) {
    const d = daysBetween(s.date, date);
    if (d < 1 || d >= restDays || s.planned) continue;
    byDate.get(s.date)?.push(s) ?? byDate.set(s.date, [s]);
  }
  const out = new Map<MuscleId, number>();
  for (const [d, sets] of byDate) {
    const totals = muscleTotals(sets.map((s) => ({ muscles: musclesOf(s.exerciseId), effective: effective(s) })));
    for (const m of target.primary) {
      const tot = totals.get(m);
      const ago = daysBetween(d, date);
      if (tot && isMainSession(tot.direct, goal) && !(out.get(m)! <= ago)) out.set(m, ago);
    }
  }
  return [...out].map(([muscle, days]) => ({ muscle, days }));
}
