// A month of workouts: one dot per category trained each day; tap a day to open it in the log.
import { useEffect, useState } from 'preact/hooks';
import { isoDate, parseIso } from '../lib/calc';
import { addMonths, monthBounds, monthGrid, monthOf } from '../lib/calendar';
import { setsBetween } from '../lib/db';
import { t } from '../lib/i18n';
import { catById, date, exById, loadDay, settings, setsVersion, view } from '../state';

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
  const title = parseIso(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekdays = grid.slice(0, 7).map((d) => parseIso(d).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const count = days ? [...days.keys()].length : 0;
  const pick = (d: string) => {
    void loadDay(d);
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
                const cats = days?.get(d) ?? [];
                const cls = ['cal-day', d.slice(0, 7) !== month && 'out', d === today && 'today', d === date.value && 'cur', cats.length && 'has']
                  .filter(Boolean)
                  .join(' ');
                const label = parseIso(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
                const names = cats.map((c) => catById.value.get(c)?.name).filter(Boolean).join(', ');
                return (
                  <button key={d} class={cls} aria-label={names ? `${label}: ${names}` : label} onClick={() => pick(d)}>
                    <span class="num">{Number(d.slice(8))}</span>
                    <span class="cal-dots" aria-hidden="true">
                      {cats.slice(0, MAX_DOTS).map((c) => (
                        <span key={c} class="dot" style={{ background: catById.value.get(c)?.color ?? '#888' }} />
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
      {month !== monthOf(today) && (
        <div class="actions">
          <button class="btn" onClick={() => setMonth(monthOf(today))}>
            {t('thisMonth')}
          </button>
        </div>
      )}
    </>
  );
}
