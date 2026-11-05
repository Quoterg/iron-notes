// A workout as plain text, for sharing (messages, notes).
import { loadOf } from './load';
import type { Exercise, Settings, WorkoutSet } from './model';
import { setText } from './units';

export function workoutText(title: string, groups: { ex: Exercise; sets: WorkoutSet[] }[], st: Settings, comment = ''): string {
  const lines = [title];
  if (comment) lines.push(comment);
  for (const { ex, sets } of groups) {
    lines.push('', ex.name);
    for (const s of sets) lines.push(`  ${setText(s, ex.type, st, loadOf(ex))}${s.comment ? ` (${s.comment})` : ''}`);
  }
  return lines.join('\n');
}
