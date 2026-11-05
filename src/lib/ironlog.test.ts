import { describe, expect, it } from 'vitest';
import { defaultMetrics } from './body';
import { maintenanceOf, parseIronLog, phaseOf, planBodyImport } from './ironlog';

const backup = (x: object = {}) => ({
  format: 'iron-log-backup',
  version: 1,
  exportedAt: '2026-11-01T10:00:00Z',
  entries: [],
  body: [
    { date: '2026-10-01', weightKg: 82.4, waistCm: 88, updatedAt: 1 },
    { date: '2026-10-08', weightKg: 81.9, bodyFatPct: 16.5, updatedAt: 2 },
    { date: 'nope', weightKg: 80, updatedAt: 3 },
    { date: '2026-10-09', weightKg: 9999, updatedAt: 4 }, // out of range: dropped
  ],
  settings: { lang: 'sv', profile: { sex: 'male', kcal: 2200, age: 30, weightKg: 82, heightCm: 180, pal: 1.55 } },
  ...x,
});

describe('reading an Iron Log backup', () => {
  it('body rows with valid values; the profile’s target and maintenance', () => {
    const d = parseIronLog(backup());
    expect(d.body).toEqual([
      { date: '2026-10-01', weightKg: 82.4, bodyFatPct: undefined, waistCm: 88 },
      { date: '2026-10-08', weightKg: 81.9, bodyFatPct: 16.5, waistCm: undefined },
    ]);
    expect(d.kcal).toBe(2200);
    expect(d.maintenance).toBe(Math.round((10 * 82 + 6.25 * 180 - 5 * 30 + 5) * 1.55));
  });
  it('anything else is refused', () => {
    expect(() => parseIronLog({ app: 'iron-notes', version: 1 })).toThrow();
    expect(() => parseIronLog(null)).toThrow();
    expect(parseIronLog(backup({ body: undefined, settings: undefined }))).toEqual({ body: [], kcal: undefined, maintenance: undefined });
  });
});

describe('diet phase from the energy target', () => {
  it('under 90 % of maintenance a cut, over 105 % building, else maintaining', () => {
    expect(phaseOf({ kcal: 2200, maintenance: 2800 })).toBe('cut');
    expect(phaseOf({ kcal: 2700, maintenance: 2800 })).toBe('maintain');
    expect(phaseOf({ kcal: 3100, maintenance: 2800 })).toBe('build');
    expect(phaseOf({ kcal: 2200 })).toBeUndefined();
    expect(maintenanceOf({ sex: 'other', age: 30, weightKg: 80, heightCm: 180 })).toBeUndefined();
  });
});

describe('the merge plan', () => {
  const metrics = defaultMetrics();
  const weight = metrics.find((m) => m.name === 'Body weight')!;
  it('into Body weight / Body fat / Waist, skipping dates already there', () => {
    let n = 0;
    const plan = planBodyImport(parseIronLog(backup()), metrics, (id) => new Set(id === weight.id ? ['2026-10-01'] : []), () => String(++n), () => n);
    const by = (name: string) => plan.entries.filter((e) => e.metricId === metrics.find((m) => m.name === name)!.id).map((e) => [e.date, e.value]);
    expect(by('Body weight')).toEqual([['2026-10-08', 81.9]]);
    expect(by('Body fat')).toEqual([['2026-10-08', 16.5]]);
    expect(by('Waist')).toEqual([['2026-10-01', 88]]);
    expect(plan.skipped).toBe(1);
    expect(plan.missing).toEqual([]);
  });
  it('a measure that doesn’t exist is reported, not created', () => {
    const plan = planBodyImport(parseIronLog(backup()), metrics.filter((m) => m.kind !== 'percent'), () => new Set(), () => 'x', () => 0);
    expect(plan.missing).toEqual(['body fat']);
  });
});
