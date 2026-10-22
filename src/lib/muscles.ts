// Muscle groups and which ones each starter exercise trains (primary = the target, secondary = helps).
// The basis for effective reps per muscle group (Phase 2); how much a secondary muscle counts is decided
// there, not here.
import type { Exercise, MuscleId, Muscles } from './model';

export const MUSCLES: MuscleId[] = [
  'chest', 'frontDelts', 'sideDelts', 'rearDelts', 'lats', 'traps', 'lowerBack',
  'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs',
];

/** In canonical order (as the editor stores them), so a list reads the same before and after an edit. */
const canon = (a: MuscleId, b: MuscleId) => MUSCLES.indexOf(a) - MUSCLES.indexOf(b);
const m = (primary: MuscleId[], secondary: MuscleId[] = []): Muscles => ({ primary: primary.sort(canon), secondary: secondary.sort(canon) });

/** The starter library's muscles, by exercise name (lower case). */
const BY_NAME: Record<string, Muscles> = {
  'overhead press': m(['frontDelts'], ['sideDelts', 'triceps']),
  'seated dumbbell press': m(['frontDelts'], ['sideDelts', 'triceps']),
  'arnold press': m(['frontDelts'], ['sideDelts', 'triceps']),
  'lateral dumbbell raise': m(['sideDelts']),
  'front dumbbell raise': m(['frontDelts']),
  'rear delt fly': m(['rearDelts'], ['traps']),
  'face pull': m(['rearDelts'], ['traps']),
  'barbell shrug': m(['traps']),
  'close grip bench press': m(['triceps'], ['chest', 'frontDelts']),
  'cable pushdown': m(['triceps']),
  'overhead triceps extension': m(['triceps']),
  skullcrusher: m(['triceps']),
  dips: m(['triceps'], ['chest', 'frontDelts']),
  'barbell curl': m(['biceps'], ['forearms']),
  'dumbbell curl': m(['biceps'], ['forearms']),
  'hammer curl': m(['biceps'], ['forearms']),
  'preacher curl': m(['biceps']),
  'cable curl': m(['biceps']),
  'flat barbell bench press': m(['chest'], ['triceps', 'frontDelts']),
  'incline barbell bench press': m(['chest'], ['frontDelts', 'triceps']),
  'flat dumbbell bench press': m(['chest'], ['triceps', 'frontDelts']),
  'incline dumbbell bench press': m(['chest'], ['frontDelts', 'triceps']),
  'dumbbell fly': m(['chest']),
  'cable crossover': m(['chest']),
  'push up': m(['chest'], ['triceps', 'frontDelts']),
  deadlift: m(['lowerBack', 'glutes', 'hamstrings'], ['quads', 'traps', 'lats', 'forearms']),
  'barbell row': m(['lats'], ['rearDelts', 'biceps', 'lowerBack']),
  'pull up': m(['lats'], ['biceps']),
  'chin up': m(['lats'], ['biceps']),
  'lat pulldown': m(['lats'], ['biceps']),
  'seated cable row': m(['lats'], ['rearDelts', 'biceps']),
  'one arm dumbbell row': m(['lats'], ['rearDelts', 'biceps']),
  'back extension': m(['lowerBack'], ['glutes', 'hamstrings']),
  'barbell squat': m(['quads', 'glutes'], ['lowerBack']),
  'front squat': m(['quads'], ['glutes']),
  'romanian deadlift': m(['hamstrings', 'glutes'], ['lowerBack']),
  'leg press': m(['quads', 'glutes']),
  'leg extension': m(['quads']),
  'lying leg curl': m(['hamstrings']),
  'walking lunge': m(['quads', 'glutes'], ['hamstrings']),
  'hip thrust': m(['glutes'], ['hamstrings']),
  'standing calf raise': m(['calves']),
  crunch: m(['abs']),
  'hanging leg raise': m(['abs']),
  plank: m(['abs']),
  'cable crunch': m(['abs']),
  'ab wheel rollout': m(['abs']),
};

export function defaultMuscles(name: string): Muscles | undefined {
  const d = BY_NAME[name.trim().toLowerCase()];
  return d && { primary: [...d.primary], secondary: [...d.secondary] }; // a copy: never share the table's arrays
}

/** Primary wins over secondary, no repeats, canonical order (backups may carry anything). */
export function normalizeMuscles(ms: Muscles): Muscles {
  const primary = [...new Set(ms.primary)].sort(canon);
  return { primary, secondary: [...new Set(ms.secondary)].filter((x) => !primary.includes(x)).sort(canon) };
}

/** Exercises that have no muscles yet but a known name, with the default muscles (others untouched). */
export function withDefaultMuscles(list: readonly Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  for (const e of list) {
    const d = !e.muscles && defaultMuscles(e.name);
    if (d) out.push({ ...e, muscles: d });
  }
  return out;
}

export type MuscleState = 'none' | 'primary' | 'secondary';
export const stateOf = (ms: Muscles | undefined, id: MuscleId): MuscleState =>
  ms?.primary.includes(id) ? 'primary' : ms?.secondary.includes(id) ? 'secondary' : 'none';

/** Tap cycle in the editor: none → primary → secondary → none. */
export function cycle(ms: Muscles | undefined, id: MuscleId): Muscles {
  const cur = stateOf(ms, id);
  const primary = (ms?.primary ?? []).filter((x) => x !== id);
  const secondary = (ms?.secondary ?? []).filter((x) => x !== id);
  if (cur === 'none') primary.push(id);
  else if (cur === 'primary') secondary.push(id);
  return { primary: primary.sort(canon), secondary: secondary.sort(canon) };
}
