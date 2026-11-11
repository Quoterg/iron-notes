// Golden fixtures for the native Rust core (docs/NATIVE.md): the web logic's answers for a set of
// inputs, kept in native/core-rs/tests/golden/. This test fails when the web logic and the file
// disagree; the Rust tests check the Rust core against the same file. After a deliberate change in the
// web logic, regenerate with `UPDATE_GOLDEN=1 pnpm test golden` and port the change to Rust.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays, fmtTime, oneRM } from './calc';
import { dFromUser, dToUser, wFromUser, wToUser } from './units';

const dir = new URL('../../native/core-rs/tests/golden/', import.meta.url);

function golden(name: string, cases: unknown[]) {
  const file = new URL(`${name}.json`, dir);
  const text = `[\n${cases.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`; // one case per line
  if (process.env.UPDATE_GOLDEN) writeFileSync(file, text);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(cases);
}

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
      ...[0, 0.4, 0.5, 1, 59, 59.5, 60, 61, 599, 3599, 3600, 3661, 36000, 86399].map((sec) => ({ fn: 'fmtTime', sec, out: fmtTime(sec) })),
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
