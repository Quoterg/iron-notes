// The exercise screen's History, Graph and Records tabs. All work from the exercise's cached history
// (sets in date/order), computed only while the tab is shown.
import { useMemo, useState } from 'preact/hooks';
import { fmtTime, isoDate, parseIso } from '../lib/calc';
import { t, type Key } from '../lib/i18n';
import type { Exercise, Settings, WorkoutSet } from '../lib/model';
import { bestOrm, bests, dailySeries, METRICS, metricsFor, rangeStart, repMaxTable, workouts, type Kind, type Metric, type Range } from '../lib/progress';
import { distance, dToUser, KM_PER_MI, num, setText, weight, wToUser } from '../lib/units';
import { open } from '../nav';
import { Trophy } from './icons';
import { LineChart } from './LineChart';

const longDate = (d: string) => parseIso(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (d: string) => parseIso(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Seconds per km → seconds per the user's distance unit (per km for metres). */
const pacePerUnit = (secPerKm: number, s: Settings) => (s.dist === 'mi' ? secPerKm * KM_PER_MI : secPerKm);
const paceUnit = (s: Settings) => (s.dist === 'mi' ? 'mi' : 'km');

/** A stored value of a kind, shown in the user's units. */
export function fmtKind(v: number, kind: Kind, s: Settings): string {
  if (kind === 'weight') return weight(v, s);
  if (kind === 'distance') return distance(v, s);
  if (kind === 'time') return fmtTime(v);
  if (kind === 'pace') return `${fmtTime(pacePerUnit(v, s))} /${paceUnit(s)}`;
  return num(v);
}

const PAGE = 20;

export function History({ ex, all, rec, st }: { ex: Exercise; all: WorkoutSet[]; rec?: ReadonlySet<string>; st: Settings }) {
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => workouts(all), [all]);
  if (!list.length) return <p class="muted center">{t('noHistory')}</p>;
  return (
    <>
      {list.slice(0, shown).map((w) => (
        <section class="card ex-card" key={w.date}>
          <button class="ex-head" onClick={() => open({ kind: 'exercise', id: ex.id, date: w.date })} aria-label={`${t('openDay')}: ${longDate(w.date)}`}>
            <h2>{longDate(w.date)}</h2>
          </button>
          <ol class="setlist">
            {w.sets.map((s) => (
              <li key={s.id}>
                <span>{setText(s, ex.type, st)}</span>
                {rec?.has(s.id) && <Trophy />}
                {s.comment && <span class="note-line">{s.comment}</span>}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {shown < list.length && (
        <button class="btn wide" onClick={() => setShown(shown + PAGE)}>
          {t('showMore')} ({list.length - shown})
        </button>
      )}
    </>
  );
}

const RANGES: Range[] = ['1m', '3m', '6m', '1y', 'all'];

export function Graph({ ex, all, st }: { ex: Exercise; all: WorkoutSet[]; st: Settings }) {
  const metrics = metricsFor(ex.type);
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const [range, setRange] = useState<Range>('3m');
  const kind = METRICS[metric].kind;
  // Values converted to display units here, so the axis shows round numbers in kg/lb, km/mi.
  const points = useMemo(() => {
    const since = rangeStart(range, isoDate(new Date()));
    const conv = (v: number) =>
      kind === 'weight' ? wToUser(v, st.unit) : kind === 'distance' ? dToUser(v, st.dist) : kind === 'pace' ? pacePerUnit(v, st) : v;
    return dailySeries(all, metric, st.formula, since).map((p) => ({ date: p.date, value: conv(p.value) }));
  }, [all, metric, range, st.unit, st.dist, st.formula]);
  const fmt = (v: number) =>
    kind === 'weight' ? `${num(v, 1)}` : kind === 'distance' ? num(v, 2) : kind === 'time' || kind === 'pace' ? fmtTime(v) : num(v, 0);
  const unit = kind === 'weight' ? st.unit : kind === 'distance' ? st.dist : kind === 'pace' ? `/${paceUnit(st)}` : '';
  const title = `${t(`m_${metric}` as Key)}${unit ? ` (${unit})` : ''}`;

  return (
    <div class="card">
      {metrics.length > 1 && (
        <div class="col">
          <label for="g-metric" class="muted small">
            {t('metric')}
          </label>
          <select id="g-metric" value={metric} onChange={(e) => setMetric(e.currentTarget.value as Metric)}>
            {metrics.map((m) => (
              <option key={m} value={m}>
                {t(`m_${m}` as Key)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div class="chips" role="group" aria-label={t('range')}>
        {RANGES.map((r) => (
          <button key={r} class={r === range ? 'chip on' : 'chip'} aria-pressed={r === range} onClick={() => setRange(r)}>
            {t(`r_${r}` as Key)}
          </button>
        ))}
      </div>
      {points.length >= 2 ? <LineChart title={title} points={points} fmt={fmt} timeAxis={kind === 'time' || kind === 'pace'} /> : <p class="muted center">{t('notEnoughData')}</p>}
    </div>
  );
}

export function Records({ ex, all, st }: { ex: Exercise; all: WorkoutSet[]; st: Settings }) {
  const strength = ex.type === 'weight,reps';
  const orm = useMemo(() => (strength ? bestOrm(all, st.formula) : null), [all, st.formula, strength]);
  const table = useMemo(() => (strength ? repMaxTable(all, 15).filter((r) => r.set) : []), [all, strength]);
  const best = useMemo(() => bests(all, ex.type), [all, ex.type]);
  if (!best.length) return <p class="muted center">{t('noRecords')}</p>;
  return (
    <>
      {orm && (
        <div class="card hero">
          <div class="hero-head">
            <span>{t('est1rm')}</span>
          </div>
          <div class="hero-num num">
            {num(wToUser(orm.value, st.unit), 1)} <small>{st.unit}</small>
          </div>
          <p class="muted small">
            {setText(orm.set, ex.type, st)} · {shortDate(orm.set.date)}
          </p>
        </div>
      )}
      {table.length > 0 && (
        <div class="card">
          <h2>{t('repMaxes')}</h2>
          <table class="data">
            <thead>
              <tr>
                <th>{t('repsCol')}</th>
                <th>{t('weightCol')}</th>
                <th>{t('dateCol')}</th>
              </tr>
            </thead>
            <tbody>
              {table.map(({ reps, set }) => (
                <tr key={reps}>
                  <td class="num">{reps}</td>
                  <td class="num">
                    {weight(set!.weight!, st)}
                    {set!.reps! > reps && <span class="muted"> × {set!.reps}</span>}
                  </td>
                  <td>{shortDate(set!.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div class="card">
        <h2>{t('bestValues')}</h2>
        <ul class="entries">
          {best.map((b) => (
            <li key={b.field}>
              <span class="entry entry-static">
                <span class="entry-name">{t(`b_${b.field}` as Key)}</span>
                <span class="num">
                  <b>{fmtKind(b.value, b.field === 'pace' ? 'pace' : b.field, st)}</b>
                  <span class="muted small"> · {shortDate(b.set.date)}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
