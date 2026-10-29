import { describe, expect, it } from 'vitest';
import type { Exercise } from './model';
import { buildProgram, isTrainingDay, TEMPLATES } from './programs';
import { starterLibrary } from './seed';

const lib = starterLibrary().exercises;
const dorian = TEMPLATES.find((t) => t.id === 'dorian4')!;
const lyle = TEMPLATES.find((t) => t.id === 'lyleGbr')!;

describe('ready-made programs', () => {
  it('every template exercise is in the starter library', () => {
    for (const tpl of TEMPLATES) expect(buildProgram(tpl, 'x', lib, 0).missing).toEqual([]);
  });
  it('Dorian: four workouts, one all-out set per exercise, no rep ranges imposed', () => {
    const { routine, ranges } = buildProgram(dorian, 'Dorian 4-day split', lib, 2);
    expect(routine).toMatchObject({ name: 'Dorian 4-day split', order: 2 });
    expect(routine.days.map((d) => d.name)).toEqual(['Chest & biceps', 'Legs', 'Delts, traps & triceps', 'Back & rear delts']);
    expect(routine.days.every((d) => d.items.every((i) => i.sets.length === 1))).toBe(true);
    expect(ranges).toEqual([]);
  });
  it('Lyle: upper/lower with sets per exercise and rep ranges only where none are set', () => {
    const own: Exercise[] = lib.map((e) => (e.name === 'Barbell Row' ? { ...e, repTop: 10 } : e));
    const { routine, ranges } = buildProgram(lyle, 'GBR', own, 0);
    expect(routine.days.map((d) => d.name)).toEqual(['Lower', 'Upper']);
    const upper = routine.days[1].items.map((i) => [own.find((e) => e.id === i.exerciseId)!.name, i.sets.length]);
    expect(upper[0]).toEqual(['Flat Barbell Bench Press', 3]);
    const range = (n: string) => ranges.find((e) => e.name === n);
    expect(range('Flat Barbell Bench Press')).toMatchObject({ repBottom: 6, repTop: 8 });
    expect(range('Lat Pulldown')).toMatchObject({ repBottom: 10, repTop: 12 });
    expect(range('Barbell Curl')).toMatchObject({ repBottom: 12, repTop: 15 });
    expect(range('Barbell Row')).toBeUndefined(); // the user's own range stays
  });
  it('missing exercises are left out and reported', () => {
    const { routine, missing } = buildProgram(lyle, 'GBR', lib.filter((e) => e.name !== 'Leg Press'), 0);
    expect(missing).toEqual(['Leg Press']);
    expect(routine.days[0].items).toHaveLength(4);
  });
});

describe('weekly schedule', () => {
  it('training days by weekday; no schedule means every day', () => {
    expect(isTrainingDay([1, 2, 4, 5], '2026-10-26')).toBe(true); // Monday
    expect(isTrainingDay([1, 2, 4, 5], '2026-10-28')).toBe(false); // Wednesday
    expect(isTrainingDay(undefined, '2026-10-28')).toBe(true);
    expect(isTrainingDay([], '2026-10-28')).toBe(true);
  });
});
