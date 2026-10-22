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
  /** Shown under Favourites at the top of the picker. */
  favorite?: boolean;
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
  /** Ticked off: a display flag only ("Mark sets complete"); unticked sets still count everywhere. */
  done?: boolean;
  /**
   * Logged from a routine and not done yet: shown greyed with a tick box, filled in by Save, and left
   * out of records, history, graphs, "last time", the calendar and copy sources until done.
   */
  planned?: true;
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

/** What a body measure records, and so its unit: kg/lb, %, cm/in or a plain number. */
export type BodyKind = 'weight' | 'percent' | 'length' | 'number';
export interface BodyMetric {
  id: string;
  name: string;
  kind: BodyKind;
  order: number;
}
export interface BodyEntry {
  id: string;
  metricId: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Stored unit: kg, %, cm or the plain number. */
  value: number;
  /** When it was entered (ms): of two entries on one date, the later counts. */
  at: number;
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
  /** Keep the screen on while an exercise is open (Wake Lock). */
  keepScreenOn: boolean;
  /** The user's bar and plates, in the unit they were set in (defaults per unit otherwise). */
  plates?: { unit: WeightUnit; bar: number; sizes: number[] };
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
  keepScreenOn: false,
};
