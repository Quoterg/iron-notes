// Month grid maths for the calendar. Dates are local YYYY-MM-DD strings, months 'YYYY-MM'.
import { addDays, isoDate, parseIso } from './calc';

export const monthOf = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return isoDate(d).slice(0, 7);
}

/** First and last day of a month. */
export function monthBounds(month: string): { first: string; last: string } {
  const first = `${month}-01`;
  return { first, last: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/**
 * The days shown for a month: whole weeks starting on `weekStart` (0 = Sunday, 1 = Monday), from the
 * week holding the 1st to the week holding the last day (4–6 rows).
 */
export function monthGrid(month: string, weekStart: 0 | 1): string[] {
  const { first, last } = monthBounds(month);
  const lead = (parseIso(first).getDay() - weekStart + 7) % 7;
  const trail = (weekStart + 6 - parseIso(last).getDay() + 7) % 7;
  const days: string[] = [];
  for (let d = addDays(first, -lead), end = addDays(last, trail); d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}
