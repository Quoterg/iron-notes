import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as db from './lib/db';
import { daySets, exercises, loadDay, loadLibrary, removeExercise } from './state';
import { logRoutineDay } from './workout';

describe('routines in the log', () => {
  let bench = '';
  let squat = '';
  beforeAll(async () => {
    await loadLibrary();
    bench = exercises.value.find((e) => e.name === 'Flat Barbell Bench Press')!.id;
    squat = exercises.value.find((e) => e.name === 'Barbell Squat')!.id;
  });

  it('finds the last done set with one indexed read, skipping planned ones', async () => {
    await db.putSets([
      { id: 'a', date: '2026-02-01', exerciseId: bench, order: 1, weight: 80, reps: 8 },
      { id: 'b', date: '2026-02-03', exerciseId: bench, order: 2, weight: 85, reps: 6, done: false }, // unticked: counts
      { id: 'c', date: '2026-02-05', exerciseId: bench, order: 3, weight: 200, reps: 8, done: false, planned: true },
    ]);
    expect((await db.lastDoneSet(bench))?.id).toBe('b');
    expect(await db.lastDoneSet('nope')).toBeUndefined();
  });

  it('logs a routine day as planned sets and skips exercises deleted since', async () => {
    await loadDay('2026-02-10');
    await removeExercise(squat);
    await logRoutineDay(
      { id: 'd', name: 'A', items: [{ exerciseId: squat, sets: [{ reps: 5 }] }, { exerciseId: bench, sets: [{ reps: 8 }, { reps: 8 }] }] },
      '2026-02-10',
    );
    expect(daySets.value.map((s) => [s.exerciseId, s.weight, s.reps, s.planned])).toEqual([
      [bench, 85, 8, true],
      [bench, 85, 8, true],
    ]);
  });
});
