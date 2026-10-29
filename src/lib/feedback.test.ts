import { describe, expect, it } from 'vitest';
import { causeOf, isCutting, longestGap, sessions, stalledAdvice, trendOf, weakerAdvice, weeklyRate, type Session } from './feedback';
import type { BodyEntry, WorkoutSet } from './model';

let n = 0;
const set = (date: string, weight: number, reps: number, x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: String(++n), date, exerciseId: 'e', order: n, weight, reps, ...x });
const ses = (...scores: number[]): Session[] => scores.map((score, i) => ({ date: `2026-10-${String(i * 4 + 1).padStart(2, '0')}`, score }));

describe('sessions', () => {
  it('best e1RM per date of working sets; warm-ups, lighter week and plans left out; readiness kept', () => {
    const list = sessions([
      set('2026-10-01', 50, 10, { warmup: true }),
      set('2026-10-01', 100, 8, { sore: 1 }),
      set('2026-10-01', 90, 10),
      set('2026-10-08', 90, 10, { deload: true }),
      set('2026-10-09', 100, 9, { planned: true }),
      set('2026-10-10', 0, 15),
    ]);
    expect(list.map((s) => [s.date, Math.round(s.score * 10) / 10, s.sore])).toEqual([
      ['2026-10-01', 126.7, 1],
      ['2026-10-10', 15, undefined],
    ]);
  });
});

describe('trend', () => {
  it('weaker: down twice in a row', () => {
    expect(trendOf(ses(100, 97, 94))).toBe('weaker');
    expect(trendOf(ses(100, 99.8, 99.6))).not.toBe('weaker'); // within the tolerance
  });
  it('stalled: neither of the last two beat the best before', () => {
    expect(trendOf(ses(95, 100, 100, 99.8))).toBe('stalled');
    expect(trendOf(ses(100, 98, 100))).toBe('stalled');
  });
  it('up otherwise; none with fewer than three sessions', () => {
    expect(trendOf(ses(100, 101, 102))).toBe('up');
    expect(trendOf(ses(100, 98, 103))).toBe('up');
    expect(trendOf(ses(100, 90))).toBe('none');
  });
});

describe('cause of getting weaker', () => {
  it('in order: long gap, cutting, only this exercise, real fatigue', () => {
    expect(causeOf({ gapDays: 14, cutting: true, othersWeaker: 3 })).toBe('inconsistent');
    expect(causeOf({ gapDays: 4, cutting: true, othersWeaker: 3 })).toBe('cutting');
    expect(causeOf({ gapDays: 4, cutting: false, othersWeaker: 0 })).toBe('exercise');
    expect(causeOf({ gapDays: 4, cutting: false, othersWeaker: 2 })).toBe('fatigue');
  });
  it('the longest gap among the last sessions', () => {
    const list: Session[] = [
      { date: '2026-09-01', score: 1 },
      { date: '2026-10-01', score: 1 },
      { date: '2026-10-15', score: 1 },
      { date: '2026-10-19', score: 1 },
    ];
    expect(longestGap(list)).toBe(14);
  });
});

describe('body weight', () => {
  const e = (date: string, value: number): BodyEntry => ({ id: date, metricId: 'w', date, value, at: 0 });
  it('weekly rate by least squares; cutting from the setting or a falling trend', () => {
    const entries = [e('2026-10-08', 80), e('2026-10-15', 79.4), e('2026-10-22', 78.8), e('2026-10-29', 78.2)];
    const r = weeklyRate(entries, '2026-10-29')!;
    expect(r).toBeCloseTo(-0.6 / 79.1, 4);
    expect(isCutting(undefined, r)).toBe(true);
    expect(isCutting('cut', null)).toBe(true);
    expect(isCutting('build', 0.002)).toBe(false);
  });
  it('not enough data: no rate', () => {
    expect(weeklyRate([e('2026-10-28', 80), e('2026-10-29', 79)], '2026-10-29')).toBeNull();
    expect(weeklyRate([e('2026-10-27', 80), e('2026-10-28', 80), e('2026-10-29', 79)], '2026-10-29')).toBeNull(); // < a week
  });
});

describe('advice', () => {
  it('stalled: a cut first, then Lyle by readiness, Dorian by spacing', () => {
    expect(stalledAdvice({ lyle: true, cutting: true, spacing: 3 })).toBe('fbStalledCut');
    expect(stalledAdvice({ lyle: true, cutting: false, lastSore: 2, spacing: 3 })).toBe('fbStalledLyleSore');
    expect(stalledAdvice({ lyle: true, cutting: false, lastSore: 0, spacing: 3 })).toBe('fbStalledLyle');
    expect(stalledAdvice({ lyle: false, cutting: false, spacing: 6 })).toBe('fbStalledDorianSpacing');
    expect(stalledAdvice({ lyle: false, cutting: false, spacing: 7 })).toBe('fbStalledDorian');
  });
  it('weaker: by cause and mode', () => {
    expect(weakerAdvice('inconsistent', true)).toBe('fbInconsistent');
    expect(weakerAdvice('fatigue', false)).toBe('fbFatigueDorian');
    expect(weakerAdvice('fatigue', true)).toBe('fbFatigueLyle');
    expect(weakerAdvice('cutting', true)).toBe('fbCuttingLyle');
  });
});
