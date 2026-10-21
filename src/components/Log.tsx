// The training log of one day: its exercises with their sets, in the order they were logged. Reorder and
// superset modes change the cards; the tools bar that switches them is DayTools (lazy).
import { useState } from 'preact/hooks';
import { dayTotals } from '../lib/calc';
import { t } from '../lib/i18n';
import type { WorkoutSet } from '../lib/model';
import { setText, weight } from '../lib/units';
import { open } from '../nav';
import { groupColors } from '../lib/groups';
import { catById, date, dayComment, daySets, exById, records, settings } from '../state';

import { lazyView } from '../lazy';
import { Dot, Trophy } from './icons';

/** The workout tools' code: a lazy chunk, loaded on the first tap (and prefetched when idle). */
const workout = () => import('../workout');
/** The tools bar under the day: not needed to show it, so it loads right after the first paint. */
export const dayTools = lazyView(() => import('./DayTools'), { quiet: true });

export function Log() {
  const d = date.value;
  const sets = daySets.value;
  const s = settings.value;
  const [reordering, setReordering] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const colors = groupColors(sets);
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
          {grouping && <p class="muted small center">{t('pickForSuperset')}</p>}
          {ids.map((id, i) => {
            const ex = exById.value.get(id)!;
            const rec = records.value.get(id);
            const g = groups.get(id)![0].group;
            const color = g ? colors.get(g) : undefined;
            return (
              <section class={color ? 'card ex-card grouped' : 'card ex-card'} key={id} style={color ? { borderLeftColor: color } : undefined}>
                {color && (
                  <span class="group-tag" style={{ color }}>
                    {t('superset')}
                  </span>
                )}
                <div class="ex-row">
                  {grouping && (
                    <input
                      type="checkbox"
                      class="tick"
                      aria-label={`${t('selectExercise')}: ${ex.name}`}
                      checked={picked.has(id)}
                      onChange={(e) => {
                        const p = new Set(picked);
                        if (e.currentTarget.checked) p.add(id);
                        else p.delete(id);
                        setPicked(p);
                      }}
                    />
                  )}
                  <button class="ex-head" onClick={() => open({ kind: 'exercise', id, date: d })}>
                    <Dot color={catById.value.get(ex.categoryId)?.color} />
                    <h2>{ex.name}</h2>
                  </button>
                  {grouping && g && (
                    <button class="btn small" onClick={() => void workout().then((w) => w.ungroupExercise(id))}>
                      {t('ungroup')}
                    </button>
                  )}
                  {reordering && (
                    <span class="move">
                      <button class="btn icon small" aria-label={`${t('moveUp')}: ${ex.name}`} disabled={i === 0} onClick={() => void workout().then((w) => w.moveExercise(id, -1))}>
                        ↑
                      </button>
                      <button class="btn icon small" aria-label={`${t('moveDown')}: ${ex.name}`} disabled={i === ids.length - 1} onClick={() => void workout().then((w) => w.moveExercise(id, 1))}>
                        ↓
                      </button>
                    </span>
                  )}
                </div>
                <ol class="setlist">
                  {groups.get(id)!.map((set) => (
                    <li key={set.id} class={set.planned || (s.markDone && !set.done) ? 'undone' : undefined}>
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
        <dayTools.Lazy
          groups={groups}
          reordering={reordering}
          setReordering={setReordering}
          grouping={grouping}
          setGrouping={setGrouping}
          picked={picked}
          setPicked={setPicked}
        />
      )}
    </>
  );
}
