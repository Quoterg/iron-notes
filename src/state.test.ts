import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from './lib/db';
import type { WorkoutSet } from './lib/model';
import { categories, exercises, loadLibrary, removeCategory, removeExercise, upsertSorted } from './state';

const set = (id: string, date: string, order: number): WorkoutSet => ({ id, date, order, exerciseId: 'x', weight: 1, reps: 1 });

describe('upsertSorted', () => {
  const list = [set('a', '2026-01-01', 1), set('b', '2026-01-03', 2)];
  it('inserts a new set at its place', () => {
    expect(upsertSorted(list, set('c', '2026-01-04', 3), false).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(upsertSorted(list, set('c', '2026-01-02', 3), false).map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });
  it('replaces and removes', () => {
    expect(upsertSorted(list, { ...list[0], reps: 9 }, false)[0].reps).toBe(9);
    expect(upsertSorted(list, list[0], true).map((s) => s.id)).toEqual(['b']);
  });
});

describe('starter library', () => {
  it('is seeded once: an emptied library stays empty', async () => {
    await loadLibrary();
    expect(categories.value.length).toBeGreaterThan(0);
    expect(await db.isSeeded()).toBe(true);
    for (const e of exercises.value) await removeExercise(e.id);
    for (const c of categories.value) await removeCategory(c.id);
    await loadLibrary();
    expect(categories.value).toEqual([]);
    expect(exercises.value).toEqual([]);
  });
});
