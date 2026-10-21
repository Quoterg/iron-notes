// The data the app stores. Weights are kept in kg, distances in km and times in seconds,
// whatever units the user sees (lib/units.ts converts).

export type Field = 'weight' | 'reps' | 'distance' | 'time';

/** What a set of an exercise records, in display order. */
export type ExerciseType =
  | 'weight,reps'
  | 'weight,distance'
  | 'weight,time'
  | 'reps,distance'
  | 'reps,time'
  | 'distance,time'
  | 'weight'
  | 'reps'
  | 'distance'
  | 'time';

export const TYPES: ExerciseType[] = [
  'weight,reps', 'weight,distance', 'weight,time', 'reps,distance', 'reps,time', 'distance,time',
  'weight', 'reps', 'distance', 'time',
];

export const fieldsOf = (type: ExerciseType): Field[] => type.split(',') as Field[];

export interface Category {
  id: string;
  name: string;
  /** #rrggbb */
  color: string;
  order: number;
}

export interface Exercise {
  id: string;
  name: string;
  categoryId: string;
  type: ExerciseType;
  notes?: string;
  /** Weight step for the +/- buttons, in the user's weight unit. Default: 2.5 kg / 5 lb. */
  increment?: number;
  /** Rest timer length in seconds. Default: the setting. */
  rest?: number;
}

export interface WorkoutSet {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  exerciseId: string;
  /** Creation order (ms timestamp, made unique): sets and exercises of a day sort by it. */
  order: number;
  weight?: number;
  reps?: number;
  distance?: number;
  time?: number;
  comment?: string;
  /** Superset id: every set of the exercises done in rotation on that day shares it. */
  group?: string;
  /**
   * Ticked off. `false` = planned but not done yet (logged from a routine): shown greyed with a tick
   * box and left out of records and progress until done. `undefined`/`true` = a done set.
   */
  done?: boolean;
}

/** A planned set of a routine (values in stored units; missing values are filled in when logging). */
export interface PlannedSet {
  weight?: number;
  reps?: number;
  distance?: number;
  time?: number;
}
export interface RoutineItem {
  exerciseId: string;
  sets: PlannedSet[];
}
export interface RoutineDay {
  id: string;
  name: string;
  items: RoutineItem[];
}
export interface Routine {
  id: string;
  name: string;
  order: number;
  days: RoutineDay[];
}

export interface DayComment {
  date: string;
  text: string;
}

export type WeightUnit = 'kg' | 'lb';
export type DistUnit = 'km' | 'mi' | 'm';

export interface Settings {
  unit: WeightUnit;
  dist: DistUnit;
  /** Default rest timer, seconds. */
  rest: number;
  autoTimer: boolean;
  timerSound: boolean;
  markDone: boolean;
  formula: 'epley' | 'brzycki';
  /** First day of the week in the calendar: 0 Sunday, 1 Monday. */
  weekStart: 0 | 1;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  dist: 'km',
  rest: 90,
  autoTimer: true,
  timerSound: true,
  markDone: false,
  formula: 'epley',
  weekStart: 1,
};
