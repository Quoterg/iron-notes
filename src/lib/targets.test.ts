import { describe, expect, it } from 'vitest';
import type { Muscles, WorkoutSet } from './model';
import { dorianTarget, dorianTargets, progressedSets, tooSoon, warmups } from './targets';

let n = 0;
const set = (x: Partial<WorkoutSet>): WorkoutSet => ({ id: String(++n), date: '2026-10-20', exerciseId: 'bench', order: n, weight: 100, reps: 8, rir: 0, ...x });

describe('Dorian double progression', () => {
  it('beats last time by a rep until the top, then the weight goes up with no rep target', () => {
    expect(dorianTarget(set({ reps: 9 }), 2.5)).toMatchObject({ weight: 100, reps: 10, why: 'beat' });
    expect(dorianTarget(set({ reps: 12 }), 2.5)).toMatchObject({ weight: 102.5, why: 'up' });
    expect(dorianTarget(set({ reps: 12 }), 2.5)?.reps).toBeUndefined();
    expect(dorianTarget(set({ reps: 13 }), 2.5)?.why).toBe('up');
  });
  it('uses the exercise\'s own top of the range', () => {
    expect(dorianTarget(set({ reps: 12 }), 5, 15)).toMatchObject({ weight: 100, reps: 13 });
    expect(dorianTarget(set({ reps: 15 }), 5, 15)).toMatchObject({ weight: 105, why: 'up' });
  });
  it('body-weight sets keep adding reps', () => {
    expect(dorianTarget(set({ weight: 0, reps: 14 }), 2.5)).toMatchObject({ weight: 0, reps: 15 });
  });
  it('warm-ups get no target; sets progress independently by position', () => {
    expect(dorianTarget(set({ warmup: true, rir: undefined }), 2.5)).toBeNull();
    // Reverse pyramid: top set 100×12 → up; back-off 80×10 → 11.
    const last = [set({ weight: 50, reps: 10, warmup: true }), set({ reps: 12 }), set({ weight: 80, reps: 10 })];
    expect(dorianTargets(last, 2.5).map((t) => [t.weight, t.reps])).toEqual([
      [102.5, undefined],
      [80, 11],
    ]);
  });
  it('routine days start from progressed sets (warm-ups as they were)', () => {
    const last = [set({ weight: 50, reps: 10, warmup: true }), set({ reps: 12 }), set({ weight: 80, reps: 10 })];
    expect(progressedSets(last, 2.5).map((s) => [s.weight, s.reps])).toEqual([
      [50, 10],
      [102.5, undefined],
      [80, 11],
    ]);
  });
});

describe('warm-ups', () => {
  it('50 % × 10 and 75 % × 6, rounded down to the step', () => {
    expect(warmups(100, 2.5)).toEqual([
      { weight: 50, reps: 10 },
      { weight: 75, reps: 6 },
    ]);
    expect(warmups(105, 2.5)).toEqual([
      { weight: 52.5, reps: 10 },
      { weight: 77.5, reps: 6 },
    ]);
    expect(warmups(0, 2.5)).toEqual([]);
  });
});

describe('too soon (Dorian)', () => {
  const chest: Muscles = { primary: ['chest'], secondary: ['triceps', 'frontDelts'] };
  const dips: Muscles = { primary: ['triceps'], secondary: ['chest', 'frontDelts'] };
  const muscles = (id: string) => (id === 'bench' ? chest : id === 'dips' ? dips : undefined);
  const eff = (s: WorkoutSet) => s.reps ?? 0;
  it('a main session less than 5 days ago gives a hint, with the most recent day', () => {
    const earlier = [
      set({ date: '2026-10-25', reps: 8 }),
      set({ date: '2026-10-25', reps: 8 }),
      set({ date: '2026-10-26', reps: 6 }),
      set({ date: '2026-10-26', reps: 6 }),
    ];
    expect(tooSoon('2026-10-28', chest, earlier, muscles, eff)).toEqual([{ muscle: 'chest', days: 2 }]);
  });
  it('extra work (dips on pull day) and older sessions don\'t count', () => {
    const earlier = [
      set({ date: '2026-10-26', exerciseId: 'dips', reps: 8 }), // chest only indirectly
      set({ date: '2026-10-27', reps: 8 }), // 8 direct: extra work (< 10)
      set({ date: '2026-10-22', reps: 12 }), // 6 days ago
      set({ date: '2026-10-28', reps: 12 }), // today itself
    ];
    expect(tooSoon('2026-10-28', chest, earlier, muscles, eff)).toEqual([]);
  });
});
