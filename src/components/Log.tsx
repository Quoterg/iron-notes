// The training log of one day: its exercises with their sets, in the order they were logged, and the
// workout's actions (copy, reorder, share, delete).
import { useState } from 'preact/hooks';
import { dayTotals, parseIso } from '../lib/calc';
import { t } from '../lib/i18n';
import type { WorkoutSet } from '../lib/model';
import { setText, weight } from '../lib/units';
import { open } from '../nav';
import { catById, date, dayComment, daySets, deleteWorkout, exById, moveExercise, records, settings, toast } from '../state';
import { Dot, Trophy } from './icons';

export function Log() {
  const d = date.value;
  const sets = daySets.value;
  const s = settings.value;
  const [reordering, setReordering] = useState(false);
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of sets) {
    if (!exById.value.has(set.exerciseId)) continue;
    const g = groups.get(set.exerciseId);
    if (g) g.push(set);
    else groups.set(set.exerciseId, [set]);
  }
  const totals = dayTotals([...groups.values()].flat()); // only sets of exercises that still exist
  const addExercise = () => open({ kind: 'pick', date: d });
  const copy = () => open({ kind: 'copy', date: d });
  const ids = [...groups.keys()];

  async function share() {
    const { workoutText } = await import('../lib/share');
    const title = parseIso(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const text = workoutText(title, ids.map((id) => ({ ex: exById.value.get(id)!, sets: groups.get(id)! })), s, dayComment.value);
    try {
      if (navigator.share) return void (await navigator.share({ text }));
    } catch {
      return; // cancelled
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('shared'));
    } catch {
      // No clipboard either (old browser, no permission): nothing more to do.
    }
  }

  async function remove() {
    if (!confirm(t('deleteWorkoutQ', { n: sets.length }))) return;
    setReordering(false);
    await deleteWorkout(d);
  }

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
          <div class="actions">
            <button class="btn primary" onClick={addExercise}>
              {t('startWorkout')}
            </button>
          </div>
          <button class="link" onClick={copy}>
            {t('copyPrevious')}
          </button>
        </div>
      ) : (
        <>
          <p class="summary muted small num">
            {groups.size} {t('exercises').toLowerCase()} · {totals.sets} {t('sets')}
            {totals.volume > 0 && ` · ${weight(totals.volume, s)} ${t('volume')}`}
          </p>
          {ids.map((id, i) => {
            const ex = exById.value.get(id)!;
            const rec = records.value.get(id);
            return (
              <section class="card ex-card" key={id}>
                <div class="ex-row">
                  <button class="ex-head" onClick={() => open({ kind: 'exercise', id, date: d })}>
                    <Dot color={catById.value.get(ex.categoryId)?.color} />
                    <h2>{ex.name}</h2>
                  </button>
                  {reordering && (
                    <span class="move">
                      <button class="btn icon small" aria-label={`${t('moveUp')}: ${ex.name}`} disabled={i === 0} onClick={() => void moveExercise(id, -1)}>
                        ↑
                      </button>
                      <button class="btn icon small" aria-label={`${t('moveDown')}: ${ex.name}`} disabled={i === ids.length - 1} onClick={() => void moveExercise(id, 1)}>
                        ↓
                      </button>
                    </span>
                  )}
                </div>
                <ol class="setlist">
                  {groups.get(id)!.map((set) => (
                    <li key={set.id} class={set.done === false || (s.markDone && !set.done) ? 'undone' : undefined}>
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
      {groups.size > 0 && (
        <div class="chips day-tools">
          <button class="chip" onClick={copy}>
            {t('copyWorkout')}
          </button>
          {groups.size > 1 && (
            <button class={reordering ? 'chip on' : 'chip'} aria-pressed={reordering} onClick={() => setReordering(!reordering)}>
              {reordering ? t('done') : t('reorder')}
            </button>
          )}
          <button class="chip" onClick={() => void share()}>
            {t('share')}
          </button>
          <button class="chip danger" onClick={() => void remove()}>
            {t('deleteWorkout')}
          </button>
        </div>
      )}
    </>
  );
}
