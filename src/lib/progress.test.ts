import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from './model';
import { bestOrm, bests, dailySeries, metricsFor, niceScale, rangeStart, repMaxTable, TIME_STEPS, workouts } from './progress';

let n = 0;
const s = (date: string, x: Partial<WorkoutSet>): WorkoutSet => ({ id: `s${++n}`, date, exerciseId: 'x', order: n, ...x });

const bench = [
  s('2026-01-01', { weight: 100, reps: 5 }),
  s('2026-01-01', { weight: 90, reps: 8 }),
  s('2026-01-08', { weight: 105, reps: 3 }),
  s('2026-01-08', { weight: 100, reps: 6 }),
  s('2026-01-15', { weight: 110, reps: 1 }),
];

describe('dailySeries', () => {
  it('folds each workout into one point', () => {
    expect(dailySeries(bench, 'maxWeight', 'epley')).toEqual([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-08', value: 105 },
      { date: '2026-01-15', value: 110 },
    ]);
    expect(dailySeries(bench, 'volume', 'epley').map((p) => p.value)).toEqual([1220, 915, 110]);
    expect(dailySeries(bench, 'orm', 'epley')[0].value).toBeCloseTo(116.67, 2);
  });
  it('starts at `since`', () => {
    expect(dailySeries(bench, 'maxWeight', 'epley', '2026-01-08').length).toBe(2);
  });
  it('keeps the fastest pace of a day', () => {
    const runs = [s('2026-02-01', { distance: 5, time: 1500 }), s('2026-02-01', { distance: 1, time: 240 })];
    expect(dailySeries(runs, 'pace', 'epley')).toEqual([{ date: '2026-02-01', value: 240 }]);
  });
  it('offers the metrics the type records', () => {
    expect(metricsFor('weight,reps')).toEqual(['orm', 'maxWeight', 'maxReps', 'volume', 'totalReps']);
    expect(metricsFor('distance,time')).toEqual(['maxDistance', 'totalDistance', 'maxTime', 'totalTime', 'pace']);
    expect(metricsFor('reps')).toEqual(['maxReps', 'totalReps']);
  });
});

describe('repMaxTable', () => {
  it('gives the heaviest set with at least N reps', () => {
    const t = repMaxTable(bench, 8);
    expect(t.map((r) => r.set?.weight ?? null)).toEqual([110, 105, 105, 100, 100, 100, 90, 90]);
    expect(t[4].set?.date).toBe('2026-01-01'); // 100 × 5 came before 100 × 6
  });
  it('is empty without weighted sets', () => {
    expect(repMaxTable([s('2026-01-01', { reps: 10 })], 3).every((r) => r.set === null)).toBe(true);
  });
});

describe('bests', () => {
  it('finds the best estimated 1RM', () => {
    expect(bestOrm(bench, 'epley')!.value).toBeCloseTo(120, 5); // 100 × 6
  });
  it('finds first-reached bests per field and fastest pace', () => {
    const runs = [s('2026-02-01', { distance: 5, time: 1500 }), s('2026-02-08', { distance: 10, time: 3300 }), s('2026-02-15', { distance: 10, time: 3000 })];
    const b = Object.fromEntries(bests(runs, 'distance,time').map((x) => [x.field, x]));
    expect(b.distance.set.date).toBe('2026-02-08');
    expect(b.time.value).toBe(3300);
    expect(b.pace.value).toBe(300);
  });
});

describe('workouts and helpers', () => {
  it('groups by day, newest first', () => {
    expect(workouts(bench).map((w) => [w.date, w.sets.length])).toEqual([['2026-01-15', 1], ['2026-01-08', 2], ['2026-01-01', 2]]);
  });
  it('computes range starts', () => {
    expect(rangeStart('1m', '2026-03-31')).toBe('2026-03-01');
    expect(rangeStart('all', '2026-03-31')).toBe('');
  });
  it('makes round axes', () => {
    expect(niceScale(97, 123)).toEqual({ lo: 90, hi: 130, ticks: [90, 100, 110, 120, 130] });
    expect(niceScale(1500, 1530, TIME_STEPS).ticks).toEqual([1500, 1510, 1520, 1530]);
    expect(niceScale(290, 301, TIME_STEPS).ticks.every(Number.isInteger)).toBe(true);
    const one = niceScale(100, 100);
    expect(one.lo).toBeLessThan(100);
    expect(one.hi).toBeGreaterThan(100);
  });
});
