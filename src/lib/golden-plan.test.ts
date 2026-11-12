// Golden fixtures for the calendar, supersets, routines and programs (N5): the web logic's answers, checked
// by the Rust core's tests too (native/core-rs/tests/golden_plan.rs).
// Regenerate with UPDATE_GOLDEN=1 pnpm exec vitest run src/lib/golden-plan.test.ts
// Random ids (`uid()`) are replaced by a counter (`ids`): "L0…" for the library, "u0…" for what a case creates.
import { describe, it, vi } from 'vitest';

const ids = vi.hoisted(() => ({ n: 0, p: 'u' }));
vi.mock('./calc', async (orig) => ({ ...(await orig<typeof import('./calc')>()), uid: () => `${ids.p}${ids.n++}` }));

import { golden, plain } from './golden-fixtures';
import { addMonths, monthBounds, monthGrid, monthOf } from './calendar';
import { dayOrder, GROUP_COLORS, groupColors, groupMembers, groupOf, moveUnit, nextInGroup, pullTogether } from './groups';
import { defaultPlan, isDone, plannedSets, workoutFromDay } from './routines';
import { buildProgram, isTrainingDay, TEMPLATES } from './programs';
import { starterLibrary } from './seed';
import type { Exercise, ExerciseType, LoadType, RoutineDay, WorkoutSet } from './model';

const resetIds = (p = 'u') => {
  ids.p = p;
  ids.n = 0;
};

describe('golden: calendar', () => {
  it('month maths', () => {
    const cases: unknown[] = [];
    for (const d of ['2026-11-12', '2024-02-29', '2026-01-01', '2026-12-31', '2025-07-04', '1999-12-31', '2100-02-28', '2026-03']) cases.push({ fn: 'monthOf', date: d, out: monthOf(d) });
    const months: string[] = [];
    for (let y = 2019; y <= 2029; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
    for (const m of ['2026-11', '2024-01', '2026-12', '2000-03', '2023-06']) {
      for (const n of [-25, -13, -12, -2, -1, 0, 1, 2, 11, 12, 13, 25]) cases.push({ fn: 'addMonths', month: m, n, out: addMonths(m, n) });
    }
    for (const m of [...months, '1900-02', '2000-02', '2100-02', '2096-02']) cases.push({ fn: 'monthBounds', month: m, out: monthBounds(m) });
    const grids = [...months.filter((m) => m >= '2020-01' && m <= '2025-12'), '2000-02', '2004-02', '2028-02', '2100-02', '1900-02', '2026-11', '2026-02'];
    for (const m of grids) for (const ws of [0, 1] as const) cases.push({ fn: 'monthGrid', month: m, weekStart: ws, out: monthGrid(m, ws) });
    golden('calendar', cases);
  });
});

// ---- Sets for realistic days ----
let seq = 0;
const set = (exerciseId: string, x: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: `s${++seq}`, date: '2026-11-10', exerciseId, order: 1000 + seq, ...x });

describe('golden: groups', () => {
  it('supersets', () => {
    seq = 0;
    const D: Record<string, WorkoutSet[]> = {};
    // Two supersets, an ungrouped exercise between, a plank at the end.
    D.twoGroups = [
      set('bench', { weight: 100, reps: 8, group: 'g1' }), set('fly', { weight: 20, reps: 12, group: 'g1' }), set('bench', { weight: 100, reps: 7, group: 'g1' }), set('fly', { weight: 20, reps: 11, group: 'g1' }),
      set('curl', { weight: 14, reps: 10 }), set('curl', { weight: 14, reps: 9 }),
      set('pushdown', { weight: 30, reps: 12, group: 'g2' }), set('skull', { weight: 25, reps: 10, group: 'g2' }), set('pushdown', { weight: 30, reps: 11, group: 'g2' }), set('skull', { weight: 25, reps: 9, group: 'g2' }),
      set('plank', { time: 60 }),
    ];
    // A set added later from a routine lacks the group (the first set has none).
    D.lateGroup = [set('row', { weight: 80, reps: 8 }), set('pulldown', { weight: 60, reps: 10, group: 'x' }), set('row', { weight: 80, reps: 7, group: 'x' }), set('squat', { weight: 120, reps: 5 })];
    // A partner left alone after a delete counts as ungrouped.
    D.lonely = [set('bench', { weight: 90, reps: 8, group: 'gone' }), set('curl', { weight: 12, reps: 10 })];
    // Three in a rotation, two groups next to each other, an empty-string group.
    D.three = [
      set('a', { group: 'g' }), set('b', { group: 'g' }), set('c', { group: 'g' }), set('d', { group: 'h' }), set('e', { group: 'h' }), set('f'), set('g', { group: '' }), set('a', { group: 'g' }),
    ];
    D.single = [set('bench', { weight: 100, reps: 5 })];
    D.empty = [];
    const cases: unknown[] = Object.entries(D).map(([name, sets]) => ({ fn: 'dataset', name, sets }));
    cases.push({ fn: 'groupColorsList', out: GROUP_COLORS });
    for (const [name, sets] of Object.entries(D)) {
      cases.push({ fn: 'dayOrder', data: name, out: plain(dayOrder(sets)) });
      cases.push({ fn: 'groupColors', data: name, out: plain(groupColors(sets)) });
      const exs = [...new Set(sets.map((s) => s.exerciseId)), 'nobody'];
      for (const ex of exs) {
        cases.push({ fn: 'groupOf', data: name, exerciseId: ex, out: plain(groupOf(sets, ex)) ?? null });
        const members = groupMembers(sets, ex);
        cases.push({ fn: 'groupMembers', data: name, exerciseId: ex, out: members });
        for (const cur of [...members, ex]) cases.push({ fn: 'nextInGroup', members, current: cur, out: nextInGroup(members, cur) ?? null });
        for (const dir of [-1, 1] as const) cases.push({ fn: 'moveUnit', data: name, exerciseId: ex, dir, out: moveUnit(dayOrder(sets), ex, dir) });
      }
    }
    cases.push({ fn: 'nextInGroup', members: ['a'], current: 'a', out: null });
    cases.push({ fn: 'nextInGroup', members: [], current: 'a', out: null });
    const orders = [['a', 'b', 'c', 'd', 'e'], ['x', 'a', 'y', 'b', 'z'], ['a', 'b'], ['a'], [], ['p', 'q', 'a', 'r', 'b', 's', 'c']];
    const memberSets = [['b', 'd'], ['a', 'b'], ['b'], ['z'], ['a'], ['c', 'a', 'q'], ['e', 'a', 'd'], []];
    for (const order of orders) for (const m of memberSets) cases.push({ fn: 'pullTogether', order, members: m, out: pullTogether(order, new Set(m)) });
    golden('groups', cases);
  });
});

// ---- Library ----
function libraries(): Record<string, Exercise[]> {
  resetIds('L');
  const starter = starterLibrary().exercises;
  const partial = starter
    .filter((e) => !['Leg Press', 'Barbell Row', 'Lat Pulldown', 'Deadlift', 'Dumbbell Fly'].includes(e.name))
    .map((e) => (e.name === 'Barbell Squat' ? { ...e, name: 'BARBELL SQUAT' } : e.name === 'Romanian Deadlift' ? { ...e, repTop: 10, repBottom: 6 } : e.name === 'Lying Leg Curl' ? { ...e, repBottom: 5 } : e.name === 'Barbell Curl' ? { ...e, repTop: 15 } : e));
  const bench = starter.find((e) => e.name === 'Flat Barbell Bench Press')!;
  const dupes = [...starter, { ...bench, id: 'dupe-bench', repTop: 7 }];
  return { starter, partial, dupes, empty: [] };
}

describe('golden: programs', () => {
  it('templates and building', () => {
    const libs = libraries();
    const cases: unknown[] = Object.entries(libs).map(([name, exercises]) => ({ fn: 'library', name, exercises: plain(exercises) }));
    cases.push({ fn: 'templates', out: plain(TEMPLATES) });
    for (const [lib, exercises] of Object.entries(libs)) {
      for (const tpl of TEMPLATES) {
        for (const order of [0, 3]) {
          resetIds();
          cases.push({ fn: 'buildProgram', template: tpl.id, name: `Program ${tpl.id}`, library: lib, order, out: plain(buildProgram(tpl, `Program ${tpl.id}`, exercises, order)) });
        }
      }
    }
    for (const weekdays of [undefined, [], [1, 2, 4, 5], [0], [0, 6], [3]]) {
      for (const date of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2024-02-29', '2000-01-01', 'garbage']) {
        cases.push({ fn: 'isTrainingDay', weekdays: weekdays ?? null, date, out: isTrainingDay(weekdays, date) });
      }
    }
    golden('programs', cases);
  });
});

describe('golden: routines', () => {
  it('plans', () => {
    seq = 0;
    const libs = libraries();
    const lib = libs.starter;
    const byName = (n: string) => lib.find((e) => e.name === n)!;
    const cases: unknown[] = [];

    // defaultPlan: every type and load.
    const types: ExerciseType[] = ['weight,reps', 'weight,distance', 'weight,time', 'reps,distance', 'reps,time', 'distance,time', 'weight', 'reps', 'distance', 'time'];
    const loads: (LoadType | undefined)[] = [undefined, 'total', 'perHand', 'bodyweight', 'assisted'];
    for (const type of types) {
      for (const load of loads) {
        const ex: Exercise = { id: 'x', name: 'X', categoryId: 'c', type, ...(load ? { load } : {}) };
        cases.push({ fn: 'defaultPlan', ex, out: plain(defaultPlan(ex)) });
      }
    }
    for (const name of ['Dips', 'Pull Up', 'Plank', 'Running', 'Flat Barbell Bench Press', 'Dumbbell Fly']) cases.push({ fn: 'defaultPlan', ex: plain(byName(name)), out: plain(defaultPlan(byName(name))) });

    // isDone
    for (const planned of [true, false, undefined]) {
      const s = set('bench', { planned: planned as true | undefined });
      cases.push({ fn: 'isDone', set: plain(s), out: isDone(s) });
    }

    // plannedSets: last time's sets per exercise; both modes' flag; ids and orders from counters.
    const day = '2026-10-30';
    const lastBench = [set('bench', { date: day, weight: 60, reps: 10, warmup: true }), set('bench', { date: day, weight: 80, reps: 6, warmup: true }), set('bench', { date: day, weight: 100, reps: 8 }), set('bench', { date: day, weight: 100, reps: 7 }), set('bench', { date: day, weight: 95, reps: 6 })];
    const last: Record<string, WorkoutSet[]> = {
      bench: lastBench,
      pyramid: [set('pyramid', { date: day, weight: 120, reps: 5 }), set('pyramid', { date: day, weight: 110, reps: 8 }), set('pyramid', { date: day, weight: 100, reps: 12 })],
      curl: [set('curl', { date: day, weight: 14, reps: 10 }), set('curl', { date: day, weight: 14, reps: 9 })],
      run: [set('run', { date: day, distance: 5.2, time: 1620 })],
      plank: [set('plank', { date: day, time: 75 })],
      onlyWarm: [set('onlyWarm', { date: day, weight: 40, reps: 10, warmup: true }), set('onlyWarm', { date: day, weight: 60, reps: 5, warmup: true })],
      repsOnly: [set('repsOnly', { date: day, reps: 15 }), set('repsOnly', { date: day, reps: 12 })],
      row: [set('row', { date: day, weight: 80, reps: 8 })],
    };
    const plan = (...sets: object[]) => sets as RoutineDay['items'][number]['sets'];
    const R3 = plan({ reps: 8 }, { reps: 8 }, { reps: 8 });
    const days: Record<string, RoutineDay> = {
      three: { id: 'd', name: 'Push', items: [{ exerciseId: 'bench', sets: R3 }] },
      longer: { id: 'd', name: 'Longer', items: [{ exerciseId: 'bench', sets: plan({ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }) }] },
      shorter: { id: 'd', name: 'Shorter', items: [{ exerciseId: 'bench', sets: plan({ reps: 8 }, { reps: 8 }) }] },
      five: { id: 'd', name: 'Five', items: [{ exerciseId: 'bench', sets: plan({}, {}, {}, {}, {}) }] },
      noLast: { id: 'd', name: 'New', items: [{ exerciseId: 'unknown', sets: plan({ reps: 10 }, { reps: 10 }, { weight: 20, reps: 10 }) }, { exerciseId: 'other', sets: plan({}) }] },
      explicit: { id: 'd', name: 'Explicit', items: [{ exerciseId: 'bench', sets: plan({ weight: 90, reps: 10 }, { weight: 0, reps: 0 }, { weight: 70 }) }] },
      pyramid: { id: 'd', name: 'Pyramid', items: [{ exerciseId: 'pyramid', sets: plan({}, {}, {}, {}) }] },
      cardio: { id: 'd', name: 'Cardio', items: [{ exerciseId: 'run', sets: plan({}) }, { exerciseId: 'run', sets: plan({ distance: 3 }, { time: 600 }) }, { exerciseId: 'plank', sets: plan({}, {}) }] },
      onlyWarm: { id: 'd', name: 'Warm', items: [{ exerciseId: 'onlyWarm', sets: plan({}, {}, {}) }] },
      repsOnly: { id: 'd', name: 'Reps', items: [{ exerciseId: 'repsOnly', sets: plan({ reps: 15 }, {}, {}) }] },
      supersets: {
        id: 'd',
        name: 'Supersets',
        items: [
          { exerciseId: 'bench', sets: R3, group: 'a' }, { exerciseId: 'row', sets: plan({ reps: 8 }, { reps: 8 }), group: 'a' }, { exerciseId: 'curl', sets: plan({}, {}), group: 'b' },
          { exerciseId: 'unknown', sets: plan({}), group: 'b' }, { exerciseId: 'plank', sets: plan({}) }, { exerciseId: 'run', sets: plan({}), group: 'a' },
        ],
      },
      emptyGroupSets: { id: 'd', name: 'Empty', items: [{ exerciseId: 'bench', sets: [], group: 'a' }, { exerciseId: 'row', sets: plan({ reps: 5 }), group: 'a' }, { exerciseId: 'curl', sets: plan({}), group: '' }] },
      empty: { id: 'd', name: 'Nothing', items: [] },
    };
    for (const [name, d] of Object.entries(days)) {
      for (const warmups of [false, true]) {
        resetIds();
        let order = 1000;
        const out = plannedSets(d, '2026-11-12', (id) => last[id] ?? [], () => order++, warmups);
        cases.push({ fn: 'plannedSets', name, day: d, last, date: '2026-11-12', warmups, out: plain(out) });
      }
    }

    // workoutFromDay
    const dayId = (n: string) => byName(n).id;
    const W: Record<string, WorkoutSet[]> = {
      push: [
        set(dayId('Flat Barbell Bench Press'), { weight: 100, reps: 8, group: 's1' }), set(dayId('Dumbbell Fly'), { weight: 20, reps: 12, group: 's1' }), set(dayId('Flat Barbell Bench Press'), { weight: 100, reps: 7, group: 's1' }),
        set(dayId('Dumbbell Fly'), { weight: 20, reps: 11, group: 's1' }), set(dayId('Cable Pushdown'), { weight: 30, reps: 12 }), set(dayId('Cable Pushdown'), { weight: 30, reps: 10, planned: true }), set('deleted-exercise', { weight: 5, reps: 5 }),
      ],
      cardio: [set(dayId('Running'), { distance: 5, time: 1500 }), set(dayId('Plank'), { time: 60 }), set(dayId('Plank'), { time: 45 }), set(dayId('Push Up'), { reps: 20 }), set(dayId('Running'), { distance: 1.2 })],
      sparse: [set(dayId('Flat Barbell Bench Press'), { weight: 100 }), set(dayId('Flat Barbell Bench Press')), set(dayId('Crunch'), { reps: 0 })],
      weightsOnly: [set('shrug-hold', { weight: 60 }), set('sled', { weight: 100, distance: 0.02, time: 12 })],
      lone: [set(dayId('Barbell Curl'), { weight: 30, reps: 10, group: 'gone' }), set(dayId('Hammer Curl'), { weight: 12, reps: 10 })],
      empty: [],
      allDeleted: [set('gone-1', { reps: 3 }), set('gone-2', { reps: 3 })],
    };
    const extra: Exercise[] = [{ id: 'shrug-hold', name: 'Shrug Hold', categoryId: 'c', type: 'weight' }, { id: 'sled', name: 'Sled', categoryId: 'c', type: 'weight,distance' }];
    for (const [name, sets] of Object.entries(W)) {
      const used = [...lib, ...extra].filter((e) => sets.some((s) => s.exerciseId === e.id));
      resetIds();
      cases.push({ fn: 'workoutFromDay', name: `Day ${name}`, sets: plain(sets), exercises: plain(used), out: plain(workoutFromDay(`Day ${name}`, sets, (id) => used.find((e) => e.id === id))) });
    }
    golden('routines', cases);
  });
});
