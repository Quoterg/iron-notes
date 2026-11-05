// Training statistics over a period: totals, per-category breakdown, workouts per week, most frequent
// exercises and their progress. Pure, one pass over the period's sets.
import { loadOf, realLoad, volumeWeight } from './load';
import { addDays, oneRM, parseIso } from './calc';
import type { Exercise, WorkoutSet } from './model';

export type Period = 'week' | 'month' | '3m' | 'year' | 'all';

/** First day of a period ending today ('' = from the beginning). */
export function periodStart(p: Period, today: string): string {
  const days = { week: 7, month: 30, '3m': 91, year: 365, all: 0 }[p];
  return days ? addDays(today, -(days - 1)) : '';
}

export interface Totals {
  workouts: number;
  sets: number;
  reps: number;
  /** kg (weight × reps). */
  volume: number;
  /** seconds */
  time: number;
  /** km */
  distance: number;
}

export interface CategoryShare {
  categoryId: string;
  sets: number;
  volume: number;
}

export interface ExerciseStat {
  exerciseId: string;
  sets: number;
  workouts: number;
  /** Best estimated 1RM on the first and the last workout day of the period (weight and reps only). */
  firstOrm?: number;
  lastOrm?: number;
}

export interface Summary {
  totals: Totals;
  categories: CategoryShare[];
  exercises: ExerciseStat[];
  /** Workout days per week, oldest first; weeks start on `weekStart` (0 Sunday, 1 Monday). */
  weeks: { start: string; workouts: number }[];
}

/** Monday (or Sunday) of the week holding `date`. */
export function weekOf(date: string, weekStart: 0 | 1): string {
  return addDays(date, -((parseIso(date).getDay() - weekStart + 7) % 7));
}

/**
 * Statistics of `sets` (any order; planned sets and sets of unknown exercises are skipped) for the
 * period `from`..`to`. Weeks cover the period (for "all": from the first workout).
 */
export function summarize(
  sets: readonly WorkoutSet[],
  exercise: (id: string) => Exercise | undefined,
  from: string,
  to: string,
  weekStart: 0 | 1,
  formula: 'epley' | 'brzycki' = 'epley',
  bwAt: (date: string) => number | undefined = () => undefined,
): Summary {
  const totals: Totals = { workouts: 0, sets: 0, reps: 0, volume: 0, time: 0, distance: 0 };
  const days = new Set<string>();
  const cats = new Map<string, CategoryShare>();
  const exs = new Map<string, ExerciseStat & { days: Set<string>; ormFirst?: string; ormLast?: string }>();
  for (const s of sets) {
    if (s.planned || s.date < from || s.date > to) continue;
    const ex = exercise(s.exerciseId);
    if (!ex) continue;
    days.add(s.date);
    totals.sets++;
    totals.reps += s.reps ?? 0;
    const load = loadOf(ex);
    const vol = volumeWeight(s.weight, load) * (s.reps ?? 0);
    totals.volume += vol;
    totals.time += s.time ?? 0;
    totals.distance += s.distance ?? 0;
    const c = cats.get(ex.categoryId) ?? cats.set(ex.categoryId, { categoryId: ex.categoryId, sets: 0, volume: 0 }).get(ex.categoryId)!;
    c.sets++;
    c.volume += vol;
    let e = exs.get(ex.id);
    if (!e) exs.set(ex.id, (e = { exerciseId: ex.id, sets: 0, workouts: 0, days: new Set() }));
    e.sets++;
    e.days.add(s.date);
    if (ex.type === 'weight,reps') {
      // Best estimated 1RM on the earliest and on the latest day with a weighted set (sets come in any order).
      const orm = oneRM(realLoad(s.weight, load, bwAt(s.date)) ?? 0, s.reps ?? 0, formula);
      if (orm > 0) {
        if (e.ormFirst === undefined || s.date < e.ormFirst) (e.ormFirst = s.date), (e.firstOrm = orm);
        else if (s.date === e.ormFirst) e.firstOrm = Math.max(e.firstOrm!, orm);
        if (e.ormLast === undefined || s.date > e.ormLast) (e.ormLast = s.date), (e.lastOrm = orm);
        else if (s.date === e.ormLast) e.lastOrm = Math.max(e.lastOrm!, orm);
      }
    }
  }
  totals.workouts = days.size;

  const exercises = [...exs.values()]
    .map(({ days: d, ormFirst: _f, ormLast: _l, ...rest }) => ({ ...rest, workouts: d.size }))
    .sort((a, b) => b.workouts - a.workouts || b.sets - a.sets);

  const weeks: Summary['weeks'] = [];
  const first = from || [...days].sort()[0];
  if (first) {
    const perWeek = new Map<string, number>();
    for (const d of days) {
      const w = weekOf(d, weekStart);
      perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
    }
    for (let w = weekOf(first, weekStart); w <= to; w = addDays(w, 7)) weeks.push({ start: w, workouts: perWeek.get(w) ?? 0 });
  }

  return { totals, categories: [...cats.values()].sort((a, b) => b.sets - a.sets), exercises, weeks };
}
