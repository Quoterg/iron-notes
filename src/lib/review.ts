// Cycle / block review (M27): what a Lyle cycle or the last weeks did — strength per exercise (first vs
// last session's best e1RM), readiness answers per muscle, and exercises to swap before the next cycle
// (stalled, weaker, or flagged for joint pain). Pure; the screen passes real-load sets (lib/load.ts).
import { addDays } from './calc';
import { sessions, trendOf, type Trend } from './feedback';
import type { Exercise, MuscleId, Routine, WorkoutSet } from './model';

/** The review's dates: a Lyle cycle's own (up to today while it runs), or the last `weeks` weeks. */
export function reviewRange(span: 'cycle' | number, cycle: { start: string; weeks: number } | undefined, today: string): { from: string; to: string } {
  if (span === 'cycle' && cycle) {
    const end = addDays(cycle.start, cycle.weeks * 7 - 1);
    return { from: cycle.start, to: end < today ? end : today };
  }
  return { from: addDays(today, -7 * (span === 'cycle' ? 6 : span) + 1), to: today };
}

export interface ExerciseChange {
  exerciseId: string;
  /** Best e1RM (or reps, body weight alone) of the first and the last session in the period. */
  first: number;
  last: number;
  /** last / first − 1, or null with one session. */
  change: number | null;
  /** The scale of `first`/`last`: kg (e1RM of the real load) or reps (body weight alone). */
  kind: 'load' | 'reps';
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
    const inRange = sets.filter((s) => s.date >= from && s.date <= to);
    // One scale per exercise: sets with a load (kg) when there are any, else reps — never mixed.
    const loaded = inRange.filter((s) => s.weight! > 0);
    const kind = loaded.length ? 'load' : 'reps';
    const list = sessions(kind === 'load' ? loaded : inRange, formula);
    if (!list.length) continue;
    const first = list[0].score;
    const last = list[list.length - 1].score;
    out.push({ exerciseId, first, last, change: list.length > 1 && first > 0 ? last / first - 1 : null, kind, sessions: list.length, trend: trendOf(list) });
  }
  return out.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
}

/** Readiness answers per muscle in the period: every set that carries one (the logger saves it on the first
 *  set of a muscle's day only). */
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
export function alternatives(ex: Exercise, library: readonly Exercise[], exclude: ReadonlySet<string>, n = 3, nameOf: (e: Exercise) => string = (e) => e.name): Exercise[] {
  const m = ex.muscles?.primary[0];
  if (!m) return [];
  return library
    .filter((x) => x.id !== ex.id && !exclude.has(x.id) && x.muscles?.primary[0] === m && x.type === ex.type)
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || nameOf(a).localeCompare(nameOf(b)))
    .slice(0, n);
}

/** The routine with `from` replaced by `to` in every day: sets × reps kept, planned weights dropped (they
 *  were the old exercise's; the new one's come from its own last time). */
export function swapInRoutine(r: Routine, from: string, to: string): Routine {
  const swap = (i: Routine['days'][number]['items'][number]) => ({ ...i, exerciseId: to, sets: i.sets.map(({ weight: _w, ...p }) => p) });
  return { ...r, days: r.days.map((d) => ({ ...d, items: d.items.map((i) => (i.exerciseId === from ? swap(i) : i)) })) };
}
