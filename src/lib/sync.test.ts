import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutSet } from './model';

/** A simulated device: fresh modules with their own IndexedDB. */
async function device() {
  vi.resetModules();
  (globalThis as { indexedDB?: unknown }).indexedDB = new IDBFactory();
  const db = await import('./db');
  const sync = await import('./sync');
  await db.getSettings(); // open (and create) this device's database while its factory is global
  return { db, sync };
}
type Device = Awaited<ReturnType<typeof device>>;

/** One sync round over a JSON "wire", both directions. Returns how many records changed on a, b. */
async function syncPair(a: Device, b: Device): Promise<[number, number]> {
  const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const [sa, sb] = [await a.sync.summarize(), await b.sync.summarize()];
  const [ca, cb] = [wire(await a.sync.changesFor(wire(sb), sa)), wire(await b.sync.changesFor(wire(sa), sb))];
  return [(await a.sync.applyChanges(cb)).count, (await b.sync.applyChanges(ca)).count];
}

const set = (id: string, weight = 100, date = '2026-11-01'): WorkoutSet => ({ id, date, exerciseId: 'bench', order: 1, weight, reps: 8 });
const ids = async (d: Device) => (await d.db.setsOn('2026-11-01')).map((s) => s.id).sort();
const at = (t: number) => vi.spyOn(Date, 'now').mockReturnValue(t);

afterEach(() => vi.restoreAllMocks());

describe('device-to-device sync', () => {
  it('brings both devices to the union of their data, and a second round changes nothing', async () => {
    const a = await device();
    const b = await device();
    await a.db.putSet(set('a1'));
    await a.db.putExercise({ id: 'bench', name: 'Bench', categoryId: 'c', type: 'weight,reps' });
    await b.db.putSet(set('b1'));
    await b.db.putRoutine({ id: 'r', name: 'Push', order: 0, days: [] });
    expect(await syncPair(a, b)).toEqual([2, 2]);
    expect(await ids(a)).toEqual(['a1', 'b1']);
    expect(await ids(b)).toEqual(['a1', 'b1']);
    expect((await b.db.getLibrary()).exercises.map((e) => e.id)).toEqual(['bench']);
    expect((await a.db.getRoutines()).map((r) => r.name)).toEqual(['Push']);
    expect(await syncPair(a, b)).toEqual([0, 0]);
  });

  it('the newer edit wins; a deletion travels and wins over an older edit', async () => {
    const a = await device();
    const b = await device();
    at(1000);
    await a.db.putSet(set('s', 100));
    await syncPair(a, b);
    at(2000);
    await b.db.putSet(set('s', 105)); // newer on b
    at(1500);
    await a.db.putSet(set('s', 102)); // older on a
    await syncPair(a, b);
    expect((await a.db.setsOn('2026-11-01'))[0].weight).toBe(105);
    at(3000);
    await a.db.deleteSet('s');
    await syncPair(a, b);
    expect(await ids(b)).toEqual([]);
  });

  it('settings sync except the device’s own (language, screen, notifications)', async () => {
    const a = await device();
    const b = await device();
    const base = await a.db.getSettings();
    at(1000);
    await b.db.putSettings({ ...base, lang: 'sv', keepScreenOn: true });
    at(2000);
    await a.db.putSettings({ ...base, mode: 'lyle', unit: 'lb', lang: 'en' });
    await syncPair(a, b);
    const sb = await b.db.getSettings();
    expect(sb).toMatchObject({ mode: 'lyle', unit: 'lb', lang: 'sv', keepScreenOn: true });
  });

  it('refuses invalid or mis-keyed records before writing anything', async () => {
    const b = await device();
    const good = { k: 'sets:x', mt: 5, v: set('x') };
    await expect(b.sync.applyChanges([good, { k: 'sets:y', mt: 5, v: { id: 'y', date: 'nope' } }])).rejects.toThrow('invalid sets record');
    await expect(b.sync.applyChanges([{ k: 'sets:z', mt: 5, v: set('other') }])).rejects.toThrow('key mismatch');
    expect(await ids(b)).toEqual([]);
    // A store from a newer version is skipped; the rest applies.
    expect((await b.sync.applyChanges([{ k: 'future:1', mt: 5, v: {} }, good])).count).toBe(1);
  });

  it('a clock far ahead can’t make a record unbeatable', async () => {
    const a = await device();
    at(10_000);
    await a.sync.applyChanges([{ k: 'sets:x', mt: 10_000 + 365 * 864e5, v: set('x', 90) }]);
    at(10_000 + 10 * 60_000);
    await a.db.putSet(set('x', 95)); // ten minutes later, here
    const s = await a.sync.summarize();
    expect(s['sets:x']).toBe(10_000 + 10 * 60_000);
  });

  it('data from before the change log (a v4 database) gets an old change time and syncs', async () => {
    vi.resetModules();
    const factory = new IDBFactory();
    (globalThis as { indexedDB?: unknown }).indexedDB = factory;
    await new Promise<void>((ok) => {
      const req = factory.open('iron-notes', 4);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of ['categories', 'exercises', 'routines', 'metrics']) d.createObjectStore(s, { keyPath: 'id' });
        const sets = d.createObjectStore('sets', { keyPath: 'id' });
        sets.createIndex('date', 'date');
        sets.createIndex('exercise', 'exerciseId');
        sets.createIndex('exerciseOrder', ['exerciseId', 'date', 'order']);
        d.createObjectStore('comments', { keyPath: 'date' });
        d.createObjectStore('kv', { keyPath: 'key' });
        d.createObjectStore('records', { keyPath: 'exerciseId' });
        const body = d.createObjectStore('body', { keyPath: 'id' });
        body.createIndex('metric', 'metricId');
        body.createIndex('metricDate', ['metricId', 'date', 'at']);
      };
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction(['sets', 'kv'], 'readwrite');
        tx.objectStore('sets').put(set('old'));
        tx.objectStore('kv').put({ key: 'settings', value: { unit: 'lb' } });
        tx.oncomplete = () => {
          d.close();
          ok();
        };
      };
    });
    const db = await import('./db');
    const sync = await import('./sync');
    const old = { db, sync };
    const s = await sync.summarize();
    expect(s).toEqual({ 'sets:old': 1, 'kv:settings': 1 });
    const fresh = await device();
    await syncPair(old, fresh);
    expect(await ids(fresh)).toEqual(['old']);
  });

  it('each device’s own starter library: matched by name, not added twice; references mapped', async () => {
    const a = await device();
    const b = await device();
    // Both seeded the starter library, each with its own ids.
    await a.db.putLibrary([{ id: 'ca', name: 'Chest', color: '#f0566a', order: 0 }], [{ id: 'xa', name: 'Bench', categoryId: 'ca', type: 'weight,reps' }]);
    await b.db.putLibrary([{ id: 'cb', name: 'Chest', color: '#f0566a', order: 0 }], [{ id: 'xb', name: 'Bench', categoryId: 'cb', type: 'weight,reps' }]);
    await a.db.putSet({ ...set('sa'), exerciseId: 'xa' });
    await b.db.putSet({ ...set('sb'), exerciseId: 'xb' });
    await b.db.putRoutine({ id: 'r', name: 'Push', order: 0, days: [{ id: 'd', name: 'A', items: [{ exerciseId: 'xb', sets: [{}] }] }] });
    // B's own exercise that A doesn't have travels, with its category mapped.
    await b.db.putExercise({ id: 'own', name: 'Cable Fly', categoryId: 'cb', type: 'weight,reps' });
    await syncPair(a, b);
    const libA = await a.db.getLibrary();
    expect(libA.categories.map((c) => c.id)).toEqual(['ca']);
    expect(libA.exercises.map((e) => [e.id, e.categoryId]).sort()).toEqual([['own', 'ca'], ['xa', 'ca']]);
    expect((await a.db.setsOn('2026-11-01')).map((s) => [s.id, s.exerciseId]).sort()).toEqual([['sa', 'xa'], ['sb', 'xa']]);
    expect((await a.db.getRoutines())[0].days[0].items[0].exerciseId).toBe('xa');
    const libB = await b.db.getLibrary();
    expect(libB.exercises.map((e) => e.id).sort()).toEqual(['own', 'xb']);
    expect((await b.db.setsOn('2026-11-01')).map((s) => [s.id, s.exerciseId]).sort()).toEqual([['sa', 'xb'], ['sb', 'xb']]);
    // Later edits keep mapping; a second round changes nothing new.
    await b.db.putSet({ ...set('sb2'), exerciseId: 'xb' });
    await syncPair(a, b);
    expect((await a.db.setsOn('2026-11-01')).find((s) => s.id === 'sb2')?.exerciseId).toBe('xa');
    expect(await syncPair(a, b)).toEqual([0, 0]);
  });
});

