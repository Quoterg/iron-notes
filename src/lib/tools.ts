// Gym calculators: 1RM percentages, plates per side, warm-up sets. Pure; values in the user's unit.
import type { Exercise, Settings } from './model';
import { wFromUser, wToUser } from './units';
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
  // At most MAX_PLATES per side: no bar holds more, and a huge target can't freeze the screen.
  for (const p of [...sizes].filter((x) => x >= MIN_PLATE).sort((a, b) => b - a)) {
    while (side >= p - 1e-9 && out.length < MAX_PLATES) {
      out.push(p);
      side = round(side - p, 4);
    }
  }
  return { plates: out, rest: round(side * 2, 3) };
}

/** Limits for the plate set (UI and backups) and the calculators' input. */
export const MIN_PLATE = 0.25;
export const MAX_PLATE = 100;
export const MAX_SIZES = 12;
export const MAX_PLATES = 40;
export const MAX_BAR = 100;
export const MAX_TARGET = 2000;

/** A valid plate set: sizes deduped and sorted, within limits; null if unusable. */
export function cleanPlates(bar: number, sizes: readonly number[]): { bar: number; sizes: number[] } | null {
  const ok = [...new Set(sizes.filter((x) => Number.isFinite(x) && x >= MIN_PLATE && x <= MAX_PLATE))].sort((a, b) => b - a);
  if (!Number.isFinite(bar) || bar < 0 || bar > MAX_BAR || !ok.length || ok.length > MAX_SIZES) return null;
  return { bar, sizes: ok };
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

/** Whether `w` can be loaded exactly with the bar and plates (per side, as many of each as needed). */
const loadable = (w: number, bar: number, sizes: readonly number[]) => w >= bar - 1e-9 && platesPerSide(w, bar, sizes).rest < 1e-6;

/**
 * The loadable weight closest to `target` (ties go to the lighter one); the bar for anything lighter.
 * `up`: the lightest loadable weight at or above it (a weight increase must not round back down).
 * Units as given (the user's). Looks at most 50 smallest steps above for the next loadable weight.
 */
export function snapToPlates(target: number, bar: number, sizes: readonly number[], up = false): number {
  if (!(target > bar)) return bar;
  const { rest } = platesPerSide(target, bar, sizes);
  const below = round(target - rest, 4);
  if (rest < 1e-6) return below;
  const step = loadStep(sizes);
  let above: number | undefined;
  if (Number.isFinite(step) && step > 0) {
    for (let i = 1; i <= 50 && above === undefined; i++) {
      const w = round(below + i * (step / 2), 4);
      if (w > target && loadable(w, bar, sizes)) above = w;
    }
  }
  if (up) return above ?? below;
  return above !== undefined && above - target < target - below ? above : below;
}

/** Starter exercises done with a bar and plates (by name), for the "bar and plates" default. */
export const usesPlatesByName = (name: string): boolean => /barbell|squat|deadlift|hip thrust|close grip bench/i.test(name);

/** The user's bar and plates in their unit (the defaults for it otherwise). */
export function plateConfig(st: Pick<Settings, 'unit' | 'plates'>): { bar: number; sizes: number[] } {
  return st.plates?.unit === st.unit ? { bar: st.plates.bar, sizes: st.plates.sizes } : { bar: DEFAULT_PLATES[st.unit].bar, sizes: [...DEFAULT_PLATES[st.unit].sizes] };
}

/** Whether an exercise's targets round to the bar and plates (setting on, total load, uses plates). */
export const roundsToPlates = (ex: Pick<Exercise, 'name' | 'load' | 'plates' | 'type'> | undefined, st: Pick<Settings, 'roundPlates'>): boolean =>
  !!st.roundPlates && !!ex && ex.type.includes('weight') && (ex.load ?? 'total') === 'total' && (ex.plates ?? usesPlatesByName(ex.name));

/** kg → the closest loadable kg for this exercise (`up`: at or above); unchanged when it doesn't round. */
export function snapperFor(ex: Pick<Exercise, 'name' | 'load' | 'plates' | 'type'> | undefined, st: Pick<Settings, 'unit' | 'plates' | 'roundPlates'>): (kg: number, up?: boolean) => number {
  if (!roundsToPlates(ex, st)) return (kg) => kg;
  const cfg = plateConfig(st);
  return (kg, up = false) => (kg > 0 ? round(wFromUser(snapToPlates(wToUser(kg, st.unit), cfg.bar, cfg.sizes, up), st.unit), 3) : kg);
}

