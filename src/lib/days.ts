// Day names for the top bar and the routine sheets (Format.kt `dayLabel` / `logDayLabel` in the app).
import { addDays, isoDate, parseIso } from './calc';
import { locale, t } from './i18n';

const short = (d: string) => parseIso(d).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });

/** "Today", "Yesterday", "Tomorrow" or "Mon 16 Nov". `today` for tests. */
export function dayLabel(d: string, today = isoDate(new Date())): string {
  if (d === today) return t('today');
  if (d === addDays(today, -1)) return t('yesterday');
  if (d === addDays(today, 1)) return t('tomorrow');
  return short(d);
}

/** The day a routine is logged to, named so a day other than today can't be missed: "today", "tomorrow, Mon 16 Nov", "Thu 19 Nov". */
export function logDayLabel(d: string, today = isoDate(new Date())): string {
  const label = dayLabel(d, today);
  if (d === today) return label.toLowerCase();
  return d === addDays(today, -1) || d === addDays(today, 1) ? `${label.toLowerCase()}, ${short(d)}` : short(d);
}
