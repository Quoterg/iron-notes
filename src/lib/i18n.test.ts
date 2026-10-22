import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coreKeys, t } from './i18n';
import { later } from './strings-later';

const keysIn = (file: string) => [...readFileSync(file, 'utf8').matchAll(/\bt\('([A-Za-z0-9_]+)'/g)].map((m) => m[1]);

/**
 * Every source file in the first-paint bundle: main.tsx and what it imports statically, transitively.
 * Dynamic `import('…')` (lazy screens and modules) is where the walk stops — those load the lazy strings.
 */
function firstPaintFiles(entry = 'src/main.tsx'): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    // `import x from './y'` and `import './y'`, but not `import type` (erased) and not `import('./y')`.
    for (const m of src.matchAll(/^import\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm)) {
      const base = normalize(join(dirname(file), m[1]));
      const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((p) => existsSync(p) && /\.tsx?$/.test(p));
      if (hit) walk(hit);
    }
  };
  walk(entry);
  return [...seen];
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') ? [join(dir, e.name)] : [],
  );
}

describe('strings', () => {
  it('finds the first-paint files from the import graph', () => {
    const files = firstPaintFiles();
    for (const f of ['src/app.tsx', 'src/components/Log.tsx', 'src/state.ts', 'src/nav.ts', 'src/lib/timer.ts']) expect(files).toContain(f);
    // Lazy parts stay out.
    for (const f of ['src/components/Settings.tsx', 'src/components/DayTools.tsx', 'src/workout.ts', 'src/lib/strings-later.ts']) expect(files).not.toContain(f);
  });
  it('first-paint code only uses first-paint strings', () => {
    const core = new Set(coreKeys());
    for (const f of firstPaintFiles()) for (const k of keysIn(f)) expect(core.has(k), `${f}: t('${k}') is not in the core table`).toBe(true);
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
