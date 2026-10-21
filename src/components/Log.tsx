// The training log of one day: its exercises with their sets, in the order they were logged.
import { dayTotals } from '../lib/calc';
import { t } from '../lib/i18n';
import type { WorkoutSet } from '../lib/model';
import { setText, weight } from '../lib/units';
import { open } from '../nav';
import { catById, date, dayComment, daySets, exById, records, settings } from '../state';
import { Dot, Trophy } from './icons';

export function Log() {
  const d = date.value;
  const sets = daySets.value;
  const s = settings.value;
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of sets) {
    if (!exById.value.has(set.exerciseId)) continue;
    const g = groups.get(set.exerciseId);
    if (g) g.push(set);
    else groups.set(set.exerciseId, [set]);
  }
  const totals = dayTotals([...groups.values()].flat()); // only sets of exercises that still exist
  const addExercise = () => open({ kind: 'pick', date: d });

  return (
    <>
      {dayComment.value && (
        <button class="card comment-card" onClick={() => open({ kind: 'comment', date: d })} aria-label={t('editComment')}>
          <span class="muted small">{t('workoutComment')}</span>
          <p>{dayComment.value}</p>
        </button>
      )}
      {groups.size === 0 ? (
        <div class="card center">
          <p class="muted">{t('emptyDay')}</p>
          <button class="btn primary" onClick={addExercise}>
            {t('startWorkout')}
          </button>
        </div>
      ) : (
        <>
          <p class="summary muted small num">
            {groups.size} {t('exercises').toLowerCase()} · {totals.sets} {t('sets')}
            {totals.volume > 0 && ` · ${weight(totals.volume, s)} ${t('volume')}`}
          </p>
          {[...groups].map(([id, list]) => {
            const ex = exById.value.get(id)!;
            const rec = records.value.get(id);
            return (
              <section class="card ex-card" key={id}>
                <button class="ex-head" onClick={() => open({ kind: 'exercise', id, date: d })}>
                  <Dot color={catById.value.get(ex.categoryId)?.color} />
                  <h2>{ex.name}</h2>
                </button>
                <ol class="setlist">
                  {list.map((set) => (
                    <li key={set.id} class={s.markDone && !set.done ? 'undone' : undefined}>
                      <span>{setText(set, ex.type, s)}</span>
                      {rec?.has(set.id) && <Trophy />}
                      {set.comment && <span class="note-line">{set.comment}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </>
      )}
      <div class="actions">
        {groups.size > 0 && (
          <button class="btn primary" onClick={addExercise}>
            + {t('addExercise')}
          </button>
        )}
        {!dayComment.value && (
          <button class="btn" onClick={() => open({ kind: 'comment', date: d })}>
            {t('comment')}
          </button>
        )}
      </div>
    </>
  );
}
