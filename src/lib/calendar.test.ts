import { describe, expect, it } from 'vitest';
import { addMonths, monthBounds, monthGrid, monthOf } from './calendar';

describe('calendar', () => {
  it('moves between months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthOf('2026-10-21')).toBe('2026-10');
  });
  it('knows month lengths', () => {
    expect(monthBounds('2024-02')).toEqual({ first: '2024-02-01', last: '2024-02-29' });
    expect(monthBounds('2026-04').last).toBe('2026-04-30');
  });
  it('lays out whole weeks from Monday', () => {
    // October 2026: the 1st is a Thursday, the 31st a Saturday.
    const g = monthGrid('2026-10', 1);
    expect(g[0]).toBe('2026-09-28');
    expect(g[g.length - 1]).toBe('2026-11-01');
    expect(g.length % 7).toBe(0);
    expect(g.length).toBe(35);
  });
  it('lays out whole weeks from Sunday', () => {
    const g = monthGrid('2026-10', 0);
    expect(g[0]).toBe('2026-09-27');
    expect(g[g.length - 1]).toBe('2026-10-31');
    expect(g.length).toBe(35);
  });
  it('needs only four rows for a February that fits', () => {
    // February 2027 starts on a Monday and has 28 days.
    expect(monthGrid('2027-02', 1).length).toBe(28);
  });
});
