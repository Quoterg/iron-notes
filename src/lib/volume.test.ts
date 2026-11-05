import { describe, expect, it } from 'vitest';
import type { Muscles, WorkoutSet } from './model';
import { contributions, dayMuscles, GOALS, lastWeeks, periodMuscles, statusOf, weekOf, weekStatus, weeks } from './volume';

const M: Record<string, Muscles> = {
  bench: { primary: ['chest'], secondary: ['triceps', 'frontDelts'] },
  dips: { primary: ['triceps'], secondary: ['chest', 'frontDelts'] },
  row: { primary: ['lats'], secondary: ['biceps', 'rearDelts'] },
};
let n = 0;
const set = (exerciseId: string, date: string, reps: number, x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: String(++n), date, exerciseId, order: n, weight: 100, reps, rir: 0, ...x });
const eff = (s: WorkoutSet) => (s.warmup ? 0 : s.reps ?? 0);
const of = (id: string) => M[id];

describe('per muscle, per session', () => {
  it('direct and indirect per muscle; main session from half the goal', () => {
    const day = [set('bench', '2026-10-26', 8), set('bench', '2026-10-26', 8), set('bench', '2026-10-26', 6), set('dips', '2026-10-26', 8)];
    const out = dayMuscles(day, of, eff, GOALS.dorian);
    expect(out.map((d) => [d.muscle, d.direct, d.indirect, d.main])).toEqual([
      ['chest', 22, 4, true],
      ['frontDelts', 0, 15, false],
      ['triceps', 8, 11, false], // dips: 8 direct = extra work
    ]);
  });
  it('without a goal any direct work is a main session; planned sets are left out', () => {
    const out = dayMuscles([set('row', '2026-10-27', 6), set('bench', '2026-10-27', 8, { planned: true })], of, eff, null);
    expect(out.map((d) => [d.muscle, d.main])).toEqual([
      ['rearDelts', false],
      ['lats', true],
      ['biceps', false],
    ]);
  });
  it('status against the goal', () => {
    expect(statusOf(18, GOALS.dorian!)).toBe('under');
    expect(statusOf(21, GOALS.dorian!)).toBe('in');
    expect(statusOf(41, GOALS.lyle!)).toBe('over');
  });
});

describe('weeks', () => {
  it('week starts by setting', () => {
    expect(weekOf('2026-10-29', 1)).toBe('2026-10-26'); // Thursday → Monday
    expect(weekOf('2026-10-29', 0)).toBe('2026-10-25'); // → Sunday
    expect(weekOf('2026-10-26', 1)).toBe('2026-10-26');
    expect(lastWeeks('2026-10-29', 3, 1)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
  });
  it('a week total with its main sessions (Lyle: two)', () => {
    const sets = [
      ...[1, 2, 3, 4, 5].map(() => set('bench', '2026-10-26', 5)),
      ...[1, 2, 3, 4].map(() => set('bench', '2026-10-29', 6)),
      set('dips', '2026-10-27', 8),
      set('bench', '2026-10-20', 8),
    ];
    const w = weeks(sets, of, eff, GOALS.lyle, 1);
    expect([...w.keys()]).toEqual(['2026-10-19', '2026-10-26']);
    const chest = w.get('2026-10-26')!.get('chest')!;
    expect(chest.total).toBe(25 + 4 + 24);
    expect(chest.sessions).toEqual([
      { date: '2026-10-26', n: 25 },
      { date: '2026-10-29', n: 24 },
    ]);
    expect(w.get('2026-10-19')!.get('chest')).toEqual({ total: 8, sessions: [] }); // 8 direct: extra work
  });
});

describe('a period (Statistics)', () => {
  it('per muscle totals and main sessions, most first; total effective reps; weeks in the period', () => {
    const sets = [
      ...[1, 2, 3].map(() => set('bench', '2026-10-05', 8)),
      ...[1, 2, 3].map(() => set('bench', '2026-10-12', 8)),
      set('dips', '2026-10-13', 8),
      set('bench', '2026-09-30', 8), // before the period
    ];
    const p = periodMuscles(sets, of, eff, GOALS.dorian, '2026-10-05', '2026-10-18');
    expect(p.list[0]).toEqual({ muscle: 'chest', total: 24 + 24 + 4, sessions: 2 });
    expect(p.list.find((m) => m.muscle === 'triceps')).toEqual({ muscle: 'triceps', total: 12 + 12 + 8, sessions: 0 });
    expect(p.total).toBe(56);
    expect(p.weeks).toBe(2);
  });
  it('"All": the period starts with the first workout', () => {
    expect(periodMuscles([set('bench', '2026-10-12', 8)], of, eff, null, '', '2026-10-18').weeks).toBe(1);
  });
});

describe('the body map', () => {
  it('a week against the session goal × sessions a week (Lyle twice, Dorian once)', () => {
    const w = (total: number) => ({ total, sessions: [] });
    expect(weekStatus(undefined, GOALS.lyle, 'lyle')).toBe('none');
    expect(weekStatus(w(30), GOALS.lyle, 'lyle')).toBe('under'); // one Lyle session
    expect(weekStatus(w(60), GOALS.lyle, 'lyle')).toBe('in');
    expect(weekStatus(w(25), GOALS.dorian, 'dorian')).toBe('in');
    expect(weekStatus(w(45), GOALS.dorian, 'dorian')).toBe('over');
    expect(weekStatus(w(10), null, 'standard')).toBe('trained');
    expect(weekStatus(w(40), GOALS.lyle, 'lyle')).toBe('in'); // exactly 20 × 2
    expect(weekStatus(w(39.5), GOALS.lyle, 'lyle')).toBe('under');
    expect(weekStatus(w(80), GOALS.lyle, 'lyle')).toBe('in'); // exactly 40 × 2
    expect(weekStatus(w(81), GOALS.lyle, 'lyle')).toBe('over');
  });
  it('what each exercise gave a muscle: direct in full, secondary at half', () => {
    const sets = [set('bench', '2026-10-26', 8), set('bench', '2026-10-26', 8), set('dips', '2026-10-27', 8), set('row', '2026-10-27', 8)];
    expect(contributions(sets, of, eff, 'chest')).toEqual([
      { exerciseId: 'bench', n: 16, direct: true },
      { exerciseId: 'dips', n: 4, direct: false },
    ]);
    expect(contributions(sets, of, eff, 'quads')).toEqual([]);
  });
});

