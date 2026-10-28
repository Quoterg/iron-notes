// What's new: one entry per release a user would notice, newest first; items are string keys (t()), so
// they can be translated. `id` only ever grows; LATEST (changelog-id.ts) is the newest one.
import type { Key } from './lib/i18n';
export { LATEST } from './changelog-id';

export const CHANGELOG: { id: number; items: Key[] }[] = [
  { id: 4, items: ['new_4a', 'new_4b'] },
  { id: 3, items: ['new_3a', 'new_3b', 'new_3c'] },
  { id: 2, items: ['new_2a', 'new_2b', 'new_2c'] },
  { id: 1, items: ['new_1a'] },
];
