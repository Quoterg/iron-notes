// Golden fixtures for the Rust core's backup validation, muscles tables and starter data (N2):
// native/core-rs/tests/golden/{backup,muscles,seed}.json, checked by native/core-rs/tests/golden_backup.rs.
// Inputs are plain JSON (a key that is absent in the file is `undefined` here). Rows in the inputs
// carry no unknown extra fields: the Rust rows drop them (the TS keeps them), see core-rs backup.rs.
import { describe, it } from 'vitest';
import { cleanSettings, validateBackup } from './backup';
import { golden, plain } from './golden-fixtures';
import { DEFAULT_LOADS } from './load-defaults';
import { defaultMuscles, normalizeMuscles } from './muscles';
import { COLORS, starterLibrary } from './seed';
import { defaultMetrics } from './body';
import type { Muscles } from './model';

type J = Record<string, unknown>;
const clone = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

/** A realistic backup using every field and every type. */
function full(): J {
  return {
    app: 'iron-notes',
    version: 1,
    exported: '2026-11-10T08:30:00.000Z',
    categories: [
      { id: 'c1', name: 'Chest', color: '#f0566a', order: 0 },
      { id: 'c2', name: 'Back', color: '#F29A38', order: 1, rest: 150 },
      { id: 'c3', name: 'Cardio', color: '#2bcf9a', order: 2, rest: 0 },
    ],
    exercises: [
      { id: 'e1', name: 'Flat Barbell Bench Press', categoryId: 'c1', type: 'weight,reps', notes: 'Pause on the chest', increment: 2.5, rest: 180, repTop: 8, repBottom: 5, favorite: true, joint: false, plates: true, load: 'total',
        muscles: { primary: ['triceps', 'chest', 'chest'], secondary: ['frontDelts', 'chest', 'triceps', 'frontDelts'] } },
      { id: 'e2', name: 'Dumbbell Fly', categoryId: 'c1', type: 'weight,reps', load: 'perHand', muscles: { primary: [], secondary: ['chest'] } },
      { id: 'e3', name: 'Pull Up', categoryId: 'c2', type: 'weight,reps', load: 'bodyweight', increment: 0, repTop: 12 },
      { id: 'e4', name: 'Assisted Pull Up', categoryId: 'c2', type: 'weight,reps', load: 'assisted', notes: '', muscles: { primary: ['lats'], secondary: ['biceps', 'rearDelts'] } },
      { id: 'e5', name: 'Running', categoryId: 'c3', type: 'distance,time', favorite: false },
      { id: 'e6', name: 'Plank', categoryId: 'c2', type: 'time', muscles: { primary: ['abs'], secondary: [] } },
      { id: 'e7', name: 'Sled push', categoryId: 'c3', type: 'weight,distance' },
      { id: 'e8', name: 'Farmer walk', categoryId: 'c3', type: 'weight,time' },
      { id: 'e9', name: 'Burpee', categoryId: 'c3', type: 'reps,distance' },
      { id: 'e10', name: 'Rope climb', categoryId: 'c3', type: 'reps,time' },
      { id: 'e11', name: 'Shrug hold', categoryId: 'c2', type: 'weight' },
      { id: 'e12', name: 'Push Up', categoryId: 'c1', type: 'reps' },
      { id: 'e13', name: 'Sprint', categoryId: 'c3', type: 'distance' },
    ],
    sets: [
      { id: 's1', date: '2026-11-09', exerciseId: 'e1', order: 1762675800000, weight: 100, reps: 5, comment: 'Felt heavy', group: 'g1', done: true, rir: 2, after: 3, warmup: true, deload: true, sore: 1, at: 1762675900000 },
      { id: 's2', date: '2026-11-09', exerciseId: 'e1', order: 1762675800001, weight: 0, reps: 0, planned: true, done: false, sore: 0 },
      { id: 's3', date: '2026-11-10', exerciseId: 'e5', order: 1762762200000, distance: 5.25, time: 1500, comment: '', sore: 2 },
      { id: 's4', date: '2026-11-10', exerciseId: 'e3', order: 1762762200001, weight: 12.5, reps: 8.5 },
    ],
    comments: [{ date: '2026-11-09', text: 'Good day' }, { date: '2026-11-10', text: '' }],
    routines: [
      { id: 'r1', name: 'Upper / Lower', order: 0, days: [
        { id: 'd1', name: 'Upper', items: [
          { exerciseId: 'e1', group: 'ss', sets: [{ weight: 100, reps: 5 }, { weight: 100 }, { reps: 8 }, {}] },
          { exerciseId: 'e2', group: 'ss', sets: [{ weight: 20, reps: 12 }] },
          { exerciseId: 'e5', sets: [{ distance: 5, time: 1800 }] },
        ] },
        { id: 'd2', name: '', items: [] },
      ] },
      { id: 'r2', name: 'Empty', order: 1, days: [] },
    ],
    metrics: [
      { id: 'm1', name: 'Body weight', kind: 'weight', order: 0 },
      { id: 'm2', name: 'Body fat', kind: 'percent', order: 1 },
      { id: 'm3', name: 'Waist', kind: 'length', order: 2 },
      { id: 'm4', name: 'Steps', kind: 'number', order: 3 },
    ],
    body: [
      { id: 'b1', metricId: 'm1', date: '2026-11-09', value: 82.4, at: 1762675800000 },
      { id: 'b2', metricId: 'm1', date: '2026-11-10', value: 82.1, at: 1762762200000 },
      { id: 'b3', metricId: 'gone', date: '2026-11-10', value: 12, at: 1762762200000 },
      { id: 'b4', metricId: 'm3', date: '2026-11-10', value: -3, at: 0 },
    ],
    settings: {
      mode: 'lyle', unit: 'lb', dist: 'mi', rest: 120, autoTimer: false, timerSound: false, markDone: true, formula: 'brzycki', weekStart: 0, keepScreenOn: true,
      plates: { unit: 'lb', bar: 45, sizes: [2.5, 45, 10, 25, 5, 35, 45] },
      cycle: { start: '2026-10-26', weeks: 8 }, light: { start: '2026-11-02' },
      program: { routineId: 'r1', lastDayId: 'd1', weekdays: [5, 1, 3, 1] },
      diet: 'cut', lang: 'sv', roundPlates: true, restNotify: false, gymEnglish: true,
    },
    futureField: { anything: true },
  };
}

const minimal = (): J => ({ app: 'iron-notes', version: 1, categories: [], exercises: [], sets: [] });

function run(input: unknown) {
  try {
    return { in: input, out: plain(validateBackup(clone(input))) };
  } catch (e) {
    return { in: input, out: { error: (e as Error).message } };
  }
}

/** A copy of `base` with `path` (dot-separated; numbers index arrays) set to `value` (undefined deletes). */
function put(base: J, path: string, value: unknown): J {
  const b = clone(base);
  const keys = path.split('.');
  let o = b as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
  return b;
}

const backupCases: { fn: string; in?: unknown; out: unknown }[] = [];

describe('golden: backup validation', () => {
  it('validateBackup', () => {
    const cases = backupCases;
    const add = (input: unknown) => cases.push({ fn: 'validateBackup', ...run(input) });
    const F = full();

    // ---- valid ----
    add(F);
    add(minimal());
    add({ ...minimal(), futureField: 1, exported: 'x' });
    // Older backups: no routines / metrics / body / comments / settings.
    for (const k of ['routines', 'metrics', 'body', 'comments', 'settings', 'exported']) add(put(F, k, undefined));
    add({ ...clone(F), routines: undefined, metrics: undefined, body: undefined, comments: undefined, settings: undefined });
    // Body entries without metrics (all orphans), with a metric key but no body, with matching and orphan ones.
    add(put(F, 'metrics', undefined));
    add(put(F, 'metrics', []));
    add(put(F, 'body', undefined));
    add(put(F, 'body', []));
    // Muscles: non-canonical, duplicated, primary also secondary.
    for (const muscles of [
      { primary: ['abs', 'chest', 'abs'], secondary: ['abs', 'calves', 'chest', 'calves', 'lats'] },
      { primary: [], secondary: [] },
      { primary: ['calves', 'quads', 'glutes', 'hamstrings', 'lowerBack', 'traps', 'lats', 'rearDelts', 'sideDelts', 'frontDelts', 'chest', 'biceps', 'triceps', 'forearms', 'abs'], secondary: ['chest', 'abs'] },
      { primary: ['chest'], secondary: ['chest'] },
    ]) add(put(F, 'exercises.0.muscles', muscles));
    // Every exercise type and load type.
    for (const type of ['weight,reps', 'weight,distance', 'weight,time', 'reps,distance', 'reps,time', 'distance,time', 'weight', 'reps', 'distance', 'time'])
      add(put(F, 'exercises.0.type', type));
    for (const load of ['total', 'perHand', 'bodyweight', 'assisted']) add(put(F, 'exercises.0.load', load));
    // Boundaries that are valid.
    add(put(F, 'categories.0.color', '#aBcDeF'));
    add(put(F, 'categories.0.rest', 0));
    add(put(F, 'exercises.0.repTop', 1));
    add(put(F, 'exercises.0.repBottom', 100));
    add(put(F, 'sets.0.sore', 2));
    add(put(F, 'sets.3.date', '0000-00-00'));
    add(put(F, 'sets.3.reps', 1e21));
    add(put(F, 'sets.3.weight', 0.1 + 0.2));
    add(put(F, 'routines.0.days.0.items.0.sets', []));
    // `exported` of various types (String(x ?? '')).
    for (const exported of ['', 'text', 0, 5, -2, 1.5, 0.1 + 0.2, 1e21, 1e-7, 1.25e-7, 0.000001, 1e300, -1e-10, true, false, null, [], [1, 2], [1, [2, null], 'a', true], {}, { a: 1 }])
      add(put(minimal(), 'exported', exported));

    // ---- not a backup / version ----
    for (const v of [null, 5, 'iron-notes', true, [], {}, { app: 'iron-log', version: 1 }, { app: 'Iron-Notes', version: 1 }, { version: 1 }, { app: 5, version: 1 }]) add(v);
    for (const version of [undefined, 0, 2, '1', 1.5, null, true, [1], [], {}, 'x', 1e21, 1e-7, -1, [null, 'a']]) add(put(minimal(), 'version', version));

    // ---- invalid rows: each rule broken once ----
    const rows: [string, [string, unknown][]][] = [
      ['categories', [
        ['', undefined], ['', null], ['', {}], ['', 'x'], ['', 5], ['', []],
        ['0.id', ''], ['0.id', 5], ['0.id', undefined], ['0.id', null],
        ['0.name', ''], ['0.name', 5], ['0.name', undefined],
        ['0.color', 'red'], ['0.color', '#12345'], ['0.color', '#1234567'], ['0.color', '#GGGGGG'], ['0.color', 'f0566a'], ['0.color', '#f0566a '], ['0.color', '#f0566a\n'], ['0.color', 5], ['0.color', undefined],
        ['0.order', '0'], ['0.order', null], ['0.order', undefined], ['0.order', true],
        ['0.rest', -1], ['0.rest', '60'], ['0.rest', null], ['0.rest', true],
      ]],
      ['exercises', [
        ['', undefined], ['', null], ['', {}], ['', 'x'],
        ['0.id', ''], ['0.id', 1], ['0.name', ''], ['0.name', null], ['0.categoryId', ''], ['0.categoryId', 2], ['0.categoryId', undefined],
        ['0.type', 'weight,reps,time'], ['0.type', 'Weight'], ['0.type', undefined], ['0.type', 5], ['0.type', ['weight']],
        ['0.notes', 5], ['0.notes', null], ['0.increment', -2.5], ['0.increment', '2.5'], ['0.rest', -1], ['0.rest', null],
        ['0.repTop', 0], ['0.repTop', 8.5], ['0.repTop', -3], ['0.repTop', '8'], ['0.repTop', null], ['0.repBottom', 0.5], ['0.repBottom', 0],
        ['0.favorite', 1], ['0.favorite', 'true'], ['0.favorite', null], ['0.joint', 0], ['0.plates', 'yes'],
        ['0.load', 'perhand'], ['0.load', ''], ['0.load', null], ['0.load', 1], ['0.load', true],
        ['0.muscles', null], ['0.muscles', 0], ['0.muscles', ''], ['0.muscles', false], ['0.muscles', []], ['0.muscles', {}],
        ['0.muscles', { primary: ['chest'] }], ['0.muscles', { secondary: [] }], ['0.muscles', { primary: 'chest', secondary: [] }],
        ['0.muscles', { primary: ['chest'], secondary: 'abs' }], ['0.muscles', { primary: ['pecs'], secondary: [] }], ['0.muscles', { primary: [], secondary: ['Chest'] }],
        ['0.muscles', { primary: [5], secondary: [] }], ['0.muscles', { primary: [null], secondary: [] }], ['0.muscles', { primary: ['chest', 'nope'], secondary: [] }],
      ]],
      ['sets', [
        ['', undefined], ['', {}], ['', null], ['0', null], ['0', 'x'], ['0', []],
        ['0.id', ''], ['0.id', 3], ['0.date', '2026-1-1'], ['0.date', '2026-01-01 '], ['0.date', ' 2026-01-01'], ['0.date', '2026-01-01\n'], ['0.date', '2026/01/01'], ['0.date', '20260101'], ['0.date', '２０２６-01-01'],
        ['0.date', '2026-01-011'], ['0.date', 20260101], ['0.date', undefined], ['0.date', null],
        ['0.exerciseId', ''], ['0.exerciseId', 1], ['0.order', '1'], ['0.order', null], ['0.order', undefined],
        ['0.weight', -1], ['0.weight', '100'], ['0.weight', null], ['0.reps', -0.5], ['0.reps', true], ['0.distance', -1], ['0.distance', 'far'], ['0.time', -1], ['0.time', null],
        ['0.comment', 5], ['0.comment', null], ['0.group', 5], ['0.group', false],
        ['0.done', 1], ['0.done', 'true'], ['0.done', null], ['1.planned', false], ['1.planned', 1], ['1.planned', 'true'], ['1.planned', null],
        ['0.rir', -1], ['0.rir', '2'], ['0.after', -1], ['0.after', null], ['0.at', -1], ['0.at', 'now'],
        ['0.warmup', false], ['0.warmup', 1], ['0.deload', false], ['0.deload', 'true'],
        ['0.sore', 3], ['0.sore', -1], ['0.sore', 1.5], ['0.sore', '1'], ['0.sore', null], ['0.sore', true],
      ]],
      ['comments', [
        ['', null], ['', {}], ['', 'x'], ['0', null], ['0', 'x'], ['0.date', '2026-1-1'], ['0.date', undefined], ['0.date', 5], ['0.text', undefined], ['0.text', 5], ['0.text', null],
      ]],
      ['routines', [
        ['', null], ['', {}], ['', 'x'], ['0', null], ['0', []], ['0.id', ''], ['0.id', 1], ['0.name', ''], ['0.name', 1], ['0.order', '0'], ['0.order', undefined],
        ['0.days', undefined], ['0.days', null], ['0.days', {}], ['0.days.0', null], ['0.days.0', 'd'], ['0.days.0.id', ''], ['0.days.0.id', 1], ['0.days.0.name', undefined], ['0.days.0.name', 1],
        ['0.days.0.items', undefined], ['0.days.0.items', {}], ['0.days.0.items.0', null], ['0.days.0.items.0.exerciseId', ''], ['0.days.0.items.0.exerciseId', 5],
        ['0.days.0.items.0.sets', undefined], ['0.days.0.items.0.sets', {}], ['0.days.0.items.0.sets', 'x'], ['0.days.0.items.0.sets.0', null], ['0.days.0.items.0.sets.0', 5], ['0.days.0.items.0.sets.0', 'x'],
        ['0.days.0.items.0.sets.0', true], ['0.days.0.items.0.sets.0.weight', -1], ['0.days.0.items.0.sets.0.weight', '5'], ['0.days.0.items.0.sets.0.reps', null],
        ['0.days.0.items.0.sets.1.distance', -1], ['0.days.0.items.0.sets.2.time', 'x'], ['0.days.0.items.0.group', 5], ['0.days.0.items.0.group', null],
      ]],
      ['metrics', [
        ['', null], ['', {}], ['', 'x'], ['0', null], ['0.id', ''], ['0.id', 2], ['0.name', ''], ['0.name', undefined], ['0.kind', 'mass'], ['0.kind', 'Weight'], ['0.kind', undefined], ['0.kind', 5],
        ['0.order', 'x'], ['0.order', null], ['0.order', undefined],
      ]],
      ['body', [
        ['', null], ['', {}], ['', 'x'], ['0', null], ['0.id', ''], ['0.id', 2], ['0.metricId', ''], ['0.metricId', 5], ['0.date', '2026-11-1'], ['0.date', undefined],
        ['0.value', '82'], ['0.value', null], ['0.value', undefined], ['0.at', '0'], ['0.at', null], ['0.at', undefined],
      ]],
    ];
    for (const [store, breaks] of rows) for (const [sub, value] of breaks) add(put(F, sub ? `${store}.${sub}` : store, value));
    // Several stores broken: the first in order wins.
    add(put(put(put(F, 'body', 'x'), 'sets', 'x'), 'categories', 'x'));
    add(put(put(F, 'body', 'x'), 'metrics', 'x'));
    add(put(put(F, 'routines', 'x'), 'comments', 'x'));
    add(put(put(F, 'sets', 'x'), 'exercises', 'x'));
    add(put(put(F, 'settings', 'x'), 'body', 'x'));

    // ---- settings container ----
    for (const settings of [null, 'x', '', 5, 0, true, false, [], [1], {}, { extra: 1 }]) add(put(minimal(), 'settings', settings));

  });

  it('cleanSettings', () => {
    const cases = backupCases;
    const add = (st: unknown, absent = false) => cases.push({ fn: 'cleanSettings', ...(absent ? {} : { in: st }), out: plain(cleanSettings(clone(st) as never)) });
    add(undefined, true);
    for (const st of [null, 0, '', false, 'abc', 5, true, [], [1, 2], {}, { unknown: 1 }]) add(st);
    const each: Record<string, unknown[]> = {
      mode: ['standard', 'dorian', 'lyle', 'Lyle', '', 'x', 1, null, true, []],
      unit: ['kg', 'lb', 'KG', 'oz', '', 1, null],
      dist: ['km', 'mi', 'm', 'ft', 'KM', 2, null],
      rest: [60, 1, 0.5, 0, -5, 1.5, 3600, 1e9, '60', null, true, [60]],
      formula: ['epley', 'brzycki', 'lombardi', '', 1, null],
      weekStart: [0, 1, 2, -1, 0.5, '1', '0', null, true, false],
      autoTimer: [true, false, 1, 0, 'true', null, []],
      timerSound: [true, false, 'x'],
      markDone: [true, false, 1],
      keepScreenOn: [true, false, null],
      diet: ['build', 'maintain', 'cut', 'bulk', '', 1, null],
      lang: ['en', 'sv', 'de', 'EN', '', null, 1],
      roundPlates: [true, false, 1, 'x', null],
      restNotify: [true, false, 1, null],
      gymEnglish: [true, false, 0, null],
      cycle: [
        { start: '2026-10-26', weeks: 6 }, { start: '2026-10-26', weeks: 8 }, { start: '2026-10-26', weeks: 7 }, { start: '2026-10-26', weeks: 4 }, { start: '2026-10-26', weeks: '6' },
        { start: '2026-10-26', weeks: 6.0001 }, { start: '2026-10-26' }, { weeks: 6 }, { start: '2026-1-1', weeks: 6 }, { start: 20261026, weeks: 6 }, { start: '2026-10-26\n', weeks: 8 },
        { start: '2026-10-26', weeks: 8, extra: 1 }, null, 0, '', 'x', 5, true, [], {},
      ],
      light: [{ start: '2026-11-02' }, { start: '2026-11-2' }, { start: 5 }, {}, { start: null }, null, 0, 'x', true, [], { start: '2026-11-02', weeks: 3 }],
      program: [
        { routineId: 'r1' }, { routineId: 'r1', lastDayId: 'd1' }, { routineId: 'r1', lastDayId: '' }, { routineId: 'r1', lastDayId: 5 }, { routineId: '' }, { routineId: 5 }, {}, null, 0, 'x', true, [],
        { routineId: 'r1', weekdays: [1, 3, 5] }, { routineId: 'r1', weekdays: [5, 3, 1, 3, 5, 0, 6] }, { routineId: 'r1', weekdays: [] }, { routineId: 'r1', weekdays: [7, -1, 1.5, 2.5, '3', null, true, 8] },
        { routineId: 'r1', weekdays: [7, 2, -1, 2] }, { routineId: 'r1', weekdays: [6, 0] }, { routineId: 'r1', weekdays: 'x' }, { routineId: 'r1', weekdays: null }, { routineId: 'r1', weekdays: {} },
        { routineId: 'r1', lastDayId: 'd2', weekdays: [4] }, { routineId: 'r1', weekdays: [1e21, 3] }, { routineId: 'r1', weekdays: [[1], 2] },
      ],
      plates: [
        { unit: 'kg', bar: 20, sizes: [25, 20, 15, 10, 5, 2.5, 1.25] }, { unit: 'lb', bar: 45, sizes: [2.5, 45, 10, 25, 5, 35] }, { unit: 'kg', bar: 20, sizes: [1.25, 25, 1.25, 25] },
        { unit: 'kg', bar: 0, sizes: [10] }, { unit: 'kg', bar: -1, sizes: [10] }, { unit: 'kg', bar: 1000, sizes: [10] }, { unit: 'kg', bar: 100, sizes: [10] }, { unit: 'kg', bar: 101, sizes: [10] }, { unit: 'kg', bar: 500, sizes: [10] },
        { unit: 'kg', bar: 20, sizes: [] }, { unit: 'kg', bar: 20, sizes: [0] }, { unit: 'kg', bar: 20, sizes: [0.001] }, { unit: 'kg', bar: 20, sizes: [0.01, 10] }, { unit: 'kg', bar: 20, sizes: [1e6] }, { unit: 'kg', bar: 20, sizes: [1000] },
        { unit: 'kg', bar: 20, sizes: [500, 5] }, { unit: 'kg', bar: 20, sizes: [-5, 10] }, { unit: 'kg', bar: 20, sizes: [10, 'x'] }, { unit: 'kg', bar: 20, sizes: [10, null] }, { unit: 'kg', bar: 20, sizes: 'x' }, { unit: 'kg', bar: 20, sizes: [[10]] },
        { unit: 'kg', bar: 20, sizes: Array.from({ length: 12 }, (_, i) => i + 1) }, { unit: 'kg', bar: 20, sizes: Array.from({ length: 13 }, (_, i) => i + 1) }, { unit: 'kg', bar: 20, sizes: Array.from({ length: 30 }, (_, i) => i + 1) },
        { unit: 'kg', bar: 20, sizes: [10, 25, 10.5, 0.5, 2.25] },
        { unit: 'KG', bar: 20, sizes: [10] }, { unit: 'g', bar: 20, sizes: [10] }, { unit: undefined, bar: 20, sizes: [10] }, { bar: 20, sizes: [10] },
        { unit: 'kg', sizes: [10] }, { unit: 'kg', bar: '20', sizes: [10] }, { unit: 'kg', bar: null, sizes: [10] }, { unit: 'kg', bar: 20 }, null, 0, 'x', true, [], {},
      ],
    };
    for (const [key, values] of Object.entries(each)) for (const v of values) add({ [key]: v });
    // Everything valid at once, then the same with garbage elsewhere.
    add(full().settings);
    add({ ...(full().settings as J), mode: 'bogus', rest: -1, plates: { unit: 'kg', bar: 20, sizes: [] }, cycle: { start: 'x', weeks: 6 } });
    add({ mode: 'dorian', unit: 'kg', dist: 'm', rest: 45, weekStart: 1, light: { start: '2026-11-02' }, program: { routineId: 'r' }, diet: 'maintain', lang: 'en' });
  });

  it('matches the fixtures', () => {
    golden('backup', backupCases);
  });
});

describe('golden: muscles and starter data', () => {
  it('muscles', () => {
    const lib = starterLibrary();
    const names = lib.exercises.map((e) => e.name);
    const cases: unknown[] = [];
    for (const name of names) {
      for (const variant of [name, name.toLowerCase(), name.toUpperCase(), `  ${name}\t`, ` ${name.toLowerCase()} `, `﻿${name}`, `\u0085${name}`, `${name}s`, name.replace(/ /g, '')])
        cases.push({ fn: 'defaultMuscles', name: variant, out: plain(defaultMuscles(variant)) ?? null });
    }
    for (const name of ['', ' ', 'unknown', 'dead lift', 'Squat', 'Bench Press', 'pull-up', 'ÖVERHEAD PRESS', 'Skullcrusher', 'DIPS']) cases.push({ fn: 'defaultMuscles', name, out: plain(defaultMuscles(name)) ?? null });
    const ms: Muscles[] = [
      { primary: [], secondary: [] },
      { primary: ['abs', 'chest', 'abs'], secondary: ['abs', 'calves', 'chest', 'calves', 'lats'] },
      { primary: ['chest'], secondary: ['chest', 'chest'] },
      { primary: ['calves', 'quads', 'glutes', 'hamstrings', 'lowerBack', 'traps', 'lats', 'rearDelts', 'sideDelts', 'frontDelts', 'chest', 'biceps', 'triceps', 'forearms', 'abs'], secondary: ['abs', 'calves', 'chest'] },
      { primary: [], secondary: ['abs', 'chest', 'forearms', 'chest'] },
      { primary: ['triceps', 'chest'], secondary: ['frontDelts', 'chest', 'triceps'] },
      { primary: ['lowerBack', 'glutes', 'hamstrings'], secondary: ['forearms', 'quads', 'lats', 'traps'] },
    ];
    for (const m of ms) cases.push({ fn: 'normalizeMuscles', in: m, out: normalizeMuscles(clone(m)) });
    cases.push({ fn: 'defaultLoads', out: DEFAULT_LOADS });
    cases.push({ fn: 'colors', out: COLORS });
    golden('muscles', cases);
  });

  it('seed', () => {
    // Ids replaced by their creation index: a category, then its exercises, category after category.
    const lib = starterLibrary();
    const map = new Map<string, string>();
    for (const c of lib.categories) {
      map.set(c.id, `id${map.size}`);
      for (const e of lib.exercises.filter((x) => x.categoryId === c.id)) map.set(e.id, `id${map.size}`);
    }
    const categories = lib.categories.map((c) => ({ ...c, id: map.get(c.id) }));
    const exercises = lib.exercises.map((e) => ({ ...e, id: map.get(e.id), categoryId: map.get(e.categoryId) }));
    const metrics = defaultMetrics();
    const mm = metrics.map((m, i) => ({ ...m, id: `id${i}` }));
    golden('seed', [
      { fn: 'starterLibrary', out: plain({ categories, exercises }) },
      { fn: 'defaultMetrics', out: plain(mm) },
    ]);
  });
});
