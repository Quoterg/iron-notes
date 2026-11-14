// Golden fixtures for the Rust core's CSV export/import and Iron Log bridge (N8):
// native/core-rs/tests/golden/{csv,ironlog}.json, checked by native/core-rs/tests/golden_import.rs.
// Exercise/category/set ids made by planImport are random: the fixtures name them by position
// (c0.., e0.., s0..) so the Rust core's counter ids compare equal after the same renaming.
import { describe, it } from 'vitest';
import { csvEscape, inferType, parseCsv, planImport, safeText, toCsv } from './csv';
import { golden, plain } from './golden-fixtures';
import { maintenanceOf, parseIronLog, phaseOf, planBodyImport } from './ironlog';
import type { BodyMetric, Category, Exercise, ExerciseType, Field, Settings, WorkoutSet } from './model';
import { DEFAULT_SETTINGS } from './model';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Ids by position of appearance: new categories c0.., exercises e0.., sets s0.. (stored ones keep theirs). */
function named(plan: ReturnType<typeof planImport>, stored: { categories: Category[]; exercises: Exercise[] }) {
  const p = clone(plan);
  const cat = new Map<string, string>();
  const ex = new Map<string, string>();
  p.categories.forEach((c, i) => (cat.set(c.id, `c${i}`), (c.id = `c${i}`)));
  p.exercises.forEach((e, i) => (ex.set(e.id, `e${i}`), (e.id = `e${i}`), (e.categoryId = cat.get(e.categoryId) ?? e.categoryId)));
  p.sets.forEach((s, i) => ((s.id = `s${i}`), (s.exerciseId = ex.get(s.exerciseId) ?? s.exerciseId)));
  void stored;
  return plain(p);
}

const FIT_HEAD = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time';
const empty = { categories: [] as Category[], exercises: [] as Exercise[], sets: [] as WorkoutSet[] };

const STORED_CATS: Category[] = [
  { id: 'cat-chest', name: 'Chest', color: '#f0566a', order: 0 },
  { id: 'cat-back', name: 'Back', color: '#3b8df5', order: 4 },
  { id: 'cat-cardio', name: 'Cardio', color: '#2bcf9a', order: 2, rest: 60 },
];
const STORED_EXS: Exercise[] = [
  { id: 'ex-bench', name: 'Flat Barbell Bench Press', categoryId: 'cat-chest', type: 'weight,reps' },
  { id: 'ex-row', name: 'Barbell Row', categoryId: 'cat-back', type: 'weight,reps' },
  { id: 'ex-run', name: 'Running', categoryId: 'cat-cardio', type: 'distance,time' },
  { id: 'ex-pushup', name: 'Push Up', categoryId: 'cat-chest', type: 'reps' },
];
const STORED_SETS: WorkoutSet[] = [
  { id: 'st1', date: '2026-11-02', exerciseId: 'ex-bench', order: 1, weight: 100, reps: 5 },
  { id: 'st2', date: '2026-11-02', exerciseId: 'ex-bench', order: 2, weight: 100, reps: 5 },
  { id: 'st3', date: '2026-11-03', exerciseId: 'ex-run', order: 3, distance: 5, time: 1500 },
  { id: 'st4', date: '2026-11-04', exerciseId: 'ex-pushup', order: 4, reps: 20 },
];
const STORED = { categories: STORED_CATS, exercises: STORED_EXS, sets: STORED_SETS };

/** A realistic FitNotes export (current format): 10 exercise types, quotes, commas, newlines, units. */
const fitnotes = [
  FIT_HEAD,
  '2026-11-02,Flat Barbell Bench Press,Chest,100.0,kgs,5,,,',
  '2026-11-02,Flat Barbell Bench Press,Chest,100.0,kgs,5,,,',
  '2026-11-02,Flat Barbell Bench Press,Chest,100.0,kgs,5,,,',
  '2026-11-02,Flat Barbell Bench Press,Chest,102.5,kgs,4,,,',
  '2026-11-03,Running,Cardio,,,,5.25,km,00:25:30',
  '2026-11-03,Running,Cardio,,,,3.1,mi,0:31:05',
  '2026-11-04,Push Up,Chest,,,20,,,',
  '2026-11-04,Plank,Abs,,,,,,01:30',
  '2026-11-05,Sled push,Legs,120,kgs,,40,m,',
  '2026-11-05,Farmer walk,Legs,2x32,kgs,,,,',
  '2026-11-05,Farmer walk,Legs,32,kgs,,,,00:45',
  '2026-11-06,Burpee,Cardio,,,12,,,',
  '2026-11-06,Burpee,Cardio,,,15,0.1,km,',
  '2026-11-06,Rope climb,Cardio,,,3,,,0:20',
  '2026-11-07,Shrug hold,Back,60,kgs,,,,',
  '2026-11-07,Sprint,Cardio,,,,0.1,km,',
  '2026-11-08,Zercher Squat,Legs,80,lbs,8,,,',
  '2026-11-08,Zercher Squat,Legs,85,lb,6,,,',
  '2026-11-08,Zercher Squat,Legs,90,,6,,,',
].join('\r\n');

const fitnotesComments = [
  'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment',
  '2026-11-02,"Bench Press, flat","Chest, upper",100,kgs,5,,,,"Felt heavy, ""grindy"""',
  '2026-11-02,"Bench Press, flat","Chest, upper",100,kgs,5,,,,"line one\nline two"',
  '2026-11-03,=HYPERLINK("http://x"),@Weird,50,kgs,10,,,,\'=1+1',
  "2026-11-03,'=Cmd,'+Plus,50,kgs,10,,,,'-note",
  "2026-11-03,'quoted,Chest,50,kgs,10,,,,'text",
  '2026-11-04,  Cable Fly  ,  chest  ,25,kgs,12,,,,   ',
].join('\n');

function planCase(text: string, current = empty, startOrder = 1000) {
  try {
    return { text, current, startOrder, out: named(planImport(text, current, startOrder), current) };
  } catch (e) {
    return { text, current, startOrder, out: { error: (e as Error).message } };
  }
}

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o });

describe('golden: csv', () => {
  it('matches the recorded answers', () => {
    const cases: unknown[] = [];

    // csvEscape / safeText
    for (const s of ['', 'plain', 'a,b', 'say "hi"', 'two\nlines', 'cr\rhere', '"', ',', 'ä ö å', ' spaced ', '1.5', 'a;b']) cases.push({ fn: 'csvEscape', in: s, out: csvEscape(s) });
    for (const s of ['', 'x', '=1+1', '+49 170', '-5', '@sum', '\tTab', '\rCR', '=', "'=x", 'a=b', ' =x', 'Chest', '=HYPERLINK("u")']) cases.push({ fn: 'safeText', in: s, out: safeText(s) });

    // parseCsv
    const parseIn = [
      '',
      '\n\n\r\n',
      'a,b,c',
      'a,b,c\n',
      'a,b,c\r\n1,2,3\r\n',
      'a,b\r1,2\r',
      'a,"b,c",d',
      'a,"b ""quoted"" c",d',
      'a,"line1\nline2",d\n1,2,3',
      'a,"line1\r\nline2",d',
      ',,\n1,2,3',
      'a,b,\n,,',
      '  ,  \n1,2',
      '"unterminated,field\nstill',
      'a,"b"c,d',
      '"",x',
      'x,\n',
      'one',
      ',',
      '﻿Date,Exercise\n2026-01-01,Squat',
      'a,b\n\n\n1,2\n   \n3,4',
      '"a""",b',
      '"a\nb"\n',
      'ä,ö\nå,é',
    ];
    for (const s of parseIn) cases.push({ fn: 'parseCsv', in: s, out: parseCsv(s) });
    for (const s of [fitnotes, fitnotesComments]) cases.push({ fn: 'parseCsv', in: s, out: parseCsv(s) });

    // inferType
    const fieldSets: Field[][] = [
      [], ['weight'], ['reps'], ['distance'], ['time'],
      ['weight', 'reps'], ['distance', 'time'], ['weight', 'distance'], ['weight', 'time'], ['reps', 'distance'], ['reps', 'time'],
      ['weight', 'reps', 'distance'], ['weight', 'reps', 'time'], ['weight', 'distance', 'time'], ['reps', 'distance', 'time'], ['weight', 'reps', 'distance', 'time'],
    ];
    for (const f of fieldSets) cases.push({ fn: 'inferType', in: f, out: inferType(new Set(f)) });

    // toCsv
    const exs: Exercise[] = [
      ...STORED_EXS,
      { id: 'ex-plank', name: 'Plank', categoryId: 'cat-back', type: 'time' },
      { id: 'ex-sled', name: '=Sled', categoryId: 'cat-gone', type: 'weight,distance' },
      { id: 'ex-farmer', name: 'Farmer, walk', categoryId: 'cat-cardio', type: 'weight,time' },
      { id: 'ex-burpee', name: 'Burpee "x"', categoryId: 'cat-cardio', type: 'reps,distance' },
      { id: 'ex-rope', name: 'Rope climb', categoryId: 'cat-cardio', type: 'reps,time' },
      { id: 'ex-shrug', name: 'Shrug', categoryId: 'cat-back', type: 'weight' },
    ];
    const cats: Category[] = [...STORED_CATS, { id: 'cat-x', name: '-Minus', color: '#000000', order: 9 }];
    const exSets: WorkoutSet[] = [
      { id: 'a1', date: '2026-11-02', exerciseId: 'ex-bench', order: 20, weight: 102.5, reps: 5, comment: 'Felt, "heavy"' },
      { id: 'a2', date: '2026-11-02', exerciseId: 'ex-bench', order: 10, weight: 100, reps: 8.5 },
      { id: 'a3', date: '2026-11-01', exerciseId: 'ex-run', order: 30, distance: 5.25, time: 1530 },
      { id: 'a4', date: '2026-11-01', exerciseId: 'ex-run', order: 31, distance: 0.8047, time: 3725, comment: '=SUM(A1)' },
      { id: 'a5', date: '2026-11-03', exerciseId: 'ex-plank', order: 40, time: 90 },
      { id: 'a6', date: '2026-11-03', exerciseId: 'ex-sled', order: 41, weight: 120.2, distance: 0.04 },
      { id: 'a7', date: '2026-11-03', exerciseId: 'ex-farmer', order: 42, weight: 64, time: 45.6 },
      { id: 'a8', date: '2026-11-03', exerciseId: 'ex-burpee', order: 43, reps: 15, distance: 0.1 },
      { id: 'a9', date: '2026-11-04', exerciseId: 'ex-rope', order: 44, reps: 3, time: 20 },
      { id: 'a10', date: '2026-11-04', exerciseId: 'ex-shrug', order: 45, weight: 0 },
      { id: 'a11', date: '2026-11-04', exerciseId: 'ex-gone', order: 46, weight: 50, reps: 5 },
      { id: 'a12', date: '2026-11-04', exerciseId: 'ex-bench', order: 47, weight: 60, reps: 12, planned: true },
      { id: 'a13', date: '2026-11-04', exerciseId: 'ex-bench', order: 48, weight: 0.0005, reps: 1 },
      { id: 'a14', date: '2026-11-04', exerciseId: 'ex-pushup', order: 49, reps: 20, weight: 30, comment: '\r\nlead' },
      { id: 'a15', date: '2026-11-04', exerciseId: 'ex-bench', order: 50 },
    ];
    for (const st of [{}, { unit: 'lb' as const }, { dist: 'mi' as const }, { unit: 'lb' as const, dist: 'm' as const }, { dist: 'm' as const }]) {
      const s = settings(st);
      cases.push({ fn: 'toCsv', sets: exSets, exercises: exs, categories: cats, settings: { unit: s.unit, dist: s.dist }, out: toCsv(exSets, (id) => exs.find((e) => e.id === id), (id) => cats.find((c) => c.id === id), s) });
    }
    cases.push({ fn: 'toCsv', sets: [], exercises: [], categories: [], settings: { unit: 'kg', dist: 'km' }, out: toCsv([], () => undefined, () => undefined, settings()) });

    // planImport: errors
    for (const text of ['', '\n\n', '   ', 'Foo,Bar\n1,2', 'Date,Weight\n2026-01-01,5', 'Exercise,Reps\nSquat,5', 'just text']) cases.push({ fn: 'planImport', ...planCase(text) });
    // planImport: nothing readable
    for (const text of [FIT_HEAD, `${FIT_HEAD}\n`, `${FIT_HEAD}\nbad,Squat,Legs,100,kgs,5,,,\n2026-01-01,,Legs,100,kgs,5,,,\n2026-01-01,Squat,Legs,,,,,,\n2026-01-01,Squat,Legs,0,kgs,0,,,`]) cases.push({ fn: 'planImport', ...planCase(text) });

    // planImport: real exports
    cases.push({ fn: 'planImport', ...planCase(fitnotes) });
    cases.push({ fn: 'planImport', ...planCase(fitnotes, STORED) });
    cases.push({ fn: 'planImport', ...planCase(`﻿${fitnotes}`) });
    cases.push({ fn: 'planImport', ...planCase(fitnotes.replace(/\r\n/g, '\n'), STORED, 5) });
    cases.push({ fn: 'planImport', ...planCase(fitnotes.replace(/\r\n/g, '\r')) });
    cases.push({ fn: 'planImport', ...planCase(fitnotesComments) });
    cases.push({ fn: 'planImport', ...planCase(fitnotesComments, STORED) });
    cases.push({ fn: 'planImport', ...planCase(`${fitnotes}\r\n`, STORED) });

    // planImport: header variants (older FitNotes puts the unit in the header)
    const old = (head: string, rows: string[]) => [head, ...rows].join('\n');
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Category,Weight (kgs),Reps,Distance (km),Time', ['2026-02-01,Squat,Legs,140,5,,', '2026-02-01,Run,Cardio,,,8.5,00:41:10'])) });
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Category,Weight (lbs),Reps,Distance (mi),Time', ['2026-02-01,Squat,Legs,300,5,,', '2026-02-01,Run,Cardio,,,5,00:41:10'])) });
    cases.push({ fn: 'planImport', ...planCase(old('date,exercise name,category,weight (LB),reps,distance (miles),duration (min)', ['2026-02-01,Squat,Legs,300,5,,', '2026-02-01,Run,Cardio,,,5,41:10'])) });
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Weight (kgs)', ['2026-02-01,Squat,140', '2026-02-02,Squat,142.5'])) });
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Reps', ['2026-02-01,Push up,12', '2026-02-02,Push up,15'])) });
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Category,Weight,Reps,Notes', ['2026-02-01,Squat,Legs,140,5,paused', '2026-02-02,Squat,,142.5,5,'])) });
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Comment', ['2026-02-01,Squat,paused'])) });
    cases.push({ fn: 'planImport', ...planCase(old(' DATE , EXERCISE , WEIGHT UNIT , WEIGHT , REPS ', ['2026-02-01,Squat,lbs,225,5'])) });
    cases.push({ fn: 'planImport', ...planCase(old('Date,Exercise,Weight unit,Weight,Reps', ['2026-02-01,Squat,lbs,225,5'])) });

    // planImport: numbers and durations
    const nums = [
      '2026-03-01,A,Cat,1,000.5,kgs,5,,,', // not a number with thousands (1,000.5 inside a plain field splits)
      '2026-03-01,B,Cat,"1,000.5",kgs,5,,,',
      '2026-03-01,B,Cat,"1,234,567",kgs,5,,,',
      '2026-03-01,C,Cat,"82,5",kgs,5,,,',
      '2026-03-01,D,Cat,82.55,kgs,5.5,,,',
      '2026-03-01,E,Cat,-5,kgs,5,,,',
      '2026-03-01,F,Cat,abc,kgs,5,,,',
      '2026-03-01,G,Cat,0x10,kgs,5,,,',
      '2026-03-01,H,Cat,1e2,kgs,5,,,',
      '2026-03-01,I,Cat,Infinity,kgs,5,,,',
      '2026-03-01,J,Cat,.5,kgs,5,,,',
      '2026-03-01,K,Cat,5.,kgs,5,,,',
      '2026-03-01,L,Cat, 60 ,kgs, 8 ,,,',
      '2026-03-01,M,Cat,,,,1000,m,',
      '2026-03-01,N,Cat,,,,10,ft,',
      '2026-03-01,O,Cat,,,,400,yd,',
      '2026-03-01,P,Cat,,,,3,Metres,',
      '2026-03-01,Q,Cat,,,,3,miles,',
      '2026-03-01,R,Cat,,,,3,furlongs,',
      '2026-03-01,S,Cat,,,,3,,',
      '2026-03-01,T,Cat,,,,,,1:02:03',
      '2026-03-01,T,Cat,,,,,,02:03',
      '2026-03-01,T,Cat,,,,,,123',
      '2026-03-01,T,Cat,,,,,,1:2:3:4',
      '2026-03-01,T,Cat,,,,,,abc',
      '2026-03-01,T,Cat,,,,,,-5',
      '2026-03-01,T,Cat,,,,,,1::2',
      '2026-03-01,T,Cat,,,,,,12.6',
      '2026-03-01,T,Cat,,,,,,0:00',
      '2026-03-01,U,Cat,70,KGS,5,,,',
      '2026-03-01,U,Cat,70,Lbs,5,,,',
      '2026-03-01,U,Cat,70, lb ,5,,,',
      '2026-03-01,U,Cat,70,pounds,5,,,',
    ];
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...nums].join('\n')) });

    // planImport: dates, skipped rows, short rows, unknown/blank categories
    const odd = [
      '2026-04-01 08:30:00,Squat,Legs,100,kgs,5,,,',
      '2026-4-1,Squat,Legs,100,kgs,5,,,',
      '04/01/2026,Squat,Legs,100,kgs,5,,,',
      '2026-04-02,,Legs,100,kgs,5,,,',
      '2026-04-02,Squat',
      '2026-04-02',
      '2026-04-03,Mystery,,100,kgs,5,,,',
      '2026-04-03,Mystery2,Nonexistent Category,100,kgs,5,,,',
      '2026-04-03,Mystery3,nonexistent category,100,kgs,5,,,',
      '2026-04-03,Mystery4,NONEXISTENT CATEGORY,100,kgs,5,,,',
      '2026-04-04,Bench Press (Flat),CHEST,100,kgs,5,,,',
      '2026-04-04,flat barbell bench press,chest,100,kgs,5,,,',
      '2026-04-05,Pull-up,Back,10,kgs,0,,,',
      '2026-04-05,Pull-up,Back,,,8,,,',
      '2026-04-05,Static hold,Abs,,,,,,00:30',
      '2026-04-05,Static hold,Abs,,,12,,,',
      '2026-04-06,Running,Cardio,,,12,,,',
      '2026-04-06,Running,Cardio,,,,,,0:10',
    ];
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...odd].join('\n')) });
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...odd].join('\n'), STORED, 7) });

    // planImport: duplicates as a multiset against stored sets
    const dup = [
      '2026-11-02,Flat Barbell Bench Press,Chest,100,kgs,5,,,',
      '2026-11-02,Flat Barbell Bench Press,Chest,100,kgs,5,,,',
      '2026-11-02,Flat Barbell Bench Press,Chest,100,kgs,5,,,',
      '2026-11-03,Running,Cardio,,,,5,km,25:00',
      '2026-11-03,Running,Cardio,,,,5,km,25:00',
      '2026-11-04,Push Up,Chest,,,20,,,',
      '2026-11-04,Push Up,Chest,,,20,,,',
      '2026-11-05,Push Up,Chest,,,20,,,',
    ];
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...dup].join('\n'), STORED) });
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...dup].join('\n'), { ...STORED, sets: [] }) });
    // existing category with higher order and colours cycling (many new categories)
    const many = Array.from({ length: 12 }, (_, i) => `2026-05-0${(i % 9) + 1},Ex ${i},Group ${i},50,kgs,5,,,`);
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...many].join('\n'), STORED) });
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, ...many].join('\n')) });
    // existing exercise matched by name whose type records fewer fields than the row has
    cases.push({ fn: 'planImport', ...planCase([FIT_HEAD, '2026-06-01,Push Up,Chest,20,kgs,15,,,', '2026-06-02,Running,Cardio,,,10,5,km,25:00'].join('\n'), STORED) });

    golden('csv', cases);
  });
});

// ---- Iron Log ----

const profile = { sex: 'male', age: 30, weightKg: 80, heightCm: 180, pal: 1.375, kcal: 2000 };
const ironLog = (over: Record<string, unknown> = {}) => ({
  format: 'iron-log-backup',
  version: 1,
  body: [
    { date: '2026-11-01', weightKg: 82.4, bodyFatPct: 15.2, waistCm: 84 },
    { date: '2026-11-02', weightKg: 82.1 },
    { date: '2026-11-03', bodyFatPct: 15 },
    { date: '2026-11-04', waistCm: 83.5 },
  ],
  settings: { profile: { ...profile } },
  ...over,
});

const METRICS: BodyMetric[] = [
  { id: 'm-weight', name: 'Body weight', kind: 'weight', order: 0 },
  { id: 'm-fat', name: 'Body fat', kind: 'percent', order: 1 },
  { id: 'm-waist', name: 'Waist', kind: 'length', order: 2 },
];

describe('golden: ironlog', () => {
  it('matches the recorded answers', () => {
    const cases: unknown[] = [];

    // maintenanceOf
    const profiles: Record<string, unknown>[] = [
      profile,
      { ...profile, sex: 'female' },
      { ...profile, pal: undefined },
      { ...profile, pal: 0.5 },
      { ...profile, pal: 2.5 },
      { ...profile, pal: 3 },
      { ...profile, sex: 'other' },
      { ...profile, sex: undefined },
      { ...profile, age: 9 },
      { ...profile, age: 10 },
      { ...profile, age: 110 },
      { ...profile, age: 111 },
      { ...profile, age: '30' },
      { ...profile, weightKg: 19.9 },
      { ...profile, weightKg: 20 },
      { ...profile, weightKg: 400 },
      { ...profile, weightKg: 401 },
      { ...profile, heightCm: 99 },
      { ...profile, heightCm: 250 },
      { ...profile, heightCm: 251 },
      { ...profile, weightKg: 62.5, heightCm: 168.5, age: 27, sex: 'female', pal: 1.55 },
      { ...profile, weightKg: 100.3, heightCm: 191, age: 45, pal: 1.725 },
      {},
    ];
    for (const p of profiles) cases.push({ fn: 'maintenanceOf', in: plain(p), out: maintenanceOf(p) ?? null });

    // phaseOf
    const phases: [number | undefined, number | undefined][] = [
      [2000, 2500], [2250, 2500], [2249, 2500], [2625, 2500], [2626, 2500], [3000, 2500], [2500, 2500], [0, 2500], [2000, 0], [undefined, 2500], [2000, undefined], [undefined, undefined], [1000, 3000], [3500, 2000],
    ];
    for (const [kcal, maintenance] of phases) cases.push({ fn: 'phaseOf', in: plain({ kcal, maintenance }), out: phaseOf({ kcal, maintenance }) ?? null });

    // parseIronLog: valid, partial, garbage
    const parse: Record<string, unknown>[] = [
      ironLog(),
      ironLog({ settings: undefined }),
      ironLog({ settings: {} }),
      ironLog({ settings: { profile: null } }),
      ironLog({ settings: { profile: 'x' } }),
      ironLog({ settings: { profile: { kcal: 2300 } } }),
      ironLog({ settings: { profile: { kcal: 700, sex: 'male', age: 30, weightKg: 80, heightCm: 180 } } }),
      ironLog({ settings: { profile: { ...profile, kcal: 10000 } } }),
      ironLog({ settings: { profile: { ...profile, kcal: 10001 } } }),
      ironLog({ settings: { profile: { ...profile, kcal: '2000' } } }),
      ironLog({ body: [] }),
      ironLog({ body: undefined }),
      ironLog({ body: 'nope' }),
      ironLog({ body: {} }),
      ironLog({ version: 2 }),
      ironLog({ version: '1' }),
      ironLog({ version: undefined }),
      ironLog({ format: 'iron-notes' }),
      ironLog({ format: undefined }),
      ironLog({
        body: [
          null, 5, 'x', [], {},
          { date: '2026-11-01' },
          { date: '2026-11-01', weightKg: 19.9 },
          { date: '2026-11-02', weightKg: 20 },
          { date: '2026-11-03', weightKg: 400 },
          { date: '2026-11-04', weightKg: 401 },
          { date: '2026-11-05', bodyFatPct: 1.9 },
          { date: '2026-11-06', bodyFatPct: 2 },
          { date: '2026-11-07', bodyFatPct: 75 },
          { date: '2026-11-08', bodyFatPct: 75.1 },
          { date: '2026-11-09', waistCm: 29.9 },
          { date: '2026-11-10', waistCm: 30 },
          { date: '2026-11-11', waistCm: 250 },
          { date: '2026-11-12', waistCm: 251 },
          { date: '2026-11-13', weightKg: '80' },
          { date: '2026-11-14', weightKg: null, bodyFatPct: 20 },
          { date: '2026-1-5', weightKg: 80 },
          { date: '20261115', weightKg: 80 },
          { date: '2026-11-16T00:00', weightKg: 80 },
          { date: 20261117, weightKg: 80 },
          { weightKg: 80 },
          { date: '2026-11-18', weightKg: 80, extra: 'ignored' },
          { date: '2026-11-18', weightKg: 80.5 },
          { date: '2026-11-19', weightKg: 80, bodyFatPct: 14, waistCm: 85 },
        ],
      }),
    ];
    for (const x of parse) {
      let out: unknown;
      try {
        out = plain(parseIronLog(x));
      } catch (e) {
        out = { error: (e as Error).message };
      }
      cases.push({ fn: 'parseIronLog', in: plain(x), out });
    }
    for (const x of [null, 0, 'text', [], true, 42, { format: 'iron-log-backup', version: 1 }, { format: 'iron-log-backup', version: 1.5, body: [{ date: '2026-01-01', weightKg: 70 }] }]) {
      let out: unknown;
      try {
        out = plain(parseIronLog(x));
      } catch (e) {
        out = { error: (e as Error).message };
      }
      cases.push({ fn: 'parseIronLog', in: x, out });
    }

    // planBodyImport
    const plans: { data: unknown; metrics: BodyMetric[]; existing: Record<string, string[]> }[] = [
      { data: parseIronLog(ironLog()), metrics: METRICS, existing: {} },
      { data: parseIronLog(ironLog()), metrics: METRICS, existing: { 'm-weight': ['2026-11-01'], 'm-fat': ['2026-11-03', '2026-11-01'], 'm-waist': ['2026-11-04'] } },
      { data: parseIronLog(ironLog()), metrics: [METRICS[0]], existing: {} },
      { data: parseIronLog(ironLog()), metrics: [], existing: {} },
      { data: parseIronLog(ironLog()), metrics: [{ id: 'm-w2', name: 'Weight (morning)', kind: 'weight', order: 0 }, { id: 'm-l', name: 'Chest', kind: 'length', order: 1 }, { id: 'm-p', name: 'Skinfold', kind: 'percent', order: 2 }], existing: {} },
      { data: parseIronLog(ironLog()), metrics: [{ id: 'm-a', name: 'Other', kind: 'weight', order: 0 }, { id: 'm-b', name: 'BODY WEIGHT', kind: 'weight', order: 1 }, { id: 'm-c', name: 'Waist', kind: 'length', order: 2 }], existing: {} },
      { data: parseIronLog(ironLog({ body: [{ date: '2026-11-01', weightKg: 80 }, { date: '2026-11-01', weightKg: 81 }] })), metrics: METRICS, existing: {} },
      { data: parseIronLog(ironLog({ body: [] })), metrics: METRICS, existing: {} },
      { data: parseIronLog(ironLog({ body: [{ date: '2026-11-01', waistCm: 80 }] })), metrics: [METRICS[0], METRICS[1]], existing: {} },
    ];
    for (const p of plans) {
      let k = 0;
      let at = 0;
      const out = planBodyImport(p.data as never, p.metrics, (id) => new Set(p.existing[id] ?? []), () => `i${k++}`, () => 1000 + at++);
      cases.push({ fn: 'planBodyImport', data: plain(p.data), metrics: p.metrics, existing: p.existing, out: plain(out) });
    }

    golden('ironlog', cases);
  });
});

void (null as unknown as ExerciseType);
