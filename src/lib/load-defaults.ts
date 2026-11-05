// Starter exercises' load types (M25): for new installs (seed.ts) and, once, for older installs
// (state.ts). A lazy module: the first paint only needs lib/load.ts itself.
import type { Exercise, LoadType } from './model';

/** Starter exercises and their load type (by name, lower case). Body-weight ones were reps-only before. */
export const DEFAULT_LOADS: Record<string, LoadType> = {
  'seated dumbbell press': 'perHand',
  'arnold press': 'perHand',
  'lateral dumbbell raise': 'perHand',
  'front dumbbell raise': 'perHand',
  'dumbbell curl': 'perHand',
  'hammer curl': 'perHand',
  'flat dumbbell bench press': 'perHand',
  'incline dumbbell bench press': 'perHand',
  'dumbbell fly': 'perHand',
  'one arm dumbbell row': 'perHand',
  dips: 'bodyweight',
  'pull up': 'bodyweight',
  'chin up': 'bodyweight',
  'push up': 'bodyweight',
};

/**
 * Starter exercises without a load type yet, with their default (others untouched). A body-weight one
 * that was reps-only gains a weight field for the added load (its old sets read as + 0 kg).
 */
export function withDefaultLoads(list: readonly Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  for (const e of list) {
    const d = e.load == null ? DEFAULT_LOADS[e.name.toLowerCase()] : undefined;
    if (!d) continue;
    if (d === 'perHand' && e.type === 'weight,reps') out.push({ ...e, load: d });
    else if (d === 'bodyweight' && (e.type === 'reps' || e.type === 'weight,reps')) out.push({ ...e, load: d, type: 'weight,reps' });
  }
  return out;
}
