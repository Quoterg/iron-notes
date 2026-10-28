import { describe, expect, it } from 'vitest';
import type { Muscles, WorkoutSet } from './model';
import { dayMuscles, GOALS, lastWeeks, statusOf, weekOf, weeks } from './volume';

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
