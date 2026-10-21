// All UI strings go through t(). English only for now. Only the first screen's strings are here; the
// later screens' strings are a lazy chunk (strings-later.ts) that every lazy screen loads with its code
// (lazy.tsx), as in Iron Log. i18n.test.ts checks first-paint code only uses keys from here.
import type { later as LaterTable } from './strings-later';

const core = {
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  prevDay: 'Previous day',
  nextDay: 'Next day',
  log: 'Log',
  settings: 'Settings',
  loading: 'Loading…',
  loadFailed: "Couldn't load this screen.",
  retry: 'Try again',
  updateReady: 'A new version is ready.',
  restart: 'Restart',
  emptyDay: 'Nothing logged on this day.',
  startWorkout: 'Start a workout',
  addExercise: 'Add exercise',
  comment: 'Comment',
  workoutComment: 'Workout comment',
  editComment: 'Edit comment',
  sets: 'sets',
  volume: 'volume',
  record: 'Personal record',
  exercises: 'Exercises',
  restOver: 'Rest over',
  stopTimer: 'Stop timer',
  calendar: 'Calendar',
  copyPrevious: 'Copy a previous workout',
  moveUp: 'Move up',
  moveDown: 'Move down',
  routines: 'Routines',
  dbBlocked: 'Iron Notes is open in another tab or window. Close it to finish updating.',
  superset: 'Superset',
  ungroup: 'Ungroup',
  pickForSuperset: 'Pick the exercises to do in rotation.',
  selectExercise: 'Select',
} as const;

type Later = typeof LaterTable;
export type Key = keyof typeof core | keyof Later;
let laterStrings: Partial<Later> = {};

/** Called by strings-later.ts when it loads. */
export function setLater(table: Later): void {
  laterStrings = table;
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = (core as Record<string, string>)[key] ?? (laterStrings as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Keys of the first screen's table (for tests). */
export const coreKeys = (): string[] => Object.keys(core);

export const locale = (): string | undefined => undefined; // the browser's
