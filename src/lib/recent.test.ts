import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CHANGELOG, LATEST } from '../changelog';
import { LATEST as LATEST_ID } from '../changelog-id';
import * as backup from './backup';
import { later } from './strings-later';
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
    expect(LATEST_ID).toBe(CHANGELOG[0].id);
    for (const e of CHANGELOG) for (const k of e.items) expect(Object.keys(later)).toContain(k);
  });
});

describe('favourites in backups', () => {
  it('round-trips the flag and rejects non-booleans; older backups without it restore', () => {
    const base = { app: 'iron-notes', version: 1, categories: [], sets: [] };
    const ex = (favorite: unknown) => ({ ...base, exercises: [{ id: 'e', name: 'X', categoryId: 'c', type: 'reps', favorite }] });
    expect(backup.validateBackup(ex(true)).exercises[0].favorite).toBe(true);
    expect(backup.validateBackup(ex(undefined)).exercises[0].favorite).toBeUndefined();
    expect(() => backup.validateBackup(ex('yes'))).toThrow();
  });
});
