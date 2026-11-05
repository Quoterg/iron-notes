// Load types (M25): what the weight typed for a set means. "Total" is the bar or machine; "per hand" is
// one dumbbell (volume counts both hands; 1RM and records stay per hand); "body weight + load" and
// "assisted" add or subtract the body weight (the latest Body-screen weigh-in on or before the day).
// Calculations get read-only copies of the sets with the real load as `weight` (never saved).
import type { BodyEntry, Exercise, LoadType, WorkoutSet } from './model';

export const LOAD_TYPES: LoadType[] = ['total', 'perHand', 'bodyweight', 'assisted'];
export const loadOf = (ex: Pick<Exercise, 'load'> | undefined): LoadType => ex?.load ?? 'total';
/** Whether the load depends on body weight. */
export const usesBodyWeight = (t: LoadType): boolean => t === 'bodyweight' || t === 'assisted';

/** Body weight on a date: the latest entry on or before it, else the first one after (it changes slowly). */
export function bodyWeightAt(entries: readonly BodyEntry[]): (date: string) => number | undefined {
  const sorted = entries.filter((e) => e.value > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at));
  return (date) => {
    if (!sorted.length) return undefined;
    let lo = 0;
    let hi = sorted.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].date <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return sorted[found >= 0 ? found : 0].value;
  };
}

/**
 * The load the muscles moved, in kg: the entered weight for total and per hand; body weight plus the
 * added load; body weight minus the assistance. Unknown body weight: the added load only (body weight +
 * load) or nothing (assisted).
 */
export function realLoad(weight: number | undefined, t: LoadType, bw: number | undefined): number | undefined {
  if (t === 'bodyweight') return (bw ?? 0) + (weight ?? 0); // no weigh-in: the added load (0 for body weight alone)
  if (t === 'assisted') return bw != null ? Math.max(0, bw - (weight ?? 0)) : undefined;
  return weight;
}

/** The weight that counts in volume: both dumbbells, the added load only (body weight isn't external
 *  load), none for an assisted machine. */
export function volumeWeight(weight: number | undefined, t: LoadType): number {
  if (t === 'perHand') return 2 * (weight ?? 0);
  if (t === 'assisted') return 0;
  return weight ?? 0;
}

/** A read-only copy for calculations: `weight` is the real load, `vol` the weight that counts in volume. */
export type LoadedSet = WorkoutSet & { vol?: number };

/** Copies of `sets` with the real load and volume weight (the same array for total loads). */
export function withRealLoad(sets: readonly WorkoutSet[], t: LoadType, bwAt: (date: string) => number | undefined): readonly LoadedSet[] {
  if (t === 'total') return sets;
  return sets.map((s) => ({ ...s, weight: realLoad(s.weight, t, bwAt(s.date)), vol: volumeWeight(s.weight, t) }));
}

/** Whether a body-weight load type is missing its body weight (the screen shows a hint). */
export const needsBodyWeight = (t: LoadType, bwAt: (date: string) => number | undefined, date: string): boolean =>
  usesBodyWeight(t) && bwAt(date) == null;
