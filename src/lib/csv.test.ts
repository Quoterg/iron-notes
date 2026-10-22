import { describe, expect, it } from 'vitest';
import { inferType, parseCsv, planImport, toCsv } from './csv';
import { DEFAULT_SETTINGS, type Category, type Exercise, type WorkoutSet } from './model';

const chest: Category = { id: 'c1', name: 'Chest', color: '#f0566a', order: 0 };
const bench: Exercise = { id: 'e1', name: 'Flat Barbell Bench Press', categoryId: 'c1', type: 'weight,reps' };

describe('csv parsing', () => {
  it('handles quotes, commas, newlines and CRLF', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,"two\nlines",3\n\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', 'two\nlines', '3'],
    ]);
  });
});

describe('FitNotes import', () => {
  const file = [
    '﻿Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment',
    '2024-01-08,Flat Barbell Bench Press,Chest,80.0,kgs,8,,,,',
    '2024-01-08,Flat Barbell Bench Press,Chest,185,lbs,5,,,,"felt good, fast"',
    '2024-01-09,Running (Treadmill),Cardio,,,,5.0,km,0:25:30,',
    '2024-01-09,Plank,Abs,,,,,,0:01:30,',
    '2024-01-10,Pull Up,Back,,,12,,,,',
    'not a date,Flat Barbell Bench Press,Chest,80,kgs,8,,,,',
    '2024-01-11,Flat Barbell Bench Press,Chest,,,,,,,',
  ].join('\r\n');

  it('reads sets in their units, matches existing exercises and creates the rest with inferred types', () => {
    const p = planImport(file, { categories: [chest], exercises: [bench], sets: [] }, 1000);
    expect(p.skipped).toBe(2);
    expect(p.sets.length).toBe(5);
    const [b1, b2, run, plank, pull] = p.sets;
    expect([b1.exerciseId, b1.weight, b1.reps]).toEqual(['e1', 80, 8]);
    expect(b2.weight).toBeCloseTo(83.915, 3); // 185 lb
    expect(b2.comment).toBe('felt good, fast');
    expect([run.distance, run.time]).toEqual([5, 1530]);
    expect(plank.time).toBe(90);
    expect(pull.reps).toBe(12);
    expect(p.exercises.map((e) => [e.name, e.type])).toEqual([
      ['Running (Treadmill)', 'distance,time'],
      ['Plank', 'time'],
      ['Pull Up', 'reps'],
    ]);
    expect(p.categories.map((c) => c.name)).toEqual(['Cardio', 'Abs', 'Back']);
    expect(p.sets.map((s) => s.order)).toEqual([1000, 1001, 1002, 1003, 1004]);
    expect([p.first, p.last]).toEqual(['2024-01-08', '2024-01-10']);
  });

  it('skips rows that are already stored (re-importing is safe)', () => {
    const first = planImport(file, { categories: [chest], exercises: [bench], sets: [] }, 1);
    const again = planImport(file, { categories: [chest, ...first.categories], exercises: [bench, ...first.exercises], sets: first.sets }, 100);
    expect(again.sets).toEqual([]);
    expect(again.duplicates).toBe(5);
    expect(again.exercises).toEqual([]);
  });

  it('reads a unit in the header and other column names', () => {
    const p = planImport('Date,Exercise Name,Category,Weight (lbs),Reps,Notes\n2024-02-01,Squat,Legs,225,5,ok\n', { categories: [], exercises: [], sets: [] }, 1);
    expect(p.sets[0].weight).toBeCloseTo(102.058, 3);
    expect(p.sets[0].comment).toBe('ok');
  });

  it('rejects files that are not FitNotes CSVs', () => {
    expect(() => planImport('', { categories: [], exercises: [], sets: [] }, 1)).toThrow();
    expect(() => planImport('Name,Value\nx,1', { categories: [], exercises: [], sets: [] }, 1)).toThrow();
  });

  it('infers types from the fields used', () => {
    expect(inferType(new Set(['weight', 'reps']))).toBe('weight,reps');
    expect(inferType(new Set(['weight', 'reps', 'time']))).toBe('weight,reps');
    expect(inferType(new Set(['distance']))).toBe('distance');
    expect(inferType(new Set())).toBe('weight,reps');
  });
});

describe('CSV export', () => {
  it('writes FitNotes columns in the user units, skipping planned sets', () => {
    const run: Exercise = { id: 'e2', name: 'Run, easy', categoryId: 'c1', type: 'distance,time' };
    const sets: WorkoutSet[] = [
      { id: 'a', date: '2024-01-08', exerciseId: 'e1', order: 1, weight: 80, reps: 8, comment: 'top "set"' },
      { id: 'b', date: '2024-01-09', exerciseId: 'e2', order: 2, distance: 5, time: 1530 },
      { id: 'c', date: '2024-01-10', exerciseId: 'e1', order: 3, weight: 90, reps: 5, planned: true },
    ];
    const csv = toCsv(sets, (id) => (id === 'e1' ? bench : run), () => chest, DEFAULT_SETTINGS);
    expect(csv.split('\r\n')).toEqual([
      'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment',
      '2024-01-08,Flat Barbell Bench Press,Chest,80,kgs,8,,,,"top ""set"""',
      '2024-01-09,"Run, easy",Chest,,,,5,km,25:30,',
      '',
    ]);
    // Round trip: the export imports back to the same values.
    const back = planImport(csv, { categories: [chest], exercises: [bench, run], sets: [] }, 1);
    expect(back.sets.map((s) => [s.weight, s.reps, s.distance, s.time])).toEqual([
      [80, 8, undefined, undefined],
      [undefined, undefined, 5, 1530],
    ]);
  });
});
