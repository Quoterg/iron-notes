// One routine day: its exercises with planned sets (count, reps, weight/distance/time for all sets),
// reorder/remove them, add exercises, rename or delete the day, log it into the shown date.
import { useState } from 'preact/hooks';
import { dayLabel } from '../app';
import { t } from '../lib/i18n';
import { fieldsOf, type Exercise, type PlannedSet, type Routine, type RoutineDay, type RoutineItem } from '../lib/model';
import { planSummary } from '../lib/routines';
import { dFromUser, dToUser, num, wFromUser, wToUser } from '../lib/units';
import { open } from '../nav';
import { catById, date, exById, routines, settings, toast, view } from '../state';
import { logRoutineDay, saveRoutine } from '../workout';
import { Dot } from './icons';
import { Sheet } from './Sheet';

const parse = (v: string): number | undefined => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export default function RoutineDaySheet({ routineId, dayId }: { routineId: string; dayId: string }) {
  const r = routines.value?.find((x) => x.id === routineId);
  const day = r?.days.find((d) => d.id === dayId);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState(day?.name ?? '');
  if (!r || !day) return <Sheet title={t('routines')}>{null}</Sheet>;
  const st = settings.value;

  const saveDay = (next: RoutineDay) => saveRoutine({ ...r, days: r.days.map((d) => (d.id === dayId ? next : d)) } as Routine);
  const setItems = (items: RoutineItem[]) => saveDay({ ...day, items });

  function move(i: number, dir: -1 | 1) {
    const items = [...day!.items];
    [items[i], items[i + dir]] = [items[i + dir], items[i]];
    void setItems(items);
  }

  async function log() {
    await logRoutineDay(day!, date.value);
    view.value = 'log';
    toast(t('routineLogged'));
    history.go(-2); // this day and its routine: back to the log
  }

  return (
    <Sheet title={`${r.name} · ${day.name}`}>
      <div class="pad">
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void saveDay({ ...day, name: name.trim() });
          }}
        >
          <label>
            {t('dayName')}
            <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => name.trim() && name.trim() !== day.name && void saveDay({ ...day, name: name.trim() })} />
          </label>
        </form>

        {day.items.length === 0 && <p class="muted center">{t('emptyRoutineDay')}</p>}
        {day.items.map((item, i) => {
          const ex = exById.value.get(item.exerciseId);
          if (!ex) return null;
          const isOpen = editing === item.exerciseId;
          return (
            <section class="card ex-card" key={item.exerciseId}>
              <div class="ex-row">
                <button class="ex-head" aria-expanded={isOpen} onClick={() => setEditing(isOpen ? null : item.exerciseId)}>
                  <Dot color={catById.value.get(ex.categoryId)?.color} />
                  <h2>{ex.name}</h2>
                </button>
                <span class="move">
                  <button class="btn icon small" aria-label={`${t('moveUp')}: ${ex.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button class="btn icon small" aria-label={`${t('moveDown')}: ${ex.name}`} disabled={i === day.items.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                </span>
              </div>
              <p class="muted small plan-line">{planSummary(item.sets, ex, st)}</p>
              {isOpen && (
                <PlanEditor
                  ex={ex}
                  sets={item.sets}
                  onChange={(sets) => void setItems(day.items.map((x) => (x.exerciseId === item.exerciseId ? { ...x, sets } : x)))}
                  onRemove={() => {
                    setEditing(null);
                    void setItems(day.items.filter((x) => x.exerciseId !== item.exerciseId));
                  }}
                />
              )}
            </section>
          );
        })}

        <div class="actions">
          <button class="btn" onClick={() => open({ kind: 'pick', date: date.value, routine: { routineId, dayId } })}>
            + {t('addExercise')}
          </button>
          {r.days.length > 1 && (
            <button
              class="btn danger"
              onClick={async () => {
                if (!confirm(t('deleteDayQ'))) return;
                await saveRoutine({ ...r, days: r.days.filter((d) => d.id !== dayId) });
                history.back();
              }}
            >
              {t('deleteDay')}
            </button>
          )}
        </div>
        {day.items.length > 0 && (
          <button class="btn primary wide" onClick={() => void log()}>
            {t('logTo', { day: dayLabel(date.value) })}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Same values for every set: count, reps, weight / distance / time (whatever the type records). */
function PlanEditor({ ex, sets, onChange, onRemove }: { ex: Exercise; sets: PlannedSet[]; onChange: (s: PlannedSet[]) => void; onRemove: () => void }) {
  const st = settings.value;
  const f = fieldsOf(ex.type);
  const p = sets[0] ?? {};
  const [count, setCount] = useState(String(sets.length || 1));
  const [reps, setReps] = useState(p.reps != null ? String(p.reps) : '');
  const [w, setW] = useState(p.weight != null ? num(wToUser(p.weight, st.unit)) : '');
  const [dist, setDist] = useState(p.distance != null ? num(dToUser(p.distance, st.dist), 3) : '');
  const [min, setMin] = useState(p.time != null ? num(p.time / 60, 2) : '');

  function apply(e: Event) {
    e.preventDefault();
    const n = Math.min(20, Math.max(1, Math.round(parse(count) ?? 1)));
    const one: PlannedSet = {};
    if (f.includes('reps') && parse(reps) != null) one.reps = Math.round(parse(reps)!);
    if (f.includes('weight') && parse(w) != null) one.weight = wFromUser(parse(w)!, st.unit);
    if (f.includes('distance') && parse(dist) != null) one.distance = dFromUser(parse(dist)!, st.dist);
    if (f.includes('time') && parse(min) != null) one.time = Math.round(parse(min)! * 60);
    onChange(Array.from({ length: n }, () => ({ ...one })));
  }

  return (
    <form class="grid2 form plan-editor" onSubmit={apply} onChange={apply}>
      <label>
        {t('setsCount')}
        <input type="text" inputMode="numeric" value={count} onInput={(e) => setCount(e.currentTarget.value)} />
      </label>
      {f.includes('reps') && (
        <label>
          {t('repsPlan')}
          <input type="text" inputMode="numeric" value={reps} onInput={(e) => setReps(e.currentTarget.value)} />
        </label>
      )}
      {f.includes('weight') && (
        <label>
          {t('weightPlan', { unit: st.unit })}
          <input type="text" inputMode="decimal" value={w} onInput={(e) => setW(e.currentTarget.value)} />
        </label>
      )}
      {f.includes('distance') && (
        <label>
          {t('distancePlan', { unit: st.dist })}
          <input type="text" inputMode="decimal" value={dist} onInput={(e) => setDist(e.currentTarget.value)} />
        </label>
      )}
      {f.includes('time') && (
        <label>
          {t('timePlan')}
          <input type="text" inputMode="decimal" value={min} onInput={(e) => setMin(e.currentTarget.value)} />
        </label>
      )}
      <button type="button" class="btn danger small" onClick={onRemove}>
        {t('removeFromDay')}
      </button>
    </form>
  );
}
