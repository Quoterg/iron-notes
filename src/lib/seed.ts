// The starter exercise library, written once on first start. Split out of the first-paint bundle.
import { uid } from './calc';
import { DEFAULT_LOADS } from './load-defaults';
import { defaultMuscles } from './muscles';
import type { Category, Exercise, ExerciseType } from './model';

type Item = string | [string, ExerciseType];

const LIBRARY: [string, string, Item[]][] = [
  ['Shoulders', '#3b8df5', ['Overhead Press', 'Seated Dumbbell Press', 'Arnold Press', 'Lateral Dumbbell Raise', 'Front Dumbbell Raise', 'Rear Delt Fly', 'Face Pull', 'Barbell Shrug']],
  ['Triceps', '#8c5aff', ['Close Grip Bench Press', 'Cable Pushdown', 'Overhead Triceps Extension', 'Skullcrusher', 'Dips']],
  ['Biceps', '#e05fb8', ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl']],
  ['Chest', '#f0566a', ['Flat Barbell Bench Press', 'Incline Barbell Bench Press', 'Flat Dumbbell Bench Press', 'Incline Dumbbell Bench Press', 'Dumbbell Fly', 'Cable Crossover', 'Push Up']],
  ['Back', '#f29a38', ['Deadlift', 'Barbell Row', 'Pull Up', 'Chin Up', 'Lat Pulldown', 'Seated Cable Row', 'One Arm Dumbbell Row', 'Back Extension']],
  ['Legs', '#e0c43a', ['Barbell Squat', 'Front Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Extension', 'Lying Leg Curl', 'Walking Lunge', 'Hip Thrust', 'Standing Calf Raise']],
  ['Abs', '#2bd4e0', [['Crunch', 'reps'], ['Hanging Leg Raise', 'reps'], ['Plank', 'time'], 'Cable Crunch', ['Ab Wheel Rollout', 'reps']]],
  ['Cardio', '#2bcf9a', [['Running', 'distance,time'], ['Cycling', 'distance,time'], ['Rowing Machine', 'distance,time'], ['Elliptical Trainer', 'distance,time'], ['Walking', 'distance,time'], ['Swimming', 'distance,time'], ['Jump Rope', 'time']]],
];

export function starterLibrary(): { categories: Category[]; exercises: Exercise[] } {
  const categories: Category[] = [];
  const exercises: Exercise[] = [];
  LIBRARY.forEach(([name, color, items], order) => {
    const c: Category = { id: uid(), name, color, order };
    categories.push(c);
    for (const it of items) {
      const [n, type] = typeof it === 'string' ? [it, 'weight,reps' as const] : it;
      exercises.push({ id: uid(), name: n, categoryId: c.id, type, muscles: defaultMuscles(n), load: DEFAULT_LOADS[n.toLowerCase()] });
    }
  });
  return { categories, exercises };
}

/** Swatches offered for categories. */
export const COLORS = ['#3b8df5', '#8c5aff', '#e05fb8', '#f0566a', '#f29a38', '#e0c43a', '#2bd4e0', '#2bcf9a', '#9aa4b2'];
