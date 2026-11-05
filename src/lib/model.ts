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

/** Muscle groups (for effective reps per muscle group). */
export type MuscleId =
  | 'chest' | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'lats' | 'traps' | 'lowerBack'
  | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs';
/** The muscles an exercise trains: primary (the target) and secondary (helping). */
export interface Muscles {
  primary: MuscleId[];
  secondary: MuscleId[];
}

export interface Exercise {
  id: string;
  name: string;
  categoryId: string;
  type: ExerciseType;
  notes?: string;
  /** Weight step for the +/- buttons, in the user's weight unit. Default: 2.5 kg / 5 lb. */
  increment?: number;
  /** Top of the rep range for progression (Dorian HIT: reach it, then the weight goes up). Default 12. */
  repTop?: number;
  /** Bottom of the rep range (Lyle mode: reps to restart from after a weight increase). Default top − 4. */
  repBottom?: number;
  /** Joint pain flagged: no weight increases until cleared; swaps for the same muscle are offered. */
  joint?: boolean;
  /** What the entered weight means (lib/load.ts). Unset = total (bar or machine). */
  load?: LoadType;
  /** Done with the bar and plates (targets can round to them). Unset = by name (barbell lifts). */
  plates?: boolean;
  /** Rest timer length in seconds. Default: the setting. */
  rest?: number;
  /** Shown under Favourites at the top of the picker. */
  favorite?: boolean;
  muscles?: Muscles;
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
  /** Reps in reserve (0 = failure, 5 = 5+). Dorian HIT working sets store 0; Standard mode leaves it out. */
  rir?: number;
  /** Reps after failure: forced, rest-pause and drop-set reps (Dorian HIT). */
  after?: number;
  /** A warm-up set: no effective reps. */
  warmup?: true;
  /** Logged in a Dorian lighter week: not used for progression targets. */
  deload?: true;
  /** Readiness given before the exercise's first set that day: 0 fresh, 1 a bit sore, 2 still sore. */
  sore?: number;
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
  /** Items sharing this key are done as a superset (a fresh group on the day each time it's logged). */
  group?: string;
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

/** Total (bar/machine), per hand (one dumbbell), body weight + added load, or assisted (body weight − help). */
export type LoadType = 'total' | 'perHand' | 'bodyweight' | 'assisted';

/** Standard logging, Dorian Yates' HIT (to failure) or Lyle McDonald's effective reps (RIR). */
export type TrainingMode = 'standard' | 'dorian' | 'lyle';

export interface Settings {
  mode: TrainingMode;
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
  /** Lyle mode's current cycle: first day (YYYY-MM-DD) and length in weeks (2 run-up + the rest push). */
  cycle?: { start: string; weeks: number };
  /** Dorian HIT's lighter week (7 days from `start`). */
  light?: { start: string };
  /** The program: a routine whose workouts rotate; the last one logged from it. */
  program?: { routineId: string; lastDayId?: string; weekdays?: number[] };
  /** Diet phase: a cut makes holding the weight a success (feedback). Unset = maintaining. */
  diet?: 'build' | 'maintain' | 'cut';
  /** Round progression targets and warm-ups to the bar and plates (exercises that use them). */
  roundPlates?: boolean;
  /** In Swedish: keep the starter library's gym-English exercise names. */
  gymEnglish?: boolean;
  /** UI language; unset = the phone's (Auto). */
  lang?: 'en' | 'sv';
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'standard',
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
