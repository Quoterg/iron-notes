// Training cycles on the calendar (docs/TRAINING-MODES.md): Lyle's cycle (run-up weeks, then push) and
// Dorian's lighter week (~10 % less, stop 1–2 reps short of failure; its sets don't drive progression),
// plus the program: a routine whose workouts rotate as the cycle's sessions.
import { cycleWeek, RUN_UP } from './lyle';
import type { Routine, RoutineDay, Settings, WorkoutSet } from './model';
import type { Target } from './targets';

/** A lighter week lasts this many days. */
export const LIGHT_DAYS = 7;
/** Share of the working weight in a lighter week. */
export const LIGHT_SHARE = 0.9;

export type Phase = 'runup' | 'push' | 'light';

const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Whether `date` is in the lighter week started on `start`. */
export const inLight = (light: Settings['light'], date: string): boolean => !!light && date >= light.start && date < addDays(light.start, LIGHT_DAYS);
/** Last day of a lighter week. */
export const lightEnd = (light: { start: string }): string => addDays(light.start, LIGHT_DAYS - 1);

/** The cycle phase of `date` for the mode (null outside any cycle). */
export function phaseOn(st: Pick<Settings, 'mode' | 'cycle' | 'light'>, date: string): { phase: Phase; week?: number; weeks?: number } | null {
  if (st.mode === 'dorian') return inLight(st.light, date) ? { phase: 'light' } : null;
  if (st.mode !== 'lyle' || !st.cycle) return null;
  const week = cycleWeek(st.cycle.start, date);
  if (week < 1 || week > st.cycle.weeks) return null;
  return { phase: week <= RUN_UP.length ? 'runup' : 'push', week, weeks: st.cycle.weeks };
}

const down = (x: number, step: number) => (step > 0 ? Math.floor(x / step + 1e-9) * step : x);

/** A lighter-week set from the same set of the last normal session: ~10 % less, same reps to aim for. */
export function lightSet<T extends Pick<WorkoutSet, 'weight' | 'reps' | 'warmup'>>(s: T, stepKg: number): T {
  if (s.warmup || !(s.weight! > 0)) return s;
  return { ...s, weight: down(s.weight! * LIGHT_SHARE, stepKg) || s.weight };
}

/** Lighter-week targets: each working set of the last normal session, ~10 % lighter, same reps to aim for. */
export function lightTargets(last: readonly WorkoutSet[], stepKg: number): Target[] {
  return last.filter((s) => !s.warmup && s.reps! > 0).map((s) => ({ weight: lightSet(s, stepKg).weight ?? 0, reps: s.reps, why: 'light' as const, prev: s }));
}

/** Sets that drive progression: done, not from a lighter week. */
export const progressing = (s: WorkoutSet): boolean => !s.planned && !s.deload;

/** The program's next workout: the one after the last logged from it (the first when none). */
export function nextProgramDay(routine: Routine | undefined, lastDayId: string | undefined): RoutineDay | undefined {
  const days = routine?.days ?? [];
  if (!days.length) return undefined;
  const i = days.findIndex((d) => d.id === lastDayId);
  return days[(i + 1) % days.length];
}
