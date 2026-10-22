import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as backup from './backup';
import type { Exercise } from './model';
import { cycle, defaultMuscles, MUSCLES, stateOf, withDefaultMuscles } from './muscles';
import { starterLibrary } from './seed';

describe('muscle map', () => {
  it('maps every starter exercise except cardio, with known muscles only', () => {
    const { categories, exercises } = starterLibrary();
    const cardio = categories.find((c) => c.name === 'Cardio')!.id;
    for (const e of exercises) {
      if (e.categoryId === cardio) expect(e.muscles, e.name).toBeUndefined();
      else {
        expect(e.muscles?.primary.length, e.name).toBeGreaterThan(0);
        for (const m of [...e.muscles!.primary, ...e.muscles!.secondary]) expect(MUSCLES).toContain(m);
      }
    }
  });

  it('cycles none → primary → secondary → none, in canonical order', () => {
    let ms = cycle(undefined, 'triceps');
    expect(ms).toEqual({ primary: ['triceps'], secondary: [] });
    ms = cycle(ms, 'chest');
    expect(ms.primary).toEqual(['chest', 'triceps']);
    ms = cycle(ms, 'triceps');
    expect([stateOf(ms, 'triceps'), stateOf(ms, 'chest')]).toEqual(['secondary', 'primary']);
    ms = cycle(ms, 'triceps');
    expect(stateOf(ms, 'triceps')).toBe('none');
  });

  it('fills in only exercises without muscles and with a known name', () => {
    const list: Exercise[] = [
      { id: 'a', name: 'Deadlift', categoryId: 'c', type: 'weight,reps' },
      { id: 'b', name: 'My Odd Lift', categoryId: 'c', type: 'weight,reps' },
      { id: 'c', name: 'Dips', categoryId: 'c', type: 'reps', muscles: { primary: ['chest'], secondary: [] } },
    ];
    const out = withDefaultMuscles(list);
    expect(out.map((e) => e.id)).toEqual(['a']);
    expect(out[0].muscles).toEqual(defaultMuscles('deadlift'));
  });

  it('validates muscles in backups', () => {
    const base = { app: 'iron-notes', version: 1, categories: [], sets: [] };
    const ex = (muscles: unknown) => ({ ...base, exercises: [{ id: 'e', name: 'X', categoryId: 'c', type: 'reps', muscles }] });
    expect(() => backup.validateBackup(ex({ primary: ['chest'], secondary: ['abs'] }))).not.toThrow();
    expect(() => backup.validateBackup(ex({ primary: ['wings'], secondary: [] }))).toThrow();
    expect(() => backup.validateBackup(ex({ primary: 'chest' }))).toThrow();
  });
});
