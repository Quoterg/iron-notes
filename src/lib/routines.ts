// Routines: named plans with days of exercises and planned sets. Pure helpers; storage in db.ts.
import { fmtTime, uid } from './calc';
import { t } from './i18n';
import { fieldsOf, type Exercise, type PlannedSet, type RoutineDay, type Settings, type WorkoutSet } from './model';
import { distance, setText, weight } from './units';

/** Default plan for a newly added exercise: 3 sets of 8–10 reps, or 1 set for cardio/time work. */
export function defaultPlan(ex: Exercise): PlannedSet[] {
  const f = fieldsOf(ex.type);
  if (f.includes('reps')) return Array.from({ length: 3 }, () => ({ reps: f.includes('weight') ? 8 : 10 }));
  return [{}];
}

/** A plan line: "3 × 8", "3 × 8 · 80 kg", "1 set · 5 km"; differing sets are listed one by one. */
export function planSummary(sets: PlannedSet[], ex: Exercise, st: Settings): string {
  if (!sets.length) return '';
  const f = fieldsOf(ex.type);
  const p = sets[0];
  const same = sets.every((s) => s.weight === p.weight && s.reps === p.reps && s.distance === p.distance && s.time === p.time);
  if (!same) return sets.map((s) => setText({ ...s } as WorkoutSet, ex.type, st)).join(', ');
  const parts = [f.includes('reps') ? `${sets.length} × ${p.reps ?? '–'}` : t(sets.length === 1 ? 'oneSet' : 'nSets', { n: sets.length })];
  if (f.includes('weight') && p.weight != null) parts.push(weight(p.weight, st));
  if (f.includes('distance') && p.distance != null) parts.push(distance(p.distance, st));
  if (f.includes('time') && p.time != null) parts.push(fmtTime(p.time));
  return parts.join(' · ');
}

/**
 * The sets a routine day logs on `date`: planned (not done), in plan order. Missing values come from
 * the exercise's latest done set (so "3 × 8" starts at last time's weight); still-missing stay empty.
 */
export function plannedSets(day: RoutineDay, date: string, lastSet: (exerciseId: string) => WorkoutSet | undefined, nextOrder: () => number): WorkoutSet[] {
  const out: WorkoutSet[] = [];
  for (const item of day.items) {
    const last = lastSet(item.exerciseId);
    for (const p of item.sets) {
      out.push({
        id: uid(),
        date,
        exerciseId: item.exerciseId,
        order: nextOrder(),
        weight: p.weight ?? last?.weight,
        reps: p.reps ?? last?.reps,
        distance: p.distance ?? last?.distance,
        time: p.time ?? last?.time,
        done: false,
        planned: true,
      });
    }
  }
  return out;
}

/** Sets that count (records, graphs, history): a routine's planned, not yet done ones don't. */
export const isDone = (s: WorkoutSet): boolean => !s.planned;
