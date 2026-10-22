import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CHANGELOG, LATEST } from '../changelog';
import * as db from './db';

describe('recent exercises', () => {
  it('lists the latest different exercises, newest first, skipping planned sets', async () => {
    expect(await db.recentExerciseIds(8)).toEqual([]);
    expect(await db.hasAnySets()).toBe(false);
    await db.putSets([
      { id: 'a', date: '2026-01-01', exerciseId: 'bench', order: 1, weight: 80, reps: 5 },
      { id: 'b', date: '2026-01-03', exerciseId: 'squat', order: 2, weight: 100, reps: 5 },
      { id: 'c', date: '2026-01-05', exerciseId: 'row', order: 3, weight: 60, reps: 8, planned: true },
      { id: 'd', date: '2026-01-05', exerciseId: 'bench', order: 4, weight: 82.5, reps: 5 },
    ]);
    expect(await db.recentExerciseIds(8)).toEqual(['bench', 'squat']);
    expect(await db.recentExerciseIds(1)).toEqual(['bench']);
    expect(await db.hasAnySets()).toBe(true);
  });
});

describe("what's new", () => {
  it('has entries with strictly decreasing ids, newest first', () => {
    expect(LATEST).toBe(CHANGELOG[0].id);
    for (let i = 1; i < CHANGELOG.length; i++) expect(CHANGELOG[i].id).toBeLessThan(CHANGELOG[i - 1].id);
    expect(CHANGELOG.every((e) => e.items.length > 0)).toBe(true);
  });
});
