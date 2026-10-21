import { describe, expect, it } from 'vitest';
import { addDays, dayTotals, fillEmpty, fmtTime, isComplete, oneRM, previousWorkout, recordIds } from './calc';
import type { WorkoutSet } from './model';

let n = 0;
const set = (date: string, weight: number | undefined, reps: number | undefined, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++n}`, date, exerciseId: 'x', order: n, weight, reps, ...extra,
});

describe('dates and time', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('formats seconds', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(95)).toBe('1:35');
    expect(fmtTime(3725)).toBe('1:02:05');
  });
});

describe('oneRM', () => {
  it('is the weight itself for a single', () => expect(oneRM(100, 1)).toBe(100));
  it('uses Epley by default', () => expect(oneRM(100, 10)).toBeCloseTo(133.33, 2));
  it('supports Brzycki', () => expect(oneRM(100, 10, 'brzycki')).toBeCloseTo(133.33, 2));
  it('is 0 without weight or reps', () => {
    expect(oneRM(0, 5)).toBe(0);
    expect(oneRM(100, 0)).toBe(0);
  });
});

describe('recordIds (weight and reps)', () => {
  it('marks the best weight per rep count that nothing heavier with more reps beats', () => {
    const a = set('2026-01-01', 100, 5);
    const b = set('2026-01-01', 110, 3);
    const c = set('2026-01-02', 90, 8);
    const d = set('2026-01-02', 95, 5); // beaten by a (100 × 5)
    const e = set('2026-01-03', 100, 3); // beaten by b (110 × 3)
    const r = recordIds([a, b, c, d, e], 'weight,reps');
    expect([...r].sort()).toEqual([a.id, b.id, c.id].sort());
  });
  it('drops a rep max that a heavier set with more reps beats', () => {
    const a = set('2026-01-01', 100, 3);
    const b = set('2026-01-08', 105, 5); // heavier and more reps: a is no longer a record
    expect([...recordIds([a, b], 'weight,reps')]).toEqual([b.id]);
  });
  it('keeps the first of equal sets', () => {
    const a = set('2026-01-01', 100, 5);
    const b = set('2026-01-08', 100, 5);
    expect([...recordIds([b, a], 'weight,reps')]).toEqual([a.id]);
  });
  it('orders sets of one day by their order key', () => {
    const a = set('2026-01-01', 100, 5, { order: 2 });
    const b = set('2026-01-01', 100, 5, { order: 1 });
    expect([...recordIds([a, b], 'weight,reps')]).toEqual([b.id]);
  });
  it('ignores sets without weight', () => {
    expect(recordIds([set('2026-01-01', 0, 10)], 'weight,reps').size).toBe(0);
  });
});

describe('recordIds (other types)', () => {
  it('uses the first field: longest distance', () => {
    const a = set('2026-01-01', undefined, undefined, { distance: 5, time: 1500 });
    const b = set('2026-01-02', undefined, undefined, { distance: 10, time: 3300 });
    expect([...recordIds([a, b], 'distance,time')]).toEqual([b.id]);
  });
  it('uses the first field: most reps', () => {
    const a = set('2026-01-01', undefined, 12);
    const b = set('2026-01-02', undefined, 15);
    const c = set('2026-01-03', undefined, 15);
    expect([...recordIds([a, b, c], 'reps')]).toEqual([b.id]);
  });
});

describe('previousWorkout', () => {
  it('returns the latest earlier day with sets, in order', () => {
    const a = set('2026-01-01', 80, 5);
    const b = set('2026-01-05', 85, 5);
    const c = set('2026-01-05', 85, 4);
    const d = set('2026-01-09', 90, 5);
    expect(previousWorkout([d, c, a, b], '2026-01-09').map((s) => s.id)).toEqual([b.id, c.id]);
    expect(previousWorkout([a], '2026-01-01')).toEqual([]);
  });
});

describe('isComplete and dayTotals', () => {
  it('needs every field of the type and something above zero', () => {
    expect(isComplete({ weight: 0, reps: 10 }, 'weight,reps')).toBe(true);
    expect(isComplete({ weight: 0, reps: 0 }, 'weight,reps')).toBe(false);
    expect(isComplete({ weight: 80 }, 'weight,reps')).toBe(false);
    expect(isComplete({ time: 60 }, 'time')).toBe(true);
  });
  it('sums sets, reps and volume', () => {
    expect(dayTotals([set('d', 100, 5), set('d', 100, 5), set('d', undefined, 10)])).toEqual({ sets: 3, reps: 20, volume: 1000 });
  });
});

describe('fillEmpty', () => {
  it('fills only empty fields (typed input wins over a late prefill)', () => {
    const typed = { weight: '90', reps: '', comment: '' };
    const last = { weight: '80', reps: '6', comment: 'x' };
    expect(fillEmpty(typed, last, ['weight', 'reps'])).toEqual({ weight: '90', reps: '6', comment: '' });
  });
});
