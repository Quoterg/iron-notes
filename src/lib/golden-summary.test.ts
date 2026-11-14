// Golden fixtures for summary.ts (workout summary): the web logic's answers, checked by
// native/core-rs/tests/golden_summary.rs. Regenerate with UPDATE_GOLDEN=1. Times depend on the zone, so
// the test pins one (Europe/Stockholm) and records its offset in each case.
process.env.TZ = 'Europe/Stockholm';
import { describe, it } from 'vitest';
import { durationOf, fmtDuration, stampAt, summaryOf } from './summary';
import type { MuscleId, WorkoutSet } from './model';
import { golden, plain } from './golden-fixtures';

const at = (date: string, h: number, m: number, s = 0) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s).getTime();
};
const offsetOf = (ms: number) => -new Date(ms).getTimezoneOffset();
const set = (id: string, date: string, ex: string, x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id, date, exerciseId: ex, order: 1, ...x });

describe('golden summary', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];

    const dur = (name: string, sets: WorkoutSet[]) => {
      const first = sets.find((s) => s.at != null)?.at ?? at('2026-01-05', 12, 0);
      cases.push({ fn: 'durationOf', name, sets, offsetMin: offsetOf(first), out: durationOf(sets) });
    };
    dur('none', []);
    dur('one timed set', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) })]);
    dur('two sets', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) }), set('b', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 52, 29) })]);
    dur('rounds the seconds', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) }), set('b', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0, 1) + 500 })]);
    dur('unordered', [set('b', '2026-01-05', 'bench', { at: at('2026-01-05', 11, 5) }), set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) }), set('c', '2026-01-05', 'bench')]);
    dur('planned ignored', [
      set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) }),
      set('b', '2026-01-05', 'bench', { at: at('2026-01-05', 11, 0), planned: true }),
    ]);
    dur('filled in on another day', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) }), set('b', '2026-01-05', 'bench', { at: at('2026-01-06', 9, 0) })]);
    dur('just before midnight', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 23, 0) }), set('b', '2026-01-05', 'bench', { at: at('2026-01-05', 23, 59, 59) })]);
    dur('just after midnight is the next day', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 23, 0) }), set('b', '2026-01-05', 'bench', { at: at('2026-01-06', 0, 30) })]);
    dur('summer', [set('a', '2026-07-05', 'bench', { at: at('2026-07-05', 0, 10) }), set('b', '2026-07-05', 'bench', { at: at('2026-07-05', 1, 10) })]);
    dur('same time', [set('a', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) }), set('b', '2026-01-05', 'bench', { at: at('2026-01-05', 10, 0) })]);

    for (const [prev, was, now] of [
      [undefined, false, true],
      [5, false, true],
      [5, true, true],
      [5, true, false],
      [undefined, false, false],
      [undefined, true, true],
    ] as [number | undefined, boolean, boolean][]) {
      cases.push({ fn: 'stampAt', prev, was, now, nowMs: 1000, out: stampAt(prev, was, now, 1000) ?? null });
    }

    for (const sec of [0, 1, 29, 30, 31, 89, 90, 600, 3000, 3569, 3570, 3600, 3629, 3630, 3900, 7200, 7260, 36000, 90000]) {
      cases.push({ fn: 'fmtDuration', sec, out: fmtDuration(sec) });
    }

    const sets: WorkoutSet[] = [
      set('s1', '2026-01-05', 'bench', { weight: 100, reps: 8, at: at('2026-01-05', 10, 0) }),
      set('s2', '2026-01-05', 'bench', { weight: 100, reps: 7, at: at('2026-01-05', 10, 6) }),
      set('s3', '2026-01-05', 'fly', { weight: 20, reps: 12, at: at('2026-01-05', 10, 40) }),
      set('s4', '2026-01-05', 'squat', { weight: 120, reps: 5, planned: true, at: at('2026-01-05', 11, 40) }),
      set('s5', '2026-01-05', 'fly', { weight: 20, reps: 10 }),
    ];
    const eff: Record<string, number> = { s1: 3.4, s2: 2.6, s3: 0.5, s4: 9, s5: 0.4 };
    const muscles = (list: [MuscleId, number, boolean][]) => list.map(([muscle, n, met]) => ({ muscle, n, met }));
    const sum = (name: string, ss: WorkoutSet[], volume: number, records: string[], m: { muscle: MuscleId; n: number; met: boolean }[]) =>
      cases.push({
        fn: 'summaryOf',
        name,
        sets: ss,
        volume,
        effective: Object.fromEntries(ss.map((s) => [s.id, eff[s.id] ?? 0])),
        records,
        muscles: m,
        offsetMin: offsetOf(at('2026-01-05', 10, 0)),
        out: summaryOf({ sets: ss, volume, effective: (s) => eff[s.id] ?? 0, recordIds: new Set(records), muscles: m }),
      });
    sum('mixed', sets, 3320, ['s1', 's4'], muscles([['chest', 22.4, true], ['triceps', 8.5, false], ['frontDelts', 2.5, true]]));
    sum('empty', [], 0, [], []);
    sum('planned only', [sets[3]], 0, ['s4'], []);
    sum('half rounds up', [sets[0], sets[1]], 1500, [], muscles([['chest', 0.5, true]]));

    golden('summary', plain(cases) as unknown[]);
  });
});
