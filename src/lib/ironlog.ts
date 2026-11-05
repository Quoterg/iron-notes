// Iron Log bridge (M30): import body measurements from an Iron Log backup file (Iron Log is the sister
// nutrition app; the two live on different origins and can't read each other's storage). Body weight,
// body fat and waist go to the Body screen; Iron Log's energy target against an estimate of maintenance
// suggests the diet phase. Pure: parsing, validation and the merge plan.
import type { BodyEntry, BodyKind, BodyMetric, Settings } from './model';

export interface IronLogBody {
  date: string;
  weightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
}
export interface IronLogData {
  body: IronLogBody[];
  /** From the profile: the daily energy target and what maintenance is estimated at (kcal), if known. */
  kcal?: number;
  maintenance?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** Mifflin–St Jeor × activity: the maintenance estimate Iron Log itself offers. */
export function maintenanceOf(p: { sex?: unknown; age?: unknown; weightKg?: unknown; heightCm?: unknown; pal?: unknown }): number | undefined {
  const w = num(p.weightKg, 20, 400);
  const h = num(p.heightCm, 100, 250);
  const a = num(p.age, 10, 110);
  const pal = num(p.pal, 1, 2.5) ?? 1.375;
  if (!w || !h || !a || (p.sex !== 'male' && p.sex !== 'female')) return undefined;
  return Math.round((10 * w + 6.25 * h - 5 * a + (p.sex === 'male' ? 5 : -161)) * pal);
}

/** Reads an Iron Log backup (format "iron-log-backup", version 1). Throws when it isn't one. */
export function parseIronLog(x: unknown): IronLogData {
  const b = x as { format?: unknown; version?: unknown; body?: unknown; settings?: { profile?: Record<string, unknown> } } | null;
  if (!b || typeof b !== 'object' || b.format !== 'iron-log-backup' || typeof b.version !== 'number') throw new Error('Not an Iron Log backup');
  const body: IronLogBody[] = [];
  for (const e of Array.isArray(b.body) ? b.body : []) {
    const r = e as Record<string, unknown>;
    if (typeof r?.date !== 'string' || !DATE.test(r.date)) continue;
    const out: IronLogBody = { date: r.date, weightKg: num(r.weightKg, 20, 400), bodyFatPct: num(r.bodyFatPct, 2, 75), waistCm: num(r.waistCm, 30, 250) };
    if (out.weightKg != null || out.bodyFatPct != null || out.waistCm != null) body.push(out);
  }
  const p = b.settings?.profile;
  return { body, kcal: p ? num(p.kcal, 800, 10000) : undefined, maintenance: p ? maintenanceOf(p) : undefined };
}

/** The diet phase Iron Log's target suggests: under 90 % of maintenance a cut, over 105 % building. */
export function phaseOf(d: Pick<IronLogData, 'kcal' | 'maintenance'>): Settings['diet'] | undefined {
  if (!d.kcal || !d.maintenance) return undefined;
  const r = d.kcal / d.maintenance;
  return r < 0.9 ? 'cut' : r > 1.05 ? 'build' : 'maintain';
}

const FIELDS: [keyof IronLogBody, BodyKind, string][] = [
  ['weightKg', 'weight', 'body weight'],
  ['bodyFatPct', 'percent', 'body fat'],
  ['waistCm', 'length', 'waist'],
];

/**
 * The entries to write: per Iron Log field, into the measure of that kind (by the starter name, else
 * the first of the kind), skipping dates that measure already has. Lengths are stored in cm.
 */
export function planBodyImport(
  data: IronLogData,
  metrics: readonly BodyMetric[],
  existing: (metricId: string) => ReadonlySet<string>,
  id: () => string,
  at: () => number,
): { entries: BodyEntry[]; skipped: number; missing: string[] } {
  const entries: BodyEntry[] = [];
  const missing: string[] = [];
  let skipped = 0;
  for (const [field, kind, starter] of FIELDS) {
    const rows = data.body.filter((r) => r[field] != null);
    if (!rows.length) continue;
    const m = metrics.find((x) => x.kind === kind && x.name.toLowerCase() === starter) ?? metrics.find((x) => x.kind === kind && kind !== 'length');
    if (!m) {
      missing.push(starter);
      continue;
    }
    const have = existing(m.id);
    for (const r of rows) {
      if (have.has(r.date)) skipped++;
      else entries.push({ id: id(), metricId: m.id, date: r.date, value: r[field] as number, at: at() });
    }
  }
  return { entries, skipped, missing };
}
