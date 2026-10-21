import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from './db';
import { starterLibrary } from './seed';

describe('db', () => {
  it('stores sets and finds them by day and by exercise', async () => {
    await db.putSet({ id: 'a', date: '2026-01-01', exerciseId: 'bench', order: 1, weight: 100, reps: 5 });
    await db.putSet({ id: 'b', date: '2026-01-01', exerciseId: 'squat', order: 2, weight: 140, reps: 5 });
    await db.putSet({ id: 'c', date: '2026-01-03', exerciseId: 'bench', order: 3, weight: 102.5, reps: 5 });
    expect((await db.setsOn('2026-01-01')).map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect((await db.setsOf('bench')).map((s) => s.id).sort()).toEqual(['a', 'c']);
    expect(await db.countSetsOf('bench')).toBe(2);
  });

  it('deletes an exercise with its sets', async () => {
    await db.putExercise({ id: 'bench', name: 'Bench', categoryId: 'c', type: 'weight,reps' });
    await db.deleteExercise('bench');
    expect(await db.setsOf('bench')).toEqual([]);
    expect((await db.setsOf('squat')).length).toBe(1);
  });

  it('keeps and clears workout comments', async () => {
    await db.putComment('2026-01-01', '  Felt strong  ');
    expect(await db.getComment('2026-01-01')).toBe('Felt strong');
    await db.putComment('2026-01-01', '');
    expect(await db.getComment('2026-01-01')).toBe('');
  });

  it('merges stored settings over the defaults', async () => {
    expect((await db.getSettings()).unit).toBe('kg');
    await db.putSettings({ ...(await db.getSettings()), unit: 'lb' });
    expect((await db.getSettings()).unit).toBe('lb');
  });

  it('round-trips a backup and rejects other files', async () => {
    const lib = starterLibrary();
    await db.putLibrary(lib.categories, lib.exercises);
    const b = await db.exportAll();
    await expect(db.importAll({ foo: 1 })).rejects.toThrow();
    await db.putSet({ id: 'z', date: '2026-02-01', exerciseId: 'squat', order: 9, weight: 1, reps: 1 });
    await db.importAll(JSON.parse(JSON.stringify(b)));
    const after = await db.exportAll();
    expect(after.sets.map((s) => s.id).sort()).toEqual(b.sets.map((s) => s.id).sort());
    expect(after.exercises.length).toBe(lib.exercises.length);
    expect(after.settings.unit).toBe('lb');
  });
});

describe('starter library', () => {
  it('has categories with exercises and unique names', () => {
    const { categories, exercises } = starterLibrary();
    expect(categories.length).toBeGreaterThan(5);
    for (const c of categories) expect(exercises.some((e) => e.categoryId === c.id)).toBe(true);
    const names = exercises.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
