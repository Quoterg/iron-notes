import { describe, expect, it } from 'vitest';
import { periodStart, summarize, weekOf } from './analysis';
import type { Exercise, WorkoutSet } from './model';

const ex: Record<string, Exercise> = {
  bench: { id: 'bench', name: 'Bench', categoryId: 'chest', type: 'weight,reps' },
  squat: { id: 'squat', name: 'Squat', categoryId: 'legs', type: 'weight,reps' },
  run: { id: 'run', name: 'Run', categoryId: 'cardio', type: 'distance,time' },
};
let n = 0;
const s = (exerciseId: string, date: string, x: Partial<WorkoutSet>): WorkoutSet => ({ id: `s${++n}`, date, exerciseId, order: n, ...x });

// 2026-03-02 is a Monday.
const sets = [
  s('squat', '2026-03-12', { weight: 140, reps: 3 }),
  s('bench', '2026-03-02', { weight: 80, reps: 8 }),
  s('bench', '2026-03-02', { weight: 85, reps: 5 }),
  s('squat', '2026-03-04', { weight: 120, reps: 5 }),
  s('run', '2026-03-05', { distance: 5, time: 1500 }),
  s('bench', '2026-03-12', { weight: 90, reps: 5 }),
  s('bench', '2026-03-13', { weight: 200, reps: 5, planned: true }), // planned: not counted
  s('gone', '2026-03-13', { weight: 10, reps: 10 }), // deleted exercise: not counted
  s('bench', '2026-02-20', { weight: 70, reps: 5 }), // before the period
];

describe('analysis', () => {
  const sum = summarize(sets, (id) => ex[id], '2026-03-01', '2026-03-14', 1);

  it('totals the period, skipping planned sets, unknown exercises and other dates', () => {
    expect(sum.totals).toEqual({ workouts: 4, sets: 6, reps: 26, volume: 80 * 8 + 85 * 5 + 120 * 5 + 90 * 5 + 140 * 3, time: 1500, distance: 5 });
  });
  it('breaks down by category, most sets first', () => {
    expect(sum.categories.map((c) => [c.categoryId, c.sets])).toEqual([['chest', 3], ['legs', 2], ['cardio', 1]]);
    expect(sum.categories[0].volume).toBe(80 * 8 + 85 * 5 + 90 * 5);
  });
  it('ranks exercises by workouts and tracks first/last day best e1RM', () => {
    const bench = sum.exercises.find((e) => e.exerciseId === 'bench')!;
    expect(sum.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'squat', 'run']);
    expect(bench.workouts).toBe(2);
    expect(bench.firstOrm).toBeCloseTo(Math.max(80 * (1 + 8 / 30), 85 * (1 + 5 / 30)), 6);
    expect(bench.lastOrm).toBeCloseTo(90 * (1 + 5 / 30), 6);
    expect(sum.exercises.find((e) => e.exerciseId === 'run')!.firstOrm).toBeUndefined();
  });
  it('counts workout days per week across the whole period', () => {
    expect(sum.weeks).toEqual([
      { start: '2026-02-23', workouts: 0 },
      { start: '2026-03-02', workouts: 3 },
      { start: '2026-03-09', workouts: 1 },
    ]);
    expect(weekOf('2026-03-08', 1)).toBe('2026-03-02'); // Sunday belongs to Monday's week
    expect(weekOf('2026-03-08', 0)).toBe('2026-03-08');
  });
  it('periods end today; "all" starts at the first workout', () => {
    expect(periodStart('week', '2026-03-14')).toBe('2026-03-08');
    expect(periodStart('all', '2026-03-14')).toBe('');
    const all = summarize(sets, (id) => ex[id], '', '2026-03-14', 1);
    expect(all.weeks[0].start).toBe('2026-02-16');
    expect(all.totals.workouts).toBe(5);
  });
  it('is empty without sets', () => {
    const none = summarize([], (id) => ex[id], '2026-03-01', '2026-03-14', 1);
    expect(none.totals.workouts).toBe(0);
    expect(none.weeks.every((w) => w.workouts === 0)).toBe(true);
    expect(summarize([], (id) => ex[id], '', '2026-03-14', 1).weeks).toEqual([]);
  });
});
