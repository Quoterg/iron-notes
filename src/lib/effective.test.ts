import { describe, expect, it } from 'vitest';
import { effectiveReps, estimateRir, isMainSession, muscleTotals } from './effective';
import { oneRM } from './calc';

describe('effective reps per set (the table in docs/TRAINING-MODES.md)', () => {
  it.each([
    [8, 0, 0, 8], // heavy set to failure: every rep
    [5, 0, 0, 5],
    [3, 2, 0, 3], // 3 with a 5RM: ×5 sets = 15 (Lyle)
    [6, 2, 0, 6],
    [9, 0, 0, 6], // taper
    [12, 0, 0, 5],
    [15, 0, 0, 5],
    [30, 0, 0, 5],
    [8, 2, 0, 3], // Lyle: "about 3"
    [10, 4, 0, 1], // Lyle: "maybe 1"
    [6, 6, 0, 0], // light and far from failure
    [8, 0, 5, 13], // + 3 rest-pause + 2 forced
    [5, 5, 0, 0], // 5+ RIR: warm-up effort
  ])('%i reps, %i RIR, +%i after failure → %i', (reps, rir, extra, want) => {
    expect(effectiveReps(reps, rir, extra)).toBe(want);
  });

  it('counts nothing without reps', () => {
    expect(effectiveReps(0, 0)).toBe(0);
    expect(effectiveReps(NaN, 0, 3)).toBe(0);
  });

  it('never gives more for a lighter load at the same reps to failure', () => {
    for (let rm = 1; rm <= 30; rm++) expect(effectiveReps(rm + 1, 0)).toBeGreaterThanOrEqual(Math.min(effectiveReps(rm, 0), 5));
  });
});

describe('estimated RIR (Standard mode)', () => {
  it('inverts the 1RM formula', () => {
    const e = oneRM(100, 10); // 10RM at 100
    expect(estimateRir(100, 10, e)).toBe(0);
    expect(estimateRir(100, 7, e)).toBe(3);
    const b = oneRM(100, 10, 'brzycki');
    expect(estimateRir(100, 8, b, 'brzycki')).toBe(2);
  });
  it('a new best counts as failure; no history assumes 2', () => {
    expect(estimateRir(120, 5, 110)).toBe(0);
    expect(estimateRir(100, 5, 0)).toBe(2);
    expect(estimateRir(0, 5, 100)).toBe(2);
  });
});

describe('per muscle', () => {
  const bench = { primary: ['chest' as const], secondary: ['triceps' as const, 'frontDelts' as const] };
  const dips = { primary: ['triceps' as const], secondary: ['chest' as const, 'frontDelts' as const] };
  it('primary counts fully as direct, secondary half as indirect', () => {
    const t = muscleTotals([
      { muscles: bench, effective: 8 },
      { muscles: bench, effective: 6 },
      { muscles: dips, effective: 8 },
      { muscles: undefined, effective: 8 },
      { muscles: bench, effective: 0 },
    ]);
    expect(t.get('chest')).toEqual({ direct: 14, indirect: 4 });
    expect(t.get('triceps')).toEqual({ direct: 8, indirect: 7 });
    expect(t.get('frontDelts')).toEqual({ direct: 0, indirect: 11 });
    expect(t.has('lats')).toBe(false);
  });
  it('main session from half the goal; less is extra work', () => {
    expect(isMainSession(10, 20)).toBe(true);
    expect(isMainSession(8, 20)).toBe(false); // one set of dips on pull day
  });
});
