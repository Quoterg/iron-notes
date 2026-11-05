import { describe, expect, it } from 'vitest';
import { oneRM, recordIds } from './calc';
import { bodyWeightAt, realLoad, volumeWeight, withRealLoad } from './load';
import { withDefaultLoads } from './load-defaults';
import type { BodyEntry, Exercise, WorkoutSet } from './model';
import { starterLibrary } from './seed';

const bw = (date: string, value: number, at = 0): BodyEntry => ({ id: date + at, metricId: 'w', date, value, at });
const set = (date: string, weight: number | undefined, reps: number): WorkoutSet => ({ id: date + weight + reps, date, exerciseId: 'e', order: 1, weight, reps });

describe('body weight on a date', () => {
  const at = bodyWeightAt([bw('2026-10-10', 82), bw('2026-10-20', 80), bw('2026-10-20', 79.5, 5), bw('2026-10-30', 0)]);
  it('the latest weigh-in on or before the day; before the first, the first', () => {
    expect(at('2026-10-15')).toBe(82);
    expect(at('2026-10-20')).toBe(79.5); // the later entry that day
    expect(at('2026-11-30')).toBe(79.5); // zero entries ignored
    expect(at('2026-01-01')).toBe(82);
    expect(bodyWeightAt([])('2026-10-15')).toBeUndefined();
  });
});

describe('real load and volume', () => {
  it('per hand: 1RM per hand, volume both hands', () => {
    expect(realLoad(30, 'perHand', 80)).toBe(30);
    expect(volumeWeight(30, 'perHand')).toBe(60);
  });
  it('body weight + added load; added only without a body weight', () => {
    expect(realLoad(20, 'bodyweight', 80)).toBe(100);
    expect(realLoad(undefined, 'bodyweight', 80)).toBe(80); // old reps-only sets: + 0 kg
    expect(realLoad(20, 'bodyweight', undefined)).toBe(20);
    expect(realLoad(undefined, 'bodyweight', undefined)).toBe(0); // body weight alone, no weigh-in: ranked by reps
    expect(volumeWeight(20, 'bodyweight')).toBe(20); // body weight isn't external load
  });
  it('assisted: body weight minus the assistance; unknown without a body weight; no volume', () => {
    expect(realLoad(25, 'assisted', 80)).toBe(55);
    expect(realLoad(100, 'assisted', 80)).toBe(0);
    expect(realLoad(25, 'assisted', undefined)).toBeUndefined();
    expect(volumeWeight(25, 'assisted')).toBe(0);
  });
  it('total: as entered', () => {
    expect(realLoad(100, 'total', 80)).toBe(100);
    expect(volumeWeight(100, 'total')).toBe(100);
  });
});

describe('calculations on real-load copies', () => {
  const at = bodyWeightAt([bw('2026-10-01', 80)]);
  it('weighted dips: e1RM includes body weight; records rank by real load', () => {
    const sets = [set('2026-10-01', 20, 8), set('2026-10-08', undefined, 15)];
    const real = withRealLoad(sets, 'bodyweight', at);
    expect(real[0].weight).toBe(100);
    expect(oneRM(real[0].weight!, 8)).toBeCloseTo(126.67, 1);
    expect(sets[0].weight).toBe(20); // the stored sets are untouched
    expect(recordIds(real, 'weight,reps').size).toBe(2); // 100 × 8 and 80 × 15 are both rep maxes
  });
  it('assisted: less assistance is the heavier set', () => {
    const real = withRealLoad([set('2026-10-01', 30, 8), set('2026-10-08', 20, 8)], 'assisted', at);
    expect(real.map((s) => s.weight)).toEqual([50, 60]);
    expect([...recordIds(real, 'weight,reps')]).toEqual(['2026-10-08208']);
  });
  it('total: the same array (no copies); per hand: volume both hands, load per hand', () => {
    const sets = [set('2026-10-01', 30, 8)];
    expect(withRealLoad(sets, 'total', at)).toBe(sets);
    expect(withRealLoad(sets, 'perHand', at)[0]).toMatchObject({ weight: 30, vol: 60 });
    expect(withRealLoad([set('2026-10-01', 20, 8)], 'bodyweight', at)[0]).toMatchObject({ weight: 100, vol: 20 });
  });
});

describe('starter load types', () => {
  it('dumbbells per hand; body-weight exercises gain an added-load field; edited ones stay', () => {
    const lib = starterLibrary().exercises.map((e): Exercise => ({ ...e, load: undefined, type: ['Dips', 'Pull Up', 'Chin Up', 'Push Up'].includes(e.name) ? 'reps' : e.type }));
    const out = withDefaultLoads(lib);
    const by = (n: string) => out.find((e) => e.name === n);
    expect(by('Dumbbell Curl')).toMatchObject({ load: 'perHand', type: 'weight,reps' });
    expect(by('Dips')).toMatchObject({ load: 'bodyweight', type: 'weight,reps' });
    expect(by('Flat Barbell Bench Press')).toBeUndefined();
    expect(withDefaultLoads([{ ...by('Dips')!, load: 'total' }])).toEqual([]); // the user's choice stays
  });
});
