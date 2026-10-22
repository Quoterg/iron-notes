// Body measures state: a lazy module, loaded with the Body tab (not part of the first paint).
// The Body list needs only each measure's latest two dates (an indexed read per measure); a measure's
// full history is read when its screen opens and then kept in memory and updated in place.
import { signal } from '@preact/signals';
import { uid } from './lib/calc';
import * as db from './lib/db';
import type { BodyEntry, BodyKind, BodyMetric } from './lib/model';

export const metrics = signal<BodyMetric[] | null>(null);
/** Per measure: its latest entries (latest date last; up to two dates until its screen opens). */
export const latest = signal<ReadonlyMap<string, BodyEntry[]>>(new Map());
/** Per opened measure: every entry (raw, incl. replaced same-date ones), in memory. */
const raw = new Map<string, BodyEntry[]>();
/** Per opened measure: one entry per date, sorted (what the screen shows). */
export const entries = signal<ReadonlyMap<string, BodyEntry[]>>(new Map());

const byOrder = (a: BodyMetric, b: BodyMetric) => a.order - b.order || a.name.localeCompare(b.name);

let loading: Promise<void> | undefined;
/** Loads the measures once (concurrent callers share one load, so the starter set is written once). */
export function loadBody(): Promise<void> {
  return (loading ??= (async () => {
    const { defaultMetrics } = await import('./lib/body');
    let list = await db.getMetrics();
    // The starter measures, once per device (deleting them all keeps them deleted).
    if (!list.length && !(await db.getFlag('bodySeeded'))) {
      list = defaultMetrics();
      await db.putMetrics(list);
      await db.setFlag('bodySeeded');
    }
    const last = await Promise.all(list.map(async (m) => [m.id, await db.latestEntries(m.id, 2)] as const));
    latest.value = new Map(last);
    metrics.value = list.sort(byOrder);
  })());
}

/** A measure's full history (its screen): read once, then kept and updated in memory. */
export async function loadEntries(metricId: string): Promise<void> {
  if (raw.has(metricId)) return;
  raw.set(metricId, await db.entriesOf(metricId));
  await publish(metricId);
}

async function publish(metricId: string) {
  const { byDate } = await import('./lib/body');
  const sorted = byDate(raw.get(metricId) ?? []);
  entries.value = new Map(entries.value).set(metricId, sorted);
  latest.value = new Map(latest.value).set(metricId, sorted.slice(-2));
}

let lastAt = 0;
/** Entry time, strictly increasing: two entries in one millisecond still have an order ("the newer"). */
const nextAt = () => (lastAt = Math.max(lastAt + 1, Date.now()));

/** Adds an entry (for a date that has one, the newer shows); one write, the list updated in place. */
export async function addEntry(metricId: string, date: string, value: number): Promise<void> {
  const e: BodyEntry = { id: uid(), metricId, date, value, at: nextAt() };
  await db.putEntry(e);
  await loadEntries(metricId);
  raw.set(metricId, [...raw.get(metricId)!.filter((x) => x.id !== e.id), e]);
  await publish(metricId);
}
/** Deletes an entry (an earlier one of the same date shows again); returns an undo. */
export async function removeEntry(e: BodyEntry): Promise<() => Promise<void>> {
  await db.deleteEntry(e.id);
  await loadEntries(e.metricId);
  raw.set(e.metricId, raw.get(e.metricId)!.filter((x) => x.id !== e.id));
  await publish(e.metricId);
  return async () => {
    await db.putEntry(e);
    raw.set(e.metricId, [...raw.get(e.metricId)!, e]);
    await publish(e.metricId);
  };
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
  raw.delete(id);
  for (const s of [entries, latest]) {
    const map = new Map(s.value);
    map.delete(id);
    s.value = map;
  }
}

/** After a restore or "delete all": read again when next shown. */
export function resetBody(): void {
  loading = undefined;
  raw.clear();
  metrics.value = null;
  latest.value = new Map();
  entries.value = new Map();
}
