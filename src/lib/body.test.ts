import { describe, expect, it } from 'vitest';
import { byDate, defaultMetrics, fmtBody, fromUser, latestChange, toUser, trend, unitOf } from './body';
import { DEFAULT_SETTINGS, type BodyEntry } from './model';

const kg = DEFAULT_SETTINGS;
const lb = { ...DEFAULT_SETTINGS, unit: 'lb' as const };
let n = 0;
const e = (date: string, value: number, at = ++n): BodyEntry => ({ id: `e${at}`, metricId: 'm', date, value, at });

describe('body measures', () => {
  it('starts with weight, body fat and girths', () => {
    const m = defaultMetrics();
    expect(m.map((x) => x.kind)).toEqual(['weight', 'percent', 'length', 'length', 'length', 'length', 'length']);
    expect(new Set(m.map((x) => x.id)).size).toBe(m.length);
  });
  it('shows values in the user units and round-trips them', () => {
    expect(unitOf('length', kg)).toBe('cm');
    expect(unitOf('length', lb)).toBe('in');
    expect(fmtBody(82.44, 'weight', kg)).toBe('82.4 kg');
    expect(fmtBody(81, 'length', lb)).toBe('31.9 in');
    expect(fmtBody(15.25, 'percent', lb)).toBe('15.3 %');
    expect(fmtBody(3, 'number', kg)).toBe('3');
    expect(toUser(fromUser(180, 'weight', lb), 'weight', lb)).toBeCloseTo(180, 9);
    expect(toUser(fromUser(32, 'length', lb), 'length', lb)).toBeCloseTo(32, 9);
  });
  it('keeps the last entry per date, in date order', () => {
    const list = byDate([e('2026-01-03', 80), e('2026-01-01', 82), e('2026-01-03', 79.5)]);
    expect(list.map((x) => [x.date, x.value])).toEqual([['2026-01-01', 82], ['2026-01-03', 79.5]]);
  });
  it('computes a trailing trend and the latest change', () => {
    expect(trend([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
    expect(trend([], 7)).toEqual([]);
    const sorted = byDate([e('2026-01-01', 82), e('2026-01-02', 81.5)]);
    expect(latestChange(sorted)).toEqual({ latest: sorted[1], change: -0.5 });
    expect(latestChange(sorted.slice(0, 1))!.change).toBeNull();
    expect(latestChange([])).toBeNull();
  });
});
