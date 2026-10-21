// One measure over time, like Iron Log's chart: hand-written SVG (no chart library), dots joined by a
// line, crosshair + readout on pointer and keyboard, and every value also as a table.
import { useState } from 'preact/hooks';
import { t } from '../lib/i18n';
import { niceScale, TIME_STEPS, type Point } from '../lib/progress';

const W = 320;
const H = 160;
const PAD = { top: 10, right: 12, bottom: 22, left: 40 };
const DAY = 86_400_000;
const time = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const shortDate = (d: string, withYear = false) =>
  new Date(time(d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/** Max dots drawn: beyond this (long histories) keep the min and max point per x-bucket. */
const MAX_DOTS = 120;
function decimate(points: Point[]): number[] {
  if (points.length <= MAX_DOTS) return points.map((_, i) => i);
  const buckets = MAX_DOTS / 2;
  const size = points.length / buckets;
  const keep: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(points.length, Math.floor((b + 1) * size));
    let lo = start;
    let hi = start;
    for (let i = start; i < end; i++) {
      if (points[i].value < points[lo].value) lo = i;
      if (points[i].value > points[hi].value) hi = i;
    }
    keep.push(...(lo < hi ? [lo, hi] : lo > hi ? [hi, lo] : [lo]));
  }
  return keep;
}

/** `points` are in display units, sorted by date; `fmt` formats a value (axis and readout). */
export function LineChart({ title, points, fmt, timeAxis }: { title: string; points: Point[]; fmt: (v: number) => string; timeAxis?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  if (points.length === 0) return null;

  const t0 = time(points[0].date);
  const t1 = Math.max(time(points[points.length - 1].date), t0 + DAY);
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const p of points) (vmin = Math.min(vmin, p.value)), (vmax = Math.max(vmax, p.value));
  const { lo, hi, ticks } = niceScale(vmin, vmax, timeAxis ? TIME_STEPS : undefined);
  const longSpan = t1 - t0 > 300 * DAY;
  const x = (d: string) => PAD.left + ((time(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const xs = points.map((p) => x(p.date));
  const dots = decimate(points);
  const drawn = new Set(dots);
  const path = dots.map((i, k) => `${k ? 'L' : 'M'}${xs[i].toFixed(1)},${y(points[i].value).toFixed(1)}`).join('');

  /** Nearest point by x: binary search (points are sorted by date). */
  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let a = 0;
    let b = xs.length - 1;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (xs[mid] < px) a = mid + 1;
      else b = mid;
    }
    return a > 0 && px - xs[a - 1] < xs[a] - px ? a - 1 : a;
  };

  const a = active == null ? null : points[active];
  const last = points[points.length - 1];
  const summary = `${title}: ${points.length} ${t('workoutsCount')}, ${fmt(last.value)} (${shortDate(last.date, true)}).`;

  return (
    <figure class="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e.clientX, (e.currentTarget as SVGSVGElement).getBoundingClientRect()))}
        onPointerDown={(e) => setActive(nearest(e.clientX, (e.currentTarget as SVGSVGElement).getBoundingClientRect()))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const step = e.key === 'ArrowRight' ? 1 : -1;
            setActive(Math.min(points.length - 1, Math.max(0, (active ?? (step > 0 ? -1 : points.length)) + step)));
          }
        }}
        onBlur={() => setActive(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text class="axis" x={PAD.left - 6} y={y(v) + 3} text-anchor="end">
              {fmt(v)}
            </text>
          </g>
        ))}
        <text class="axis" x={PAD.left} y={H - 6}>
          {shortDate(points[0].date, longSpan)}
        </text>
        <text class="axis" x={W - PAD.right} y={H - 6} text-anchor="end">
          {shortDate(last.date, longSpan)}
        </text>
        {a && <line class="crosshair" x1={xs[active!]} x2={xs[active!]} y1={PAD.top} y2={H - PAD.bottom} />}
        <path class="trend" d={path} />
        {dots.map((i) => (
          <circle key={points[i].date} class={i === active ? 'point on' : 'point'} cx={xs[i]} cy={y(points[i].value)} r={3.5} />
        ))}
        {a && !drawn.has(active!) && <circle class="point on" cx={xs[active!]} cy={y(a.value)} r={3.5} />}
      </svg>
      <p class="chart-tip num" aria-live="polite">
        {a ? (
          <>
            <b>{fmt(a.value)}</b> · {shortDate(a.date, true)}
          </>
        ) : (
          <span class="muted">{t('chartHint')}</span>
        )}
      </p>
      <button type="button" class="link small" aria-expanded={tableOpen} onClick={() => setTableOpen(!tableOpen)}>
        {tableOpen ? t('hideTable') : t('showTable')}
      </button>
      {/* Rows only while open: a long history would otherwise add hundreds of hidden rows. */}
      {tableOpen && (
        <table class="data">
          <thead>
            <tr>
              <th>{t('dateCol')}</th>
              <th>{title}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td class="num">{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
