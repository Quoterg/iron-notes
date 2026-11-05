import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as backup from './backup';
import type { Exercise } from './model';
import { cycle, defaultMuscles, MUSCLES, searchExercises, stateOf, withDefaultMuscles } from './muscles';
import { starterLibrary } from './seed';

describe('muscle map', () => {
  it('maps every starter exercise but the cardio ones, with known muscles only', () => {
    // Pinned by name, so a renamed starter exercise fails here instead of silently losing its muscles.
    const CARDIO = ['Running', 'Cycling', 'Rowing Machine', 'Elliptical Trainer', 'Walking', 'Swimming', 'Jump Rope'];
    const { exercises } = starterLibrary();
    expect(exercises.filter((e) => !e.muscles).map((e) => e.name).sort()).toEqual([...CARDIO].sort());
    for (const e of exercises.filter((x) => x.muscles)) {
      expect(e.muscles!.primary.length, e.name).toBeGreaterThan(0);
      for (const m of [...e.muscles!.primary, ...e.muscles!.secondary]) expect(MUSCLES).toContain(m);
    }
  });

  it('hands out copies of the defaults', () => {
    const a = defaultMuscles('deadlift')!;
    a.primary.push('abs');
    expect(defaultMuscles('deadlift')!.primary).not.toContain('abs');
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

  it('searches by exercise name first, then primary muscles/category, then secondary muscles', () => {
    const { categories, exercises } = starterLibrary();
    const catName = (id: string) => categories.find((c) => c.id === id)?.name;
    const muLabel = (m: string) => (m === 'rearDelts' ? 'Rear delts' : m === 'hamstrings' ? 'Hamstrings' : m);

    // Name match vs primary vs secondary for "triceps":
    // Overhead Triceps Extension has "triceps" in its name (tier 0);
    // Cable Pushdown / Skullcrusher / Dips train triceps primarily (tier 1);
    // Flat Barbell Bench Press trains triceps secondarily (tier 2).
    const tri = searchExercises(exercises, 'triceps', catName, muLabel).map((e) => e.name);
    expect(tri[0]).toBe('Overhead Triceps Extension');
    expect(tri.indexOf('Cable Pushdown')).toBeGreaterThan(0);
    expect(tri.indexOf('Cable Pushdown')).toBeLessThan(tri.indexOf('Flat Barbell Bench Press'));

    // Multi-word muscle search ("rear delts") finds Face Pull and Rear Delt Fly before rows.
    const rear = searchExercises(exercises, 'rear delts', catName, muLabel).map((e) => e.name);
    expect(rear).toContain('Face Pull');
    expect(rear.indexOf('Face Pull')).toBeLessThan(rear.indexOf('Barbell Row'));
  });
});
