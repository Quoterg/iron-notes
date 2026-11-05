import { describe, expect, it } from 'vitest';
import type { Exercise, Routine, WorkoutSet } from './model';
import { alternatives, exerciseChanges, soreness, swapInRoutine, toSwap } from './review';

let n = 0;
const set = (exerciseId: string, date: string, weight: number, reps: number, x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: String(++n), date, exerciseId, order: n, weight, reps, ...x });

describe('exercise changes over a cycle', () => {
  const by = new Map([
    ['bench', [set('bench', '2026-10-05', 80, 8), set('bench', '2026-10-12', 85, 8), set('bench', '2026-10-19', 90, 8), set('bench', '2026-09-20', 120, 8)]],
    ['row', [set('row', '2026-10-06', 70, 10), set('row', '2026-10-13', 70, 10), set('row', '2026-10-20', 70, 9)]],
    ['curl', [set('curl', '2026-10-07', 15, 10)]],
  ]);
  const out = exerciseChanges(by, '2026-10-01', '2026-10-31');
  it('first vs last session in the period (sets outside left out), most improved first', () => {
    expect(out.map((c) => c.exerciseId)).toEqual(['bench', 'row', 'curl']);
    expect(out[0].change).toBeCloseTo(90 / 80 - 1, 5);
    expect(out[0].sessions).toBe(3);
    expect(out[2]).toMatchObject({ change: null, sessions: 1, trend: 'none' });
  });
  it('to swap: no progress over three sessions, weaker/stalled, or joint pain', () => {
    const row = out.find((c) => c.exerciseId === 'row')!;
    expect(toSwap(row, undefined)).toBe(true);
    expect(toSwap(out[0], undefined)).toBe(false);
    expect(toSwap(out[0], { id: 'bench', name: 'B', categoryId: 'c', type: 'weight,reps', joint: true })).toBe(true);
  });
});

describe('readiness per muscle', () => {
  it('counts fresh / a bit sore / still sore by primary muscle', () => {
    const sets = [set('bench', '2026-10-05', 80, 8, { sore: 0 }), set('bench', '2026-10-12', 80, 8, { sore: 2 }), set('bench', '2026-10-13', 80, 8), set('bench', '2026-11-12', 80, 8, { sore: 2 })];
    const s = soreness(sets, () => ({ primary: ['chest'] }), '2026-10-01', '2026-10-31');
    expect(s.get('chest')).toEqual([1, 0, 1]);
  });
});

describe('swaps', () => {
  const ex = (id: string, name: string, primary: string, x: Partial<Exercise> = {}): Exercise => ({ id, name, categoryId: 'c', type: 'weight,reps', muscles: { primary: [primary as 'chest'], secondary: [] }, ...x });
  const lib = [ex('b', 'Bench', 'chest'), ex('i', 'Incline', 'chest'), ex('f', 'Fly', 'chest', { favorite: true }), ex('d', 'Dips', 'triceps'), ex('p', 'Push Up', 'chest', { type: 'reps' })];
  it('same main muscle and type, not already used, favourites first', () => {
    expect(alternatives(lib[0], lib, new Set(['i'])).map((e) => e.name)).toEqual(['Fly']);
    expect(alternatives(lib[0], lib, new Set()).map((e) => e.name)).toEqual(['Fly', 'Incline']);
  });
  it('replaces the exercise in every day of the routine, keeping its sets', () => {
    const r: Routine = { id: 'r', name: 'P', order: 0, days: [{ id: 'a', name: 'A', items: [{ exerciseId: 'b', sets: [{ reps: 8 }] }] }, { id: 'c', name: 'C', items: [{ exerciseId: 'b', sets: [{}] }, { exerciseId: 'd', sets: [{}] }] }] };
    const s = swapInRoutine(r, 'b', 'i');
    expect(s.days.flatMap((d) => d.items.map((i) => i.exerciseId))).toEqual(['i', 'i', 'd']);
    expect(s.days[0].items[0].sets).toEqual([{ reps: 8 }]);
    expect(r.days[0].items[0].exerciseId).toBe('b'); // the original stays
  });
});
