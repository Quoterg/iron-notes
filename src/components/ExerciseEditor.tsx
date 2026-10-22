// Create or edit an exercise: name, category, type, weight step, rest time and notes.
import { useEffect, useState } from 'preact/hooks';
import { uid } from '../lib/calc';
import { countSetsOf } from '../lib/db';
import { t } from '../lib/i18n';
import { typeName } from '../lib/strings-later';
import { TYPES, type Exercise, type ExerciseType } from '../lib/model';
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
  const [rest, setRest] = useState(old?.rest != null ? String(old.rest) : '');
  const [notes, setNotes] = useState(old?.notes ?? '');
  const [used, setUsed] = useState(0);
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
    const r = parseInt(rest, 10);
    const ex: Exercise = {
      ...old, // fields this form doesn't edit (e.g. favourite) stay
      id: id ?? uid(),
      name: n,
      categoryId: cat,
      type: used ? old!.type : type,
      notes: notes.trim() || undefined,
      increment: inc > 0 ? inc : undefined,
      rest: r > 0 ? r : undefined,
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
        {(used ? old!.type : type).includes('weight') && (
          <label>
            {t('increment')} ({st.unit})
            <input type="text" inputMode="decimal" placeholder={num(defaultIncrement(st.unit))} value={increment} onInput={(e) => setIncrement(e.currentTarget.value)} />
          </label>
        )}
        <label>
          {t('restTime')}
          <input type="text" inputMode="numeric" placeholder={String(st.rest)} value={rest} onInput={(e) => setRest(e.currentTarget.value)} />
        </label>
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
