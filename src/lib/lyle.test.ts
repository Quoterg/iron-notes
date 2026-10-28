import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from './model';
import { bestForRange, cycleWeek, lastFirstSet, lyleTarget, repRange } from './lyle';

let n = 0;
const set = (x: Partial<WorkoutSet>): WorkoutSet => ({ id: String(++n), date: '2026-10-01', exerciseId: 'b', order: n, weight: 100, reps: 8, ...x });
const range = { bottom: 6, top: 8 };

describe('cycle weeks', () => {
  it('counts weeks from the start', () => {
    expect(cycleWeek('2026-10-26', '2026-10-26')).toBe(1);
    expect(cycleWeek('2026-10-26', '2026-11-01')).toBe(1);
    expect(cycleWeek('2026-10-26', '2026-11-02')).toBe(2);
    expect(cycleWeek('2026-10-26', '2026-12-07')).toBe(7); // past a 6-week cycle
    expect(cycleWeek('2026-10-26', '2026-10-25')).toBe(0);
  });
  it('rep range defaults: top 12, bottom top − 4', () => {
    expect(repRange({})).toEqual({ bottom: 8, top: 12 });
    expect(repRange({ repTop: 8, repBottom: 6 })).toEqual(range);
    expect(repRange({ repTop: 5, repBottom: 9 })).toEqual({ bottom: 5, top: 5 });
  });
});

describe('Lyle targets', () => {
  it('run-up: week 1 ≈ 82.5 %, week 2 ≈ 92.5 % of the best for the range, rounded down to the step', () => {
    expect(lyleTarget(1, 100, undefined, 2.5, range)).toMatchObject({ weight: 82.5, reps: 8, why: 'runup' });
    expect(lyleTarget(2, 100, undefined, 2.5, range)).toMatchObject({ weight: 92.5, why: 'runup' });
    expect(lyleTarget(2, 105, undefined, 2.5, range)?.weight).toBe(95); // 97.1 → 95
  });
  it('push: top with reps to spare → up one step (reps from the bottom); a grind → hold; below → one more rep', () => {
    expect(lyleTarget(3, 100, set({ weight: 92.5, reps: 8, rir: 2 }), 2.5, range)).toMatchObject({ weight: 95, reps: 6, why: 'up' });
    expect(lyleTarget(4, 100, set({ weight: 95, reps: 8, rir: 0 }), 2.5, range)).toMatchObject({ weight: 95, reps: 8, why: 'grind' });
    expect(lyleTarget(4, 100, set({ weight: 95, reps: 8 }), 2.5, range)?.why).toBe('grind'); // no RIR logged
    expect(lyleTarget(5, 100, set({ weight: 97.5, reps: 6, rir: 1 }), 2.5, range)).toMatchObject({ weight: 97.5, reps: 7, why: 'reps' });
  });
  it('no cycle or no best: push rules from last time; nothing at all → no target', () => {
    expect(lyleTarget(0, 0, set({ reps: 8, rir: 1 }), 2.5, range)).toMatchObject({ weight: 102.5, why: 'up' });
    expect(lyleTarget(1, 0, set({ reps: 7, rir: 1 }), 2.5, range)).toMatchObject({ why: 'reps' });
    expect(lyleTarget(1, 0, undefined, 2.5, range)).toBeNull();
  });
});

describe('history helpers', () => {
  const sets = [
    set({ date: '2026-09-20', weight: 110, reps: 5 }), // below the range: not a best for 6–8
    set({ date: '2026-09-22', weight: 100, reps: 7 }),
    set({ date: '2026-09-24', weight: 120, reps: 8, warmup: true }),
    set({ date: '2026-10-27', weight: 85, reps: 8, rir: 3 }),
    set({ date: '2026-10-29', weight: 90, reps: 8, rir: 2 }),
    set({ date: '2026-10-29', weight: 90, reps: 7, rir: 1 }),
  ];
  it('best for the range comes from before the cycle, working sets only', () => {
    expect(bestForRange(sets, 6, '2026-10-26')).toBe(100);
  });
  it('the last session’s first working set, before today', () => {
    expect(lastFirstSet(sets, '2026-10-31')?.weight).toBe(90);
    expect(lastFirstSet(sets, '2026-10-31')?.reps).toBe(8);
    expect(lastFirstSet(sets, '2026-10-29')?.weight).toBe(85);
  });
});
