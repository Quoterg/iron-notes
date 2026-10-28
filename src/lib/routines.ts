// Routines: named plans with days of exercises and planned sets. Pure helpers; storage in db.ts.
import { fmtTime, uid } from './calc';
import { t } from './i18n';
import { fieldsOf, type Exercise, type PlannedSet, type RoutineDay, type RoutineItem, type Settings, type WorkoutSet } from './model';
import { dayOrder } from './groups';
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
 * the exercise's last workout, set by set (set 1 from last time's set 1, …; extra sets from its last set),
 * so a reverse pyramid keeps its shape; still-missing values stay empty.
 */
/**
 * `warmups` (Dorian HIT): last time's warm-ups come back as warm-ups — but only when the plan has room for
 * all of last time's sets; otherwise, and in the other modes, sets are matched to last time's working sets.
 */
export function plannedSets(
  day: RoutineDay,
  date: string,
  lastSets: (exerciseId: string) => readonly WorkoutSet[],
  nextOrder: () => number,
  warmups = false,
): WorkoutSet[] {
  const out: WorkoutSet[] = [];
  // A workout's supersets become new groups on the day (logging it twice makes two separate supersets).
  const groups = new Map<string, string>();
  for (const item of day.items) {
    const all = lastSets(item.exerciseId);
    const working = all.filter((s) => !s.warmup);
    const withWarmups = warmups && item.sets.length >= all.length;
    const prev = withWarmups || !working.length ? all : working;
    let group: string | undefined;
    if (item.group) {
      group = groups.get(item.group);
      if (!group) groups.set(item.group, (group = uid()));
    }
    item.sets.forEach((p, i) => {
      const last = prev[i] ?? prev[prev.length - 1];
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
        // A warm-up stays a warm-up (Dorian HIT), so filling it in doesn't count it as a working set.
        warmup: withWarmups && last?.warmup && i < prev.length ? true : undefined,
        group,
      });
    });
  }
  return out;
}

/** Sets that count (records, graphs, history): a routine's planned, not yet done ones don't. */
export const isDone = (s: WorkoutSet): boolean => !s.planned;

/**
 * A saved workout from a logged day: its exercises in order with sets × reps (distance and time for
 * those types) and its supersets — no weights: those come from the last time when it's logged.
 */
export function workoutFromDay(name: string, daySets: readonly WorkoutSet[], exercise: (id: string) => Exercise | undefined): RoutineDay {
  const order = dayOrder(daySets);
  const items: RoutineItem[] = [];
  for (const { exerciseId, group } of order) {
    const ex = exercise(exerciseId);
    if (!ex) continue;
    const f = fieldsOf(ex.type).filter((k) => k !== 'weight');
    const sets = daySets
      .filter((s) => s.exerciseId === exerciseId)
      .map((s) => Object.fromEntries(f.filter((k) => s[k] != null).map((k) => [k, s[k]])) as PlannedSet);
    items.push({ exerciseId, sets: sets.length ? sets : [{}], group });
  }
  return { id: uid(), name, items };
}
