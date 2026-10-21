import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as backup from './backup';
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
    const b = await backup.exportAll();
    await expect(backup.importAll({ foo: 1 })).rejects.toThrow();
    await db.putSet({ id: 'z', date: '2026-02-01', exerciseId: 'squat', order: 9, weight: 1, reps: 1 });
    await backup.importAll(JSON.parse(JSON.stringify(b)));
    const after = await backup.exportAll();
    expect(after.sets.map((s) => s.id).sort()).toEqual(b.sets.map((s) => s.id).sort());
    expect(after.exercises.length).toBe(lib.exercises.length);
    expect(after.settings.unit).toBe('lb');
  });
});

describe('restore validation', () => {
  type Any = any;
  const good = async (): Promise<Any> => JSON.parse(JSON.stringify(await backup.exportAll()));

  it('rejects malformed rows and leaves the current data untouched', async () => {
    const before = (await backup.exportAll()).sets.length;
    const bad: ((b: Any) => void)[] = [
      (b) => (b.sets[0] = { ...b.sets[0], date: 20260101 }),
      (b) => (b.sets[0] = { ...b.sets[0], id: undefined }),
      (b) => (b.sets[0] = { ...b.sets[0], weight: 'heavy' }),
      (b) => (b.sets[0] = { ...b.sets[0], order: null }),
      (b) => (b.exercises[0] = { ...b.exercises[0], type: 'weight,banana' }),
      (b) => (b.categories[0] = { ...b.categories[0], color: 'red' }),
      (b) => (b.comments = [{ date: 'yesterday', text: 'x' }]),
      (b) => (b.version = 2),
    ];
    for (const spoil of bad) {
      const b = await good();
      spoil(b);
      await expect(backup.importAll(b)).rejects.toThrow();
    }
    expect((await backup.exportAll()).sets.length).toBe(before);
  });

  it('keeps only known settings values', () => {
    const b = backup.validateBackup({ app: 'iron-notes', version: 1, categories: [], exercises: [], sets: [], settings: { unit: 'stone', rest: -5, autoTimer: false } });
    expect(b.settings.unit).toBe('kg');
    expect(b.settings.rest).toBe(90);
    expect(b.settings.autoTimer).toBe(false);
  });

  it('round-trips routines and rejects malformed ones; older backups without routines restore', async () => {
    const routine = { id: 'r1', name: 'Push', order: 0, days: [{ id: 'd1', name: 'Day 1', items: [{ exerciseId: 'x', sets: [{ reps: 8 }, { reps: 8, weight: 60 }] }] }] };
    await db.putRoutine(routine);
    const b = await good();
    expect(b.routines).toEqual([routine]);
    const bad = await good();
    bad.routines[0].days[0].items[0].sets[0].reps = 'eight';
    await expect(backup.importAll(bad)).rejects.toThrow();
    const old = await good();
    delete old.routines;
    await backup.importAll(old);
    expect(await db.getRoutines()).toEqual([]);
    await backup.importAll(b);
    expect(await db.getRoutines()).toEqual([routine]);
  });

  it('marks the library as seeded after a restore, even an empty one', async () => {
    await backup.importAll({ app: 'iron-notes', version: 1, categories: [], exercises: [], sets: [] });
    expect(await db.isSeeded()).toBe(true);
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
