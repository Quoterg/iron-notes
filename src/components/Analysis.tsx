// Training statistics for a period: totals, categories, workouts per week, most frequent exercises.
// One index-range read of the period's sets; everything else is computed in memory.
import { loadOf, usesBodyWeight } from '../lib/load';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { periodStart, summarize, type Period } from '../lib/analysis';
import { effectiveOf } from '../effort';
import { GOALS, periodMuscles } from '../lib/volume';
import { fmtTime, isoDate, parseIso } from '../lib/calc';
import { setsBetween } from '../lib/db';
import { type Key, locale, t } from '../lib/i18n';
import type { WorkoutSet } from '../lib/model';
import { distance, num, weight, wToUser } from '../lib/units';
import { open } from '../nav';
import { bodyWeights, catById, exById, settings } from '../state';
import { Dot } from './icons';
import { Sheet } from './Sheet';

type Choice = Period | 'custom';
const PERIODS: Choice[] = ['week', 'month', '3m', 'year', 'all', 'custom'];
const TOP = 10;

export default function Analysis() {
  const today = isoDate(new Date());
  const st = settings.value;
  const [period, setPeriod] = useState<Choice>('month');
  const [from, setFrom] = useState(periodStart('month', today));
  const [to, setTo] = useState(today);
  const [by, setBy] = useState<'sets' | 'volume'>('sets');
  const [sets, setSets] = useState<WorkoutSet[] | null>(null);

  const range = period === 'custom' ? { from, to } : { from: periodStart(period, today), to: today };
  useEffect(() => {
    let live = true;
    setSets(null);
    void setsBetween(range.from || '0000-01-01', range.to).then((s) => live && setSets(s));
    return () => {
      live = false;
    };
  }, [range.from, range.to]);

  // Body weight by date (only when a body-weight exercise is in the period: one read, cached).
  const [bwAt, setBwAt] = useState<(d: string) => number | undefined>(() => () => undefined);
  useEffect(() => {
    if (sets?.some((s) => usesBodyWeight(loadOf(exById.value.get(s.exerciseId))))) void bodyWeights().then((f) => setBwAt(() => f));
  }, [sets]);

  // Effective reps per muscle in the period: the same numbers as the day log and the Muscles screen.
  const [er, setEr] = useState<ReturnType<typeof periodMuscles> | null>(null);
  useEffect(() => {
    let live = true;
    setEr(null);
    if (sets)
      void effectiveOf(sets).then((eff) => {
        if (live) setEr(periodMuscles(sets, (id) => exById.value.get(id)?.muscles, (s) => eff(s).n, GOALS[st.mode], range.from, range.to));
      });
    return () => {
      live = false;
    };
  }, [sets, st.mode, st.formula]);

  const sum = useMemo(
    () => (sets ? summarize(sets, (id) => exById.value.get(id), range.from, range.to, st.weekStart, st.formula, bwAt) : null),
    [sets, st.weekStart, st.formula, bwAt],
  );

  return (
    <Sheet title={t('analysis')}>
      <div class="pad">
        <div class="chips" role="group" aria-label={t('range')}>
          {PERIODS.map((p) => (
            <button key={p} class={p === period ? 'chip on' : 'chip'} aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {t(`p_${p}` as Key)}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div class="grid2 form">
            <label>
              {t('from')}
              <input type="date" value={from} max={to} onInput={(e) => setFrom(e.currentTarget.value)} />
            </label>
            <label>
              {t('to')}
              <input type="date" value={to} min={from} max={today} onInput={(e) => setTo(e.currentTarget.value)} />
            </label>
          </div>
        )}

        {!sum && <p class="muted center">{t('loading')}</p>}
        {sum && sum.totals.workouts === 0 && <p class="muted center">{t('noWorkoutsInPeriod')}</p>}
        {sum && sum.totals.workouts > 0 && (
          <>
            <div class="stats-grid num">
              <Stat label={t('statWorkouts')} value={String(sum.totals.workouts)} />
              <Stat label={t('statSets')} value={String(sum.totals.sets)} />
              <Stat label={t('repsCol')} value={String(sum.totals.reps)} />
              <Stat label={t('statVolume')} value={weight(sum.totals.volume, st)} />
              {er && er.total > 0 && <Stat label={t('statEffective')} value={`${st.mode === 'standard' ? '≈' : ''}${Math.round(er.total)}`} />}
              {sum.totals.time > 0 && <Stat label={t('time')} value={fmtTime(sum.totals.time)} />}
              {sum.totals.distance > 0 && <Stat label={t('distance')} value={distance(sum.totals.distance, st)} />}
            </div>

            {sum.weeks.length > 1 && (
              <div class="card">
                <h2>{t('workoutsPerWeek')}</h2>
                <WeekBars weeks={sum.weeks} />
              </div>
            )}

            <div class="card">
              <div class="title-row">
                <h2>{t('categories')}</h2>
                <div class="chips small-chips" role="group" aria-label={t('metric')}>
                  {(['sets', 'volume'] as const).map((k) => (
                    <button key={k} class={k === by ? 'chip on' : 'chip'} aria-pressed={k === by} onClick={() => setBy(k)}>
                      {t(k === 'sets' ? 'statSets' : 'statVolume')}
                    </button>
                  ))}
                </div>
              </div>
              <CategoryBars cats={sum.categories} by={by} />
            </div>

            {er && er.list.length > 0 && (
              <div class="card">
                <h2>{t('effPerMuscle')}</h2>
                <p class="muted small">{t('effPerMuscleHint', { weeks: num(er.weeks, 1) })}</p>
                <ul class="mu-bars">
                  {er.list.map((m) => (
                    <li key={m.muscle}>
                      <span class="mu-name">{t(`mu_${m.muscle}` as Key)}</span>
                      <span class="mu-track">
                        <span class="mu-fill" style={{ width: `${(m.total / er.list[0].total) * 100}%` }} />
                      </span>
                      <span class="mu-num num">{Math.round(m.total)}</span>
                      <span class="mu-sessions small">
                        {t('effPerWeek', { n: Math.round(m.total / er.weeks) })} · {m.sessions === 1 ? t('mainSession1') : t('mainSessions', { n: m.sessions })}
                      </span>
                    </li>
                  ))}
                </ul>
                <button class="btn wide" onClick={() => open({ kind: 'muscles' })}>
                  {t('muscles')}
                </button>
              </div>
            )}

            <div class="card">
              <h2>{t('topExercises')}</h2>
              <ul class="entries">
                {sum.exercises.slice(0, TOP).map((e) => {
                  const ex = exById.value.get(e.exerciseId)!;
                  const change = e.firstOrm && e.lastOrm && e.lastOrm !== e.firstOrm ? (e.lastOrm / e.firstOrm - 1) * 100 : null;
                  return (
                    <li key={e.exerciseId}>
                      {/* Opens the exercise for today (history/graph/records cover any period); logging there writes to today. */}
                      <button class="entry" onClick={() => open({ kind: 'exercise', id: e.exerciseId, date: today })}>
                        <Dot color={catById.value.get(ex.categoryId)?.color} />
                        <span class="entry-name">{ex.name}</span>
                        <span class="muted small num">
                          {e.workouts} × · {e.sets} {t('sets')}
                          {e.lastOrm != null && ` · ${t('est1rm')} ${num(wToUser(e.lastOrm, st.unit), 1)} ${st.unit}`}
                          {change != null && <b class={change > 0 ? 'delta up' : 'delta down'}> {change > 0 ? '+' : '−'}{num(Math.abs(change), 1)} %</b>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div class="stat card">
      <span class="stat-value">{value}</span>
      <span class="muted small">{label}</span>
    </div>
  );
}

function CategoryBars({ cats, by }: { cats: { categoryId: string; sets: number; volume: number }[]; by: 'sets' | 'volume' }) {
  const st = settings.value;
  const list = [...cats].sort((a, b) => b[by] - a[by]).filter((c) => c[by] > 0);
  const max = Math.max(1, ...list.map((c) => c[by]));
  return (
    <ul class="cat-bars">
      {list.map((c) => {
        const cat = catById.value.get(c.categoryId);
        return (
          <li key={c.categoryId}>
            <span class="cat-bar-head">
              <span>{cat?.name ?? '–'}</span>
              <b class="num">{by === 'sets' ? c.sets : weight(c.volume, st)}</b>
            </span>
            <span class="track">
              <span class="fill" style={{ width: `${(c[by] / max) * 100}%`, background: cat?.color }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const W = 320;
const H = 110;
/** Workout days per week as bars (hand-written SVG, like the line chart). */
function WeekBars({ weeks }: { weeks: { start: string; workouts: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.workouts));
  const bw = (W - 24) / weeks.length;
  const label = (d: string) => parseIso(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const total = weeks.reduce((a, w) => a + w.workouts, 0);
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t('workoutsPerWeek')}: ${num(total / weeks.length, 1)} ${t('perWeekAvg')}`}>
        <line class="grid" x1={0} x2={W} y1={H - 18} y2={H - 18} />
        <text class="axis" x={0} y={10}>
          {max}
        </text>
        {weeks.map((w, i) => {
          const h = (w.workouts / max) * (H - 30);
          return <rect key={w.start} class="bar-rect" x={20 + i * bw + bw * 0.15} y={H - 18 - h} width={Math.max(1, bw * 0.7)} height={h} rx={Math.min(3, bw * 0.2)} />;
        })}
        <text class="axis" x={20} y={H - 4}>
          {label(weeks[0].start)}
        </text>
        <text class="axis" x={W} y={H - 4} text-anchor="end">
          {label(weeks[weeks.length - 1].start)}
        </text>
      </svg>
      <p class="muted small num">
        {num(total / weeks.length, 1)} {t('perWeekAvg')}
      </p>
    </figure>
  );
}
