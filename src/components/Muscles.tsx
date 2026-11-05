// Muscles: effective reps per muscle group this week (a body map and bars, with each main session against
// the mode's goal) and the last 8 weeks; tap a muscle for what trained it and what could train it today.
// One date-range read of the sets; estimates as on the logging screen.
import { useEffect, useState } from 'preact/hooks';
import { isoDate } from '../lib/calc';
import { effectiveOf } from '../effort';
import { byShownName, exName, type Key, locale, t } from '../lib/i18n';
import { MUSCLES } from '../lib/muscles';
import type { MuscleId, WorkoutSet } from '../lib/model';
import { contributions, GOALS, lastWeeks, statusOf, weekStatus, weeks, type WeekMuscle } from '../lib/volume';
import { setsBetween } from '../lib/db';
import { open } from '../nav';
import { exById, exercises, settings, setsVersion } from '../state';
import { BodyMap, muscleKey } from './BodyMap';
import { Sheet } from './Sheet';

const WEEKS = 8;

export default function Muscles() {
  const st = settings.value;
  const goal = GOALS[st.mode];
  const today = isoDate(new Date());
  const starts = lastWeeks(today, WEEKS, st.weekStart);
  const [data, setData] = useState<Map<string, Map<MuscleId, WeekMuscle>> | null>(null);
  // This week's sets and their effective reps, for the drill-down.
  const [week, setWeek] = useState<{ sets: WorkoutSet[]; eff: (s: WorkoutSet) => number } | null>(null);
  const [sel, setSel] = useState<MuscleId | null>(null);
  const ver = setsVersion.value;
  useEffect(() => {
    let live = true;
    void setsBetween(starts[0], today).then(async (sets) => {
      const eff = await effectiveOf(sets);
      if (!live) return;
      setData(weeks(sets, (id) => exById.value.get(id)?.muscles, (s) => eff(s).n, goal, st.weekStart));
      setWeek({ sets: sets.filter((s) => s.date >= starts[WEEKS - 1]), eff: (s) => eff(s).n });
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
        ) : (
          <>
            <section class="card">
              <h2>{t('thisWeek')}</h2>
              <BodyMap
                status={(m) => weekStatus(thisWeek?.get(m), goal, st.mode)}
                label={(m) => `${t(muscleKey(m))}: ${Math.round(thisWeek?.get(m)?.total ?? 0)}`}
                selected={sel}
                onSelect={(m) => setSel(sel === m ? null : m)}
              />
              <p class="muted small mm-legend">
                {goal ? (
                  <>
                    <span class="mm-key under" /> {t('mmUnder')} <span class="mm-key in" /> {t('mmIn')} <span class="mm-key over" /> {t('mmOver')}
                  </>
                ) : (
                  <>
                    <span class="mm-key trained" /> {t('mmTrained')}
                  </>
                )}
              </p>
              {sel && week && <Drill muscle={sel} sets={week.sets} eff={week.eff} total={thisWeek?.get(sel)?.total ?? 0} />}
              {!trained.length && <p class="muted center">{t('musclesEmpty')}</p>}
              <ul class="mu-bars">
                {trained.map((m) => {
                  const w = thisWeek?.get(m);
                  const total = Math.round(w?.total ?? 0);
                  return (
                    <li key={m} class={sel === m ? 'sel' : undefined}>
                      <button class="mu-name link" aria-pressed={sel === m} onClick={() => setSel(sel === m ? null : m)}>
                        {t(`mu_${m}` as Key)}
                      </button>
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
            {trained.length > 0 && <section class="card">
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
            </section>}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** A muscle's week: the exercises that trained it, and exercises to train it today (favourites first). */
function Drill({ muscle, sets, eff, total }: { muscle: MuscleId; sets: WorkoutSet[]; eff: (s: WorkoutSet) => number; total: number }) {
  const list = contributions(sets, (id) => exById.value.get(id)?.muscles, eff, muscle);
  const used = new Set(list.map((c) => c.exerciseId));
  const train = byShownName(exercises.value.filter((e) => e.muscles?.primary.includes(muscle) && !used.has(e.id)))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
    .slice(0, 4);
  return (
    <div class="drill">
      <h3>
        {t(muscleKey(muscle))} · {Math.round(total)} {t('effShortWord')}
      </h3>
      {list.length ? (
        <ul class="entries">
          {list.map((c) => {
            const ex = exById.value.get(c.exerciseId);
            return ex ? (
              <li key={c.exerciseId} class="entry entry-static">
                <span class="entry-name">{exName(ex)}</span>
                <span class="muted small num">
                  {Math.round(c.n)} {c.direct ? '' : `(${t('ms_secondary')})`}
                </span>
              </li>
            ) : null;
          })}
        </ul>
      ) : (
        <p class="muted small">{t('notTrainedThisWeek')}</p>
      )}
      {train.length > 0 && (
        <>
          <p class="muted small">{t('trainToday')}</p>
          <div class="chips">
            {train.map((e) => (
              <button key={e.id} class="chip" onClick={() => open({ kind: 'exercise', id: e.id, date: isoDate(new Date()) })}>
                {exName(e)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

