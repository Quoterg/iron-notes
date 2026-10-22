// Workout operations that run after a tap or on later screens (copy, reorder, supersets, delete, routines):
// a lazy chunk, not part of the first paint. Builds on state.ts (cache, records, day reload).
import { byOrder, uid } from './lib/calc';
import * as db from './lib/db';
import type { RoutineDay, Routine, WorkoutSet } from './lib/model';
import { afterWrite, applyToCache, date, dayComment, daySets, exById, loadDay, nextOrder, routines, settings, setsVersion } from './state';

/** Copies sets to `to` (new ids, in their order, after anything already logged there; comments not copied). */
export async function copySets(sets: readonly WorkoutSet[], to: string): Promise<void> {
  const copies = [...sets].sort(byOrder).map(
    (s): WorkoutSet => ({ ...s, id: uid(), date: to, order: nextOrder(), comment: undefined, done: settings.value.markDone ? false : undefined }),
  );
  await db.putSets(copies);
  await afterWrite(copies);
}

/** Moves an exercise (with its whole superset) of the shown day up (-1) or down (+1). */
export async function moveExercise(exerciseId: string, dir: -1 | 1): Promise<void> {
  const { dayOrder, moveUnit } = await import('./lib/groups');
  const current = dayOrder(daySets.value);
  const order = moveUnit(current, exerciseId, dir);
  if (order.every((id, i) => id === current[i].exerciseId)) return;
  const groupOf = new Map(current.map((o) => [o.exerciseId, o.group]));
  await rewriteDay(order, (id) => groupOf.get(id));
}

/** Writes the day's sets in a new exercise order (and group ids), keeping each exercise's set order. */
async function rewriteDay(order: string[], groupOf: (exerciseId: string) => string | undefined) {
  const groups = new Map<string, WorkoutSet[]>();
  for (const s of daySets.value) groups.get(s.exerciseId)?.push(s) ?? groups.set(s.exerciseId, [s]);
  const base = daySets.value[0].order; // the day's own key range: other days are unaffected
  const next = order.flatMap((id) => groups.get(id) ?? []).map((s, k) => ({ ...s, order: base + k, group: groupOf(s.exerciseId) }));
  // Only sets whose order or group changed are written.
  const before = new Map(daySets.value.map((s) => [s.id, s]));
  const changed = next.filter((s) => before.get(s.id)!.order !== s.order || before.get(s.id)!.group !== s.group);
  await db.putSets(changed);
  applyToCache(changed, false); // order within each exercise is unchanged: records stay as they are
  setsVersion.value++;
  await loadDay(date.value);
}

/** Groups exercises of the shown day into a superset (pulled next to each other at the first one). */
export async function groupExercises(ids: string[]): Promise<void> {
  const { dayOrder, pullTogether } = await import('./lib/groups');
  if (ids.length < 2) return;
  const members = new Set(ids);
  const current = dayOrder(daySets.value);
  const g = uid();
  // Joining a group takes an exercise out of its old one; a group left with one member dissolves.
  const left = new Map<string, number>();
  for (const o of current) if (o.group && !members.has(o.exerciseId)) left.set(o.group, (left.get(o.group) ?? 0) + 1);
  const groupOf = new Map(current.map((o) => [o.exerciseId, members.has(o.exerciseId) ? g : o.group && (left.get(o.group) ?? 0) > 1 ? o.group : undefined]));
  await rewriteDay(pullTogether(current.map((o) => o.exerciseId), members), (id) => groupOf.get(id));
}

/** Takes an exercise out of its superset (the group dissolves if one member is left). */
export async function ungroupExercise(exerciseId: string): Promise<void> {
  const { dayOrder } = await import('./lib/groups');
  const current = dayOrder(daySets.value);
  const g = current.find((o) => o.exerciseId === exerciseId)?.group;
  if (!g) return;
  const remaining = current.filter((o) => o.group === g && o.exerciseId !== exerciseId).length;
  const groupOf = new Map(current.map((o) => [o.exerciseId, o.exerciseId === exerciseId || (o.group === g && remaining < 2) ? undefined : o.group]));
  await rewriteDay(current.map((o) => o.exerciseId), (id) => groupOf.get(id));
}

/** Deletes a whole day (sets and comment); returns an undo. */
export async function deleteWorkout(d: string): Promise<() => Promise<void>> {
  const gone = await db.deleteDay(d);
  if (d === date.value) dayComment.value = '';
  await afterWrite(gone.sets, true);
  return async () => {
    await db.restoreDay(gone.sets, gone.comment);
    if (d === date.value) dayComment.value = gone.comment?.text ?? '';
    await afterWrite(gone.sets);
  };
}

// ---- Routines (loaded when first needed, not at start) ----
const byRoutineOrder = (a: Routine, b: Routine) => a.order - b.order || a.name.localeCompare(b.name);

export async function loadRoutines(): Promise<Routine[]> {
  if (!routines.value) routines.value = (await db.getRoutines()).sort(byRoutineOrder);
  return routines.value;
}
export async function saveRoutine(r: Routine): Promise<void> {
  await db.putRoutine(r);
  routines.value = [...(routines.value ?? []).filter((x) => x.id !== r.id), r].sort(byRoutineOrder);
}
export async function removeRoutine(id: string): Promise<void> {
  await db.deleteRoutine(id);
  routines.value = (routines.value ?? []).filter((x) => x.id !== id);
}

/** Logs a routine day into `d` as planned (not yet done) sets, after anything already there. */
export async function logRoutineDay(day: RoutineDay, d: string): Promise<void> {
  const { plannedSets } = await import('./lib/routines');
  const items = day.items.filter((i) => exById.value.has(i.exerciseId));
  // Last done set per exercise (one indexed read each): fills in weights the plan leaves open.
  const last = new Map<string, WorkoutSet | undefined>();
  await Promise.all(items.map(async (i) => last.set(i.exerciseId, await db.lastDoneSet(i.exerciseId))));
  const { groupOf } = await import('./lib/groups');
  const sameDay = d === date.value ? daySets.value : await db.setsOn(d);
  // Sets of an exercise already in a superset that day join it.
  const sets = plannedSets({ ...day, items }, d, (id) => last.get(id), nextOrder).map((s) => ({ ...s, group: groupOf(sameDay, s.exerciseId) }));
  if (!sets.length) return;
  await db.putSets(sets);
  if (d !== date.value) date.value = d;
  await afterWrite(sets);
}

