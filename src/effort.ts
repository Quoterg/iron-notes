// Effective reps of logged sets for the screens that sum them (day log muscles, Muscles screen): a lazy
// module. Sets logged without effort are estimated from their exercise's best e1RM over its whole
// (cached) history, as on the logging screen, so every screen shows the same numbers.
import { loadOf, realLoad, usesBodyWeight } from './lib/load';
import { oneRM } from './lib/calc';
import { setEffective } from './lib/effective';
import type { WorkoutSet } from './lib/model';
import { bodyWeights, exById, loadedSetsOf, settings } from './state';

export async function effectiveOf(sets: readonly WorkoutSet[]): Promise<(s: WorkoutSet) => { n: number; est: boolean }> {
  const formula = settings.value.formula;
  // Only exercises with sets that need an estimate read their history (once; cached until it changes).
  const need = new Set(sets.filter((s) => s.rir == null && !s.warmup && (s.weight! > 0 || usesBodyWeight(loadOf(exById.value.get(s.exerciseId)))) && s.reps! > 0).map((s) => s.exerciseId));
  const best = new Map<string, number>();
  await Promise.all(
    [...need].map(async (id) => {
      let b = 0;
      for (const s of await loadedSetsOf(id)) if (!s.planned && !s.warmup) b = Math.max(b, oneRM(s.weight ?? 0, s.reps ?? 0, formula));
      best.set(id, b);
    }),
  );
  // The set itself at its real load too (body weight ±), so it compares with that best.
  const at = sets.some((s) => usesBodyWeight(loadOf(exById.value.get(s.exerciseId)))) ? await bodyWeights() : () => undefined;
  return (s) => {
    const t = loadOf(exById.value.get(s.exerciseId));
    const real = usesBodyWeight(t) ? { ...s, weight: realLoad(s.weight, t, at(s.date)) } : s;
    return setEffective(real, best.get(s.exerciseId) ?? 0, formula);
  };
}
