// Supersets: exercises of a day done in rotation. Every set of a grouped exercise on that day carries
// the same `group` id. Pure helpers; the state functions write the sets.
import type { WorkoutSet } from './model';

/** Colours for groups (by their position in the day), readable in both themes. */
export const GROUP_COLORS = ['#7b5cff', '#f29a38', '#2bd4e0', '#e05fb8', '#e0c43a'];

/**
 * The day's exercises in order with their group id: from any of the exercise's sets (a set added later,
 * e.g. from a routine, may lack it), and only for groups that still have 2+ exercises — a partner left
 * alone after a delete counts as ungrouped.
 */
export function dayOrder(sets: readonly WorkoutSet[]): { exerciseId: string; group?: string }[] {
  const seen = new Map<string, string | undefined>();
  for (const s of sets) if (!seen.has(s.exerciseId) || (!seen.get(s.exerciseId) && s.group)) seen.set(s.exerciseId, s.group);
  const size = new Map<string, number>();
  for (const g of seen.values()) if (g) size.set(g, (size.get(g) ?? 0) + 1);
  return [...seen].map(([exerciseId, g]) => ({ exerciseId, group: g && size.get(g)! > 1 ? g : undefined }));
}

/** The group a new set of `exerciseId` on that day joins (its exercise's current group, if any). */
export const groupOf = (sets: readonly WorkoutSet[], exerciseId: string): string | undefined =>
  dayOrder(sets).find((o) => o.exerciseId === exerciseId)?.group;

/** Exercise order with `members` pulled together at the first member's place (others keep their order). */
export function pullTogether(order: readonly string[], members: ReadonlySet<string>): string[] {
  const first = order.findIndex((id) => members.has(id));
  if (first < 0) return [...order];
  const inGroup = order.filter((id) => members.has(id));
  const rest = order.filter((id) => !members.has(id));
  const before = order.slice(0, first).filter((id) => !members.has(id)).length;
  return [...rest.slice(0, before), ...inGroup, ...rest.slice(before)];
}

/** The exercises of `exerciseId`'s group, in day order (empty if it isn't grouped). */
export function groupMembers(sets: readonly WorkoutSet[], exerciseId: string): string[] {
  const order = dayOrder(sets);
  const g = order.find((o) => o.exerciseId === exerciseId)?.group;
  return g ? order.filter((o) => o.group === g).map((o) => o.exerciseId) : [];
}

/** Where to go after saving a set in a superset: the next member, or back to the first (end of a round). */
export function nextInGroup(members: readonly string[], current: string): { next: string; endOfRound: boolean } | null {
  const i = members.indexOf(current);
  if (i < 0 || members.length < 2) return null;
  return i === members.length - 1 ? { next: members[0], endOfRound: true } : { next: members[i + 1], endOfRound: false };
}

/** Colour of each group of the day, by order of appearance. */
export function groupColors(sets: readonly WorkoutSet[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const { group } of dayOrder(sets)) if (group && !out.has(group)) out.set(group, GROUP_COLORS[out.size % GROUP_COLORS.length]);
  return out;
}

/**
 * Moves the unit holding `exerciseId` (its whole superset, or the exercise alone) one unit up (-1) or
 * down (+1) past the neighbouring unit. Returns the new exercise order.
 */
export function moveUnit(order: readonly { exerciseId: string; group?: string }[], exerciseId: string, dir: -1 | 1): string[] {
  const units: string[][] = [];
  let prevGroup: string | undefined;
  for (const o of order) {
    if (units.length && o.group && o.group === prevGroup) units[units.length - 1].push(o.exerciseId);
    else units.push([o.exerciseId]);
    prevGroup = o.group;
  }
  const i = units.findIndex((u) => u.includes(exerciseId));
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < units.length) [units[i], units[j]] = [units[j], units[i]];
  return units.flat();
}
