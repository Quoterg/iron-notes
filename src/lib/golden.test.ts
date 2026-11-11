// Golden fixtures for the native Rust core (docs/NATIVE.md): the web logic's answers for a set of
// inputs, kept in native/core-rs/tests/golden/. This test fails when the web logic and the file
// disagree; the Rust tests check the Rust core against the same file. After a deliberate change in the
// web logic, regenerate with `UPDATE_GOLDEN=1 pnpm test golden` and port the change to Rust.
// More modules: src/lib/golden-*.test.ts, with the helpers in golden-fixtures.ts.
import { describe, it } from 'vitest';
import { addDays, fmtTime, oneRM } from './calc';
import { golden, j, n } from './golden-fixtures';
import { dFromUser, dToUser, wFromUser, wToUser } from './units';

const weights = [0, 2.5, 20, 60, 82.5, 100, 142.5, 227.5];
const reps = [0, 1, 2, 3, 5, 8, 10, 12, 15, 20, 30, 36, 37, 40];

describe('golden fixtures (shared with the Rust core)', () => {
  it('calc', () => {
    golden('calc', [
      ...weights.flatMap((weight) =>
        reps.flatMap((r) =>
          (['epley', 'brzycki'] as const).map((formula) => ({ fn: 'oneRM', weight, reps: r, formula, out: oneRM(weight, r, formula) })),
        ),
      ),
      // Edge inputs too: the fixtures are the contract (NaN/∞ as strings — JSON has no such numbers).
      ...([[-10, 5], [100, 'NaN'], ['NaN', 5], [100, 0.5], [100, 1.5], [100, -3], ['Infinity', 5]] as const).flatMap(([weight, r]) =>
        (['epley', 'brzycki'] as const).map((formula) => ({ fn: 'oneRM', weight, reps: r, formula, out: j(oneRM(n(weight), n(r), formula)) })),
      ),
      ...[0, 0.4, 0.5, 1, 59, 59.5, 60, 61, 599, 3599, 3600, 3661, 36000, 86399].map((sec) => ({ fn: 'fmtTime', sec, out: fmtTime(sec) })),
      ...[-0.5, -5, -59.5, -61, -3600, -3661, 0.49999999999999994, 4503599627370497, 1e15, 'NaN', 'Infinity', '-Infinity'].map((sec) => ({
        fn: 'fmtTime',
        sec,
        out: fmtTime(n(sec)),
      })),
      ...[
        ['2026-01-01', 0],
        ['2026-01-31', 1],
        ['2026-02-28', 1],
        ['2028-02-28', 1],
        ['2026-03-01', -1],
        ['2024-03-01', -1],
        ['2026-12-31', 1],
        ['2026-01-01', -1],
        ['2026-10-28', -42],
        ['2026-10-05', 41],
        ['2000-02-29', 365],
        ['2026-03-29', 1], // DST change in Europe: still one calendar day
        ['2026-10-25', -1],
        ['2026-06-15', 1000],
        ['2026-06-15', -1000],
        // What parseIso + new Date(y, m − 1, d) make of odd input: rollovers, years 0–99 = 1900s,
        // unpadded short years, whitespace, extra parts, fractions; unreadable → NaN-NaN-NaN.
        ['2026-13-01', 0],
        ['2026-02-30', 0],
        ['2026-00-00', 0],
        ['2026-1-5', 0],
        [' 2026 - 01 - 05 ', 0],
        ['2026-01-05-extra', 0],
        ['2026-01-05.7', 0],
        ['0099-06-15', 0],
        ['0000-01-01', 1],
        ['999-01-01', 0],
        ['100-03-01', -1],
        ['', 0],
        ['abc', 0],
        ['2026-01', 0],
        ['2026-xx-01', 0],
        ['0x7EA-01-01', 0],
      ].map(([date, n]) => ({ fn: 'addDays', date, n, out: addDays(date as string, n as number) })),
    ]);
  });

  it('units', () => {
    golden('units', [
      ...[0, 1, 2.5, 20, 82.5, 100, 227.5].flatMap((v) =>
        (['kg', 'lb'] as const).flatMap((u) => [
          { fn: 'wToUser', v, u, out: wToUser(v, u) },
          { fn: 'wFromUser', v, u, out: wFromUser(v, u) },
        ]),
      ),
      ...[0, 0.4, 1, 5, 21.0975, 42.195].flatMap((v) =>
        (['km', 'mi', 'm'] as const).flatMap((u) => [
          { fn: 'dToUser', v, u, out: dToUser(v, u) },
          { fn: 'dFromUser', v, u, out: dFromUser(v, u) },
        ]),
      ),
    ]);
  });
});
