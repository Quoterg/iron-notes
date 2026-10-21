import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import * as db from './db';

// Two tabs on different app versions share one database: an upgrade must neither hang nor fail silently.
describe('database upgrades with other tabs open', () => {
  it('reports a blocked upgrade, then finishes once the old tab closes', async () => {
    // The "old tab": version 1 open, with no handler that would close it.
    const old = await openDB(db.DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('categories', { keyPath: 'id' });
        d.createObjectStore('exercises', { keyPath: 'id' });
        const sets = d.createObjectStore('sets', { keyPath: 'id' });
        sets.createIndex('date', 'date');
        sets.createIndex('exercise', 'exerciseId');
        d.createObjectStore('comments', { keyPath: 'date' });
        d.createObjectStore('kv', { keyPath: 'key' });
      },
    });
    let blocked = 0;
    db.setBlockedHandler(() => blocked++);
    const opening = db.db();
    await new Promise((r) => setTimeout(r, 20));
    expect(blocked).toBe(1);
    old.close();
    const d = await opening;
    expect(d.version).toBeGreaterThanOrEqual(2);
    expect(d.objectStoreNames.contains('records')).toBe(true);
  });

  it('steps aside when a newer version opens elsewhere', async () => {
    await db.db(); // this tab, current version, open
    // A "newer tab" upgrading: resolves only if this tab's connection closes itself.
    const newer = await openDB(db.DB_NAME, 99);
    expect(newer.version).toBe(99);
    newer.close();
  });
});
