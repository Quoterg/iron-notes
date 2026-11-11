// Golden fixtures for progress.ts (graph series, rep maxes, bests, workouts, axis scale): the web logic's
// answers, checked by native/core-rs/tests/golden_progress.rs. Regenerate with UPDATE_GOLDEN=1.
import { describe, it } from 'vitest';
import { byOrder } from './calc';
import { bodyWeightAt, withRealLoad } from './load';
import { bestOrm, bests, dailySeries, metricsFor, METRICS, niceScale, rangeStart, repMaxTable, TIME_STEPS, workouts, type Formula, type Metric, type Range } from './progress';
import type { BodyEntry, ExerciseType, LoadType, WorkoutSet } from './model';
import { golden, n, plain } from './golden-fixtures';

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
const METRIC_LIST = Object.keys(METRICS) as Metric[];
const FORMULAS: Formula[] = ['epley', 'brzycki'];
const DATES = ['2025-12-30', '2026-01-05', '2026-01-08', '2026-01-12', '2026-02-02', '2026-02-09', '2026-02-28', '2026-03-02', '2026-03-23', '2026-04-06', '2026-05-18'];
const WEIGHTS = [undefined, 0, 20, 40, 40, 60, 60, 62.5, 80, 80, 100, 100, 102.5, 140];
const REPS = [undefined, 0, 1, 3, 5, 5, 8, 8, 10, 10, 12, 15, 20, 36, 37, 40];
const DISTS = [undefined, 0, 1, 2.5, 5, 5, 10, 21.1];
const TIMES = [undefined, 0, 30, 60, 60, 90, 300, 1800];

/** A history in byOrder order: ties, zeros, missing fields, several sets per day. */
function history(seed: number, count: number): WorkoutSet[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const sets: WorkoutSet[] = [];
  for (let i = 0; i < count; i++) {
    const s: WorkoutSet = { id: `p${seed}-${i}`, date: pick(DATES), exerciseId: 'x', order: 1000 + Math.floor(i / 2) * 3 + (r() < 0.3 ? 0 : 1) };
    const w = pick(WEIGHTS), rp = pick(REPS), d = pick(DISTS), t = pick(TIMES);
    if (w !== undefined) s.weight = w;
    if (rp !== undefined) s.reps = rp;
    if (d !== undefined) s.distance = d;
    if (t !== undefined) s.time = t;
    sets.push(s);
  }
  return sets.sort(byOrder);
}
let nid = 0;
const mk = (date: string, weight: number | undefined, reps: number | undefined, x: Partial<WorkoutSet> = {}): WorkoutSet => {
  const s: WorkoutSet = { id: `m${++nid}`, date, exerciseId: 'x', order: nid };
  if (weight !== undefined) s.weight = weight;
  if (reps !== undefined) s.reps = reps;
  return Object.assign(s, x);
};
const clean = <T,>(s: T): T => JSON.parse(JSON.stringify(s));

const BW: BodyEntry[] = [
  { id: 'b1', metricId: 'w', date: '2026-01-01', value: 82, at: 1 },
  { id: 'b2', metricId: 'w', date: '2026-02-01', value: 80, at: 2 },
  { id: 'b3', metricId: 'w', date: '2026-03-15', value: 78, at: 0 },
];

describe('golden: progress', () => {
  it('matches the fixture', () => {
    const cases: unknown[] = [];

    // metricsFor / metricKind
    for (const type of TYPES) cases.push({ fn: 'metricsFor', type, out: metricsFor(type) });
    for (const m of METRIC_LIST) cases.push({ fn: 'metricKind', metric: m, out: METRICS[m].kind });

    // dailySeries: every metric x formula over several histories (and since cut-offs)
    const sinces = ['', '2026-02-01', '2026-02-28', '2027-01-01'];
    for (let k = 0; k < 6; k++) {
      const sets = history(300 + k, 20);
      for (const metric of METRIC_LIST) {
        for (const formula of FORMULAS) {
          if (formula === 'brzycki' && metric !== 'orm' && k > 1) continue;
          const since = sinces[(k + METRIC_LIST.indexOf(metric)) % sinces.length];
          cases.push({ fn: 'dailySeries', sets: clean(sets), metric, formula, since, out: dailySeries(sets, metric, formula, since) });
        }
      }
    }
    // load-mapped copies (with vol)
    const at = bodyWeightAt(BW);
    for (let k = 0; k < 4; k++) {
      const sets = history(400 + k, 20);
      for (const load of ['perHand', 'bodyweight', 'assisted'] as LoadType[]) {
        const real = withRealLoad(sets, load, at);
        for (const metric of ['volume', 'orm', 'maxWeight', 'totalReps'] as Metric[]) {
          const since = k % 2 ? '2026-01-10' : '';
          cases.push({ fn: 'dailySeries', sets: clean(real), metric, formula: FORMULAS[k % 2], since, out: dailySeries(real, metric, FORMULAS[k % 2], since) });
        }
      }
    }
    // hand-made edge histories
    const edge: WorkoutSet[][] = [
      [],
      [mk('2026-01-01', undefined, undefined)],
      [mk('2026-01-01', 0, 5), mk('2026-01-01', -5, 5)],
      [mk('2026-01-01', 1e308, 5), mk('2026-01-02', 50, 5)],
      [mk('2026-01-01', 1e308, 1e10), mk('2026-01-01', 1e308, 1e10)],
      [mk('2026-01-01', 100, 5, { distance: 5, time: 1500 }), mk('2026-01-01', 100, 5, { distance: 0.5, time: 100 }), mk('2026-01-02', 50, 5, { distance: 5, time: 0 })],
      [mk('2026-01-01', 100, 5, { vol: 200 } as Partial<WorkoutSet>), mk('2026-01-01', 100, 5, { vol: 0 } as Partial<WorkoutSet>), mk('2026-01-02', 100, 5, { vol: 0 } as Partial<WorkoutSet>)],
    ];
    for (const sets of edge) {
      for (const metric of METRIC_LIST) {
        cases.push({ fn: 'dailySeries', sets: clean(sets), metric, formula: 'epley', since: '', out: dailySeries(sets, metric, 'epley', '') });
      }
    }

    // rangeStart
    const todays = ['2026-03-31', '2024-02-29', '2026-01-01', '2028-03-01', '2026-12-31', '2025-03-01', '2026-07-31', '2000-02-29', '2026-05-31'];
    for (const range of ['1m', '3m', '6m', '1y', 'all'] as Range[]) {
      for (const today of todays) cases.push({ fn: 'rangeStart', range, today, out: rangeStart(range, today) });
    }

    // repMaxTable
    for (let k = 0; k < 10; k++) {
      const sets = history(500 + k, 6 + k * 2);
      for (const maxReps of k % 3 === 0 ? [15, 5, 25] : [15]) cases.push({ fn: 'repMaxTable', sets: clean(sets), maxReps, out: repMaxTable(sets, maxReps) });
    }
    const rm: WorkoutSet[][] = [
      [],
      [mk('2026-01-01', 100, 5), mk('2026-01-02', 100, 5)], // tie: earliest
      [mk('2026-01-02', 100, 5, { order: 1 }), mk('2026-01-01', 100, 5, { order: 2 })].sort(byOrder),
      [mk('2026-01-01', 100, 3), mk('2026-01-01', 100, 5), mk('2026-01-02', 100, 8)], // equal weight across reps
      [mk('2026-01-01', 100, 3), mk('2026-01-02', 100, 5, { order: 1 }), mk('2026-01-02', 100, 5, { order: 2 })],
      [mk('2026-01-01', 60, 20), mk('2026-01-02', 50, 30), mk('2026-01-03', 100, 1)], // above maxReps
      [mk('2026-01-01', 60, 14), mk('2026-01-02', 50, 18)],
      [mk('2026-01-01', 60, 5), mk('2026-01-02', 80, 10), mk('2026-01-03', 70, 7)], // gaps
      [mk('2026-01-01', 0, 5), mk('2026-01-02', 50, 0), mk('2026-01-03', undefined, 5), mk('2026-01-03', -5, 5)],
      [mk('2026-01-01', 60, 5.5), mk('2026-01-02', 80, 2)], // fractional reps
      [mk('2026-01-01', 60, 3, { order: 5 }), mk('2026-01-01', 60, 4, { order: 4 })],
    ];
    for (const sets of rm) for (const maxReps of [15, 10, 0, 1]) cases.push({ fn: 'repMaxTable', sets: clean(sets), maxReps, out: repMaxTable(sets, maxReps) });

    // bestOrm
    for (let k = 0; k < 8; k++) {
      const sets = history(600 + k, 4 + k * 2);
      for (const formula of FORMULAS) cases.push({ fn: 'bestOrm', sets: clean(sets), formula, out: bestOrm(sets, formula) });
    }
    for (const sets of [[], [mk('2026-01-01', 100, 5), mk('2026-01-02', 100, 5)], [mk('2026-01-01', 100, 1), mk('2026-01-02', 90, 36), mk('2026-01-03', 90, 37)], [mk('2026-01-01', 0, 5), mk('2026-01-01', 50, 0), mk('2026-01-01', undefined, undefined)]]) {
      for (const formula of FORMULAS) cases.push({ fn: 'bestOrm', sets: clean(sets), formula, out: bestOrm(sets, formula) });
    }

    // bests: every type
    for (const type of TYPES) {
      for (let k = 0; k < 5; k++) {
        const sets = history(700 + k * 11 + TYPES.indexOf(type), 3 + k * 2);
        cases.push({ fn: 'bests', sets: clean(sets), type, out: bests(sets, type) });
      }
      cases.push({ fn: 'bests', sets: [], type, out: [] });
    }
    const bs: WorkoutSet[] = [
      mk('2026-01-01', 100, 5, { distance: 5, time: 1500 }),
      mk('2026-01-02', 100, 5, { distance: 5, time: 1400 }),
      mk('2026-01-03', 100, 6, { distance: 5, time: 1400 }),
      mk('2026-01-04', 0, 0, { distance: 0, time: 0 }),
      mk('2026-01-05', 1e308, 1e308, { distance: 1e-300, time: 1e308 }),
    ];
    for (const type of TYPES) cases.push({ fn: 'bests', sets: clean(bs), type, out: bests(bs, type) });

    // workouts
    for (let k = 0; k < 8; k++) {
      const sets = history(800 + k, k * 4);
      cases.push({ fn: 'workouts', sets: clean(sets), out: workouts(sets) });
    }

    // niceScale
    const pairs: [number | string, number | string][] = [];
    const vals = [-1000, -100, -10, -2.5, -1, -0.5, 0, 0.001, 0.5, 1, 1.5, 2, 3, 5, 7, 10, 12.5, 20, 42, 99, 100, 101, 250, 1000, 1234.5, 5000, 1e5, 1e9, 1e-6, 1e12];
    for (const a of vals) for (const b of vals) if (a <= b || a === 1 || b === 0) pairs.push([a, b]);
    pairs.push([1e300, 1e300], [-1e308, 1e308], [5e-324, 5e-324], [0.1, 0.1000001], [3600, 3601], [60, 61], [0, 7200], [0, 100000]);
    for (const x of ['NaN', 'Infinity', '-Infinity'])
      for (const y of [0, 5, 'NaN', 'Infinity', '-Infinity']) pairs.push([x, y], [y, x]);
    for (const [a, b] of pairs) {
      for (const timeSteps of [false, true]) {
        // fixed steps over a huge span would loop (almost) forever, on the web too
        if (timeSteps && !(Math.max(Math.abs(n(a)), Math.abs(n(b))) <= 1e6 || !Number.isFinite(n(a) + n(b)))) continue;
        const out = niceScale(n(a), n(b), timeSteps ? TIME_STEPS : undefined);
        cases.push({ fn: 'niceScale', min: a, max: b, timeSteps, out: plain(out) });
      }
    }
    // pace/time axes
    for (let lo = 0; lo < 3000; lo += 337) {
      for (const span of [0, 3, 40, 200, 2400, 90000]) {
        cases.push({ fn: 'niceScale', min: lo, max: lo + span, timeSteps: true, out: plain(niceScale(lo, lo + span, TIME_STEPS)) });
      }
    }

    // dailySeries cases over the same sets share them: { sets, runs: [{ metric, formula, since, out }] }
    const grouped: unknown[] = [];
    let cur: { fn: string; sets: string; json: { fn: string; sets: unknown; runs: unknown[] } } | undefined;
    for (const c of cases as { fn: string; sets?: unknown; metric?: string; formula?: string; since?: string; out?: unknown }[]) {
      if (c.fn !== 'dailySeries') {
        grouped.push(c);
        cur = undefined;
        continue;
      }
      const key = JSON.stringify(c.sets);
      if (!cur || cur.sets !== key) {
        cur = { fn: 'dailySeries', sets: key, json: { fn: 'dailySeries', sets: c.sets, runs: [] } };
        grouped.push(cur.json);
      }
      cur.json.runs.push({ metric: c.metric, formula: c.formula, since: c.since, out: c.out });
    }
    golden('progress', grouped.map((c) => plain(c)));
  });
});
