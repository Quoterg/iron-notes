import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as backup from './lib/backup';
import * as db from './lib/db';
import { defaultMuscles } from './lib/muscles';
import { exercises, loadLibrary } from './state';

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 50 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('mapping muscles once for existing installs', () => {
  it('maps exercises without muscles, never edited ones, and honours the flag', async () => {
    // An install from before M13: library seeded without muscles, one exercise edited by the user.
    await db.putLibrary(
      [{ id: 'c', name: 'Chest', color: '#f0566a', order: 0 }],
      [
        { id: 'bench', name: 'Flat Barbell Bench Press', categoryId: 'c', type: 'weight,reps' },
        { id: 'dips', name: 'Dips', categoryId: 'c', type: 'reps', muscles: { primary: [], secondary: [] } }, // cleared by the user
        { id: 'mine', name: 'My Odd Lift', categoryId: 'c', type: 'weight,reps' },
      ],
    );
    await db.markSeeded();
    await loadLibrary();
    await until(() => !!exercises.value.find((e) => e.id === 'bench')?.muscles);
    const byId = (id: string) => exercises.value.find((e) => e.id === id)!;
    expect(byId('bench').muscles).toEqual(defaultMuscles('Flat Barbell Bench Press'));
    expect(byId('dips').muscles).toEqual({ primary: [], secondary: [] });
    expect(byId('mine').muscles).toBeUndefined();
    expect(await db.getFlag('musclesMapped')).toBe(true);

    // The user removes bench's muscles entirely: a later start doesn't map it again.
    await db.putExercise({ ...byId('bench'), muscles: undefined });
    await loadLibrary();
    await new Promise((r) => setTimeout(r, 50));
    expect(byId('bench').muscles).toBeUndefined();
  });

  it('runs again after restoring an older backup (the flag goes with the old data)', async () => {
    const b = JSON.parse(JSON.stringify(await backup.exportAll()));
    for (const e of b.exercises) delete e.muscles;
    await backup.importAll(b);
    expect(await db.getFlag('musclesMapped')).toBe(false);
    await loadLibrary();
    await until(() => !!exercises.value.find((e) => e.id === 'bench')?.muscles);
    expect(exercises.value.find((e) => e.id === 'bench')!.muscles).toEqual(defaultMuscles('flat barbell bench press'));
  });

  it('normalises muscles on restore (primary wins, no repeats, canonical order)', () => {
    const v = backup.validateBackup({
      app: 'iron-notes', version: 1, categories: [], sets: [],
      exercises: [{ id: 'e', name: 'X', categoryId: 'c', type: 'reps', muscles: { primary: ['triceps', 'chest', 'chest'], secondary: ['chest', 'abs'] } }],
    });
    expect(v.exercises[0].muscles).toEqual({ primary: ['chest', 'triceps'], secondary: ['abs'] });
  });
});
