// Save the shown day as a reusable workout (sets × reps, no weights) into a folder (a routine).
import { useEffect, useState } from 'preact/hooks';
import { uid } from '../lib/calc';
import { t } from '../lib/i18n';
import { workoutFromDay } from '../lib/routines';
import { back } from '../nav';
import { daySets, exById, routines, toast } from '../state';
import { loadRoutines, saveRoutine } from '../workout';
import { Sheet } from './Sheet';

const NEW = '';

export default function SaveWorkoutSheet() {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<string>(NEW);
  useEffect(() => {
    void loadRoutines().then((list) => list.length && setFolder(list[0].id));
  }, []);
  const list = routines.value ?? [];
  const exercisesCount = new Set(daySets.value.map((s) => s.exerciseId)).size;

  async function save(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const workout = workoutFromDay(n, daySets.value, (id) => exById.value.get(id));
    const r = list.find((x) => x.id === folder);
    if (r) await saveRoutine({ ...r, days: [...r.days, workout] });
    else {
      const order = Math.max(-1, ...list.map((x) => x.order)) + 1;
      await saveRoutine({ id: uid(), name: t('myWorkouts'), order, days: [workout] });
    }
    toast(t('workoutSaved', { name: n }));
    back();
  }

  return (
    <Sheet title={t('saveAsWorkout')}>
      <form class="pad form" onSubmit={save}>
        <p class="muted small">{t('saveWorkoutHint', { n: exercisesCount })}</p>
        <label>
          {t('workoutName')}
          <input type="text" value={name} placeholder={t('workoutNameExample')} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
        </label>
        <div class="col">
          <label for="sw-folder">{t('folder')}</label>
          <select id="sw-folder" value={folder} onChange={(e) => setFolder(e.currentTarget.value)}>
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value={NEW}>{t('newFolderMyWorkouts')}</option>
          </select>
        </div>
        <button class="btn primary wide" disabled={!name.trim()}>
          {t('save')}
        </button>
      </form>
    </Sheet>
  );
}
