// The native app's strings come from the web app's tables (one place for all wording, docs/NATIVE.md):
// native/app/src/main/assets/strings.json holds English (first screen + later screens) and the Swedish
// pack. This test fails when the file is out of date; regenerate with `UPDATE_STRINGS=1 pnpm test native-strings`.
// Placeholders stay `{name}` — the native `t()` replaces them like the web's.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { coreStrings } from './i18n';
import sv from './lang/sv';
import { later } from './strings-later';

it('native strings.json matches the web string tables', () => {
  const en = { ...coreStrings(), ...(later as Record<string, string>) };
  for (const [k, v] of Object.entries(en)) expect(typeof v, k).toBe('string');
  const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const data = {
    en: sorted(en),
    sv: {
      strings: sorted(sv.strings as Record<string, string>),
      types: sorted(sv.types),
      exercises: sorted(sv.exercises),
      categories: sorted(sv.categories),
      metrics: sorted(sv.metrics),
    },
  };
  const file = new URL('../../native/app/src/main/assets/strings.json', import.meta.url);
  const text = JSON.stringify(data, null, 1) + '\n';
  if (process.env.UPDATE_STRINGS) writeFileSync(file, text);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(data);
});
