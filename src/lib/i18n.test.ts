import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coreKeys, t } from './i18n';
import { later } from './strings-later';

/** Files in the first-paint bundle: they may only use the core table (the lazy one isn't loaded yet). */
const FIRST_PAINT = ['src/app.tsx', 'src/main.tsx', 'src/lazy.tsx', 'src/state.ts', 'src/components/Log.tsx', 'src/components/RestTimer.tsx', 'src/components/icons.tsx'];
const keysIn = (file: string) => [...readFileSync(file, 'utf8').matchAll(/\bt\('([A-Za-z0-9_]+)'/g)].map((m) => m[1]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') ? [join(dir, e.name)] : [],
  );
}

describe('strings', () => {
  it('first-paint code only uses first-paint strings', () => {
    const core = new Set(coreKeys());
    for (const f of FIRST_PAINT) for (const k of keysIn(f)) expect(core.has(k), `${f}: t('${k}') is not in the core table`).toBe(true);
  });
  it('every key used anywhere exists in one of the tables', () => {
    const all = new Set([...coreKeys(), ...Object.keys(later)]);
    for (const f of sources('src')) for (const k of keysIn(f)) expect(all.has(k), `${f}: t('${k}')`).toBe(true);
  });
  it('the tables do not overlap, and later strings resolve once loaded', () => {
    for (const k of Object.keys(later)) expect(coreKeys()).not.toContain(k);
    expect(t('settings')).toBe('Settings');
    expect(t('est1rm')).toBe('Estimated 1RM'); // strings-later is imported above, so it registered itself
  });
});
