// The day's workout tools under the log: copy, reorder, superset, share, delete. A lazy chunk: it
// isn't needed to show the day, so it loads right after the first paint.
import { t } from '../lib/i18n';
import type { WorkoutSet } from '../lib/model';
import { open } from '../nav';
import { date, daySets, toast } from '../state';
import { deleteWorkout, groupExercises } from '../workout';

export interface DayToolsProps {
  /** The day's exercises (in order) with their sets. */
  groups: Map<string, WorkoutSet[]>;
  reordering: boolean;
  setReordering: (v: boolean) => void;
  grouping: boolean;
  setGrouping: (v: boolean) => void;
  picked: Set<string>;
  setPicked: (v: Set<string>) => void;
}

export default function DayTools({ groups, reordering, setReordering, grouping, setGrouping, picked, setPicked }: DayToolsProps) {
  const d = date.value;

  async function remove() {
    // Every set of the day goes, including sets of exercises deleted since (hidden in the log).
    if (!confirm(t('deleteWorkoutQ', { n: daySets.value.length }))) return;
    setReordering(false);
    setGrouping(false);
    const undo = await deleteWorkout(d);
    toast(t('workoutDeleted'), { label: t('undo'), run: () => void undo() });
  }

  return (
    <>
      {grouping && picked.size >= 2 && (
        <button
          class="btn primary wide"
          onClick={async () => {
            await groupExercises([...picked]);
            setPicked(new Set());
            setGrouping(false);
          }}
        >
          {t('makeSuperset', { n: picked.size })}
        </button>
      )}
      <div class="chips day-tools">
        <button class="chip" onClick={() => open({ kind: 'saveWorkout' })}>
          {t('saveAsWorkout')}
        </button>
        <button class="chip" onClick={() => open({ kind: 'copy', date: d })}>
          {t('copyWorkout')}
        </button>
        {groups.size > 1 && !grouping && (
          <button class={reordering ? 'chip on' : 'chip'} aria-pressed={reordering} onClick={() => setReordering(!reordering)}>
            {reordering ? t('done') : t('reorder')}
          </button>
        )}
        {groups.size > 1 && !reordering && (
          <button
            class={grouping ? 'chip on' : 'chip'}
            aria-pressed={grouping}
            onClick={() => {
              setGrouping(!grouping);
              setPicked(new Set());
            }}
          >
            {grouping ? t('done') : t('superset')}
          </button>
        )}
        <button class="chip" onClick={() => open({ kind: 'summary', date: d })}>
          {t('share')}
        </button>
        <button class="chip danger" onClick={() => void remove()}>
          {t('deleteWorkout')}
        </button>
      </div>
    </>
  );
}
