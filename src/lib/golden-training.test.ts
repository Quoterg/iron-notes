// Golden fixtures for the training logic (effective, targets, lyle, cycle, volume): the web logic's
// answers, checked by the Rust core's tests too (native/core-rs/tests/golden_training.rs).
// Regenerate with UPDATE_GOLDEN=1 pnpm exec vitest run src/lib/golden-training.test.ts
import { describe, it } from 'vitest';
import { golden, j, plain } from './golden-fixtures';
import { effectiveReps, estimateRir, isMainSession, muscleTotals, setEffective, window as windowOf } from './effective';
import { dorianTarget, dorianTargets, progressedSets, tooSoon, warmups } from './targets';
import { bestForRange, cycleWeek, lastFirstSet, lyleTarget, repRange } from './lyle';
import { inLight, lightEnd, lightSet, lightTargets, nextProgramDay, phaseOn, progressing, redated } from './cycle';
import { contributions, dayMuscles, GOALS, lastWeeks, periodMuscles, statusOf, weekOf, weekStatus, weeks } from './volume';
import type { MuscleId, Muscles, Routine, TrainingMode, WorkoutSet } from './model';

// ---- deterministic helpers ----
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
let seq = 0;
const set = (x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: String(++seq), date: '2026-10-20', exerciseId: 'bench', order: seq, weight: 100, reps: 8, rir: 0, ...x });

const M: Record<string, Muscles> = {
  bench: { primary: ['chest'], secondary: ['frontDelts', 'triceps'] },
  dips: { primary: ['triceps'], secondary: ['chest', 'frontDelts'] },
  row: { primary: ['lats'], secondary: ['rearDelts', 'biceps'] },
  squat: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'lowerBack', 'abs'] },
  curl: { primary: ['biceps'], secondary: ['forearms'] },
  ohp: { primary: ['frontDelts'], secondary: ['sideDelts', 'triceps'] },
  odd: { primary: ['chest', 'triceps'], secondary: ['triceps', 'lats'] }, // a muscle both primary and secondary
};
const of = (id: string): Muscles | undefined => M[id];
const eff = (mode: string, e1rm: number) => (s: WorkoutSet) => (mode === 'reps' ? (s.warmup ? 0 : (s.reps ?? 0)) : setEffective(s, e1rm).n);
/** Big set lists go in once, as a `dataset` case at the top of a fixture; cases refer to them by name. */
const D: Record<string, WorkoutSet[]> = {};
const reg = (name: string, sets: WorkoutSet[]): string => ((D[name] = sets), name);
const withData = (cases: unknown[]): unknown[] => {
  const data = Object.entries(D).map(([name, sets]) => ({ fn: 'dataset', name, sets }));
  for (const k of Object.keys(D)) delete D[k];
  return [...data, ...cases];
};
const EFFS: [string, number][] = [['reps', 0], ['set', 120], ['set', 0]];

/** A realistic history: 12 weeks, 3–4 sessions a week, a few exercises, warm-ups, RIRs, a lighter week. */
function history(seed: number, start: string, weeksN: number): WorkoutSet[] {
  const r = rng(seed);
  const out: WorkoutSet[] = [];
  const plan: Record<number, string[]> = { 0: ['bench', 'ohp', 'dips'], 2: ['row', 'curl'], 4: ['squat', 'curl'], 5: ['bench', 'row'] };
  let order = 1_000;
  for (let w = 0; w < weeksN; w++) {
    for (const [dow, exs] of Object.entries(plan)) {
      if (r() < 0.12) continue;
      const date = addDays(start, w * 7 + Number(dow));
      for (const ex of exs) {
        const base = { bench: 80, ohp: 50, dips: 0, row: 70, curl: 25, squat: 110 }[ex]!;
        const wt = base ? base + Math.floor(w / 3) * 2.5 : 0;
        if (base && r() < 0.5) out.push({ id: `h${order}`, date, exerciseId: ex, order: order++, weight: wt / 2, reps: 10, warmup: true });
        const sets = 2 + Math.floor(r() * 3);
        for (let k = 0; k < sets; k++) {
          const s: WorkoutSet = { id: `h${order}`, date, exerciseId: ex, order: order++, weight: wt, reps: 5 + Math.floor(r() * 9) };
          const q = r();
          if (q < 0.6) s.rir = Math.floor(r() * 4);
          if (q > 0.9) s.after = 1 + Math.floor(r() * 4);
          if (q > 0.85 && q < 0.9) s.planned = true;
          if (w === 5) s.deload = true;
          if (wt === 0) delete s.weight;
          out.push(s);
        }
      }
    }
  }
  return out;
}

describe('golden: effective', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];
    for (const rm of [-1, 0, 1, 3, 5, 7, 8, 8.5, 9, 10, 12, 20, 30, 40, 100, NaN, Infinity]) cases.push({ fn: 'window', rm: j(rm), out: plain(windowOf(rm)) });
    const repsL = [0, 1, 2, 3, 5, 6, 8, 9, 10, 12, 15, 20, 30, 8.4, -1, NaN];
    const rirL = [0, 1, 2, 3, 4, 5, 6, 2.5, 0.4, -1, NaN];
    const afterL: (number | undefined)[] = [undefined, 0, 1, 3, 2.6, NaN, -2];
    for (const reps of repsL) for (const rir of rirL) for (const after of afterL) {
      if ((reps * 7 + rir * 3 + (after ?? 9)) % 3 !== 0 && !(rir === 0 || rir === 5) && !(Number.isNaN(reps + rir))) continue; // a thinned grid
      cases.push({ fn: 'effectiveReps', reps: j(reps), rir: j(rir), ...(after === undefined ? {} : { after: j(after) }), out: plain(after === undefined ? effectiveReps(reps, rir) : effectiveReps(reps, rir, after)) });
    }
    for (const formula of ['epley', 'brzycki'] as const)
      for (const weight of [0, 60, 80, 100, 120, 140, NaN])
        for (const reps of [0, 1, 3, 5, 8, 10, 15, 25])
          for (const e1rm of [0, 100, 120, 133.3, 140, 200, 500, NaN])
            cases.push({ fn: 'estimateRir', weight: j(weight), reps, e1rm: j(e1rm), formula, out: plain(estimateRir(weight, reps, e1rm, formula)) });
    const sets: Partial<WorkoutSet>[] = [
      {}, { rir: 0 }, { rir: 0, after: 3 }, { rir: 2 }, { rir: 5 }, { rir: 7, after: 2 }, { warmup: true, rir: 0 }, { warmup: true },
      { reps: undefined, time: 60 }, { reps: 0 }, { weight: 0 }, { weight: 0, rir: 1 }, { weight: undefined, rir: 0 }, { weight: undefined },
      { reps: 12 }, { reps: 20, weight: 40 }, { weight: 150, reps: 3 }, { after: 4 }, { rir: 1.6 }, { planned: true }, { deload: true, rir: 1 },
    ];
    for (const formula of ['epley', 'brzycki'] as const)
      for (const e1rm of [0, 120, 133.33, 90]) for (const x of sets) {
        const s = set(x);
        cases.push({ fn: 'setEffective', set: s, e1rm, formula, out: plain(setEffective(s, e1rm, formula)) });
      }
    const bench = M.bench, dips = M.dips;
    const lists: { muscles?: Muscles; effective: number }[][] = [
      [{ muscles: bench, effective: 8 }, { muscles: bench, effective: 6 }, { muscles: dips, effective: 8 }, { effective: 8 }, { muscles: bench, effective: 0 }],
      [],
      [{ muscles: M.odd, effective: 5 }],
      [{ muscles: M.squat, effective: 3 }, { muscles: M.curl, effective: 4 }, { muscles: M.squat, effective: 2.5 }, { muscles: M.row, effective: -1 }, { muscles: M.ohp, effective: NaN }],
      [{ muscles: { primary: [], secondary: ['abs'] }, effective: 4 }, { muscles: { primary: ['abs'], secondary: [] }, effective: 1 }],
    ];
    for (const list of lists) cases.push({ fn: 'muscleTotals', sets: list.map((x) => ({ ...(x.muscles ? { muscles: x.muscles } : {}), effective: j(x.effective) })), out: plain(muscleTotals(list)) });
    for (const direct of [0, 9.5, 10, 10.5, 20, NaN]) for (const goalMin of [20, 21, 0]) cases.push({ fn: 'isMainSession', direct: j(direct), goalMin, out: isMainSession(direct, goalMin) });
    golden('effective', cases);
  });
});

describe('golden: targets', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];
    const prevs: Partial<WorkoutSet>[] = [
      { reps: 9 }, { reps: 12 }, { reps: 13 }, { reps: 11 }, { reps: 1 }, { reps: 15 }, { weight: 0, reps: 14 }, { weight: undefined, reps: 14 },
      { warmup: true, rir: undefined }, { reps: 0 }, { reps: undefined }, { weight: 102.5, reps: 12, planned: true }, { weight: 20, reps: 12, deload: true }, { weight: 0.5, reps: 12 },
    ];
    for (const [step, top] of [[2.5, 12], [5, 15], [2.5, 8], [0, 12], [1.25, 10], [NaN, 12]] as const)
      for (const x of prevs) {
        const prev = set(x);
        cases.push({ fn: 'dorianTarget', prev, step: j(step), top, out: plain(dorianTarget(prev, step, top)) });
      }
    const pyramid = [set({ weight: 50, reps: 10, warmup: true }), set({ reps: 12 }), set({ weight: 80, reps: 10 }), set({ reps: 0 }), set({ weight: 0, reps: 20 })];
    for (const [step, top] of [[2.5, 12], [5, 10], [2.5, 20]] as const) {
      cases.push({ fn: 'dorianTargets', last: pyramid, step, top, out: plain(dorianTargets(pyramid, step, top)) });
      cases.push({ fn: 'progressedSets', last: pyramid, step, top, out: plain(progressedSets(pyramid, step, top)) });
    }
    cases.push({ fn: 'dorianTargets', last: [], step: 2.5, top: 12, out: plain(dorianTargets([], 2.5)) });
    cases.push({ fn: 'progressedSets', last: [], step: 2.5, top: 12, out: plain(progressedSets([], 2.5)) });
    const hist = history(7, '2026-08-03', 4);
    for (const ex of ['bench', 'squat', 'dips']) {
      const last = hist.filter((s) => s.exerciseId === ex && s.date === hist.filter((x) => x.exerciseId === ex).at(-1)!.date);
      cases.push({ fn: 'dorianTargets', last, step: 2.5, top: 12, out: plain(dorianTargets(last, 2.5)) });
      cases.push({ fn: 'progressedSets', last, step: 2.5, top: 12, out: plain(progressedSets(last, 2.5)) });
    }
    for (const work of [0, -5, 20, 40, 45, 100, 105, 62.5, 7, 3, NaN, 200.2]) for (const step of [2.5, 5, 1, 0, 1.25, 10]) cases.push({ fn: 'warmups', work: j(work), step, out: plain(warmups(work, step)) });

    // tooSoon
    const sess = (date: string, ex: string, n: number, reps: number, x: Partial<WorkoutSet> = {}) => Array.from({ length: n }, () => set({ date, exerciseId: ex, reps, ...x }));
    const earlierA = [...sess('2026-10-25', 'bench', 2, 8), ...sess('2026-10-26', 'bench', 2, 6)];
    const earlierB = [...sess('2026-10-26', 'dips', 1, 8), ...sess('2026-10-27', 'bench', 1, 8), ...sess('2026-10-22', 'bench', 1, 12), ...sess('2026-10-28', 'bench', 1, 12)];
    const earlierC = [...sess('2026-10-24', 'bench', 3, 8), ...sess('2026-10-27', 'bench', 3, 8), ...sess('2026-10-26', 'squat', 5, 8), ...sess('2026-10-27', 'ohp', 3, 12), ...sess('2026-10-27', 'bench', 2, 8, { planned: true })];
    const earlierD = [...sess('2026-10-28', 'curl', 3, 10, { warmup: true }), ...sess('2026-10-23', 'bench', 3, 8), ...sess('2026-10-27', 'row', 4, 8), ...sess('2026-10-26', 'odd', 3, 8)];
    const earlierE = [...sess('2026-10-27', 'bench', 3, 8), ...sess('d', 'bench', 3, 8), ...sess('2026-10-26', 'bench', 3, 8)];
    const earlierF = [...sess('2026-02-27', 'squat', 4, 8), ...sess('2026-02-28', 'squat', 2, 8), ...sess('2026-03-01', 'bench', 5, 8)];
    const earlierG = [...sess('2025-12-30', 'bench', 4, 8), ...sess('2025-12-31', 'bench', 3, 8)];
    const [A, B, C, Dd, E, F, G, empty] = [earlierA, earlierB, earlierC, earlierD, earlierE, earlierF, earlierG, []].map((l, i) => [reg(`tooSoon${i}`, l), l] as const);
    const targets: [string, Muscles | undefined, readonly [string, WorkoutSet[]]][] = [
      ['2026-10-28', M.bench, A], ['2026-10-28', M.bench, B], ['2026-10-28', M.bench, C], ['2026-10-28', M.squat, C],
      ['2026-10-28', M.ohp, C], ['2026-10-28', M.odd, Dd], ['2026-10-28', M.row, Dd], ['2026-10-28', M.curl, Dd],
      ['2026-10-28', M.bench, E], ['2026-03-03', M.squat, F], ['2026-03-03', M.bench, F], ['2026-01-02', M.bench, G],
      ['2026-10-28', undefined, A], ['2026-10-28', { primary: [], secondary: ['chest'] }, A], ['2026-10-28', M.bench, empty],
    ];
    for (const [date, target, [data, earlier]] of targets)
      for (const [mode, e1rm] of EFFS)
        for (const [restDays, goal] of [[5, 20], [3, 20], [7, 10], [2, 30]]) {
          cases.push({ fn: 'tooSoon', date, ...(target ? { target } : {}), data, muscles: M, eff: mode, e1rm, restDays, goal, out: plain(tooSoon(date, target, earlier, of, eff(mode, e1rm), restDays, goal)) });
        }
    // default rest days / goal
    cases.push({ fn: 'tooSoon', date: '2026-10-28', target: M.bench, data: A[0], muscles: M, eff: 'reps', e1rm: 0, out: plain(tooSoon('2026-10-28', M.bench, earlierA, of, eff('reps', 0))) });
    golden('targets', withData(cases));
  });
});

describe('golden: lyle', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];
    const starts = ['2026-10-26', '2026-02-23', '2025-12-29', '2024-02-26'];
    for (const start of starts) for (const k of [-10, -1, 0, 1, 6, 7, 8, 13, 14, 15, 27, 28, 41, 42, 43, 49, 56, 100]) {
      const date = addDays(start, k);
      cases.push({ fn: 'cycleWeek', start, date, out: plain(cycleWeek(start, date)) });
    }
    cases.push({ fn: 'cycleWeek', start: '2026-10-26', date: 'x', out: plain(cycleWeek('2026-10-26', 'x')) });
    cases.push({ fn: 'cycleWeek', start: '', date: '2026-10-26', out: plain(cycleWeek('', '2026-10-26')) });
    for (const ex of [{}, { repTop: 8, repBottom: 6 }, { repTop: 5, repBottom: 9 }, { repTop: 15 }, { repTop: 3 }, { repTop: 1 }, { repBottom: 3 }, { repTop: 10, repBottom: 10 }, { repTop: 6, repBottom: 0 }, { repTop: 4 }, { repTop: 12, repBottom: 12.5 }])
      cases.push({ fn: 'repRange', ...ex, out: plain(repRange(ex)) });
    const lastSets: Partial<WorkoutSet>[] = [
      { weight: 92.5, reps: 8, rir: 2 }, { weight: 95, reps: 8, rir: 0 }, { weight: 95, reps: 8 }, { weight: 97.5, reps: 6, rir: 1 }, { reps: 8, rir: 1 }, { reps: 7, rir: 1 },
      { reps: 9, rir: 3 }, { reps: 12, rir: 1 }, { reps: 8, rir: 5 }, { reps: 8, rir: 0.5 }, { reps: 1 }, { warmup: true }, { planned: true }, { deload: true }, { weight: 0 }, { reps: 0 }, { weight: undefined },
    ];
    const ranges = [{ bottom: 6, top: 8 }, { bottom: 8, top: 12 }, { bottom: 5, top: 5 }, { bottom: 1, top: 1 }];
    let cnt = 0;
    for (const week of [0, 1, 2, 3, 4, 8, -1, 1.5, NaN, Infinity])
      for (const best of [0, 2.5, 100, 62.5])
        for (const step of [2.5, 5, 0])
          for (const lf of [undefined, ...lastSets.slice(0, 4)]) {
            const range = ranges[cnt++ % ranges.length];
            const last = lf && set(lf);
            cases.push({ fn: 'lyleTarget', week: j(week), best, ...(last ? { last } : {}), step, range, out: plain(lyleTarget(week, best, last, step, range)) });
          }
    for (const week of [0, 1, 3]) for (const range of ranges) for (const lf of lastSets) {
      const last = set(lf);
      cases.push({ fn: 'lyleTarget', week, best: week && week < 3 ? 80 : 0, last, step: 2.5, range, out: plain(lyleTarget(week, week && week < 3 ? 80 : 0, last, 2.5, range)) });
    }
    const hs = [set({ date: '2026-09-20', weight: 110, reps: 5 }), set({ date: '2026-09-22', weight: 100, reps: 7 }), set({ date: '2026-09-24', weight: 120, reps: 8, warmup: true }),
      set({ date: '2026-09-25', weight: 130, reps: 8, deload: true }), set({ date: '2026-09-26', weight: 140, reps: 8, planned: true }), set({ date: '2026-10-27', weight: 85, reps: 8, rir: 3 }),
      set({ date: '2026-10-29', weight: 90, reps: 8, rir: 2 }), set({ date: '2026-10-29', weight: 90, reps: 7, rir: 1 }), set({ date: '2026-10-26', weight: 95, reps: 8 })];
    const long = history(11, '2026-06-01', 14).filter((s) => s.exerciseId === 'bench' || s.exerciseId === 'row');
    for (const [i, sets] of [hs, long, []].entries()) {
      const data = reg(`lyle${i}`, sets);
      for (const bottom of [1, 5, 6, 7, 8, 10, NaN]) for (const before of ['2026-10-26', '2026-09-23', '2026-09-26', '2000-01-01', '2030-01-01', '2026-07-20', '2026-08-31'])
        cases.push({ fn: 'bestForRange', data, bottom: j(bottom), before, out: plain(bestForRange(sets, bottom, before)) });
      for (const date of ['2026-10-31', '2026-10-29', '2026-10-26', '2026-09-19', '2026-06-01', '2026-06-08', '2026-07-01', '2026-08-15', '2030-01-01'])
        cases.push({ fn: 'lastFirstSet', data, date, out: plain(lastFirstSet(sets, date)) });
    }
    // Ties on date: the lowest order wins, whatever the list order.
    const tie = [set({ date: '2026-10-01', order: 30, weight: 60 }), set({ date: '2026-10-01', order: 10, weight: 70 }), set({ date: '2026-10-01', order: 20, weight: 80 })];
    cases.push({ fn: 'lastFirstSet', data: reg('lyleTie', tie), date: '2026-10-05', out: plain(lastFirstSet(tie, '2026-10-05')) });
    golden('lyle', withData(cases));
  });
});

describe('golden: cycle', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];
    const lights = [{ start: '2026-10-29' }, { start: '2026-12-28' }, { start: '2026-02-25' }, { start: '2024-02-26' }];
    for (const light of lights) for (const k of [-2, -1, 0, 1, 5, 6, 7, 8, 30]) {
      const date = addDays(light.start, k);
      cases.push({ fn: 'inLight', light, date, out: inLight(light, date) });
    }
    cases.push({ fn: 'inLight', date: '2026-10-29', out: inLight(undefined, '2026-10-29') });
    for (const light of lights) cases.push({ fn: 'lightEnd', light, out: lightEnd(light) });

    const settings: { mode: TrainingMode; cycle?: { start: string; weeks: number }; light?: { start: string } }[] = [
      { mode: 'lyle', cycle: { start: '2026-10-26', weeks: 6 } }, { mode: 'lyle', cycle: { start: '2026-12-21', weeks: 8 } }, { mode: 'lyle', cycle: { start: '2026-02-16', weeks: 2 } },
      { mode: 'lyle' }, { mode: 'lyle', light: { start: '2026-10-26' } }, { mode: 'dorian', light: { start: '2026-10-29' } }, { mode: 'dorian', light: { start: '2026-12-30' } },
      { mode: 'dorian' }, { mode: 'dorian', cycle: { start: '2026-10-26', weeks: 6 } }, { mode: 'standard', light: { start: '2026-10-29' } }, { mode: 'standard', cycle: { start: '2026-10-26', weeks: 6 } }, { mode: 'standard' },
    ];
    for (const st of settings) {
      const base = st.cycle?.start ?? st.light?.start ?? '2026-10-26';
      for (let k = -3; k <= 60; k += k < 20 ? 1 : 4) {
        const date = addDays(base, k);
        cases.push({ fn: 'phaseOn', st, date, out: plain(phaseOn(st, date)) });
      }
    }
    const sets: Partial<WorkoutSet>[] = [{ weight: 100, reps: 10 }, { weight: 105, reps: 8 }, { weight: 50, reps: 10, warmup: true }, { weight: 0, reps: 12 }, { weight: 1, reps: 12 }, { weight: undefined, reps: 12 },
      { weight: 72, reps: 10 }, { weight: 2.5, reps: 5 }, { weight: 87.3, reps: 9, rir: 1 }, { weight: 20, reps: 15, deload: true }, { weight: 1.2, reps: 5 }, { weight: 100, reps: 10, planned: true }];
    for (const step of [2.5, 5, 1, 0, 1.25, 20, NaN]) for (const x of sets) {
      const s = set(x);
      cases.push({ fn: 'lightSet', set: s, step: j(step), out: plain(lightSet(s, step)) });
    }
    const last: WorkoutSet[] = [set({ weight: 50, reps: 10, warmup: true, date: 'd' }), set({ weight: 100, reps: 12, date: 'd' }), set({ weight: 80, reps: 10, date: 'd' }), set({ weight: 0, reps: 8 }), set({ weight: undefined, reps: 8 }), set({ weight: 60, reps: 0 }), set({ weight: 60, reps: undefined })];
    for (const step of [2.5, 5, 0, 1]) {
      cases.push({ fn: 'lightTargets', last, step, out: plain(lightTargets(last, step)) });
      cases.push({ fn: 'lightTargets', last: [], step, out: plain(lightTargets([], step)) });
    }
    const hist = history(3, '2026-09-01', 3).filter((s) => s.exerciseId === 'bench');
    cases.push({ fn: 'lightTargets', last: hist, step: 2.5, out: plain(lightTargets(hist, 2.5)) });
    const copies = [{ deload: true }, { deload: undefined }, { deload: false as unknown as true }, { deload: true, rir: 1 }, { planned: true, deload: true }] as Partial<WorkoutSet>[]; // `false` as old or imported data may hold
    for (const x of copies) for (const light of [undefined, ...lights.slice(0, 2)]) for (const to of ['2026-10-29', '2026-10-30', '2026-11-04', '2026-11-05', '2026-11-12', '2026-12-31', '2027-01-03']) {
      const s = set({ date: '2026-10-29', weight: 90, reps: 10, ...x });
      cases.push({ fn: 'redated', set: s, to, ...(light ? { light } : {}), out: plain(redated(s, to, light)) });
    }
    for (const x of [{}, { deload: true }, { planned: true }, { deload: true, planned: true }, { deload: false, planned: false }]) {
      const s = set(x as Partial<WorkoutSet>);
      cases.push({ fn: 'progressing', set: s, out: progressing(s) });
    }
    const routine = (n: number): Routine => ({ id: 'r', name: 'Split', order: 0, days: Array.from({ length: n }, (_, i) => ({ id: 'abcdefg'[i], name: 'abcdefg'[i].toUpperCase(), items: [] })) });
    for (const n of [0, 1, 2, 4]) for (const lastId of [undefined, 'a', 'b', 'c', 'd', 'gone']) {
      const r = routine(n);
      cases.push({ fn: 'nextProgramDay', routine: r, ...(lastId ? { lastId } : {}), out: plain(nextProgramDay(r, lastId)?.id ?? null) });
    }
    cases.push({ fn: 'nextProgramDay', lastId: 'a', out: plain(nextProgramDay(undefined, 'a')?.id ?? null) });
    golden('cycle', cases);
  });
});

describe('golden: volume', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];
    const modes: TrainingMode[] = ['standard', 'dorian', 'lyle'];
    for (const mode of modes) for (const n of [0, 19.5, 20, 29.99, 30, 30.5, 40, 41, NaN]) {
      const g = GOALS[mode];
      if (g) cases.push({ fn: 'statusOf', n: j(n), goal: g, out: statusOf(n, g) });
    }
    const hist = history(21, '2026-08-03', 12);
    reg('hist', hist);
    const hist2 = history(5, '2025-11-17', 10); // across the year end
    const hist3 = history(9, '2026-02-02', 6); // across a leap-free February
    const day = (date: string, h = hist) => h.filter((s) => s.date === date);
    const dayCases: WorkoutSet[][] = [
      [set({ date: '2026-10-26', reps: 8 }), set({ date: '2026-10-26', reps: 8 }), set({ date: '2026-10-26', reps: 6 }), set({ date: '2026-10-26', exerciseId: 'dips', reps: 8 })],
      [set({ exerciseId: 'row', reps: 6 }), set({ exerciseId: 'bench', reps: 8, planned: true })],
      [], [set({ exerciseId: 'nope', reps: 8 })], [set({ exerciseId: 'odd', reps: 8 }), set({ exerciseId: 'squat', reps: 10 }), set({ exerciseId: 'squat', reps: 10, warmup: true })],
      day('2026-08-03'), day('2026-08-05'), day('2026-08-07'), day('2026-08-08'), day('2026-09-14'), day('2025-11-17', hist2), day('2025-11-21', hist2),
    ];
    for (const [i, sets] of dayCases.entries()) for (const [mode, e1rm] of (i < 5 ? EFFS : [EFFS[1]])) for (const g of [null, GOALS.dorian, i % 3 ? GOALS.lyle : { min: 5, max: 6, label: 'x' }]) {
      cases.push({ fn: 'dayMuscles', sets, muscles: M, eff: mode, e1rm, goal: g, out: plain(dayMuscles(sets, of, eff(mode, e1rm), g)) });
    }
    // dates around week and year ends, both week starts
    const dates = ['2026-10-26', '2026-10-27', '2026-10-29', '2026-11-01', '2026-11-02', '2026-01-01', '2026-01-04', '2026-01-05', '2025-12-31', '2024-02-29', '2024-03-03', '2024-03-04', '2026-03-01', '2026-02-28', '2027-01-01', '2020-12-31'];
    for (const date of dates) for (const ws of [0, 1] as const) cases.push({ fn: 'weekOf', date, weekStart: ws, out: weekOf(date, ws) });
    for (const today of ['2026-10-29', '2026-01-02', '2025-12-29', '2024-03-01', '2026-11-02']) for (const n of [0, 1, 3, 8, 60]) for (const ws of [0, 1] as const)
      cases.push({ fn: 'lastWeeks', today, n, weekStart: ws, out: lastWeeks(today, n, ws) });

    const wkSets: [string, WorkoutSet[]][] = [
      ['hist', hist], ['hist2', hist2], ['hist3', hist3], ['empty', []],
      ['small', [...[1, 2, 3, 4, 5].map(() => set({ date: '2026-10-26', reps: 5 })), ...[1, 2, 3, 4].map(() => set({ date: '2026-10-29', reps: 6 })), set({ date: '2026-10-27', exerciseId: 'dips', reps: 8 }), set({ date: '2026-10-20', reps: 8 })]],
      ['unsorted', [set({ date: '2026-11-03', reps: 12 }), set({ date: '2026-10-05', reps: 12 }), set({ date: '2026-11-03', exerciseId: 'row', reps: 12 }), set({ date: '2026-10-05', exerciseId: 'row', reps: 12 })]],
    ];
    for (const [name, sets] of wkSets) reg(name, sets);
    for (const [name, sets] of wkSets) for (const [mode, e1rm] of name.startsWith('hist') ? [EFFS[1]] : EFFS.slice(0, 2)) for (const m of modes) for (const ws of name === 'hist2' || name === 'hist3' ? [1 as const] : [0 as const, 1 as const])
      cases.push({ fn: 'weeks', data: name, muscles: M, eff: mode, e1rm, goal: GOALS[m], weekStart: ws, out: plain(weeks(sets, of, eff(mode, e1rm), GOALS[m], ws)) });

    const periods: [string, string, string][] = [
      ['hist', '2026-08-03', '2026-08-30'], ['hist', '2026-09-01', '2026-09-30'], ['hist', '', '2026-10-25'], ['hist', '2026-10-01', '2026-10-01'], ['hist', '2026-08-10', '2026-08-09'], ['hist', '2020-01-01', '2030-01-01'],
      ['hist2', '2025-12-01', '2026-01-31'], ['hist2', '', '2026-02-01'], ['hist3', '2026-02-01', '2026-03-31'], ['hist3', '', '2026-03-31'], ['small', '2026-10-05', '2026-10-18'], ['small', '', '2026-10-18'], ['empty', '2026-10-01', '2026-10-31'], ['empty', '', '2026-10-31'], ['unsorted', '', '2026-11-30'], ['unsorted', '2026-10-01', '2026-11-30'],
    ];
    const byName = Object.fromEntries(wkSets);
    for (const [name, from, to] of periods) for (const [mode, e1rm] of [EFFS[1]]) for (const m of modes) {
      const sets = byName[name];
      cases.push({ fn: 'periodMuscles', data: name, muscles: M, eff: mode, e1rm, goal: GOALS[m], from, to, out: plain(periodMuscles(sets, of, eff(mode, e1rm), GOALS[m], from, to)) });
    }
    const wm = (total: number) => ({ total, sessions: [] });
    for (const m of modes) for (const total of [0, -1, 9, 10, 20, 30, 39.5, 40, 41, 45, 60, 80, 81, 100, NaN]) {
      cases.push({ fn: 'weekStatus', w: { total: j(total), sessions: [] }, goal: GOALS[m], mode: m, out: weekStatus(wm(total), GOALS[m], m) });
      cases.push({ fn: 'weekStatus', w: { total: j(total), sessions: [] }, goal: GOALS.lyle, mode: m, out: weekStatus(wm(total), GOALS.lyle, m) });
    }
    for (const m of modes) cases.push({ fn: 'weekStatus', goal: GOALS[m], mode: m, out: weekStatus(undefined, GOALS[m], m) });
    const cs = [...[set({ date: '2026-10-26', reps: 8 }), set({ date: '2026-10-26', reps: 8 }), set({ date: '2026-10-27', exerciseId: 'dips', reps: 8 }), set({ date: '2026-10-27', exerciseId: 'row', reps: 8 })],
      ...hist.slice(0, 90), set({ exerciseId: 'odd', reps: 10 }), set({ exerciseId: 'nope', reps: 10 }), set({ exerciseId: 'ohp', reps: 10, planned: true })];
    const allMuscles: MuscleId[] = ['chest', 'frontDelts', 'sideDelts', 'rearDelts', 'lats', 'traps', 'lowerBack', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];
    reg('contrib', cs);
    for (const muscle of allMuscles) for (const [mode, e1rm] of EFFS.slice(0, 2))
      cases.push({ fn: 'contributions', data: 'contrib', muscles: M, eff: mode, e1rm, muscle, out: plain(contributions(cs, of, eff(mode, e1rm), muscle)) });
    golden('volume', withData(cases));
  });
});
