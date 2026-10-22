// Gym calculators: 1RM percentages, plates per side, warm-up sets. Pure; values in the user's unit.
import { oneRM, round } from './calc';

export type Formula = 'epley' | 'brzycki';

/** Weight that should be liftable for `reps` given a 1RM (the formula inverted). */
export function weightForReps(orm: number, reps: number, formula: Formula = 'epley'): number {
  if (reps <= 1) return orm;
  if (formula === 'brzycki') return reps >= 37 ? 0 : (orm * (37 - reps)) / 36;
  return orm / (1 + reps / 30);
}

/** Reps 1..12 with the % of 1RM and the weight. */
export function percentTable(orm: number, formula: Formula = 'epley'): { reps: number; pct: number; weight: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const w = weightForReps(orm, i + 1, formula);
    return { reps: i + 1, pct: orm > 0 ? Math.round((w / orm) * 100) : 0, weight: w };
  });
}

export const estimate = (weight: number, reps: number, formula: Formula = 'epley'): number => oneRM(weight, reps, formula);

/**
 * Plates for one side of the bar to reach `target`, largest first, using as many of each size as fit.
 * `rest` is what can't be loaded with these plates (total, both sides; 0 when exact).
 */
export function platesPerSide(target: number, bar: number, sizes: readonly number[]): { plates: number[]; rest: number } {
  let side = round((target - bar) / 2, 4);
  if (side <= 0) return { plates: [], rest: round(Math.max(0, target - bar), 3) };
  const out: number[] = [];
  for (const p of [...sizes].filter((x) => x > 0).sort((a, b) => b - a)) {
    while (side >= p - 1e-9) {
      out.push(p);
      side = round(side - p, 4);
    }
  }
  return { plates: out, rest: round(side * 2, 3) };
}

/** The smallest weight step the plates allow (two of the smallest plate). */
export const loadStep = (sizes: readonly number[]): number => 2 * Math.min(...sizes.filter((x) => x > 0), Infinity);

/**
 * Warm-up sets for a working weight: the empty bar, then ~40 / 60 / 80 % with falling reps, each rounded
 * down to what the plates can load (and never below the bar). Light targets get fewer steps.
 */
export function warmup(target: number, bar: number, sizes: readonly number[]): { weight: number; reps: number }[] {
  const step = loadStep(sizes);
  const at = (f: number) => Math.max(bar, Number.isFinite(step) ? bar + Math.floor((target * f - bar) / step) * step : target * f);
  const sets = [{ weight: bar, reps: 10 }];
  for (const [f, reps] of [[0.4, 5], [0.6, 3], [0.8, 2]] as const) {
    const w = round(at(f), 3);
    if (w > sets[sets.length - 1].weight && w < target) sets.push({ weight: w, reps });
  }
  return target > bar ? sets : [];
}

/** Default bar and plates per unit (an Olympic bar and a full plate set). */
export const DEFAULT_PLATES = {
  kg: { bar: 20, sizes: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, sizes: [45, 35, 25, 10, 5, 2.5] },
} as const;
