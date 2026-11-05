// Full-screen sheets as a stack, mirrored in browser history so the Android back
// button (and back gesture) closes the top sheet instead of leaving the app. Same as Iron Log.
import { computed, signal } from '@preact/signals';

export type Screen =
  /** Pick an exercise to log on `date`, or (routine) to add to a routine day. */
  | { kind: 'pick'; date: string; routine?: { routineId: string; dayId: string } }
  /** Save the shown day as a reusable workout. */
  | { kind: 'saveWorkout' }
  /** A routine and its days. */
  | { kind: 'routine'; id: string }
  /** One day of a routine: its exercises and planned sets. */
  | { kind: 'routineDay'; routineId: string; dayId: string }
  /** Log sets of an exercise on `date`. */
  | { kind: 'exercise'; id: string; date: string }
  /** Create (no id) or edit an exercise. With `date`, a new exercise opens for logging afterwards. */
  | { kind: 'editExercise'; id?: string; categoryId?: string; date?: string }
  /** Browse and manage all exercises and categories. */
  | { kind: 'library' }
  /** Create (no id) or edit a category. */
  | { kind: 'category'; id?: string }
  /** The workout comment of `date`. */
  | { kind: 'comment'; date: string }
  /** Calculators (1RM, plates, warm-up); `weight` (kg) and `reps` prefill them. */
  | { kind: 'tools'; weight?: number; reps?: number }
  /** What's new since the last update. */
  | { kind: 'whatsnew'; since: number }
  /** Training statistics. */
  | { kind: 'analysis' }
  /** Effective reps per muscle group: this week and the last weeks. */
  | { kind: 'muscles' }
  /** Sync with another of the user's devices (QR + direct WebRTC). */
  | { kind: 'sync' }
  /** Ready-made programs and your own (a routine folder + training weekdays). */
  | { kind: 'programs' }
  /** Review of a Lyle cycle or the last weeks: strength, muscles, readiness, swaps. */
  | { kind: 'review' }
  /** A body measure: entries, graph. */
  | { kind: 'metric'; id: string }
  /** Copy (part of) a previous workout into `date`. */
  | { kind: 'copy'; date: string };

export const stack = signal<Screen[]>([]);
export const top = computed(() => stack.value[stack.value.length - 1]);

export function open(s: Screen): void {
  stack.value = [...stack.value, s];
  history.pushState({ depth: stack.value.length }, '');
}

/** Swap the top sheet without adding a history step. */
export function replaceTop(s: Screen): void {
  stack.value = [...stack.value.slice(0, -1), s];
}

/** Replace the top two sheets by one (e.g. picker + new-exercise editor → logging screen). */
export function replaceTopTwo(s: Screen): void {
  if (stack.value.length < 2) return replaceTop(s);
  // The popstate of history.back() then trims the stack to the new depth: already that long.
  stack.value = [...stack.value.slice(0, -2), s];
  history.back();
}

export function back(): void {
  if (stack.value.length) history.back();
}

export function initNav(): void {
  history.replaceState({ depth: 0 }, '');
  window.addEventListener('popstate', (e: PopStateEvent) => {
    const depth = (e.state as { depth?: number } | null)?.depth ?? 0;
    stack.value = stack.value.slice(0, depth);
  });
}
