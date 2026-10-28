// Feedback and autoregulation (docs/TRAINING-MODES.md): measure first, ask little, find the cause before
// suggesting anything. Pure: performance per session, its trend, the cause of getting weaker, the body-
// weight trend and the long-gap rule. The screens turn the results into each mode's suggestion.
import { oneRM } from './calc';
import type { BodyEntry, WorkoutSet } from './model';

/** Changes smaller than this share count as "the same" (rounding, a slightly different set). */
export const TOLERANCE = 0.005;
/** More days than this since a muscle's last session is a long gap. */
export const GAP_DAYS = 10;
/** Body weight falling at least this share per week counts as cutting. */
export const CUT_RATE = -0.005;

const day = (d: string) => Date.parse(d + 'T00:00:00Z') / 86_400_000;
export const daysBetween = (a: string, b: string): number => Math.round(day(b) - day(a));

export interface Session {
  date: string;
  /** Best e1RM of the session's working sets. */
  score: number;
  /** Readiness given before the session's first set, if any (0 fresh, 1 a bit sore, 2 still sore). */
  sore?: number;
}

/** One entry per session date (oldest first): working sets only (no warm-ups, lighter week or plans). */
export function sessions(sets: readonly WorkoutSet[], formula: 'epley' | 'brzycki' = 'epley', since = ''): Session[] {
  const by = new Map<string, Session>();
  for (const s of sets) {
    if (s.planned || s.warmup || s.deload || s.date < since || !(s.reps! > 0)) continue;
    // Body-weight sets score by reps.
    const score = s.weight! > 0 ? oneRM(s.weight!, s.reps!, formula) : s.reps!;
    const x = by.get(s.date) ?? by.set(s.date, { date: s.date, score: 0 }).get(s.date)!;
    x.score = Math.max(x.score, score);
    if (s.sore != null) x.sore = Math.max(x.sore ?? 0, s.sore);
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type Trend = 'none' | 'up' | 'stalled' | 'weaker';

/**
 * The last sessions' direction: 'weaker' when each of the last two fell below the one before, 'stalled'
 * when neither of the last two beat the best before them, 'up' otherwise; 'none' with fewer than three.
 */
export function trendOf(list: readonly Session[]): Trend {
  if (list.length < 3) return 'none';
  const [a, b, c] = list.slice(-3).map((s) => s.score);
  if (b < a * (1 - TOLERANCE) && c < b * (1 - TOLERANCE)) return 'weaker';
  const before = Math.max(...list.slice(0, -2).map((s) => s.score));
  if (b <= before * (1 + TOLERANCE) && c <= before * (1 + TOLERANCE)) return 'stalled';
  return 'up';
}

export type Cause = 'inconsistent' | 'cutting' | 'exercise' | 'fatigue';

/**
 * Why an exercise got weaker, in the order the design checks: a long gap before the latest sessions,
 * a cut (setting or body-weight trend), only this exercise down, else real fatigue.
 */
export function causeOf(i: { gapDays: number; cutting: boolean; othersWeaker: number }): Cause {
  if (i.gapDays > GAP_DAYS) return 'inconsistent';
  if (i.cutting) return 'cutting';
  return i.othersWeaker > 0 ? 'fatigue' : 'exercise';
}

/** Longest gap in days between consecutive sessions among the last `n` (the stretch that got weaker). */
export function longestGap(list: readonly Session[], n = 3): number {
  const last = list.slice(-n);
  let gap = 0;
  for (let i = 1; i < last.length; i++) gap = Math.max(gap, daysBetween(last[i - 1].date, last[i].date));
  return gap;
}

/**
 * Body-weight change per week as a share (least squares over the entries of the last `days` days, at
 * least 3 entries spanning a week); null when there isn't enough.
 */
export function weeklyRate(entries: readonly BodyEntry[], today: string, days = 21): number | null {
  const from = day(today) - days;
  const pts = entries.filter((e) => day(e.date) >= from && e.value > 0).map((e) => [day(e.date), e.value] as const);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p[0]);
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den ? ((num / den) * 7) / my : null;
}

/** Cutting: set as the diet phase, or body weight falling ≥ 0.5 % a week. */
export const isCutting = (diet: string | undefined, rate: number | null): boolean => diet === 'cut' || (rate != null && rate <= CUT_RATE);
