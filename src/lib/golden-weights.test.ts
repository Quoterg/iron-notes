// Golden fixtures for the weights-and-records modules (calc.ts records, load.ts, tools.ts, feedback.ts):
// the web logic's answers, checked by native/core-rs/tests/golden_weights.rs. Regenerate with UPDATE_GOLDEN=1.
import { describe, it } from 'vitest';
import { byOrder, dayTotals, isComplete, previousWorkout, recordIds } from './calc';
import { bodyWeightAt, loadOf, LOAD_TYPES, needsBodyWeight, realLoad, usesBodyWeight, volumeWeight, withRealLoad } from './load';
import { causeOf, daysBetween, isCutting, longestGap, sessions, stalledAdvice, trendOf, weakerAdvice, weeklyRate, type Session } from './feedback';
import {
  cleanPlates, DEFAULT_PLATES, estimate, loadStep, percentTable, platesPerSide, platesToStore, plateConfig, roundsToPlates, snapperFor, snapToPlates,
  usesPlatesByName, warmup, weightForReps,
} from './tools';
import type { BodyEntry, Exercise, ExerciseType, LoadType, WorkoutSet } from './model';
import { golden, j, plain } from './golden-fixtures';

// ---- deterministic inputs ----
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TYPES: ExerciseType[] = ['weight,reps', 'weight,distance', 'weight,time', 'reps,distance', 'reps,time', 'distance,time', 'weight', 'reps', 'distance', 'time'];
const DATES = ['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19', '2026-02-02', '2026-02-09', '2026-02-16', '2026-03-02', '2026-03-09', '2026-03-23', '2026-04-06'];
const WEIGHTS = [undefined, 0, 20, 40, 40, 60, 60, 62.5, 80, 80, 100, 100, 102.5, 140];
const REPS = [undefined, 0, 1, 3, 5, 5, 8, 8, 10, 10, 12, 15, 20];
const DISTS = [undefined, 0, 1, 2.5, 5, 5, 10, 21.1];
const TIMES = [undefined, 0, 30, 60, 60, 90, 300, 1800];

/** A shuffled history of one exercise: ties, zeros, missing fields, planned / warm-up / deload sets. */
function history(seed: number, count: number, tag = 's'): WorkoutSet[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const sets: WorkoutSet[] = [];
  for (let i = 0; i < count; i++) {
    const s: WorkoutSet = { id: `${tag}${seed}-${i}`, date: pick(DATES), exerciseId: 'x', order: 1000 + Math.floor(i / 2) * 3 + (r() < 0.3 ? 0 : 1) };
    const w = pick(WEIGHTS), rp = pick(REPS), d = pick(DISTS), t = pick(TIMES);
    if (w !== undefined) s.weight = w;
    if (rp !== undefined) s.reps = rp;
    if (d !== undefined) s.distance = d;
    if (t !== undefined) s.time = t;
    if (r() < 0.08) s.planned = true;
    if (r() < 0.1) s.warmup = true;
    if (r() < 0.06) s.deload = true;
    if (r() < 0.1) s.sore = Math.floor(r() * 3);
    if (r() < 0.05) s.rir = 2;
    sets.push(s);
  }
  // shuffle (Fisher-Yates)
  for (let i = sets.length - 1; i > 0; i--) {
    const k = Math.floor(r() * (i + 1));
    [sets[i], sets[k]] = [sets[k], sets[i]];
  }
  return sets;
}
const sortedBy = (sets: WorkoutSet[]) => [...sets].sort(byOrder);
let nid = 0;
const mk = (date: string, weight: number | undefined, reps: number | undefined, x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: `m${++nid}`, date, exerciseId: 'x', order: nid, weight, reps, ...x });
const clean = (s: unknown) => JSON.parse(JSON.stringify(s));

const BW: BodyEntry[] = [
  { id: 'b1', metricId: 'w', date: '2026-01-01', value: 82, at: 1 },
  { id: 'b2', metricId: 'w', date: '2026-02-01', value: 80, at: 2 },
  { id: 'b3', metricId: 'w', date: '2026-02-01', value: 79.5, at: 5 },
  { id: 'b4', metricId: 'w', date: '2026-03-01', value: 0, at: 3 },
  { id: 'b5', metricId: 'w', date: '2026-03-15', value: 78, at: 0 },
];

describe('golden: records', () => {
  it('matches the fixture', () => {
    const cases: unknown[] = [];
    // byOrder
    for (let k = 0; k < 6; k++) {
      const sets = history(100 + k, 14);
      cases.push({ fn: 'sortIds', sets, out: sets.slice().sort(byOrder).map((s) => s.id) });
    }
    cases.push({ fn: 'sortIds', sets: [mk('2026-01-02', 1, 1, { order: 5 }), mk('2026-01-01', 1, 1, { order: 9 }), mk('2026-01-02', 1, 1, { order: 5 }), mk('2026-01-02', 1, 1, { order: 2 })].map(clean), out: [] });
    {
      const sets = cases[cases.length - 1] as { sets: WorkoutSet[]; out: string[] };
      sets.out = sets.sets.slice().sort(byOrder).map((s) => s.id);
    }
    // recordIds on every type, several histories each, sorted and unsorted
    for (const type of TYPES) {
      for (let k = 0; k < 4; k++) {
        const sets = history(200 + k * 7 + TYPES.indexOf(type), 8 + k * 4);
        cases.push({ fn: 'recordIds', type, sorted: false, sets, out: plain(recordIds(sets, type)) });
        const pre = sortedBy(sets);
        if (k % 2) cases.push({ fn: 'recordIds', type, sorted: true, sets: pre, out: plain(recordIds(pre, type, true)) });
      }
    }
    // hand-made weight,reps cases
    const hand: [string, WorkoutSet[]][] = [
      ['ladder', [mk('2026-01-01', 100, 5), mk('2026-01-02', 90, 8), mk('2026-01-03', 80, 10), mk('2026-01-04', 110, 3)]],
      ['dominated', [mk('2026-01-01', 100, 5), mk('2026-01-02', 90, 5), mk('2026-01-03', 100, 6)]],
      ['tie keeps first', [mk('2026-01-01', 100, 5), mk('2026-01-02', 100, 5)]],
      ['equal weight more reps', [mk('2026-01-01', 100, 5), mk('2026-01-02', 100, 8)]],
      ['planned and warmup', [mk('2026-01-01', 200, 5, { planned: true }), mk('2026-01-02', 190, 5, { warmup: true }), mk('2026-01-03', 100, 5)]],
      ['zero weight', [mk('2026-01-01', 0, 15), mk('2026-01-02', 50, 5)]],
      ['no reps', [mk('2026-01-01', 50, undefined), mk('2026-01-02', 50, 0), mk('2026-01-03', 50, -3)]],
      ['empty', []],
    ];
    for (const [name, sets] of hand) {
      for (const type of ['weight,reps', 'weight', 'reps'] as ExerciseType[]) cases.push({ fn: 'recordIds', name, type, sorted: false, sets: clean(sets), out: plain(recordIds(sets, type)) });
    }
    // load-mapped copies (0 kg counts where `vol` is set)
    for (const lt of ['total', 'perHand', 'bodyweight', 'assisted'] as LoadType[]) {
      for (let k = 0; k < 4; k++) {
        const sets = history(300 + k, 10);
        const real = withRealLoad(sets, lt, bodyWeightAt(k % 2 ? BW : []));
        cases.push({ fn: 'recordIds', type: 'weight,reps', sorted: false, sets, loadType: lt, bw: k % 2 ? BW : [], out: plain(recordIds(real, 'weight,reps')) });
      }
    }
    // previousWorkout
    for (let k = 0; k < 4; k++) {
      const sets = history(400 + k, 14);
      for (const date of ['2026-01-01', '2026-01-06', '2026-02-10', '2027-01-01', DATES[k + 2]]) {
        cases.push({ fn: 'previousWorkout', sets, date, out: previousWorkout(sets, date).map((s) => s.id) });
      }
    }
    cases.push({ fn: 'previousWorkout', sets: [], date: '2026-01-01', out: [] });
    // isComplete
    const V = [undefined, 0, 5, 2.5, -1];
    for (const type of TYPES) {
      for (const a of V) for (const b of V) {
        const s: WorkoutSet = { id: 'c', date: '2026-01-01', exerciseId: 'x', order: 1 };
        const fs = type.split(',');
        const vals = [a, b];
        fs.forEach((f, i) => { if (vals[i] !== undefined) (s as unknown as Record<string, number>)[f] = vals[i]!; });
        // the other fields are set too (noise): they must not matter
        if (!fs.includes('weight')) s.weight = 100;
        if (!fs.includes('reps')) s.reps = 0;
        cases.push({ fn: 'isComplete', type, set: s, out: isComplete(s, type) });
      }
    }
    // dayTotals
    for (let k = 0; k < 8; k++) {
      const sets = history(500 + k, k * 2);
      cases.push({ fn: 'dayTotals', sets, out: dayTotals(sets) });
      for (const lt of ['perHand', 'bodyweight', 'assisted'] as LoadType[]) cases.push({ fn: 'dayTotals', sets, loadType: lt, out: dayTotals(sets, (s) => volumeWeight(s.weight, lt)) });
    }
    golden('records', cases);
  });
});

describe('golden: load', () => {
  it('matches the fixture', () => {
    const cases: unknown[] = [];
    const num = (x: number | undefined) => (x === undefined ? undefined : j(x));
    // bodyWeightAt
    const sets: BodyEntry[][] = [
      BW,
      [],
      [{ id: 'z', metricId: 'w', date: '2026-01-01', value: 0, at: 0 }],
      [BW[4], BW[0], BW[2], BW[1]],
      [{ id: 'a', metricId: 'w', date: '2026-01-01', value: 70, at: 3 }, { id: 'b', metricId: 'w', date: '2026-01-01', value: 71, at: 3 }, { id: 'c', metricId: 'w', date: '2026-01-01', value: 72, at: 1 }],
    ];
    const dates = ['2025-12-31', '2026-01-01', '2026-01-15', '2026-02-01', '2026-02-02', '2026-03-01', '2026-03-15', '2026-12-31'];
    for (const entries of sets) {
      const at = bodyWeightAt(entries);
      cases.push({ fn: 'bodyWeightAt', entries, dates, out: dates.map((d) => plain(at(d)) ?? null) });
    }
    // realLoad / volumeWeight grids
    const ws = [undefined, 0, 20, 30, 100, -5, 0.5, NaN];
    const bws = [undefined, 0, 80, 55.5, NaN];
    for (const t of LOAD_TYPES) {
      for (const w of ws) {
        cases.push({ fn: 'volumeWeight', weight: num(w), t, out: j(volumeWeight(w, t)) });
        for (const bw of bws) cases.push({ fn: 'realLoad', weight: num(w), t, bw: num(bw), out: plain(realLoad(w, t, bw)) ?? null });
      }
      cases.push({ fn: 'usesBodyWeight', t, out: usesBodyWeight(t) });
    }
    // loadOf, needsBodyWeight
    for (const load of [undefined, 'total', 'perHand', 'bodyweight', 'assisted'] as (LoadType | undefined)[]) cases.push({ fn: 'loadOf', load, out: loadOf(load ? ({ load } as Exercise) : undefined) });
    cases.push({ fn: 'loadOf', out: loadOf(undefined), noExercise: true });
    for (const t of LOAD_TYPES) for (const entries of [BW, []]) for (const date of ['2026-01-10', '2025-01-01']) {
      cases.push({ fn: 'needsBodyWeight', t, entries, date, out: needsBodyWeight(t, bodyWeightAt(entries), date) });
    }
    // withRealLoad
    for (const t of LOAD_TYPES) {
      for (let k = 0; k < 5; k++) {
        const hs = history(600 + k, 8);
        const entries = k % 3 === 0 ? [] : BW;
        cases.push({ fn: 'withRealLoad', t, sets: hs, bw: entries, out: plain(withRealLoad(hs, t, bodyWeightAt(entries))) });
      }
    }
    // and the same-array case
    cases.push({ fn: 'withRealLoad', t: 'total', sets: [], bw: [], out: [] });
    golden('load', cases);
  });
});

const PSETS: { name: string; bar: number; sizes: number[] }[] = [
  { name: 'kg', ...DEFAULT_PLATES.kg, sizes: [...DEFAULT_PLATES.kg.sizes] },
  { name: 'lb', ...DEFAULT_PLATES.lb, sizes: [...DEFAULT_PLATES.lb.sizes] },
  { name: 'home', bar: 20, sizes: [20, 10, 5] },
  { name: 'odd', bar: 15, sizes: [7, 3] },
  { name: 'small', bar: 10, sizes: [1.25] },
  { name: 'unsorted', bar: 20, sizes: [2.5, 25, 5, 10, 1.25] },
  { name: 'tiny', bar: 20, sizes: [0.1] },
  { name: 'empty', bar: 20, sizes: [] },
  { name: 'zeroBar', bar: 0, sizes: [20, 10] },
  { name: 'zeroPlate', bar: 20, sizes: [0, 5] },
];

describe('golden: tools', () => {
  it('matches the fixture', () => {
    const cases: unknown[] = [];
    // 1RM maths
    for (const f of ['epley', 'brzycki'] as const) {
      for (const orm of [0, 1, 100, 133.33, 250, -5, NaN]) for (const reps of [0, 1, 2, 5, 12, 36, 37, 40, -1]) {
        cases.push({ fn: 'weightForReps', orm: j(orm), reps, formula: f, out: j(weightForReps(orm, reps, f)) });
      }
      for (const orm of [0, 1, 80, 100, 143.7, 300, -10, NaN]) cases.push({ fn: 'percentTable', orm: j(orm), formula: f, out: plain(percentTable(orm, f)) });
      for (const w of [0, 20, 100, 142.5]) for (const reps of [0, 1, 3, 10, 36, 37, 50]) cases.push({ fn: 'estimate', weight: w, reps, formula: f, out: j(estimate(w, reps, f)) });
    }
    // platesPerSide / snapToPlates / warmup / loadStep on many plate sets and targets
    const loadables: number[] = [];
    for (const ps of PSETS) {
      const targets = new Set<number>([-5, 0, 10, ps.bar - 0.001, ps.bar, ps.bar + 0.001, ps.bar + 1, ps.bar + 2.4, 30, 50, 61, 62.5, 82.5, 92.5, 96, 100, 101, 101.25, 101.5, 102.5, 140, 143.3, 225, 315, 500, 2000]);
      for (let w = ps.bar; w <= ps.bar + 80; w += 2.5) { targets.add(w); targets.add(w + 0.001); targets.add(w - 0.001); targets.add(w + 1e-7); targets.add(w - 1e-7); targets.add(w + 0.6); }
      const list = [...targets];
      for (const t of list.slice(0, 60)) cases.push({ fn: 'platesPerSide', target: t, bar: ps.bar, sizes: ps.sizes, out: plain(platesPerSide(t, ps.bar, ps.sizes)) });
      for (const t of list.filter((_, i) => i < 26 || i % 6 === 0)) for (const up of [false, true]) cases.push({ fn: 'snapToPlates', target: t, bar: ps.bar, sizes: ps.sizes, up, out: j(snapToPlates(t, ps.bar, ps.sizes, up)) });
      for (const t of [0, 15, 20, 25, 30, 40, 60, 100, 140, 142.5, 200, 315, 1000, 99999]) cases.push({ fn: 'warmup', target: t, bar: ps.bar, sizes: ps.sizes, out: plain(warmup(t, ps.bar, ps.sizes)) });
      cases.push({ fn: 'loadStep', sizes: ps.sizes, out: j(loadStep(ps.sizes)) });
      loadables.push(ps.bar);
    }
    for (const t of [NaN, Infinity, -Infinity, 99_999_999]) {
      cases.push({ fn: 'platesPerSide', target: j(t), bar: 20, sizes: [25, 20, 15, 10, 5, 2.5, 1.25], out: plain(platesPerSide(t, 20, [25, 20, 15, 10, 5, 2.5, 1.25])) });
      cases.push({ fn: 'snapToPlates', target: j(t), bar: 20, sizes: [25, 20, 15, 10, 5, 2.5, 1.25], up: false, out: j(snapToPlates(t, 20, [25, 20, 15, 10, 5, 2.5, 1.25])) });
      cases.push({ fn: 'warmup', target: j(t), bar: 20, sizes: [25, 20, 15, 10, 5, 2.5, 1.25], out: plain(warmup(t, 20, [25, 20, 15, 10, 5, 2.5, 1.25])) });
    }
    cases.push({ fn: 'platesPerSide', target: 100, bar: 20, sizes: [0.0001], out: plain(platesPerSide(100, 20, [0.0001])) });
    cases.push({ fn: 'platesPerSide', target: 1000, bar: 20, sizes: [0.25], out: plain(platesPerSide(1000, 20, [0.25])) });
    // cleanPlates
    const cleanIn: [number, number[]][] = [
      [20, [5, 25, 5, 2.5]], [20, [0.1]], [500, [20]], [20, Array.from({ length: 13 }, (_, i) => i + 1)], [20, Array.from({ length: 12 }, (_, i) => i + 1)],
      [-1, [5]], [0, [5]], [100, [100]], [100.5, [5]], [20, []], [20, [101, 5]], [20, [0.25, 0.24]], [NaN, [5]], [20, [NaN, 5, Infinity]], [Infinity, [5]], [20, [1.25, 1.25, 1.25]],
    ];
    for (const [bar, sizes] of cleanIn) cases.push({ fn: 'cleanPlates', bar: j(bar), sizes: sizes.map(j), out: plain(cleanPlates(bar, sizes)) ?? null });
    // names
    for (const name of ['Flat Barbell Bench Press', 'Romanian Deadlift', 'Cable Pushdown', 'Leg Press', 'Back SQUAT', 'Hip Thrust', 'Close Grip Bench Press', 'Close-grip bench', 'Barbell', '', 'Dumbbell Curl', 'DEADLIFT', 'Hip  Thrust', 'Sumo Dead lift', 'Squats'])
      cases.push({ fn: 'usesPlatesByName', name, out: usesPlatesByName(name) });
    for (const name of ['Back Squat', 'Cable Row']) for (const choice of [undefined, true, false]) cases.push({ fn: 'platesToStore', name, choice, out: platesToStore(choice, name) ?? null });
    // plateConfig, roundsToPlates, snapperFor
    const stored = { unit: 'lb' as const, bar: 45, sizes: [45, 25, 10, 5] };
    const storedKg = { unit: 'kg' as const, bar: 15, sizes: [20, 10, 5, 1] };
    for (const unit of ['kg', 'lb'] as const) for (const plates of [undefined, stored, storedKg]) cases.push({ fn: 'plateConfig', unit, plates, out: plain(plateConfig({ unit, plates })) });
    const exs: Pick<Exercise, 'name' | 'load' | 'plates' | 'type'>[] = [
      { name: 'Flat Barbell Bench Press', type: 'weight,reps' },
      { name: 'Cable Pushdown', type: 'weight,reps' },
      { name: 'Flat Barbell Bench Press', type: 'weight,reps', plates: false },
      { name: 'Cable Row', type: 'weight,reps', plates: true },
      { name: 'Dumbbell Curl', type: 'weight,reps', load: 'perHand' },
      { name: 'Back Squat', type: 'weight,reps', load: 'bodyweight' },
      { name: 'Back Squat', type: 'weight,reps', load: 'assisted' },
      { name: 'Back Squat', type: 'weight,reps', load: 'total' },
      { name: 'Barbell Row', type: 'reps' },
      { name: 'Barbell Carry', type: 'weight,distance' },
      { name: 'Deadlift Hold', type: 'weight,time' },
      { name: 'Barbell Run', type: 'distance,time' },
      { name: 'Squat', type: 'weight' },
      { name: 'Squat', type: 'time' },
    ];
    const kgTargets = [0, 20, 31, 41, 62.4, 101, 102.4, 142.3, 220.5];
    for (const unit of ['kg', 'lb'] as const) for (const roundPlates of [true, false, undefined]) for (const plates of [undefined, stored, storedKg]) {
      const st = { unit, roundPlates, plates };
      cases.push({ fn: 'roundsToPlates', st, exs, out: [...exs, undefined].map((e) => roundsToPlates(e, st)) });
      for (const ex of [...exs, undefined]) {
        const sn = snapperFor(ex, st);
        cases.push({ fn: 'snapperFor', ex, st, kgs: kgTargets, out: kgTargets.flatMap((k) => [j(sn(k)), j(sn(k, true))]) });
      }
    }
    golden('tools', cases);
  });
});

describe('golden: feedback', () => {
  it('matches the fixture', () => {
    const cases: unknown[] = [];
    // daysBetween
    for (const [a, b] of [['2026-01-01', '2026-01-01'], ['2026-01-01', '2026-01-02'], ['2026-03-01', '2026-02-01'], ['2024-02-28', '2024-03-01'], ['2025-12-31', '2026-01-01'], ['2026-01-01', '2027-01-01']])
      cases.push({ fn: 'daysBetween', a, b, out: j(daysBetween(a, b)) });
    // sessions
    for (let k = 0; k < 24; k++) {
      const sets = history(700 + k, 6 + k * 3);
      const formula = k % 2 ? 'brzycki' : 'epley';
      const since = k % 3 === 0 ? '' : DATES[k % DATES.length];
      cases.push({ fn: 'sessions', sets, formula, since, out: plain(sessions(sets, formula, since)) });
    }
    cases.push({ fn: 'sessions', sets: [], formula: 'epley', since: '', out: [] });
    // trendOf over many score series
    const series: number[][] = [[], [100], [100, 90], [100, 97, 94], [100, 99.8, 99.6], [95, 100, 100, 99.8], [100, 98, 100], [100, 101, 102], [100, 98, 103], [100, 100, 100], [100, 99.5, 99.5], [100, 100.5, 100.5], [100, 100.6, 100.6], [0, 0, 0], [50, 100, 100.5, 100.4, 99], [100, 94, 88, 82, 76]];
    for (let k = 0; k < 30; k++) { const r = rng(900 + k); series.push(Array.from({ length: 3 + (k % 6) }, () => Math.round((80 + r() * 40) * 10) / 10)); }
    const toSessions = (sc: number[]): Session[] => sc.map((score, i) => ({ date: `2026-10-${String(i * 4 + 1).padStart(2, '0')}`, score }));
    for (const sc of series) cases.push({ fn: 'trendOf', list: toSessions(sc), out: trendOf(toSessions(sc)) });
    // causeOf
    for (const gapDays of [0, 4, 10, 10.5, 11, 14]) for (const cutting of [false, true]) for (const othersWeaker of [0, 1, 3]) cases.push({ fn: 'causeOf', gapDays, cutting, othersWeaker, out: causeOf({ gapDays, cutting, othersWeaker }) });
    // longestGap
    const gapList: Session[] = [{ date: '2026-09-01', score: 1 }, { date: '2026-10-01', score: 1 }, { date: '2026-10-15', score: 1 }, { date: '2026-10-19', score: 1 }, { date: '2026-10-20', score: 1 }];
    for (const n of [undefined, 0, 1, 2, 3, 4, 5, 6, 10]) for (let len = 0; len <= 5; len++) cases.push({ fn: 'longestGap', list: gapList.slice(0, len), n, out: j(n === undefined ? longestGap(gapList.slice(0, len)) : longestGap(gapList.slice(0, len), n)) });
    // weeklyRate
    const e = (date: string, value: number): BodyEntry => ({ id: date, metricId: 'w', date, value, at: 0 });
    const rate: [BodyEntry[], string, number | undefined][] = [
      [[e('2026-10-08', 80), e('2026-10-15', 79.4), e('2026-10-22', 78.8), e('2026-10-29', 78.2)], '2026-10-29', undefined],
      [[e('2026-10-28', 80), e('2026-10-29', 79)], '2026-10-29', undefined],
      [[e('2026-10-27', 80), e('2026-10-28', 80), e('2026-10-29', 79)], '2026-10-29', undefined],
      [[e('2026-10-01', 80), e('2026-10-15', 80), e('2026-10-29', 80)], '2026-10-29', undefined],
      [[e('2026-10-01', 80), e('2026-10-15', 81), e('2026-10-29', 82), e('2026-10-30', 0)], '2026-10-29', undefined],
      [[e('2026-09-01', 90), e('2026-10-01', 80), e('2026-10-15', 80), e('2026-10-29', 80)], '2026-10-29', 21],
      [[e('2026-09-01', 90), e('2026-10-01', 80), e('2026-10-15', 80), e('2026-10-29', 80)], '2026-10-29', 60],
      [[e('2026-10-08', 80), e('2026-10-15', 79.4), e('2026-10-22', 78.8), e('2026-10-29', 78.2)], '2026-10-29', 14],
      [[e('2026-10-08', 80), e('2026-10-15', 79.4), e('2026-10-22', 78.8), e('2026-10-29', 78.2)], '2026-10-29', 7],
      [[], '2026-10-29', undefined],
    ];
    for (let k = 0; k < 20; k++) {
      const r = rng(1100 + k);
      const entries: BodyEntry[] = [];
      for (let i = 0; i < 4 + (k % 8); i++) entries.push(e(`2026-10-${String(1 + Math.floor(r() * 29)).padStart(2, '0')}`, Math.round((70 + r() * 20) * 10) / 10));
      rate.push([entries, '2026-10-30', k % 4 === 0 ? 14 : undefined]);
    }
    for (const [entries, today, days] of rate) cases.push({ fn: 'weeklyRate', entries, today, days, out: weeklyRate(entries, today, days) });
    // advice
    for (const lyle of [false, true]) for (const cutting of [false, true]) for (const lastSore of [undefined, 0, 1, 2]) for (const spacing of [3, 6, 7, 10])
      cases.push({ fn: 'stalledAdvice', lyle, cutting, lastSore, spacing, out: stalledAdvice({ lyle, cutting, lastSore, spacing }) });
    for (const cause of ['inconsistent', 'cutting', 'exercise', 'fatigue'] as const) for (const lyle of [false, true]) cases.push({ fn: 'weakerAdvice', cause, lyle, out: weakerAdvice(cause, lyle) });
    for (const diet of [undefined, 'build', 'maintain', 'cut']) for (const r of [null, 0.002, -0.004, -0.005, -0.006, 0]) cases.push({ fn: 'isCutting', diet, rate: r, out: isCutting(diet, r) });
    golden('feedback', cases);
  });
});
