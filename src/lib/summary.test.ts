import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from './model';
import { durationOf, fmtDuration, stampAt, summaryOf } from './summary';

let n = 0;
const set = (x: Partial<WorkoutSet>): WorkoutSet => ({ id: String(++n), date: '2026-11-05', exerciseId: 'b', order: n, weight: 100, reps: 8, ...x });
/** A local time on 5 Nov 2026 (the sets' date). */
const local = (h: number, m = 0) => new Date(2026, 10, 5, h, m).getTime();

describe('duration', () => {
  it('first to last set logged; planned and untimed sets left out; null with fewer than two', () => {
    const t0 = local(17);
    expect(durationOf([set({ at: t0 }), set({ at: t0 + 52 * 60_000 }), set({ planned: true, at: t0 + 99 * 60_000 }), set({})])).toBe(52 * 60);
    // A forgotten set added the next day doesn't stretch the workout to a day.
    expect(durationOf([set({ at: local(17) }), set({ at: local(17, 52) }), set({ at: new Date(2026, 10, 6, 9).getTime() })])).toBe(52 * 60);
    expect(durationOf([set({ at: t0 })])).toBeNull();
    expect(durationOf([set({}), set({})])).toBeNull(); // copied or imported sets carry no time
  });
  it('formatted in minutes and hours', () => {
    expect(fmtDuration(52 * 60)).toBe('52 min');
    expect(fmtDuration(65 * 60)).toBe('1 h 5 min');
    expect(fmtDuration(120 * 60)).toBe('2 h');
    expect(fmtDuration(20)).toBe('1 min');
  });
});

describe('logged time on a tick', () => {
  it('ticking a set done is now; unticking or editing keeps its time', () => {
    expect(stampAt(100, false, true, 999)).toBe(999); // re-ticked two hours later: now
    expect(stampAt(undefined, false, true, 999)).toBe(999);
    expect(stampAt(100, true, false, 999)).toBe(100);
    expect(stampAt(100, true, true, 999)).toBe(100);
  });
});

describe('summary', () => {
  it('totals, records of the day and the muscles that met the goal', () => {
    const a = set({ exerciseId: 'b', at: local(17) });
    const b = set({ exerciseId: 'b', at: local(17, 1) });
    const c = set({ exerciseId: 's', at: local(17, 2) });
    const s = summaryOf({
      sets: [a, b, c, set({ planned: true })],
      volume: 2400,
      effective: () => 7.5,
      recordIds: new Set([b.id]),
      muscles: [
        { muscle: 'chest', n: 21.4, met: true },
        { muscle: 'triceps', n: 8, met: false },
      ],
    });
    expect(s).toEqual({ duration: 120, exercises: 2, sets: 3, volume: 2400, effective: 23, records: 1, goalsMet: [{ muscle: 'chest', n: 21 }] });
  });
});
