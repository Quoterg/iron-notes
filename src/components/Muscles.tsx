// Muscles: effective reps per muscle group this week (bars, with each main session against the mode's
// goal) and the last 8 weeks. One date-range read of the sets; estimates as on the logging screen.
import { useEffect, useState } from 'preact/hooks';
import { isoDate } from '../lib/calc';
import { effectiveOf } from '../effort';
import { type Key, locale, t } from '../lib/i18n';
import { MUSCLES } from '../lib/muscles';
import type { MuscleId } from '../lib/model';
import { GOALS, lastWeeks, statusOf, weeks, type WeekMuscle } from '../lib/volume';
import { setsBetween } from '../lib/db';
import { exById, settings, setsVersion } from '../state';
import { Sheet } from './Sheet';

const WEEKS = 8;

export default function Muscles() {
  const st = settings.value;
  const goal = GOALS[st.mode];
  const today = isoDate(new Date());
  const starts = lastWeeks(today, WEEKS, st.weekStart);
  const [data, setData] = useState<Map<string, Map<MuscleId, WeekMuscle>> | null>(null);
  const ver = setsVersion.value;
  useEffect(() => {
    let live = true;
    void setsBetween(starts[0], today).then(async (sets) => {
      const eff = await effectiveOf(sets);
      if (live) setData(weeks(sets, (id) => exById.value.get(id)?.muscles, (s) => eff(s).n, goal, st.weekStart));
    });
    return () => {
      live = false;
    };
  }, [ver, st.mode, st.weekStart, st.formula, today]);

  const thisWeek = data?.get(starts[WEEKS - 1]);
  const trained = MUSCLES.filter((m) => starts.some((w) => data?.get(w)?.get(m)));
  // Bars share one scale: the goal's top per session times the week's sessions, or the largest total.
  const scale = Math.max(1, ...trained.map((m) => thisWeek?.get(m)?.total ?? 0), goal ? goal.max * 2 : 0);
  const day = (d: string) => new Date(d + 'T00:00').toLocaleDateString(locale(), { weekday: 'short' });

  return (
    <Sheet title={t('muscles')}>
      <div class="pad">
        <p class="muted small">
          {goal ? t('musclesGoal', { goal: goal.label }) : t('musclesNoGoal')}
        </p>
        {!data ? (
          <p class="muted center">{t('loading')}</p>
        ) : !trained.length ? (
          <p class="muted center">{t('musclesEmpty')}</p>
        ) : (
          <>
            <section class="card">
              <h2>{t('thisWeek')}</h2>
              <ul class="mu-bars">
                {trained.map((m) => {
                  const w = thisWeek?.get(m);
                  const total = Math.round(w?.total ?? 0);
                  return (
                    <li key={m}>
                      <span class="mu-name">{t(`mu_${m}` as Key)}</span>
                      <span class="mu-track">
                        <span class="mu-fill" style={{ width: `${Math.min(100, (total / scale) * 100)}%` }} />
                      </span>
                      <span class="mu-num num">{total}</span>
                      {w && w.sessions.length > 0 && (
                        <span class="mu-sessions small">
                          {w.sessions.map((x) => (
                            <span key={x.date} class={goal ? statusOf(Math.round(x.n), goal) : undefined}>
                              {day(x.date)} {Math.round(x.n)}
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
            <section class="card">
              <h2>{t('lastWeeks', { n: WEEKS })}</h2>
              <ul class="mu-hist">
                {trained.map((m) => {
                  const vals = starts.map((w) => data.get(w)?.get(m)?.total ?? 0);
                  const max = Math.max(1, ...vals);
                  return (
                    <li key={m} aria-label={`${t(`mu_${m}` as Key)}: ${vals.map(Math.round).join(', ')}`}>
                      <span class="mu-name">{t(`mu_${m}` as Key)}</span>
                      <span class="mu-spark">
                        {vals.map((v, i) => (
                          <span key={starts[i]} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} class={v ? undefined : 'zero'} />
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}
