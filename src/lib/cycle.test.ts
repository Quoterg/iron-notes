import { describe, expect, it } from 'vitest';
import { inLight, lightEnd, lightSet, lightTargets, nextProgramDay, phaseOn, progressing } from './cycle';
import type { Routine, WorkoutSet } from './model';

describe('phases', () => {
  it('Lyle: run-up weeks, push weeks, nothing outside the cycle', () => {
    const st = { mode: 'lyle' as const, cycle: { start: '2026-10-26', weeks: 6 } };
    expect(phaseOn(st, '2026-10-26')).toEqual({ phase: 'runup', week: 1, weeks: 6 });
    expect(phaseOn(st, '2026-11-08')).toEqual({ phase: 'runup', week: 2, weeks: 6 });
    expect(phaseOn(st, '2026-11-09')).toEqual({ phase: 'push', week: 3, weeks: 6 });
    expect(phaseOn(st, '2026-12-06')?.week).toBe(6);
    expect(phaseOn(st, '2026-12-07')).toBeNull();
    expect(phaseOn(st, '2026-10-25')).toBeNull();
    expect(phaseOn({ mode: 'lyle' }, '2026-10-26')).toBeNull();
  });
  it('Dorian: a lighter week of 7 days', () => {
    const light = { start: '2026-10-29' };
    const st = { mode: 'dorian' as const, light };
    expect(phaseOn(st, '2026-10-29')).toEqual({ phase: 'light' });
    expect(phaseOn(st, '2026-11-04')).toEqual({ phase: 'light' });
    expect(phaseOn(st, '2026-11-05')).toBeNull();
    expect(lightEnd(light)).toBe('2026-11-04');
    expect(inLight(undefined, '2026-10-29')).toBe(false);
    expect(phaseOn({ mode: 'standard', light }, '2026-10-29')).toBeNull();
  });
});

describe('lighter week', () => {
  it('~10 % less, rounded down to the step; warm-ups and body weight unchanged', () => {
    expect(lightSet({ weight: 100, reps: 10 }, 2.5)).toEqual({ weight: 90, reps: 10 });
    expect(lightSet({ weight: 105, reps: 8 }, 2.5).weight).toBe(92.5);
    expect(lightSet({ weight: 50, reps: 10, warmup: true }, 2.5).weight).toBe(50);
    expect(lightSet({ weight: 0, reps: 12 }, 2.5).weight).toBe(0);
  });
  it('targets per working set of the last normal session', () => {
    const last: WorkoutSet[] = [
      { id: 'w', date: 'd', exerciseId: 'e', order: 1, weight: 50, reps: 10, warmup: true },
      { id: 'a', date: 'd', exerciseId: 'e', order: 2, weight: 100, reps: 12, rir: 0 },
      { id: 'b', date: 'd', exerciseId: 'e', order: 3, weight: 80, reps: 10, rir: 0 },
    ];
    expect(lightTargets(last, 2.5).map((x) => [x.weight, x.reps, x.why])).toEqual([
      [90, 12, 'light'],
      [70, 10, 'light'], // 72 rounded down to the 2.5 kg step
    ]);
  });
  it('lighter-week and planned sets don’t drive progression', () => {
    const s: WorkoutSet = { id: 'a', date: '2026-10-29', exerciseId: 'e', order: 1, weight: 90, reps: 10 };
    expect(progressing(s)).toBe(true);
    expect(progressing({ ...s, deload: true })).toBe(false);
    expect(progressing({ ...s, planned: true })).toBe(false);
  });
});

describe('program rotation', () => {
  const r: Routine = { id: 'r', name: 'Dorian split', order: 0, days: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), items: [] })) };
  it('the workout after the last one logged, wrapping around', () => {
    expect(nextProgramDay(r, undefined)?.id).toBe('a');
    expect(nextProgramDay(r, 'b')?.id).toBe('c');
    expect(nextProgramDay(r, 'd')?.id).toBe('a');
    expect(nextProgramDay(r, 'gone')?.id).toBe('a');
    expect(nextProgramDay(undefined, 'a')).toBeUndefined();
  });
});
