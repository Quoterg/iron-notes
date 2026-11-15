import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from './model';
import { dayOrder, groupColors, groupMembers, moveUnit, nextInGroup, placeTogether, pullTogether, pullUnits } from './groups';

let n = 0;
const s = (exerciseId: string, group?: string): WorkoutSet => ({ id: `s${++n}`, date: 'd', exerciseId, order: n, group });

describe('supersets', () => {
  const sets = [s('a'), s('b', 'g1'), s('c'), s('d', 'g1'), s('b', 'g1'), s('e', 'g2'), s('f', 'g2')];
  it('lists the day order with groups', () => {
    expect(dayOrder(sets)).toEqual([
      { exerciseId: 'a', group: undefined },
      { exerciseId: 'b', group: 'g1' },
      { exerciseId: 'c', group: undefined },
      { exerciseId: 'd', group: 'g1' },
      { exerciseId: 'e', group: 'g2' },
      { exerciseId: 'f', group: 'g2' },
    ]);
  });
  it('pulls members together at the first one', () => {
    expect(pullTogether(['a', 'b', 'c', 'd', 'e'], new Set(['b', 'd']))).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(pullTogether(['a', 'b', 'c', 'd'], new Set(['d', 'a']))).toEqual(['a', 'd', 'b', 'c']);
    expect(pullTogether(['a', 'b'], new Set(['x']))).toEqual(['a', 'b']);
  });
  it('finds members and the next exercise of a round', () => {
    expect(groupMembers(sets, 'd')).toEqual(['b', 'd']);
    expect(groupMembers(sets, 'a')).toEqual([]);
    expect(nextInGroup(['b', 'd'], 'b')).toEqual({ next: 'd', endOfRound: false });
    expect(nextInGroup(['b', 'd'], 'd')).toEqual({ next: 'b', endOfRound: true });
    expect(nextInGroup(['b'], 'b')).toBeNull();
    expect(nextInGroup(['b', 'd'], 'a')).toBeNull();
  });
  it('colours groups by appearance', () => {
    const c = groupColors(sets);
    expect(c.size).toBe(2);
    expect(c.get('g1')).not.toBe(c.get('g2'));
  });
  it('moves a superset as one unit', () => {
    const o = [{ exerciseId: 'a' }, { exerciseId: 'b', group: 'g' }, { exerciseId: 'c', group: 'g' }, { exerciseId: 'd' }];
    expect(moveUnit(o, 'c', -1)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveUnit(o, 'b', 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveUnit(o, 'd', -1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveUnit(o, 'a', -1)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('treats a lone group as none and reads the group from any set', () => {
    expect(dayOrder([s('a', 'g'), s('b')])).toEqual([{ exerciseId: 'a', group: undefined }, { exerciseId: 'b', group: undefined }]);
    expect(dayOrder([s('a'), s('b', 'g'), s('a', 'g')]).map((o) => o.group)).toEqual(['g', 'g']);
  });
});

describe('a routine added to a logged day', () => {
  it('pulls whole supersets, never splitting one', () => {
    const order = [{ exerciseId: 'a', group: 'g' }, { exerciseId: 'b', group: 'g' }, { exerciseId: 'c' }, { exerciseId: 'x' }];
    expect(pullUnits(order, new Set(['a', 'x']))).toEqual(['a', 'b', 'x', 'c']);
    expect(pullTogether(order.map((o) => o.exerciseId), new Set(['a', 'x']))).toEqual(['a', 'x', 'b', 'c']); // what it avoids
  });
  it('places the new sets together in one write, moving only what has to move', () => {
    const existing = [{ ...s('p'), order: 10 }, { ...s('q'), order: 11 }];
    const added = [{ ...s('r'), order: 50 }, { ...s('p'), order: 51 }];
    const write = placeTogether(existing, added);
    const all = [...existing.filter((e) => !write.some((w) => w.id === e.id)), ...write].sort((x, y) => x.order - y.order);
    expect([...new Set(all.map((x) => x.exerciseId))]).toEqual(['p', 'r', 'q']);
    expect(placeTogether([], added)).toEqual(added);
  });
});
