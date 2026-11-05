// A month of workouts: one dot per category trained each day; tap a day to open it in the log.
import { useEffect, useState } from 'preact/hooks';
import { isoDate, parseIso } from '../lib/calc';
import { phaseOn } from '../lib/cycle';
import { addMonths, monthBounds, monthGrid, monthOf } from '../lib/calendar';
import { setsBetween } from '../lib/db';
import { locale, t } from '../lib/i18n';
import { open } from '../nav';
import { catById, date, exById, loadDay, settings, setsVersion, view } from '../state';

/** What the coloured lines under the days mean, when a cycle or lighter week is on. */
function CycleLegend() {
  const st = settings.value;
  if (!((st.mode === 'lyle' && st.cycle) || (st.mode === 'dorian' && st.light))) return null;
  const now = phaseOn(st, isoDate(new Date()));
  return (
    <p class="cal-legend small muted center">
      {now?.week ? `${t('cycleWeek', { n: now.week, N: now.weeks!, phase: t(now.phase === 'runup' ? 'runUp' : 'push') })} · ` : ''}
      {st.mode === 'lyle' ? (
        <>
          <span class="key ph-runup" /> {t('runUp')} <span class="key ph-push" /> {t('push')}
        </>
      ) : (
        <>
          <span class="key ph-light" /> {t('lightWeek')}
        </>
      )}
    </p>
  );
}

/** Up to this many category dots per day (more would not fit an old phone's cell). */
const MAX_DOTS = 4;

export default function Calendar() {
  const [month, setMonth] = useState(monthOf(date.value));
  // Category ids per day of the shown month.
  const [days, setDays] = useState<Map<string, string[]> | null>(null);
  const ver = setsVersion.value;
  const weekStart = settings.value.weekStart;

  useEffect(() => {
    let live = true;
    const { first, last } = monthBounds(month);
    void setsBetween(first, last).then((sets) => {
      if (!live) return;
      const m = new Map<string, string[]>();
      for (const s of sets) {
        if (s.planned) continue; // a routine day logged but not done isn't a workout
        const cat = exById.value.get(s.exerciseId)?.categoryId;
        if (!cat) continue;
        const list = m.get(s.date);
        if (!list) m.set(s.date, [cat]);
        else if (!list.includes(cat)) list.push(cat);
      }
      setDays(m);
    });
    return () => {
      live = false;
    };
  }, [month, ver]);

  const today = isoDate(new Date());
  const grid = monthGrid(month, weekStart);
  const cats = catById.value;
  const title = parseIso(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const weekdays = grid.slice(0, 7).map((d) => parseIso(d).toLocaleDateString(locale(), { weekday: 'narrow' }));
  const count = days?.size ?? 0;
  // Switch once the day is loaded: the log never flashes the previous day.
  const pick = async (d: string) => {
    await loadDay(d);
    view.value = 'log';
  };

  return (
    <>
      <div class="cal-head">
        <button class="btn icon" aria-label={t('prevMonth')} onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <h2 aria-live="polite">{title}</h2>
        <button class="btn icon" aria-label={t('nextMonth')} onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
      </div>
      <div class="card cal-card">
        <div class="cal" aria-label={title}>
          <div class="cal-row">
            {weekdays.map((w, i) => (
              <span key={i} class="cal-wd" aria-hidden="true">
                {w}
              </span>
            ))}
          </div>
          {Array.from({ length: grid.length / 7 }, (_, r) => (
            <div class="cal-row" key={r}>
              {grid.slice(r * 7, r * 7 + 7).map((d) => {
                const dayCats = days?.get(d) ?? [];
                const ph = phaseOn(settings.value, d);
                const cls = ['cal-day', d.slice(0, 7) !== month && 'out', d === today && 'today', d === date.value && 'cur', dayCats.length && 'has', ph && `ph-${ph.phase}`]
                  .filter(Boolean)
                  .join(' ');
                const label = parseIso(d).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
                const names = dayCats.map((c) => cats.get(c)?.name).filter(Boolean).join(', ');
                return (
                  <button key={d} class={cls} aria-label={names ? `${label}: ${names}` : label} onClick={() => void pick(d)}>
                    <span class="num">{Number(d.slice(8))}</span>
                    <span class="cal-dots" aria-hidden="true">
                      {dayCats.slice(0, MAX_DOTS).map((c) => (
                        // No colour (category deleted): the .dot's own themed background shows.
                        <span key={c} class="dot" style={cats.get(c) ? { background: cats.get(c)!.color } : undefined} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p class="muted small center num">
        {days ? `${count} ${t('workoutsInMonth')}` : t('loading')}
      </p>
      <CycleLegend />
      <div class="actions">
        {month !== monthOf(today) && (
          <button class="btn" onClick={() => setMonth(monthOf(today))}>
            {t('thisMonth')}
          </button>
        )}
        <button class="btn primary" onClick={() => open({ kind: 'analysis' })}>
          {t('analysis')}
        </button>
      </div>
    </>
  );
}
