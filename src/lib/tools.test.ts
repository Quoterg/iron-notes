import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATES, estimate, loadStep, percentTable, platesPerSide, warmup, weightForReps } from './tools';

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
