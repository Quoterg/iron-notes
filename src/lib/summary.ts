// A workout's summary (M26): duration (first to last set logged), sets, volume, effective reps, records,
// and the muscles that met the mode's goal — for the summary sheet, its image and the shared text.
import { isoDate } from './calc';
import type { MuscleId, WorkoutSet } from './model';

/**
 * Seconds from the first to the last set logged that day (`at`), or null with fewer than two. Only sets
 * logged on their own date count: a set added to Monday on Tuesday, or a whole day filled in later, says
 * nothing about how long that workout took.
 */
export function durationOf(sets: readonly WorkoutSet[]): number | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of sets) {
    if (s.planned || s.at == null || isoDate(new Date(s.at)) !== s.date) continue;
    lo = Math.min(lo, s.at);
    hi = Math.max(hi, s.at);
  }
  return hi > lo ? Math.round((hi - lo) / 1000) : null;
}

/** A set's logged time after a tick: turning it done is "now"; otherwise it keeps its time. */
export const stampAt = (prevAt: number | undefined, wasDone: boolean, nowDone: boolean, now = Date.now()): number | undefined =>
  nowDone && !wasDone ? now : prevAt;

/** "52 min", "1 h 5 min". */
export function fmtDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

export interface Summary {
  duration: number | null;
  exercises: number;
  sets: number;
  volume: number;
  effective: number;
  records: number;
  /** Muscles whose main session met (or passed) the goal, with their effective reps. */
  goalsMet: { muscle: MuscleId; n: number }[];
}

export function summaryOf(i: {
  sets: readonly WorkoutSet[];
  volume: number;
  effective: (s: WorkoutSet) => number;
  recordIds: ReadonlySet<string>;
  muscles: { muscle: MuscleId; n: number; met: boolean }[];
}): Summary {
  const done = i.sets.filter((s) => !s.planned);
  return {
    duration: durationOf(done),
    exercises: new Set(done.map((s) => s.exerciseId)).size,
    sets: done.length,
    volume: i.volume,
    effective: Math.round(done.reduce((n, s) => n + i.effective(s), 0)),
    records: done.filter((s) => i.recordIds.has(s.id)).length,
    goalsMet: i.muscles.filter((m) => m.met).map(({ muscle, n }) => ({ muscle, n: Math.round(n) })),
  };
}
