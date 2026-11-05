// Effective reps per muscle group per session and per week, against the training mode's goal
// (docs/TRAINING-MODES.md, "Per muscle group"). Pure: callers pass each set's effective reps.
import { isMainSession, muscleTotals, type MuscleTotal } from './effective';
import { MUSCLES } from './muscles';
import type { MuscleId, Muscles, TrainingMode, WorkoutSet } from './model';

export interface Goal {
  min: number;
  max: number;
  /** As shown: Dorian's ~20, Lyle's range. */
  label: string;
}
/** Effective reps per muscle per main session. Standard mode has no goal (numbers only). */
export const GOALS: Record<TrainingMode, Goal | null> = {
  standard: null,
  dorian: { min: 20, max: 30, label: '20' },
  lyle: { min: 20, max: 40, label: '20–40' },
};

export type Status = 'under' | 'in' | 'over';
export const statusOf = (n: number, g: Goal): Status => (n < g.min ? 'under' : n > g.max ? 'over' : 'in');

export interface DayMuscle {
  muscle: MuscleId;
  direct: number;
  indirect: number;
  /** A main session for this muscle (direct work ≥ half the goal; any direct work without a goal). */
  main: boolean;
}

/** Per muscle for one session, in the canonical muscle order; muscles with nothing are left out. */
export function dayMuscles(
  sets: readonly WorkoutSet[],
  musclesOf: (exerciseId: string) => Muscles | undefined,
  effective: (s: WorkoutSet) => number,
  goal: Goal | null,
): DayMuscle[] {
  const totals = muscleTotals(sets.filter((s) => !s.planned).map((s) => ({ muscles: musclesOf(s.exerciseId), effective: effective(s) })));
  return MUSCLES.flatMap((m) => {
    const t = totals.get(m);
    if (!t || t.direct + t.indirect <= 0) return [];
    return [{ muscle: m, ...t, main: goal ? isMainSession(t.direct, goal.min) : t.direct > 0 }];
  });
}

/** First day (YYYY-MM-DD) of the week containing `date`; `weekStart` 0 = Sunday, 1 = Monday. */
export function weekOf(date: string, weekStart: 0 | 1): string {
  const d = new Date(date + 'T00:00:00Z');
  const back = (d.getUTCDay() - weekStart + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The `n` week starts ending with the week of `today`, oldest first. */
export function lastWeeks(today: string, n: number, weekStart: 0 | 1): string[] {
  const end = new Date(weekOf(today, weekStart) + 'T00:00:00Z');
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - 7 * (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export interface WeekMuscle {
  /** Direct + indirect effective reps of the week. */
  total: number;
  /** The week's main sessions: date and that session's direct + indirect reps. */
  sessions: { date: string; n: number }[];
}

/** Per week start, per muscle: the week's total and its main sessions. */
export function weeks(
  sets: readonly WorkoutSet[],
  musclesOf: (exerciseId: string) => Muscles | undefined,
  effective: (s: WorkoutSet) => number,
  goal: Goal | null,
  weekStart: 0 | 1,
): Map<string, Map<MuscleId, WeekMuscle>> {
  const byDate = new Map<string, WorkoutSet[]>();
  for (const s of sets) if (!s.planned) byDate.get(s.date)?.push(s) ?? byDate.set(s.date, [s]);
  const out = new Map<string, Map<MuscleId, WeekMuscle>>();
  for (const date of [...byDate.keys()].sort()) {
    const wk = weekOf(date, weekStart);
    const week = out.get(wk) ?? out.set(wk, new Map()).get(wk)!;
    for (const d of dayMuscles(byDate.get(date)!, musclesOf, effective, goal)) {
      const w = week.get(d.muscle) ?? week.set(d.muscle, { total: 0, sessions: [] }).get(d.muscle)!;
      w.total += d.direct + d.indirect;
      if (d.main) w.sessions.push({ date, n: d.direct + d.indirect });
    }
  }
  return out;
}


export interface PeriodMuscle {
  muscle: MuscleId;
  /** Direct + indirect effective reps in the period. */
  total: number;
  /** Main sessions in the period. */
  sessions: number;
}

/**
 * Effective reps per muscle over a period (Statistics), by muscle total, most first; `weeks` is the
 * period's length in weeks (at least 1) for a per-week average.
 */
export function periodMuscles(
  sets: readonly WorkoutSet[],
  musclesOf: (exerciseId: string) => Muscles | undefined,
  effective: (s: WorkoutSet) => number,
  goal: Goal | null,
  from: string,
  to: string,
): { list: PeriodMuscle[]; total: number; weeks: number } {
  const byDate = new Map<string, WorkoutSet[]>();
  for (const s of sets) if (!s.planned && s.date >= from && s.date <= to) byDate.get(s.date)?.push(s) ?? byDate.set(s.date, [s]);
  const out = new Map<MuscleId, PeriodMuscle>();
  let total = 0;
  for (const day of byDate.values()) {
    for (const d of dayMuscles(day, musclesOf, effective, goal)) {
      const m = out.get(d.muscle) ?? out.set(d.muscle, { muscle: d.muscle, total: 0, sessions: 0 }).get(d.muscle)!;
      m.total += d.direct + d.indirect;
      if (d.main) m.sessions++;
    }
    for (const s of day) total += effective(s);
  }
  const first = from || [...byDate.keys()].sort()[0] || to;
  const days = Math.round((Date.parse(to + 'T00:00Z') - Date.parse(first + 'T00:00Z')) / 86_400_000) + 1;
  return { list: [...out.values()].sort((a, b) => b.total - a.total), total, weeks: Math.max(1, days / 7) };
}

export type { MuscleTotal };

