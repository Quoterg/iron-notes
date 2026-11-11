// Shared helpers for the golden-fixture tests (src/lib/golden*.test.ts): the web logic's answers for a
// set of inputs, kept in native/core-rs/tests/golden/<name>.json and checked by the Rust core's tests
// too (docs/NATIVE.md). Test-only: never imported by the app.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect } from 'vitest';

const dir = new URL('../../native/core-rs/tests/golden/', import.meta.url);

/**
 * Check `cases` against native/core-rs/tests/golden/<name>.json (one case per line); with
 * UPDATE_GOLDEN=1 write the file first. Cases must be plain JSON: encode NaN/±∞ with `j`.
 */
export function golden(name: string, cases: unknown[]): void {
  const file = new URL(`${name}.json`, dir);
  const text = `[\n${cases.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`;
  if (process.env.UPDATE_GOLDEN) writeFileSync(file, text);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(text));
}

/** A fixture number: numbers as they are, 'NaN' / 'Infinity' / '-Infinity' as those values. */
export const n = (x: number | string): number => (typeof x === 'string' ? Number(x) : x);
/** A number for a fixture: finite as is, NaN/±∞ as strings (JSON has no such numbers). */
export const j = (x: number): number | string => (Number.isFinite(x) ? x : String(x));
/** A value for a fixture with every non-finite number (at any depth) encoded by `j`, and Maps/Sets as arrays. */
export function plain(x: unknown): unknown {
  if (typeof x === 'number') return j(x);
  if (x instanceof Map) return [...x].map(([k, v]) => [plain(k), plain(v)]);
  if (x instanceof Set) return [...x].map(plain);
  if (Array.isArray(x)) return x.map(plain);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).map(([k, v]) => [k, plain(v)]));
  return x;
}
