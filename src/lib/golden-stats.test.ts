// Golden fixtures for analysis.ts (Statistics) and review.ts (cycle review): the web logic's answers,
// checked by native/core-rs/tests/golden_stats.rs. Regenerate with UPDATE_GOLDEN=1.
import { describe, it } from 'vitest';
import { bodyWeightAt, loadOf, withRealLoad } from './load';
import { periodStart, summarize, weekOf, type Period } from './analysis';
import { alternatives, exerciseChanges, reviewRange, soreness, swapInRoutine, toSwap } from './review';
import type { BodyEntry, Exercise, MuscleId, Routine, WorkoutSet } from './model';
import { golden, plain } from './golden-fixtures';

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

const ex = (id: string, categoryId: string, type: Exercise['type'], x: Partial<Exercise> = {}): Exercise => ({ id, name: id, categoryId, type, ...x });
const EXS: Exercise[] = [
  ex('bench', 'chest', 'weight,reps', { muscles: { primary: ['chest'], secondary: ['triceps', 'frontDelts'] }, favorite: true }),
  ex('incline', 'chest', 'weight,reps', { muscles: { primary: ['chest'], secondary: ['triceps'] } }),
  ex('Fly', 'chest', 'weight,reps', { muscles: { primary: ['chest'], secondary: [] }, favorite: true }),
  ex('dip', 'chest', 'reps', { muscles: { primary: ['chest'], secondary: [] } }),
  ex('squat', 'legs', 'weight,reps', { muscles: { primary: ['quads'], secondary: ['glutes'] }, joint: true }),
  ex('legpress', 'legs', 'weight,reps', { muscles: { primary: ['quads'], secondary: [] } }),
  ex('pullup', 'back', 'weight,reps', { load: 'bodyweight', muscles: { primary: ['lats'], secondary: ['biceps'] } }),
  ex('assdip', 'back', 'weight,reps', { load: 'assisted', muscles: { primary: ['lats'], secondary: [] } }),
  ex('dbrow', 'back', 'weight,reps', { load: 'perHand', muscles: { primary: ['lats'], secondary: ['biceps'] } }),
  ex('run', 'cardio', 'distance,time'),
  ex('plank', 'abs', 'time', { muscles: { primary: ['abs'], secondary: [] } }),
  ex('curl', 'arms', 'weight,reps', { muscles: { primary: ['biceps'], secondary: ['forearms'] } }),
  ex('nomuscle', 'arms', 'weight,reps'),
];
const byId = (id: string) => EXS.find((e) => e.id === id);
const BW: BodyEntry[] = [
  { id: 'b1', metricId: 'w', date: '2026-01-10', value: 82, at: 1 },
  { id: 'b2', metricId: 'w', date: '2026-02-20', value: 80, at: 2 },
  { id: 'b3', metricId: 'w', date: '2026-03-15', value: 78, at: 0 },
];
const DATES = ['2025-12-29', '2026-01-04', '2026-01-05', '2026-01-12', '2026-01-14', '2026-02-02', '2026-02-09', '2026-02-18', '2026-03-02', '2026-03-11', '2026-03-23', '2026-04-06'];
const IDS = ['bench', 'bench', 'bench', 'incline', 'Fly', 'dip', 'squat', 'squat', 'legpress', 'pullup', 'assdip', 'dbrow', 'run', 'plank', 'curl', 'nomuscle', 'ghost'];

let nid = 0;
function history(seed: number, count: number): WorkoutSet[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const sets: WorkoutSet[] = [];
  for (let i = 0; i < count; i++) {
    const exerciseId = pick(IDS);
    const type = byId(exerciseId)?.type ?? 'weight,reps';
    const s: WorkoutSet = { id: `s${seed}-${i}`, date: pick(DATES), exerciseId, order: ++nid };
    if (type.includes('weight')) s.weight = pick([0, 20, 40, 60, 62.5, 80, 100, 102.5]);
    if (type.includes('reps')) s.reps = pick([0, 1, 3, 5, 8, 8, 10, 12, 15]);
    if (type.includes('distance')) s.distance = pick([1, 2.5, 5, 10]);
    if (type.includes('time')) s.time = pick([30, 60, 300, 1800]);
    if (r() < 0.1) s.planned = true;
    if (r() < 0.15) s.sore = pick([0, 1, 2]);
    sets.push(s);
  }
  return sets;
}
const mk = (date: string, exerciseId: string, weight: number | undefined, reps: number | undefined, x: Partial<WorkoutSet> = {}): WorkoutSet => {
  const s: WorkoutSet = { id: `m${++nid}`, date, exerciseId, order: nid };
  if (weight !== undefined) s.weight = weight;
  if (reps !== undefined) s.reps = reps;
  return Object.assign(s, x);
};

describe('golden: stats', () => {
  it('analysis matches the fixture', () => {
    const cases: unknown[] = [];
    const periods: Period[] = ['week', 'month', '3m', 'year', 'all'];
    for (const p of periods) for (const today of ['2026-03-15', '2026-01-03', '2024-03-01', '2026-12-31']) cases.push({ fn: 'periodStart', period: p, today, out: periodStart(p, today) });
    for (const d of ['2026-01-04', '2026-01-05', '2026-01-11', '2026-01-12', '2024-02-29', '2025-12-31', '2026-03-29'])
      for (const ws of [0, 1] as const) cases.push({ fn: 'weekOf', date: d, weekStart: ws, out: weekOf(d, ws) });

    const runs: { sets: WorkoutSet[]; from: string; to: string; ws: 0 | 1; formula: 'epley' | 'brzycki'; bw: BodyEntry[] | null }[] = [];
    for (let k = 0; k < 8; k++) {
      const sets = history(100 + k, 40 + k * 10);
      runs.push({ sets, from: k % 2 ? '' : '2026-01-01', to: '2026-04-30', ws: (k % 2) as 0 | 1, formula: k % 3 ? 'epley' : 'brzycki', bw: k % 4 === 3 ? null : BW });
    }
    const A = [mk('2026-03-02', 'bench', 60, 8), mk('2026-03-02', 'bench', 80, 5), mk('2026-03-09', 'bench', 85, 5), mk('2026-03-16', 'bench', 100, 3), mk('2026-03-16', 'bench', 90, 5), mk('2026-03-02', 'plank', undefined, undefined, { time: 90 }), mk('2026-03-09', 'run', undefined, undefined, { distance: 5, time: 1500 })];
    runs.push({ sets: A, from: '2026-03-01', to: '2026-03-31', ws: 1, formula: 'epley', bw: null });
    runs.push({ sets: [...A].reverse(), from: '2026-03-01', to: '2026-03-31', ws: 1, formula: 'epley', bw: null }); // other order
    runs.push({ sets: A, from: '', to: '2026-03-31', ws: 0, formula: 'brzycki', bw: null });
    runs.push({ sets: A, from: '2026-03-10', to: '2026-03-12', ws: 1, formula: 'epley', bw: null }); // no workouts, from given
    runs.push({ sets: A, from: '', to: '2025-01-01', ws: 1, formula: 'epley', bw: null }); // nothing at all
    runs.push({ sets: [], from: '', to: '2026-03-31', ws: 1, formula: 'epley', bw: null });
    runs.push({ sets: [mk('2026-03-02', 'ghost', 50, 5), mk('2026-03-03', 'pullup', 10, 8, { planned: true })], from: '', to: '2026-03-31', ws: 1, formula: 'epley', bw: BW });
    runs.push({ sets: [mk('2026-03-02', 'pullup', 10, 8), mk('2026-03-04', 'assdip', 30, 8), mk('2026-03-05', 'dbrow', 20, 10)], from: '', to: '2026-03-31', ws: 1, formula: 'epley', bw: BW });
    for (const r of runs) {
      const at = r.bw ? bodyWeightAt(r.bw) : () => undefined;
      cases.push({ fn: 'summarize', sets: r.sets, exercises: EXS, from: r.from, to: r.to, weekStart: r.ws, formula: r.formula, bw: r.bw, out: plain(summarize(r.sets, byId, r.from, r.to, r.ws, r.formula, at)) });
    }
    golden('analysis', cases);
  });

  it('review matches the fixture', () => {
    const cases: unknown[] = [];
    const cyc = { start: '2026-03-02', weeks: 8 };
    for (const [span, cycle, today] of [
      ['cycle', cyc, '2026-03-20'], ['cycle', cyc, '2026-05-24'], ['cycle', cyc, '2026-06-30'], ['cycle', undefined, '2026-03-20'],
      [4, cyc, '2026-03-20'], [6, undefined, '2026-03-20'], [8, undefined, '2026-01-10'], [4, undefined, '2024-03-10'],
    ] as const)
      cases.push({ fn: 'reviewRange', span, cycle: cycle ?? null, today, out: reviewRange(span, cycle, today) });

    // exerciseChanges: several exercises, trends, bodyweight-only, mixed
    const by = new Map<string, WorkoutSet[]>();
    const add = (s: WorkoutSet) => by.get(s.exerciseId)?.push(s) ?? by.set(s.exerciseId, [s]);
    const days = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'];
    [100, 100, 100, 100, 100].forEach((w, i) => add(mk(days[i], 'bench', w, 5))); // stalled
    [100, 95, 90, 85, 80].forEach((w, i) => add(mk(days[i], 'squat', w, 5))); // weaker
    [40, 42.5, 45, 47.5, 50].forEach((w, i) => add(mk(days[i], 'curl', w, 8))); // up
    [8, 9, 10].forEach((r, i) => add(mk(days[i], 'dip', undefined, r))); // reps scale
    add(mk('2026-03-02', 'Fly', 20, 12)); // one session
    add(mk('2026-03-02', 'incline', 0, 10)); add(mk('2026-03-09', 'incline', 30, 8)); add(mk('2026-03-16', 'incline', 30, 9)); // mixed: weight only counts
    add(mk('2026-03-02', 'legpress', 200, 10, { warmup: true })); // only a warm-up
    add(mk('2026-03-02', 'dbrow', 30, 10)); add(mk('2026-03-09', 'dbrow', 30, 10)); add(mk('2026-03-16', 'dbrow', 30, 10)); add(mk('2026-02-01', 'dbrow', 20, 10)); // before range
    [50, 50, 49, 50].forEach((w, i) => add(mk(days[i], 'assdip', w, 5, i === 3 ? { deload: true } : {})));
    const byArr = [...by].map(([id, list]) => [id, list] as [string, WorkoutSet[]]);
    for (const [from, to, formula] of [['2026-03-01', '2026-03-31', 'epley'], ['2026-03-01', '2026-03-20', 'brzycki'], ['2026-03-10', '2026-03-31', 'epley'], ['2026-06-01', '2026-06-30', 'epley']] as const)
      cases.push({ fn: 'exerciseChanges', byExercise: byArr, from, to, formula, out: plain(exerciseChanges(by, from, to, formula)) });
    // with real load (body weight)
    {
      const bwSets = new Map<string, WorkoutSet[]>([['pullup', [mk('2026-01-12', 'pullup', 0, 8), mk('2026-02-02', 'pullup', 5, 8), mk('2026-03-02', 'pullup', 10, 8), mk('2026-03-23', 'pullup', 10, 10)]]]);
      const real = new Map([...bwSets].map(([id, l]) => [id, withRealLoad(l, loadOf(byId(id)), bodyWeightAt(BW)).map(({ vol: _v, ...s }) => s as WorkoutSet)]));
      cases.push({ fn: 'exerciseChanges', byExercise: [...real], from: '2026-01-01', to: '2026-03-31', formula: 'epley', out: plain(exerciseChanges(real, '2026-01-01', '2026-03-31', 'epley')) });
    }

    // soreness
    const ss = [
      mk('2026-03-02', 'bench', 80, 5, { sore: 0 }), mk('2026-03-09', 'bench', 80, 5, { sore: 2 }), mk('2026-03-16', 'bench', 80, 5, { sore: 2 }),
      mk('2026-03-09', 'squat', 80, 5, { sore: 1 }), mk('2026-03-09', 'dbrow', 80, 5), mk('2026-03-10', 'curl', 80, 5, { sore: 1 }),
      mk('2026-02-01', 'bench', 80, 5, { sore: 2 }), mk('2026-03-12', 'nomuscle', 80, 5, { sore: 2 }), mk('2026-03-12', 'ghost', 80, 5, { sore: 2 }), mk('2026-03-12', 'run', 1, 1, { sore: 0 }),
    ];
    const musclesOf = (id: string) => byId(id)?.muscles;
    for (const [from, to] of [['2026-03-01', '2026-03-31'], ['2026-03-09', '2026-03-09'], ['2026-04-01', '2026-04-30']])
      cases.push({ fn: 'soreness', sets: ss, exercises: EXS, from, to, out: plain(soreness(ss, musclesOf, from, to) as Map<MuscleId, [number, number, number]>) });

    // toSwap
    const changes = exerciseChanges(by, '2026-03-01', '2026-03-31', 'epley');
    for (const c of changes) for (const e of [byId(c.exerciseId), undefined]) cases.push({ fn: 'toSwap', change: plain(c), exercise: e ?? null, out: toSwap(c, e) });
    const base = { exerciseId: 'x', first: 100, last: 100, kind: 'load' as const, sessions: 3, trend: 'up' as const };
    for (const c of [{ ...base, change: 0 }, { ...base, change: -0.01 }, { ...base, change: 0.02 }, { ...base, change: null }, { ...base, change: 0, sessions: 2 }, { ...base, change: 0.1, trend: 'weaker' as const }, { ...base, change: 0.1, trend: 'stalled' as const }, { ...base, change: 0.1, trend: 'none' as const }])
      cases.push({ fn: 'toSwap', change: c, exercise: byId('bench'), out: toSwap(c, byId('bench')) });

    // alternatives
    for (const id of ['bench', 'incline', 'squat', 'dbrow', 'nomuscle', 'run', 'dip'])
      for (const [exclude, n] of [[[], 3], [['Fly'], 3], [['Fly', 'incline'], 1], [[], 0], [[], 10]] as const) {
        const e = byId(id)!;
        cases.push({ fn: 'alternatives', exercise: e, library: EXS, exclude, n, out: alternatives(e, EXS, new Set(exclude), n).map((x) => x.id) });
      }
    // names that sort by case / digits
    {
      const lib = ['b curl', 'A curl', 'a curl', 'Curl 2', 'curl 10', 'Zottman', 'ez bar curl'].map((name, i) => ex(`n${i}`, 'arms', 'weight,reps', { name, muscles: { primary: ['biceps'], secondary: [] } }));
      const all = [...lib, byId('curl')!];
      cases.push({ fn: 'alternatives', exercise: byId('curl'), library: all, exclude: [], n: 10, out: alternatives(byId('curl')!, all, new Set(), 10).map((x) => x.id) });
    }

    // swapInRoutine
    const routine: Routine = {
      id: 'r', name: 'R', order: 1,
      days: [
        { id: 'd1', name: 'A', items: [{ exerciseId: 'bench', sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }], group: 'g' }, { exerciseId: 'curl', sets: [{ weight: 20, reps: 10 }] }] },
        { id: 'd2', name: 'B', items: [{ exerciseId: 'bench', sets: [{ reps: 5 }] }, { exerciseId: 'run', sets: [{ distance: 5, time: 1500 }] }] },
        { id: 'd3', name: 'C', items: [] },
      ],
    };
    for (const [from, to] of [['bench', 'incline'], ['curl', 'Fly'], ['nope', 'incline'], ['run', 'plank']])
      cases.push({ fn: 'swapInRoutine', routine, from, to, out: swapInRoutine(routine, from, to) });
    golden('review', cases);
  });
});
