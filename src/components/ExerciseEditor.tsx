// Create or edit an exercise: name, category, type, weight step, rest time and notes.
import { platesToStore, usesPlatesByName } from '../lib/tools';
import { LOAD_TYPES, usesBodyWeight } from '../lib/load';
import { useEffect, useState } from 'preact/hooks';
import { uid, isoDate } from '../lib/calc';
import { countSetsOf } from '../lib/db';
import { DORIAN_TOP } from '../lib/targets';
import { cycleWeek, repRange } from '../lib/lyle';
import { t, type Key } from '../lib/i18n';
import { typeName } from '../lib/strings-later';
import { TYPES, type Exercise, type ExerciseType, type LoadType, type Muscles } from '../lib/model';
import { cycle, defaultMuscles, MUSCLES, stateOf } from '../lib/muscles';
import { defaultIncrement, num } from '../lib/units';
import { replaceTop, replaceTopTwo, stack } from '../nav';
import { categories, exById, exercises, removeExercise, saveExercise, settings } from '../state';
import { Sheet } from './Sheet';

export default function ExerciseEditor({ id, categoryId, date }: { id?: string; categoryId?: string; date?: string }) {
  const old = id ? exById.value.get(id) : undefined;
  const st = settings.value;
  const [name, setName] = useState(old?.name ?? '');
  const [cat, setCat] = useState(old?.categoryId ?? categoryId ?? categories.value[0]?.id ?? '');
  const [type, setType] = useState<ExerciseType>(old?.type ?? 'weight,reps');
  const [increment, setIncrement] = useState(old?.increment != null ? num(old.increment) : '');
  const [load, setLoad] = useState<LoadType>(old?.load ?? 'total');
  // `undefined` until the box is touched: the default then follows the (possibly new) name.
  const [plates, setPlates] = useState<boolean | undefined>(old?.plates);
  const [rest, setRest] = useState(old?.rest != null ? String(old.rest) : '');
  const [repTop, setRepTop] = useState(old?.repTop != null ? String(old.repTop) : '');
  const [repBottom, setRepBottom] = useState(old?.repBottom != null ? String(old.repBottom) : '');
  const [notes, setNotes] = useState(old?.notes ?? '');
  // Edited muscles; until then an existing exercise shows (and keeps) its own, a new one its name's defaults.
  const [muscles, setMuscles] = useState<Muscles | undefined>(old?.muscles);
  const [used, setUsed] = useState(0);
  const cyc = st.mode === 'lyle' ? st.cycle : undefined;
  const midCycle = !!cyc && cycleWeek(cyc.start, isoDate(new Date())) <= cyc.weeks;
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) void countSetsOf(id).then(setUsed);
  }, [id]);

  async function save(e: Event) {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return setError(t('nameRequired'));
    if (exercises.value.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return setError(t('nameTaken'));
    const inc = parseFloat(increment.replace(',', '.'));
    const base = used ? old!.type : type;
    const loadedType: ExerciseType = base === 'reps' && (load === 'bodyweight' || load === 'assisted') ? 'weight,reps' : base;
    const r = parseInt(rest, 10);
    const top = parseInt(repTop, 10);
    const bottom = parseInt(repBottom, 10);
    const ex: Exercise = {
      ...old, // fields this form doesn't edit (e.g. favourite) stay
      id: id ?? uid(),
      name: n,
      categoryId: cat,
      // A reps-only exercise made "body weight + load" gains a weight field (its old sets: + 0 kg).
      type: loadedType,
      notes: notes.trim() || undefined,
      muscles: muscles ?? (old ? old.muscles : defaultMuscles(n)),
      increment: inc > 0 ? inc : undefined,
      load: loadedType.includes('weight') && load !== 'total' ? load : undefined,
      // Stored only when it differs from the default for the name.
      plates: loadedType.includes('weight') && load === 'total' ? platesToStore(plates, n) : undefined,
      rest: r > 0 ? r : undefined,
      repTop: top > 0 ? Math.min(top, 100) : undefined,
      repBottom: bottom > 0 ? Math.min(bottom, 100) : undefined,
    };
    await saveExercise(ex);
    // A new exercise from "Add exercise" goes straight to logging it.
    if (!id && date) {
      const next = { kind: 'exercise' as const, id: ex.id, date };
      const s = stack.value;
      if (s[s.length - 2]?.kind === 'pick') replaceTopTwo(next);
      else replaceTop(next);
    }
    else history.back();
  }

  async function remove() {
    if (!id || !confirm(used ? t('deleteExerciseSetsQ', { n: used }) : t('deleteExerciseQ'))) return;
    await removeExercise(id);
    // Close this editor and the exercise's own screen under it, if any.
    let n = 1;
    const s = stack.value;
    while (n < s.length && s[s.length - 1 - n].kind === 'exercise' && (s[s.length - 1 - n] as { id: string }).id === id) n++;
    history.go(-n);
  }

  return (
    <Sheet title={id ? t('editExercise') : t('newExercise')}>
      <form class="pad form" onSubmit={save}>
        <label>
          {t('name')}
          <input type="text" value={name} required onInput={(e) => (setName(e.currentTarget.value), setError(''))} autoFocus={!id} />
        </label>
        {error && <p class="error-text" role="alert">{error}</p>}
        <div class="col">
          <label for="ex-cat">{t('category')}</label>
          <select id="ex-cat" value={cat} onChange={(e) => setCat(e.currentTarget.value)}>
            {categories.value.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div class="col">
          <label for="ex-type">{t('type')}</label>
          <select id="ex-type" value={used ? old?.type : type} disabled={!!used} onChange={(e) => setType(e.currentTarget.value as ExerciseType)}>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {typeName(x)}
              </option>
            ))}
          </select>
        </div>
        {!!used && <p class="muted small">{t('typeLocked')}</p>}
        {((used ? old!.type : type).includes('weight') || (used ? old!.type : type) === 'reps') && (
          <label>
            {t('loadType')}
            <select value={load} onChange={(e) => setLoad(e.currentTarget.value as LoadType)}>
              {LOAD_TYPES.filter((l) => (used ? old!.type : type) !== 'reps' || l === 'total' || usesBodyWeight(l)).map((l) => (
                <option key={l} value={l}>
                  {t(`load_${l}` as Key)}
                </option>
              ))}
            </select>
          </label>
        )}
        {(used ? old!.type : type).includes('weight') && (
          <label>
            {t('increment')} ({st.unit})
            <input type="text" inputMode="decimal" placeholder={num(defaultIncrement(st.unit))} value={increment} onInput={(e) => setIncrement(e.currentTarget.value)} />
          </label>
        )}
        {(used ? old!.type : type).includes('reps') && (
          <label>
            {t('repTop')}
            <input type="text" inputMode="numeric" placeholder={String(DORIAN_TOP)} value={repTop} onInput={(e) => setRepTop(e.currentTarget.value)} />
          </label>
        )}
        {(used ? old!.type : type).includes('reps') && midCycle && <p class="muted small">{t('rangeMidCycle')}</p>}
        {(used ? old!.type : type).includes('reps') && (
          <label>
            {t('repBottom')}
            <input
              type="text"
              inputMode="numeric"
              placeholder={String(repRange({ repTop: parseInt(repTop, 10) || undefined }).bottom)}
              value={repBottom}
              onInput={(e) => setRepBottom(e.currentTarget.value)}
            />
          </label>
        )}
        {(used ? old!.type : type).includes('weight') && load === 'total' && (
          <label class="check">
            <input type="checkbox" checked={plates ?? usesPlatesByName(name)} onChange={(e) => setPlates(e.currentTarget.checked)} />
            {t('usesPlates')}
          </label>
        )}
        <label>
          {t('restTime')}
          <input type="text" inputMode="numeric" placeholder={String(st.rest)} value={rest} onInput={(e) => setRest(e.currentTarget.value)} />
        </label>
        <fieldset class="muscle-pick">
          <legend>{t('muscles')}</legend>
          <p class="muted small">{t('musclesHint')}</p>
          <div class="chips">
            {MUSCLES.map((id) => {
              const state = stateOf(muscles ?? (old ? old.muscles : defaultMuscles(name)), id);
              return (
                <button
                  type="button"
                  key={id}
                  class={`chip muscle ${state}`}
                  aria-label={`${t(`mu_${id}` as Key)}: ${t(`ms_${state}` as Key)}`}
                  onClick={() => setMuscles(cycle(muscles ?? (old ? old.muscles : defaultMuscles(name)), id))}
                >
                  {t(`mu_${id}` as Key)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label>
          {t('notes')}
          <textarea value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
        </label>
        <div class="actions">
          <button type="submit" class="btn primary">
            {t('save')}
          </button>
          {id && (
            <button type="button" class="btn danger" onClick={() => void remove()}>
              {t('delete')}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
