import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addEntry, addMetric, entries, latest, loadBody, loadEntries, metrics, removeEntry, removeMetric, resetBody } from './body-state';
import * as backup from './lib/backup';
import * as db from './lib/db';

describe('body measures', () => {
  it('seeds the starter measures once, even when two screens load at the same time', async () => {
    await Promise.all([loadBody(), loadBody()]);
    expect(metrics.value!.length).toBe(7);
    expect((await db.getMetrics()).length).toBe(7);
    for (const m of metrics.value!) await removeMetric(m.id);
    resetBody();
    await loadBody();
    expect(metrics.value).toEqual([]);
  });

  it('the list reads the latest two dates; a same-date entry replaces the shown value; delete can be undone', async () => {
    const m = await addMetric('Body weight', 'weight');
    await addEntry(m.id, '2026-03-01', 82);
    await addEntry(m.id, '2026-03-02', 81.8);
    await addEntry(m.id, '2026-03-03', 81.6);
    await addEntry(m.id, '2026-03-03', 81.2);
    expect(entries.value.get(m.id)!.map((e) => [e.date, e.value])).toEqual([
      ['2026-03-01', 82],
      ['2026-03-02', 81.8],
      ['2026-03-03', 81.2],
    ]);
    // A fresh start reads only the latest two dates (newest entry of each) for the list.
    resetBody();
    await loadBody();
    expect(latest.value.get(m.id)!.map((e) => e.value)).toEqual([81.8, 81.2]);
    expect(entries.value.get(m.id)).toBeUndefined();
    await loadEntries(m.id);
    const undo = await removeEntry(entries.value.get(m.id)![2]);
    expect(entries.value.get(m.id)!.map((e) => e.value)).toEqual([82, 81.8, 81.6]); // the earlier one of that date
    expect(latest.value.get(m.id)!.map((e) => e.value)).toEqual([81.8, 81.6]);
    await undo();
    expect(entries.value.get(m.id)!.map((e) => e.value)).toEqual([82, 81.8, 81.2]);
  });

  it('round-trips through a backup, drops orphan entries, and an old backup keeps the starter set coming', async () => {
    const b = JSON.parse(JSON.stringify(await backup.exportAll()));
    expect(b.metrics.length).toBe(1);
    expect(b.body.length).toBe(4);
    const orphan = JSON.parse(JSON.stringify(b));
    orphan.body.push({ ...orphan.body[0], id: 'x', metricId: 'gone' });
    await backup.importAll(orphan);
    expect((await db.entriesOf('gone')).length).toBe(0);

    // An older backup (no metrics/body fields): the starter measures are seeded on next open.
    const old = JSON.parse(JSON.stringify(b));
    delete old.metrics;
    delete old.body;
    await backup.importAll(old); // clears every store first, the "seeded" flag too
    resetBody();
    await loadBody();
    expect(metrics.value!.map((m) => m.name)).toContain('Body fat');
  });
});
