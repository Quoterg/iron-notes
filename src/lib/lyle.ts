// Lyle McDonald's progression (Generic Bulking Routine FAQ; docs/TRAINING-MODES.md): cycles of 6 weeks
// (2 run-up + 4 push; his own 8 selectable). Run-up: week 1 at ~80–85 % of the best weight for the rep
// range, week 2 at ~90–95 %, well short of failure. Push: the exercise follows its first set — top of the
// range reached with 1–2 reps to spare → weight up one step; a grind (0 in reserve) → hold.
import type { WorkoutSet } from './model';
import { DORIAN_TOP } from './targets';

export const CYCLE_WEEKS = [6, 8] as const;
export const DEFAULT_CYCLE = 6;
/** Run-up weeks and the share of the best weight they start from. */
export const RUN_UP = [0.825, 0.925];
/** Default width of the rep range below its top (top 12 → 8–12). */
export const RANGE_WIDTH = 4;

export const repRange = (ex: { repTop?: number; repBottom?: number }): { bottom: number; top: number } => {
  const top = ex.repTop ?? DORIAN_TOP;
  const bottom = Math.min(top, ex.repBottom ?? Math.max(1, top - RANGE_WIDTH));
  return { bottom, top };
};

/** Week of the cycle that `date` is in (1 = the cycle's first week); 0 before it starts. */
export function cycleWeek(start: string, date: string): number {
  const days = Math.round((Date.parse(date + 'T00:00Z') - Date.parse(start + 'T00:00Z')) / 86_400_000);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

const working = (s: WorkoutSet) => !s.warmup && !s.planned && !s.deload && s.reps! > 0 && s.weight! > 0;

/** Best weight lifted for at least the bottom of the range, from sets before `before` (the cycle start). */
export function bestForRange(sets: readonly WorkoutSet[], bottom: number, before: string): number {
  let best = 0;
  for (const s of sets) if (working(s) && s.date < before && s.reps! >= bottom) best = Math.max(best, s.weight!);
  return best;
}

export interface LyleTarget {
  weight: number;
  reps: number;
  /** 'runup': submaximal week (1 or 2); 'up': top reached with reps to spare; 'grind': top at 0 RIR, hold;
   *  'norir': top reached without an RIR logged, hold until one is; 'reps': below the top, one more rep. */
  why: 'runup' | 'up' | 'grind' | 'norir' | 'reps';
  week: number;
  /** Last session's first working set (push weeks). */
  prev?: WorkoutSet;
}

const down = (x: number, step: number) => (step > 0 ? Math.floor(x / step + 1e-9) * step : x);

/**
 * The exercise's target for a session in `week` of the cycle (0 = no cycle: push rules). `lastFirst` is
 * the first working set of the last session before today; `best` the best weight for the range.
 */
export function lyleTarget(week: number, best: number, lastFirst: WorkoutSet | undefined, stepKg: number, range: { bottom: number; top: number }): LyleTarget | null {
  const pct = week >= 1 ? RUN_UP[week - 1] : undefined;
  // A step bigger than the run-up weight: the share itself, unrounded (never more than planned).
  if (pct && best > 0) return { weight: down(best * pct, stepKg) || best * pct, reps: range.top, why: 'runup', week };
  if (!lastFirst || !working(lastFirst)) return null;
  const w = lastFirst.weight!;
  const r = lastFirst.reps!;
  if (r >= range.top) {
    // The weight only goes up on a set known to have reps to spare; without an RIR it holds and says why.
    if (lastFirst.rir == null) return { weight: w, reps: range.top, why: 'norir', week, prev: lastFirst };
    if (lastFirst.rir >= 1) return { weight: w + stepKg, reps: range.bottom, why: 'up', week, prev: lastFirst };
    return { weight: w, reps: range.top, why: 'grind', week, prev: lastFirst };
  }
  return { weight: w, reps: Math.min(range.top, r + 1), why: 'reps', week, prev: lastFirst };
}

/** The first working set of the last session before `date`. */
export function lastFirstSet(sets: readonly WorkoutSet[], date: string): WorkoutSet | undefined {
  let first: WorkoutSet | undefined;
  for (const s of sets) {
    if (!working(s) || s.date >= date) continue;
    if (!first || s.date > first.date || (s.date === first.date && s.order < first.order)) first = s;
  }
  return first;
}
