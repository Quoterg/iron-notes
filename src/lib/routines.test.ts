import { describe, expect, it } from 'vitest';
import { recordIds } from './calc';
import { DEFAULT_SETTINGS, type Exercise, type RoutineDay, type WorkoutSet } from './model';
import { defaultPlan, isDone, planSummary, plannedSets } from './routines';
import './strings-later'; // as every later screen does: plan summaries use its strings

const bench: Exercise = { id: 'b', name: 'Bench', categoryId: 'c', type: 'weight,reps' };
const pullup: Exercise = { id: 'p', name: 'Pull Up', categoryId: 'c', type: 'reps' };
const run: Exercise = { id: 'r', name: 'Run', categoryId: 'c', type: 'distance,time' };

describe('plans', () => {
  it('defaults to 3 × 8 (weighted), 3 × 10 (reps only), 1 set otherwise', () => {
    expect(defaultPlan(bench)).toEqual([{ reps: 8 }, { reps: 8 }, { reps: 8 }]);
    expect(defaultPlan(pullup)).toEqual([{ reps: 10 }, { reps: 10 }, { reps: 10 }]);
    expect(defaultPlan(run)).toEqual([{}]);
  });
  it('summarises plans', () => {
    expect(planSummary([{ reps: 8 }, { reps: 8 }, { reps: 8 }], bench, DEFAULT_SETTINGS)).toBe('3 × 8');
    expect(planSummary([{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }], bench, DEFAULT_SETTINGS)).toBe('2 × 5 · 100 kg');
    expect(planSummary([{ reps: 8, weight: 80 }, { reps: 6, weight: 85 }], bench, DEFAULT_SETTINGS)).toBe('80 kg × 8, 85 kg × 6');
    expect(planSummary([{ distance: 5 }], run, DEFAULT_SETTINGS)).toBe('1 set · 5 km');
  });
});

describe('plannedSets', () => {
  const day: RoutineDay = { id: 'd', name: 'A', items: [{ exerciseId: 'b', sets: [{ reps: 8 }, { reps: 8, weight: 90 }] }, { exerciseId: 'p', sets: [{}] }] };
  it('fills open values from the last done set and marks every set planned', () => {
    let n = 0;
    const last = (id: string): WorkoutSet | undefined => (id === 'b' ? { id: 'x', date: '2026-01-01', exerciseId: 'b', order: 1, weight: 80, reps: 10 } : undefined);
    const sets = plannedSets(day, '2026-01-08', last, () => ++n);
    expect(sets.map((s) => [s.exerciseId, s.weight, s.reps, s.order, s.planned])).toEqual([
      ['b', 80, 8, 1, true],
      ['b', 90, 8, 2, true],
      ['p', undefined, undefined, 3, true],
    ]);
    expect(sets.every((s) => s.date === '2026-01-08')).toBe(true);
  });
});

describe('planned sets and records', () => {
  const done: WorkoutSet = { id: 'a', date: '2026-01-01', exerciseId: 'b', order: 1, weight: 80, reps: 8 };
  it("a routine's planned sets never hold records, until done", () => {
    const planned: WorkoutSet = { id: 'p', date: '2026-01-08', exerciseId: 'b', order: 2, weight: 200, reps: 8, done: false, planned: true };
    expect([...recordIds([done, planned], 'weight,reps')]).toEqual(['a']);
    expect([...recordIds([done, planned], 'weight,reps', true)]).toEqual(['a']);
    expect(isDone(planned)).toBe(false);
    expect([...recordIds([done, { ...planned, planned: undefined, done: true }], 'weight,reps')]).toEqual(['p']);
  });
  it('an unticked set (done: false, not planned) still counts: done is only a display flag', () => {
    const unticked: WorkoutSet = { id: 'u', date: '2026-01-08', exerciseId: 'b', order: 2, weight: 90, reps: 8, done: false };
    expect(isDone(unticked)).toBe(true);
    expect([...recordIds([done, unticked], 'weight,reps')]).toEqual(['u']);
    const run: WorkoutSet = { id: 'r', date: '2026-01-08', exerciseId: 'r', order: 3, distance: 5, time: 1500, done: false };
    expect([...recordIds([run], 'distance,time')]).toEqual(['r']);
  });
});

describe('plan edge cases', () => {
  const plank: Exercise = { id: 'k', name: 'Plank', categoryId: 'c', type: 'time' };
  it('summarises time-only, missing and differing plans', () => {
    // t() returns the key here: the strings table isn't loaded in this test.
    expect(planSummary([{ time: 60 }], plank, DEFAULT_SETTINGS)).toMatch(/^(1 set|oneSet) · 1:00$/);
    expect(planSummary([{ time: 60 }, { time: 60 }], plank, DEFAULT_SETTINGS)).toMatch(/^(2 sets|nSets) · 1:00$/);
    expect(planSummary([{}, {}, {}], bench, DEFAULT_SETTINGS)).toBe('3 × –');
    expect(planSummary([{ reps: 5 }, { reps: 3 }], pullup, DEFAULT_SETTINGS)).toBe('5 reps, 3 reps');
    expect(planSummary([], bench, DEFAULT_SETTINGS)).toBe('');
  });
  it('plans with no last set leave values empty; an empty day logs nothing', () => {
    const day: RoutineDay = { id: 'd', name: 'A', items: [{ exerciseId: 'k', sets: [{}] }] };
    const [only] = plannedSets(day, '2026-01-08', () => undefined, () => 1);
    expect([only.time, only.planned, only.done]).toEqual([undefined, true, false]);
    expect(plannedSets({ id: 'e', name: 'E', items: [] }, '2026-01-08', () => undefined, () => 1)).toEqual([]);
  });
});
