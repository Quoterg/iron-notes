// A routine: rename it, add/remove/reorder days, open a day, or log a day into the shown date.
import { useState } from 'preact/hooks';
import { dayLabel } from '../app';
import { uid } from '../lib/calc';
import { t } from '../lib/i18n';
import type { Routine } from '../lib/model';
import { back, open } from '../nav';
import { date, exById, logRoutineDay, removeRoutine, routines, saveRoutine, toast, view } from '../state';
import { Sheet } from './Sheet';

export default function RoutineSheet({ id }: { id: string }) {
  const r = routines.value?.find((x) => x.id === id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(r?.name ?? '');
  if (!r) return <Sheet title={t('routines')}>{null}</Sheet>;
  const save = (next: Routine) => saveRoutine(next);

  function move(i: number, dir: -1 | 1) {
    const days = [...r!.days];
    [days[i], days[i + dir]] = [days[i + dir], days[i]];
    void save({ ...r!, days });
  }

  async function log(dayId: string) {
    await logRoutineDay(r!.days.find((d) => d.id === dayId)!, date.value);
    view.value = 'log';
    toast(t('routineLogged'));
    // Close the routine sheets: back to the log.
    history.go(-1);
  }

  return (
    <Sheet title={r.name}>
      <div class="pad">
        {renaming ? (
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void save({ ...r, name: name.trim() });
              setRenaming(false);
            }}
          >
            <label>
              {t('routineName')}
              <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
            </label>
            <button class="btn primary">{t('save')}</button>
          </form>
        ) : (
          <button class="link" onClick={() => setRenaming(true)}>
            {t('rename')}
          </button>
        )}

        {r.days.map((d, i) => (
          <section class="card" key={d.id}>
            <div class="title-row">
              <button class="ex-head day-open" onClick={() => open({ kind: 'routineDay', routineId: r.id, dayId: d.id })}>
                <h2>{d.name}</h2>
              </button>
              {r.days.length > 1 && (
                <span class="move">
                  <button class="btn icon small" aria-label={`${t('moveUp')}: ${d.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button class="btn icon small" aria-label={`${t('moveDown')}: ${d.name}`} disabled={i === r.days.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                </span>
              )}
            </div>
            <p class="muted small">
              {d.items.length ? d.items.map((it) => exById.value.get(it.exerciseId)?.name).filter(Boolean).join(', ') : t('emptyRoutineDay')}
            </p>
            {d.items.length > 0 && (
              <button class="btn primary wide" onClick={() => void log(d.id)}>
                {t('logTo', { day: dayLabel(date.value) })}
              </button>
            )}
          </section>
        ))}

        <div class="actions">
          <button class="btn" onClick={() => void save({ ...r, days: [...r.days, { id: uid(), name: t('dayN', { n: r.days.length + 1 }), items: [] }] })}>
            + {t('addDay')}
          </button>
          <button
            class="btn danger"
            onClick={async () => {
              if (!confirm(t('deleteRoutineQ'))) return;
              await removeRoutine(r.id);
              back();
            }}
          >
            {t('deleteRoutine')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
