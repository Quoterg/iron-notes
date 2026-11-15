import { describe, expect, it } from 'vitest';
import { dayLabel, logDayLabel } from './days';

describe('day names', () => {
  const today = '2026-11-30';
  it('names today, yesterday and tomorrow, across a month boundary', () => {
    expect(dayLabel(today, today)).toBe('Today');
    expect(dayLabel('2026-11-29', today)).toBe('Yesterday');
    expect(dayLabel('2026-12-01', today)).toBe('Tomorrow');
  });
  it('says which day a routine is logged to', () => {
    expect(logDayLabel(today, today)).toBe('today');
    expect(logDayLabel('2026-12-01', today)).toMatch(/^tomorrow, .*1/);
    expect(logDayLabel('2026-11-29', today)).toMatch(/^yesterday, .*29/);
    expect(logDayLabel('2026-12-04', today)).not.toMatch(/today|tomorrow|yesterday/);
    expect(logDayLabel('2026-12-04', today)).toMatch(/4/);
  });
});
