// Body measurements: body weight, body fat, girths and the user's own measures. Pure helpers; storage in
// db.ts. Values are stored in kg (weight), % (percent), cm (length) or as plain numbers.
import { uid } from './calc';
import type { BodyEntry, BodyKind, BodyMetric, Settings } from './model';
import { num, wFromUser, wToUser } from './units';

export const CM_PER_IN = 2.54;

/** The starter measures, written once when the Body tab first opens. */
export function defaultMetrics(): BodyMetric[] {
  const list: [string, BodyKind][] = [
    ['Body weight', 'weight'], ['Body fat', 'percent'], ['Waist', 'length'], ['Chest', 'length'],
    ['Arms', 'length'], ['Thighs', 'length'], ['Neck', 'length'],
  ];
  return list.map(([name, kind], order) => ({ id: uid(), name, kind, order }));
}

/** The unit a kind shows in: kg/lb, %, cm/in (follows the weight unit), or none. */
export function unitOf(kind: BodyKind, st: Settings): string {
  if (kind === 'weight') return st.unit;
  if (kind === 'percent') return '%';
  if (kind === 'length') return st.unit === 'lb' ? 'in' : 'cm';
  return '';
}
export function toUser(v: number, kind: BodyKind, st: Settings): number {
  if (kind === 'weight') return wToUser(v, st.unit);
  if (kind === 'length' && st.unit === 'lb') return v / CM_PER_IN;
  return v;
}
export function fromUser(v: number, kind: BodyKind, st: Settings): number {
  if (kind === 'weight') return wFromUser(v, st.unit);
  if (kind === 'length' && st.unit === 'lb') return v * CM_PER_IN;
  return v;
}
/** "82.4 kg", "15.2 %", "81 cm", "3". */
export function fmtBody(v: number, kind: BodyKind, st: Settings): string {
  const u = unitOf(kind, st);
  return `${num(toUser(v, kind, st), 1)}${u ? ` ${u}` : ''}`;
}

/** Entries of one measure sorted by date (then entry order), one value per date: the last one entered. */
export function byDate(entries: readonly BodyEntry[]): BodyEntry[] {
  const last = new Map<string, BodyEntry>();
  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at))) last.set(e.date, e);
  return [...last.values()];
}

/** Trailing mean over the last `window` entries: a trend that smooths day-to-day noise (water, food). */
export function trend(values: readonly number[], window = 7): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}

/** Latest value and the change since the entry before it (null if there is only one). */
export function latestChange(sorted: readonly BodyEntry[]): { latest: BodyEntry; change: number | null } | null {
  const n = sorted.length;
  if (!n) return null;
  return { latest: sorted[n - 1], change: n > 1 ? sorted[n - 1].value - sorted[n - 2].value : null };
}
