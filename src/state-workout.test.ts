import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeAll, describe, expect, it } from 'vitest';
import * as db from './lib/db';
import type { WorkoutSet } from './lib/model';
import { copySets, date, daySets, deleteWorkout, exercises, loadDay, loadLibrary, moveExercise, records } from './state';

const D1 = '2026-01-05';
const D2 = '2026-01-12';
let n = 100;
const set = (exerciseId: string, d: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++n}`, date: d, exerciseId, order: n, weight, reps, ...extra,
});

describe('v1 → v2 upgrade', () => {
  it('keeps existing data and adds the records store', async () => {
    // A database as version 1 of the app left it.
    const v1 = await openDB('iron-notes', 1, {
      upgrade(d) {
        d.createObjectStore('categories', { keyPath: 'id' });
        d.createObjectStore('exercises', { keyPath: 'id' });
        const sets = d.createObjectStore('sets', { keyPath: 'id' });
        sets.createIndex('date', 'date');
        sets.createIndex('exercise', 'exerciseId');
        d.createObjectStore('comments', { keyPath: 'date' });
        d.createObjectStore('kv', { keyPath: 'key' });
      },
    });
    await v1.put('sets', { id: 'old', date: '2025-12-01', exerciseId: 'x', order: 1, weight: 50, reps: 5 });
    v1.close();
    expect((await db.setsOn('2025-12-01')).map((s) => s.id)).toEqual(['old']);
    await db.putRecords({ exerciseId: 'x', ids: ['old'] });
    expect(await db.getRecords('x')).toEqual({ exerciseId: 'x', ids: ['old'] });
  });
});

describe('workout tools', () => {
  let bench = '';
  let squat = '';
  beforeAll(async () => {
    await loadLibrary();
    bench = exercises.value.find((e) => e.name === 'Flat Barbell Bench Press')!.id;
    squat = exercises.value.find((e) => e.name === 'Barbell Squat')!.id;
    await db.putSets([set(bench, D1, 80, 8, { comment: 'easy' }), set(bench, D1, 85, 5), set(squat, D1, 120, 5)]);
  });

  it('copies a workout with new ids after what is there, without comments, and stores records', async () => {
    await loadDay(D2);
    await copySets(await db.setsOn(D1), D2);
    const copied = daySets.value;
    expect(copied.map((s) => [s.weight, s.reps])).toEqual([[80, 8], [85, 5], [120, 5]]);
    expect(copied.every((s) => s.date === D2 && !s.comment && !s.id.startsWith('s'))).toBe(true);
    // Equal sets later than the originals hold no records; the originals keep theirs.
    const stored = await db.getRecords(bench);
    expect(stored!.ids.some((id) => id.startsWith('s'))).toBe(true);
    expect(copied.some((s) => records.value.get(s.exerciseId)?.has(s.id))).toBe(false);
  });

  it('moves an exercise without touching set order within it or records', async () => {
    await loadDay(D1);
    const before = new Set(records.value.get(bench));
    await moveExercise(squat, -1);
    expect(daySets.value.map((s) => s.exerciseId)).toEqual([squat, bench, bench]);
    expect(daySets.value.filter((s) => s.exerciseId === bench).map((s) => s.weight)).toEqual([80, 85]);
    await moveExercise(squat, -1); // already first: no-op
    expect(daySets.value[0].exerciseId).toBe(squat);
    expect(records.value.get(bench)).toEqual(before);
  });

  it('deletes a whole workout and updates stored records', async () => {
    await loadDay(D1);
    await db.putComment(D1, 'heavy day');
    await deleteWorkout(D1);
    expect(daySets.value).toEqual([]);
    expect(await db.getComment(D1)).toBe('');
    expect(date.value).toBe(D1);
    // The copies on D2 now hold the records.
    const d2 = await db.setsOn(D2);
    expect((await db.getRecords(bench))!.ids.every((id) => d2.some((s) => s.id === id))).toBe(true);
  });
});
