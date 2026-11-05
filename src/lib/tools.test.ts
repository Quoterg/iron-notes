import { describe, expect, it } from 'vitest';
import { cleanPlates, DEFAULT_PLATES, estimate, loadStep, MAX_PLATES, percentTable, platesPerSide, snapToPlates, usesPlatesByName, warmup, weightForReps } from './tools';
import { validateBackup } from './backup';

describe('1RM', () => {
  it('inverts the formula', () => {
    const orm = estimate(100, 5);
    expect(weightForReps(orm, 5)).toBeCloseTo(100, 9);
    expect(weightForReps(estimate(100, 5, 'brzycki'), 5, 'brzycki')).toBeCloseTo(100, 9);
    expect(weightForReps(120, 1)).toBe(120);
  });
  it('makes a % table for 1–12 reps', () => {
    const t = percentTable(100);
    expect(t.length).toBe(12);
    expect(t[0]).toEqual({ reps: 1, pct: 100, weight: 100 });
    expect(t[9].pct).toBe(75); // 10 reps ≈ 75 % (Epley)
    expect(percentTable(0)[3].pct).toBe(0);
  });
});

describe('plates', () => {
  const kg = DEFAULT_PLATES.kg;
  it('loads each side largest first', () => {
    expect(platesPerSide(140, kg.bar, kg.sizes)).toEqual({ plates: [25, 25, 10], rest: 0 });
    expect(platesPerSide(62.5, kg.bar, kg.sizes)).toEqual({ plates: [20, 1.25], rest: 0 });
    expect(platesPerSide(225, 45, DEFAULT_PLATES.lb.sizes)).toEqual({ plates: [45, 45], rest: 0 });
  });
  it('reports what cannot be loaded', () => {
    expect(platesPerSide(61, kg.bar, kg.sizes)).toEqual({ plates: [20], rest: 1 });
    expect(platesPerSide(15, kg.bar, kg.sizes)).toEqual({ plates: [], rest: 0 });
    expect(platesPerSide(20, kg.bar, kg.sizes)).toEqual({ plates: [], rest: 0 });
  });
});

describe('warm-up', () => {
  const kg = DEFAULT_PLATES.kg;
  it('ramps from the bar in loadable steps', () => {
    expect(loadStep(kg.sizes)).toBe(2.5);
    expect(warmup(140, kg.bar, kg.sizes)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 55, reps: 5 },
      { weight: 82.5, reps: 3 },
      { weight: 110, reps: 2 },
    ]);
  });
  it('drops steps that would repeat the bar for light weights', () => {
    expect(warmup(30, kg.bar, kg.sizes)).toEqual([{ weight: 20, reps: 10 }, { weight: 22.5, reps: 2 }]);
    expect(warmup(20, kg.bar, kg.sizes)).toEqual([]);
  });
});

describe('limits (review: no freezes)', () => {
  it('stops at MAX_PLATES per side and reports the rest', () => {
    const r = platesPerSide(99_999_999, 20, DEFAULT_PLATES.kg.sizes);
    expect(r.plates.length).toBe(MAX_PLATES);
    expect(r.rest).toBeGreaterThan(0);
    expect(platesPerSide(100, 20, [0.0001]).plates).toEqual([]); // below the smallest allowed plate
  });
  it('cleans a plate set: dedupe, sort, limits', () => {
    expect(cleanPlates(20, [5, 25, 5, 2.5])).toEqual({ bar: 20, sizes: [25, 5, 2.5] });
    expect(cleanPlates(20, [0.1])).toBeNull();
    expect(cleanPlates(500, [20])).toBeNull();
    expect(cleanPlates(20, Array.from({ length: 13 }, (_, i) => i + 1))).toBeNull();
  });
  it('validates plates in backups with the same limits', () => {
    const b = (plates: unknown) => validateBackup({ app: 'iron-notes', version: 1, categories: [], exercises: [], sets: [], settings: { plates } });
    expect(b({ unit: 'kg', bar: 20, sizes: [20, 10, 10] }).settings.plates).toEqual({ unit: 'kg', bar: 20, sizes: [20, 10] });
    expect(b({ unit: 'kg', bar: 20, sizes: [0.0001] }).settings.plates).toBeUndefined();
    expect(b({ unit: 'kg', bar: 20, sizes: [] }).settings.plates).toBeUndefined();
    expect(b({ unit: 'st', bar: 20, sizes: [20] }).settings.plates).toBeUndefined();
  });
});

describe('snapping to plates', () => {
  const kg = { bar: 20, sizes: [25, 20, 15, 10, 5, 2.5, 1.25] };
  it('the closest loadable weight; ties to the lighter one; the bar for anything lighter', () => {
    expect(snapToPlates(101, kg.bar, kg.sizes)).toBe(100);
    expect(snapToPlates(101.5, kg.bar, kg.sizes)).toBe(102.5);
    expect(snapToPlates(101.25, kg.bar, kg.sizes)).toBe(100); // tie
    expect(snapToPlates(82.5, kg.bar, kg.sizes)).toBe(82.5);
    expect(snapToPlates(15, kg.bar, kg.sizes)).toBe(20);
  });
  it('a home set without small plates: steps of 10 kg', () => {
    expect(snapToPlates(92.5, 20, [20, 10, 5])).toBe(90);
    expect(snapToPlates(96, 20, [20, 10, 5])).toBe(100);
  });
  it('barbell lifts by name', () => {
    expect(usesPlatesByName('Flat Barbell Bench Press')).toBe(true);
    expect(usesPlatesByName('Romanian Deadlift')).toBe(true);
    expect(usesPlatesByName('Cable Pushdown')).toBe(false);
    expect(usesPlatesByName('Leg Press')).toBe(false);
  });
});

