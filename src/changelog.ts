// What's new: one entry per release a user would notice, newest first; items are string keys (t()), so
// they can be translated. `id` only ever grows; LATEST (changelog-id.ts) is the newest one.
import type { Key } from './lib/i18n';
export { LATEST } from './changelog-id';

export const CHANGELOG: { id: number; items: Key[] }[] = [
  { id: 18, items: ['new_18a'] },
  { id: 17, items: ['new_17a'] },
  { id: 16, items: ['new_16a'] },
  { id: 15, items: ['new_15a'] },
  { id: 14, items: ['new_14a'] },
  { id: 13, items: ['new_13a'] },
  { id: 12, items: ['new_12a', 'new_12b'] },
  { id: 11, items: ['new_11a'] },
  { id: 10, items: ['new_10a', 'new_10b'] },
  { id: 9, items: ['new_9a', 'new_9b'] },
  { id: 8, items: ['new_8a', 'new_8b'] },
  { id: 7, items: ['new_7a', 'new_7b'] },
  { id: 6, items: ['new_6a', 'new_6b'] },
  { id: 5, items: ['new_5a', 'new_5b'] },
  { id: 4, items: ['new_4a', 'new_4b'] },
  { id: 3, items: ['new_3a', 'new_3b', 'new_3c'] },
  { id: 2, items: ['new_2a', 'new_2b', 'new_2c'] },
  { id: 1, items: ['new_1a'] },
];
