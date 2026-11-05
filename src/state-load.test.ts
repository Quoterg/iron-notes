import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from './lib/db';
import { bodyWeightsChanged, exercises, loadLibrary, loadRecords, records } from './state';

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('load types for existing installs', () => {
  it('converts reps-only Dips once and re-ranks its records by the real load; a weigh-in rebuilds them', async () => {
    await db.putLibrary(
      [{ id: 'c', name: 'Triceps', color: '#8c5aff', order: 0 }],
      [
        { id: 'dips', name: 'Dips', categoryId: 'c', type: 'reps' },
        { id: 'curl', name: 'Dumbbell Curl', categoryId: 'c', type: 'distance,time' }, // changed elsewhere: stays
      ],
    );
    await db.markSeeded();
    await db.putSets([
      { id: 'a', date: '2026-10-01', exerciseId: 'dips', order: 1, reps: 15 },
      { id: 'b', date: '2026-10-02', exerciseId: 'dips', order: 2, reps: 12 },
    ]);
    await db.putRecords({ exerciseId: 'dips', ids: ['a'] }); // ranked by reps before
    await loadLibrary();
    await until(() => exercises.value.find((e) => e.id === 'dips')?.load === 'bodyweight');
    expect(exercises.value.find((e) => e.id === 'dips')).toMatchObject({ type: 'weight,reps', load: 'bodyweight' });
    expect(exercises.value.find((e) => e.id === 'curl')?.type).toBe('distance,time');
    await until(() => !!records.value.get('dips')?.size);
    // As weight and reps (body weight alone, no weigh-in yet): 15 and 12 reps at the same load — 15 holds.
    expect([...records.value.get('dips')!].sort()).toEqual(['a']);

    // A weigh-in drops the stored records; the next use rebuilds them from the sets.
    await db.putEntry({ id: 'w', metricId: 'm', date: '2026-10-01', value: 80, at: 1 });
    await bodyWeightsChanged();
    expect(records.value.has('dips')).toBe(false);
    expect(await db.getRecords('dips')).toBeUndefined();
    await loadRecords(['dips']);
    expect([...records.value.get('dips')!]).toEqual(['a']); // rebuilt from the sets: 15 reps beats 12 at the same load
  });
});
