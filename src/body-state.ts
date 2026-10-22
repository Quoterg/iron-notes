// Body measures state: a lazy module, loaded with the Body tab (not part of the first paint).
import { signal } from '@preact/signals';
import { uid } from './lib/calc';
import * as db from './lib/db';
import type { BodyEntry, BodyKind, BodyMetric } from './lib/model';

export const metrics = signal<BodyMetric[] | null>(null);
/** All entries by measure, sorted by date (one value per date). Small: a few per week per measure. */
export const entries = signal<ReadonlyMap<string, BodyEntry[]>>(new Map());

const byOrder = (a: BodyMetric, b: BodyMetric) => a.order - b.order || a.name.localeCompare(b.name);

export async function loadBody(): Promise<void> {
  if (metrics.value) return;
  const { byDate, defaultMetrics } = await import('./lib/body');
  let list = await db.getMetrics();
  // The starter measures, once per device (deleting them all keeps them deleted).
  if (!list.length && !(await db.getFlag('bodySeeded'))) {
    list = defaultMetrics();
    await db.putMetrics(list);
    await db.setFlag('bodySeeded');
  }
  const all = await db.allEntries();
  const map = new Map<string, BodyEntry[]>();
  for (const e of all) map.get(e.metricId)?.push(e) ?? map.set(e.metricId, [e]);
  for (const [k, v] of map) map.set(k, byDate(v));
  entries.value = map;
  metrics.value = list.sort(byOrder);
}

async function refresh(metricId: string) {
  const { byDate } = await import('./lib/body');
  entries.value = new Map(entries.value).set(metricId, byDate(await db.entriesOf(metricId)));
}

/** Adds (or, for the same date, replaces the shown value of) an entry. */
export async function addEntry(metricId: string, date: string, value: number): Promise<void> {
  await db.putEntry({ id: uid(), metricId, date, value, at: Date.now() });
  await refresh(metricId);
}
export async function removeEntry(e: BodyEntry): Promise<void> {
  await db.deleteEntry(e.id);
  await refresh(e.metricId);
}

export async function addMetric(name: string, kind: BodyKind): Promise<BodyMetric> {
  const m: BodyMetric = { id: uid(), name, kind, order: Math.max(-1, ...(metrics.value ?? []).map((x) => x.order)) + 1 };
  await db.putMetrics([m]);
  metrics.value = [...(metrics.value ?? []), m].sort(byOrder);
  return m;
}
export async function renameMetric(m: BodyMetric, name: string): Promise<void> {
  const next = { ...m, name };
  await db.putMetrics([next]);
  metrics.value = (metrics.value ?? []).map((x) => (x.id === m.id ? next : x));
}
export async function removeMetric(id: string): Promise<void> {
  await db.deleteMetric(id);
  metrics.value = (metrics.value ?? []).filter((x) => x.id !== id);
  const map = new Map(entries.value);
  map.delete(id);
  entries.value = map;
}

/** After a restore: read again when next shown. */
export function resetBody(): void {
  metrics.value = null;
  entries.value = new Map();
}
