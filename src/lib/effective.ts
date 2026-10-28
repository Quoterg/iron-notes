// Effective reps: reps done with all of a muscle's high-threshold fibres recruited (docs/TRAINING-MODES.md).
// Load decides when that starts: with a heavy weight (≈ 5–8RM or heavier) from the first rep, with a
// lighter one only over the last few reps before failure. The constants are tuning knobs, kept here.
import type { MuscleId, Muscles } from './model';

/** Reps-to-failure at or below which every rep counts (≈ 80 % of 1RM). */
export const HEAVY_RM = 8;
/** Reps before failure that count with a lighter load. */
export const LIGHT_WINDOW = 5;
/** RIR this high or more counts as no effort (the 5+ chip). */
export const MAX_RIR = 5;
/** How much a secondary muscle gets of an exercise's effective reps. */
export const SECONDARY = 0.5;

/** Reps before failure that count for a set whose load allows `rm` reps to failure. */
export function window(rm: number): number {
  if (rm <= HEAVY_RM) return rm;
  if (rm === HEAVY_RM + 1) return LIGHT_WINDOW + 1; // taper, so 9 to failure isn't worth less than 8
  return LIGHT_WINDOW;
}

/**
 * Effective reps of one set: `reps` done with `rir` reps left in reserve (0 = failure), plus reps
 * after failure (forced, rest-pause, drop) which all count.
 */
export function effectiveReps(reps: number, rir: number, afterFailure = 0): number {
  if (!(reps > 0)) return 0;
  const r = Math.max(0, Math.round(rir));
  const extra = Math.max(0, Math.round(afterFailure || 0));
  if (r >= MAX_RIR) return 0;
  const rm = reps + r;
  return Math.max(0, reps - Math.max(0, rm - window(rm))) + extra;
}

/**
 * Reps in reserve estimated from the exercise's best e1RM (Standard mode, no effort logged): the reps
 * this weight would allow to failure by the inverse of the 1RM formula, minus the reps done.
 */
export function estimateRir(weight: number, reps: number, e1rm: number, formula: 'epley' | 'brzycki' = 'epley'): number {
  if (!(weight > 0) || !(reps > 0) || !(e1rm > 0)) return 2;
  if (weight >= e1rm) return 0;
  const rm = formula === 'brzycki' ? 37 - (36 * weight) / e1rm : 30 * (e1rm / weight - 1);
  return Math.max(0, Math.round(rm) - reps);
}

export interface MuscleTotal {
  /** Effective reps from exercises with this muscle as primary. */
  direct: number;
  /** Secondary share from other exercises (SECONDARY × their effective reps). */
  indirect: number;
}

/** Effective reps per muscle of a session, from (muscles, effective reps) per set. */
export function muscleTotals(sets: Iterable<{ muscles?: Muscles; effective: number }>): Map<MuscleId, MuscleTotal> {
  const out = new Map<MuscleId, MuscleTotal>();
  const get = (m: MuscleId) => out.get(m) ?? out.set(m, { direct: 0, indirect: 0 }).get(m)!;
  for (const s of sets) {
    if (!s.muscles || !(s.effective > 0)) continue;
    for (const m of s.muscles.primary) get(m).direct += s.effective;
    for (const m of s.muscles.secondary) if (!s.muscles.primary.includes(m)) get(m).indirect += s.effective * SECONDARY;
  }
  return out;
}

/** A session is a muscle's main session when its direct work reaches half the goal; less is extra work. */
export const isMainSession = (direct: number, goalMin: number): boolean => direct >= goalMin / 2;
