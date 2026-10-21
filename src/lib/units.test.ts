import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type WorkoutSet } from './model';
import { dFromUser, dToUser, num, setText, wFromUser, wToUser } from './units';

const kg = DEFAULT_SETTINGS;
const lb = { ...DEFAULT_SETTINGS, unit: 'lb' as const, dist: 'mi' as const };
const s = (x: Partial<WorkoutSet>): WorkoutSet => ({ id: 'a', date: '2026-01-01', exerciseId: 'x', order: 1, ...x });

describe('units', () => {
  it('round-trips pounds and miles without visible drift', () => {
    expect(num(wToUser(wFromUser(135, 'lb'), 'lb'))).toBe('135');
    expect(num(dToUser(dFromUser(3.1, 'mi'), 'mi'))).toBe('3.1');
    expect(dToUser(1.5, 'm')).toBe(1500);
  });
  it('formats sets per type', () => {
    expect(setText(s({ weight: 82.5, reps: 5 }), 'weight,reps', kg)).toBe('82.5 kg × 5');
    expect(setText(s({ weight: wFromUser(185, 'lb'), reps: 5 }), 'weight,reps', lb)).toBe('185 lb × 5');
    expect(setText(s({ reps: 12 }), 'reps', kg)).toBe('12 reps');
    expect(setText(s({ distance: 5, time: 1500 }), 'distance,time', kg)).toBe('5 km · 25:00');
    expect(setText(s({ time: 75 }), 'time', kg)).toBe('1:15');
  });
});
