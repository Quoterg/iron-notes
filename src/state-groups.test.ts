import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as db from './lib/db';
import { dayOrder, groupOf } from './lib/groups';
import type { WorkoutSet } from './lib/model';
import { daySets, exercises, loadDay, loadLibrary, records, removeExercise } from './state';
import { groupExercises, logRoutineDay, ungroupExercise } from './workout';

const D = '2026-03-02';
const order = () => dayOrder(daySets.value);
const groupsOf = () => Object.fromEntries(order().map((o) => [o.exerciseId, o.group]));

describe('superset operations', () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    await loadLibrary();
    for (const [k, name] of Object.entries({ a: 'Flat Barbell Bench Press', b: 'Barbell Row', c: 'Barbell Squat', d: 'Overhead Press' })) {
      ids[k] = exercises.value.find((e) => e.name === name)!.id;
    }
    let n = 0;
    const sets: WorkoutSet[] = [];
    for (const k of ['a', 'b', 'c', 'd']) for (const w of [60, 70]) sets.push({ id: `${k}${w}`, date: D, exerciseId: ids[k], order: ++n, weight: w, reps: 5 });
    await db.putSets(sets);
    await loadDay(D);
  });

  it('groups exercises next to each other without changing set order or records', async () => {
    const before = new Map([...records.value].map(([k, v]) => [k, [...v]]));
    await groupExercises([ids.a, ids.c, ids.d]);
    expect(order().map((o) => o.exerciseId)).toEqual([ids.a, ids.c, ids.d, ids.b]);
    const g = groupsOf();
    expect(g[ids.a]).toBeTruthy();
    expect(g[ids.c]).toBe(g[ids.a]);
    expect(g[ids.d]).toBe(g[ids.a]);
    expect(g[ids.b]).toBeUndefined();
    // Each exercise keeps its own set order; records don't move.
    expect(daySets.value.filter((s) => s.exerciseId === ids.a).map((s) => s.weight)).toEqual([60, 70]);
    for (const [k, v] of before) expect([...(records.value.get(k) ?? [])]).toEqual(v);
  });

  it('joining a new superset leaves the other two of a three-group grouped', async () => {
    await groupExercises([ids.d, ids.b]);
    const g = groupsOf();
    expect(g[ids.d]).toBe(g[ids.b]);
    expect(g[ids.a]).toBe(g[ids.c]);
    expect(g[ids.a]).not.toBe(g[ids.d]);
  });

  it('taking one out of a two-group dissolves it; ungrouping a pair clears both', async () => {
    await groupExercises([ids.c, ids.b]); // c leaves a/c (dissolves), b leaves d/b (dissolves)
    let g = groupsOf();
    expect(g[ids.a]).toBeUndefined();
    expect(g[ids.d]).toBeUndefined();
    expect(g[ids.c]).toBe(g[ids.b]);
    await ungroupExercise(ids.c);
    g = groupsOf();
    expect(g[ids.b]).toBeUndefined();
    expect(g[ids.c]).toBeUndefined();
  });

  it('new and routine-logged sets join their exercise’s superset', async () => {
    await groupExercises([ids.a, ids.b]);
    expect(groupOf(daySets.value, ids.a)).toBe(groupsOf()[ids.a]);
    expect(groupOf(daySets.value, ids.c)).toBeUndefined();
    await logRoutineDay({ id: 'r', name: 'R', items: [{ exerciseId: ids.a, sets: [{ reps: 5 }] }] }, D);
    const planned = daySets.value.find((s) => s.planned)!;
    expect(planned.group).toBe(groupsOf()[ids.a]);
  });

  it('a partner left alone after a delete counts as ungrouped', async () => {
    await removeExercise(ids.b);
    expect(groupsOf()[ids.a]).toBeUndefined();
  });
});
