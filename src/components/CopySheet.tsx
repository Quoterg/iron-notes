// Copy a previous workout (all of it, or some of its exercises) into `date`.
import { useEffect, useState } from 'preact/hooks';
import { byOrder, parseIso } from '../lib/calc';
import { recentWorkoutDates, setsBetween } from '../lib/db';
import { locale, t } from '../lib/i18n';
import type { WorkoutSet } from '../lib/model';
import { back } from '../nav';
import { catById, exById, toast } from '../state';
import { copySets } from '../workout';
import { Dot } from './icons';
import { Sheet } from './Sheet';

const PAGE = 15;
const label = (d: string) => parseIso(d).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

interface Day {
  date: string;
  /** Exercise ids in logged order, with their sets. */
  groups: [string, WorkoutSet[]][];
}

export default function CopySheet({ date }: { date: string }) {
  const [limit, setLimit] = useState(PAGE);
  const [days, setDays] = useState<Day[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void (async () => {
      // One extra date tells whether there are more to show.
      const dates = await recentWorkoutDates(limit + 1, date);
      const shown = dates.slice(0, limit);
      // One range read covers all shown days (they're the latest workouts, so little else lies between).
      const sets = shown.length ? await setsBetween(shown[shown.length - 1], shown[0]) : [];
      const byDate = new Map<string, Map<string, WorkoutSet[]>>();
      for (const s of sets.sort(byOrder)) {
        // A routine's planned, never done sets aren't a workout to copy.
        if (s.date === date || s.planned || !exById.value.has(s.exerciseId)) continue;
        const g = byDate.get(s.date) ?? byDate.set(s.date, new Map()).get(s.date)!;
        g.get(s.exerciseId)?.push(s) ?? g.set(s.exerciseId, [s]);
      }
      if (!live) return;
      setDays(shown.filter((d) => byDate.has(d)).map((d) => ({ date: d, groups: [...byDate.get(d)!] })));
      setMore(dates.length > limit);
    })();
    return () => {
      live = false;
    };
  }, [limit, date]);

  async function copy(day: Day) {
    const chosen = day.groups.filter(([id]) => !skip.has(id));
    if (!chosen.length) return;
    await copySets(chosen.flatMap(([, sets]) => sets), date);
    toast(t('copied'));
    back();
  }

  return (
    <Sheet title={t('copyWorkout')}>
      <div class="pad">
        {days == null && <p class="muted center">{t('loading')}</p>}
        {days?.length === 0 && <p class="muted center">{t('nothingToCopy')}</p>}
        {days?.map((day) => {
          const isOpen = open === day.date;
          return (
            <section class="card" key={day.date}>
              <button
                class="ex-head copy-head"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : day.date);
                  setSkip(new Set());
                }}
              >
                <h2>{label(day.date)}</h2>
                <span class="muted small">
                  {day.groups.length} {t('exercises').toLowerCase()}
                </span>
              </button>
              {!isOpen && <p class="muted small copy-names">{day.groups.map(([id]) => exById.value.get(id)!.name).join(', ')}</p>}
              {isOpen && (
                <div class="form">
                  {day.groups.map(([id, sets]) => {
                    const ex = exById.value.get(id)!;
                    return (
                      <label class="check" key={id}>
                        <input
                          type="checkbox"
                          checked={!skip.has(id)}
                          onChange={(e) => {
                            const s = new Set(skip);
                            if (e.currentTarget.checked) s.delete(id);
                            else s.add(id);
                            setSkip(s);
                          }}
                        />
                        <Dot color={catById.value.get(ex.categoryId)?.color} />
                        <span>
                          {ex.name} <span class="muted small">· {sets.length} {t('sets')}</span>
                        </span>
                      </label>
                    );
                  })}
                  <button class="btn primary wide" disabled={day.groups.every(([id]) => skip.has(id))} onClick={() => void copy(day)}>
                    {t('copyHere')}
                  </button>
                </div>
              )}
            </section>
          );
        })}
        {more && (
          <button class="btn wide" onClick={() => setLimit(limit + PAGE)}>
            {t('showMore')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
