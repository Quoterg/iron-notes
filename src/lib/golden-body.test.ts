// Golden fixtures for body.ts: the web logic's answers, checked by native/core-rs/tests/golden_body.rs.
// Regenerate with UPDATE_GOLDEN=1.
import { describe, it } from 'vitest';
import { byDate, fmtBody, fromUser, latestChange, toUser, trend, unitOf } from './body';
import type { BodyEntry, BodyKind, Settings } from './model';
import { golden } from './golden-fixtures';

const KINDS: BodyKind[] = ['weight', 'percent', 'length', 'number'];
const st = (unit: 'kg' | 'lb') => ({ unit }) as Settings;
const VALUES = [0, 0.04, 1, 2.54, 15.25, 70.05, 81.96, 82.44, 82.45, 100, 180.34, 0.449];

const e = (id: string, date: string, value: number, at: number): BodyEntry => ({ id, metricId: 'm', date, value, at });
const ENTRY_SETS: BodyEntry[][] = [
  [],
  [e('a', '2026-03-01', 80, 1)],
  [e('a', '2026-03-02', 81, 5), e('b', '2026-03-01', 80, 2), e('c', '2026-03-02', 79.5, 9)],
  [e('a', '2026-03-02', 81, 9), e('b', '2026-03-02', 80, 3), e('c', '2026-03-05', 82.1, 4), e('d', '2026-02-27', 79, 7)],
  [
    e('a', '2026-01-01', 1, 1), e('b', '2026-01-02', 2, 2), e('c', '2026-01-03', 3, 3), e('d', '2026-01-04', 4, 4), e('e', '2026-01-05', 5, 5),
    e('f', '2026-01-06', 6.5, 6), e('g', '2026-01-07', 7, 7), e('h', '2026-01-08', 9.25, 8), e('i', '2026-01-09', 8, 9),
  ],
];

describe('golden body', () => {
  it('matches the fixtures', () => {
    const cases: unknown[] = [];
    for (const unit of ['kg', 'lb'] as const) {
      for (const kind of KINDS) {
        cases.push({ fn: 'unitOf', kind, unit, out: unitOf(kind, st(unit)) });
        for (const v of VALUES) {
          cases.push({ fn: 'toUser', v, kind, unit, out: toUser(v, kind, st(unit)) });
          cases.push({ fn: 'fromUser', v, kind, unit, out: fromUser(v, kind, st(unit)) });
          cases.push({ fn: 'fmtBody', v, kind, unit, out: fmtBody(v, kind, st(unit)) });
        }
      }
    }
    for (const entries of ENTRY_SETS) {
      const sorted = byDate(entries);
      cases.push({ fn: 'byDate', entries, out: sorted });
      cases.push({ fn: 'latestChange', sorted, out: latestChange(sorted) });
      const values = sorted.map((x) => x.value);
      cases.push({ fn: 'trend', values, window: 7, out: trend(values) });
      cases.push({ fn: 'trend', values, window: 3, out: trend(values, 3) });
    }
    golden('body', cases);
  });
});
