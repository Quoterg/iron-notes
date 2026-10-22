import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addEntry, addMetric, entries, loadBody, metrics, removeEntry, removeMetric, resetBody } from './body-state';
import * as backup from './lib/backup';
import * as db from './lib/db';

describe('body measures', () => {
  it('seeds the starter measures once', async () => {
    await loadBody();
    expect(metrics.value!.map((m) => m.name)).toContain('Body weight');
    for (const m of metrics.value!) await removeMetric(m.id);
    resetBody();
    await loadBody();
    expect(metrics.value).toEqual([]);
  });

  it('adds entries; a second one on the same date replaces the shown value', async () => {
    const m = await addMetric('Body weight', 'weight');
    await addEntry(m.id, '2026-03-01', 82);
    await addEntry(m.id, '2026-03-03', 81.6);
    await addEntry(m.id, '2026-03-03', 81.2);
    expect(entries.value.get(m.id)!.map((e) => [e.date, e.value])).toEqual([
      ['2026-03-01', 82],
      ['2026-03-03', 81.2],
    ]);
    await removeEntry(entries.value.get(m.id)![1]);
    // The earlier value of that date shows again (both were stored).
    expect(entries.value.get(m.id)!.map((e) => e.value)).toEqual([82, 81.6]);
  });

  it('round-trips through a backup; deleting a measure deletes its entries', async () => {
    const b = JSON.parse(JSON.stringify(await backup.exportAll()));
    expect(b.metrics.length).toBe(1);
    expect(b.body.length).toBe(2);
    const bad = JSON.parse(JSON.stringify(b));
    bad.body[0].date = 'yesterday';
    await expect(backup.importAll(bad)).rejects.toThrow();
    const id = metrics.value![0].id;
    await removeMetric(id);
    expect(await db.entriesOf(id)).toEqual([]);
    await backup.importAll(b);
    resetBody();
    await loadBody();
    expect(entries.value.get(id)!.length).toBe(2);
  });
});
