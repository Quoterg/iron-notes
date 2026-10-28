// Ready-made programs (docs/TRAINING-MODES.md): Dorian Yates' 4-day split (one all-out set per exercise)
// and Lyle McDonald's Generic Bulking Routine (upper/lower, 6–8 main, 10–12 secondary, 12–15 arms).
// Built from the user's exercise library by name; anything missing is left out and reported.
import { uid } from './calc';
import type { Exercise, Routine, TrainingMode } from './model';

/** [exercise name, sets, rep range (Lyle sets it on exercises that have none)] */
type Item = [string, number, [number, number]?];
export interface Template {
  id: 'dorian4' | 'lyleGbr';
  mode: TrainingMode;
  /** Training weekdays (0 Sunday … 6 Saturday). */
  weekdays: number[];
  days: [string, Item[]][];
}

const MAIN: [number, number] = [6, 8];
const SECONDARY: [number, number] = [10, 12];
const ARMS: [number, number] = [12, 15];

export const TEMPLATES: Template[] = [
  {
    id: 'dorian4',
    mode: 'dorian',
    weekdays: [1, 2, 4, 5],
    days: [
      ['Chest & biceps', [['Incline Barbell Bench Press', 1], ['Flat Dumbbell Bench Press', 1], ['Dumbbell Fly', 1], ['Dumbbell Curl', 1], ['Barbell Curl', 1]]],
      ['Legs', [['Leg Extension', 1], ['Leg Press', 1], ['Barbell Squat', 1], ['Lying Leg Curl', 1], ['Romanian Deadlift', 1], ['Standing Calf Raise', 1]]],
      ['Delts, traps & triceps', [['Seated Dumbbell Press', 1], ['Lateral Dumbbell Raise', 1], ['Barbell Shrug', 1], ['Cable Pushdown', 1], ['Overhead Triceps Extension', 1]]],
      ['Back & rear delts', [['Lat Pulldown', 1], ['Barbell Row', 1], ['One Arm Dumbbell Row', 1], ['Rear Delt Fly', 1], ['Deadlift', 1], ['Back Extension', 1]]],
    ],
  },
  {
    id: 'lyleGbr',
    mode: 'lyle',
    weekdays: [1, 2, 4, 5],
    days: [
      ['Lower', [['Barbell Squat', 3, MAIN], ['Romanian Deadlift', 3, MAIN], ['Leg Press', 2, SECONDARY], ['Lying Leg Curl', 2, SECONDARY], ['Standing Calf Raise', 3, MAIN]]],
      ['Upper', [['Flat Barbell Bench Press', 3, MAIN], ['Barbell Row', 3, MAIN], ['Incline Dumbbell Bench Press', 2, SECONDARY], ['Lat Pulldown', 2, SECONDARY], ['Cable Pushdown', 2, ARMS], ['Barbell Curl', 2, ARMS]]],
    ],
  },
];

/**
 * The template as a routine from `library` (matched by name, any case), the exercises that get its rep
 * range (only those without one), and the names not found.
 */
export function buildProgram(tpl: Template, name: string, library: readonly Exercise[], order: number): { routine: Routine; ranges: Exercise[]; missing: string[] } {
  const byName = new Map(library.map((e) => [e.name.toLowerCase(), e]));
  const missing: string[] = [];
  const ranges = new Map<string, Exercise>();
  const days = tpl.days.map(([dayName, items]) => ({
    id: uid(),
    name: dayName,
    items: items.flatMap(([exName, sets, range]) => {
      const ex = byName.get(exName.toLowerCase());
      if (!ex) {
        if (!missing.includes(exName)) missing.push(exName);
        return [];
      }
      if (range && ex.repTop == null && ex.repBottom == null && !ranges.has(ex.id)) ranges.set(ex.id, { ...ex, repBottom: range[0], repTop: range[1] });
      return [{ exerciseId: ex.id, sets: Array.from({ length: sets }, () => ({})) }];
    }),
  }));
  return { routine: { id: uid(), name, order, days }, ranges: [...ranges.values()], missing };
}

/** Whether `date` (YYYY-MM-DD) is a training day of the schedule (no schedule: every day). */
export function isTrainingDay(weekdays: readonly number[] | undefined, date: string): boolean {
  if (!weekdays?.length) return true;
  return weekdays.includes(new Date(date + 'T00:00:00Z').getUTCDay());
}
