// Log sets of one exercise on one day: fields for the exercise type with +/- steppers, Save/Clear
// (Update/Delete when a set is selected), the day's sets with record marks, and last time's sets.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fillEmpty, fmtTime, isoDate, parseIso, previousWorkout, recordIds, round, uid } from '../lib/calc';
import { t } from '../lib/i18n';
import { fieldsOf, type Exercise, type Settings, type WorkoutSet } from '../lib/model';
import { startTimer } from '../lib/timer';
import { dFromUser, defaultIncrement, dToUser, num, setText, wFromUser, wToUser } from '../lib/units';
import { groupColors, groupMembers, groupOf, nextInGroup } from '../lib/groups';
import { open, replaceTop } from '../nav';
import { allSetsOf, catById, date as shownDate, daySets, exById, loadRecords, nextOrder, records, removeSet, saveSet, settings, setsVersion, toast } from '../state';
import { isDone } from '../lib/routines';
import { Graph, History, Records } from './ExerciseProgress';
import { Dot, Trophy } from './icons';
import { Sheet } from './Sheet';

interface Form {
  weight: string;
  reps: string;
  distance: string;
  min: string;
  sec: string;
  comment: string;
}
type Tab = 'track' | 'history' | 'graph' | 'records';
const TABS: Tab[] = ['track', 'history', 'graph', 'records'];

const EMPTY: Form = { weight: '', reps: '', distance: '', min: '', sec: '', comment: '' };

/** Accepts "82,5" as well as "82.5". Empty or invalid → null. */
const parse = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function toForm(s: WorkoutSet, st: Settings, comment = false): Form {
  return {
    weight: s.weight != null ? num(wToUser(s.weight, st.unit)) : '',
    reps: s.reps != null ? String(s.reps) : '',
    distance: s.distance != null ? num(dToUser(s.distance, st.dist), 3) : '',
    min: s.time != null ? String(Math.floor(s.time / 60)) : '',
    sec: s.time != null ? String(Math.round(s.time % 60)) : '',
    comment: comment ? s.comment ?? '' : '',
  };
}

/** The set values a form holds, or null if a field the type needs is missing. */
function fromForm(f: Form, ex: Exercise, st: Settings): Partial<WorkoutSet> | null {
  const out: Partial<WorkoutSet> = {};
  for (const field of fieldsOf(ex.type)) {
    if (field === 'time') {
      const m = parse(f.min) ?? 0;
      const s = parse(f.sec) ?? 0;
      if (f.min === '' && f.sec === '') return null;
      out.time = Math.round(m * 60 + s);
    } else {
      const v = parse(f[field]);
      if (v == null) return null;
      // Rounded so lb/mi entries don't store float noise (61.235 kg, not 61.23496…).
      if (field === 'weight') out.weight = round(wFromUser(v, st.unit), 3);
      else if (field === 'distance') out.distance = round(dFromUser(v, st.dist), 4);
      else out.reps = Math.round(v);
    }
  }
  // At least one non-zero value (0 kg × 10 is fine for body-weight work; 0 × 0 isn't a set).
  return Object.values(out).some((v) => (v as number) > 0) ? out : null;
}

export default function ExerciseScreen({ id, date }: { id: string; date: string }) {
  const ex = exById.value.get(id);
  const st = settings.value;
  const [all, setAll] = useState<WorkoutSet[] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [sel, setSel] = useState<string | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [tab, setTab] = useState<Tab>('track');
  const ver = setsVersion.value;

  useEffect(() => {
    let live = true;
    void allSetsOf(id).then((a) => live && setAll(a));
    void loadRecords([id]);
    return () => {
      live = false;
    };
  }, [id, ver]);

  const today = all?.filter((s) => s.date === date) ?? [];
  // Sets that count: not a routine's planned ones (filtered once, shared with the tabs).
  const counted = useMemo(() => all?.filter(isDone) ?? null, [all]);
  // "Last time" means sets actually done.
  const prev = counted ? previousWorkout(counted, date) : [];
  /** The next planned set of a routine logged today: Save fills it in. */
  const planned = today.find((s) => s.planned);

  // Start from the last set logged (today, else last time), like a paper log.
  const [filled, setFilled] = useState(false);
  // Runs once, when the history first arrives (deliberately only on `all`; `filled` stops repeats).
  useEffect(() => {
    if (filled || !all) return;
    const last = planned ?? today[today.length - 1] ?? prev[0];
    // Only into empty fields: on a slow phone the user may have typed before the history arrived.
    if (last) setForm((f) => fillEmpty(f, toForm(last, st), ['weight', 'reps', 'distance', 'min', 'sec']));
    setFilled(true);
  }, [all]);

  if (!ex) return <Sheet title="">{null}</Sheet>;
  const fields = fieldsOf(ex.type);
  const rec = records.value.get(id);
  // The exercise's superset on the shown day (in rotation order), if any.
  const members = date === shownDate.value ? groupMembers(daySets.value, id) : [];
  const selected = sel ? today.find((s) => s.id === sel) : undefined;
  const values = fromForm(form, ex, st);
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inc = ex.increment ?? defaultIncrement(st.unit);
  const distStep = st.dist === 'm' ? 100 : 0.1;

  async function save() {
    if (!values || !ex || !all) return;
    const comment = form.comment.trim() || undefined;
    if (selected) {
      // Editing a planned set means it was done.
      // Editing a planned set means it was done.
      await saveSet(selected.planned ? { ...selected, ...values, comment, planned: undefined, done: true } : { ...selected, ...values, comment });
      setSel(null);
    } else {
      // A routine's next planned set is filled in (and done); otherwise a new set.
      const s: WorkoutSet = planned
        ? { ...planned, ...values, comment, planned: undefined, done: true }
        : { id: uid(), date, exerciseId: id, order: nextOrder(), ...values, comment, done: st.markDone ? true : undefined, group: groupOf(daySetsFor(date), id) };
      // A record only counts as "new" when it beats earlier sets (the first ever set always holds one).
      if (counted!.some((x) => x.id !== s.id) && recordIds([...all.filter((x) => x.id !== s.id), s], ex.type).has(s.id)) toast(t('newRecord'));
      await saveSet(s);
      // In a superset: on to the next exercise; rest only after the round's last one.
      const step = nextInGroup(members, id);
      if (st.autoTimer && (!step || step.endOfRound)) startTimer(ex.rest ?? st.rest, st.timerSound);
      if (step) {
        replaceTop({ kind: 'exercise', id: step.next, date });
        return;
      }
    }
    setForm((f) => ({ ...f, comment: '' }));
    setShowComment(false);
  }

  async function clearOrDelete() {
    if (selected) {
      await removeSet(selected);
      setSel(null);
      setForm((f) => ({ ...f, comment: '' }));
    } else setForm(EMPTY);
  }

  function select(s: WorkoutSet) {
    if (sel === s.id) {
      setSel(null);
      setForm((f) => ({ ...f, comment: '' }));
      setShowComment(false);
      return;
    }
    setSel(s.id);
    setForm(toForm(s, st, true));
    setShowComment(!!s.comment);
  }

  const cat = catById.value.get(ex.categoryId);
  const colors = members.length ? groupColors(daySets.value) : null;
  return (
    <Sheet
      title={ex.name}
      actions={
        <>
          <button class="btn small" aria-label={t('startTimer')} onClick={() => startTimer(ex.rest ?? st.rest, st.timerSound)}>
            ⏱
          </button>
          <button class="btn small" onClick={() => open({ kind: 'editExercise', id })}>
            {t('edit')}
          </button>
        </>
      }
    >
      <div class="pad">
        <p class="muted small">
          <Dot color={cat?.color} /> {cat?.name}
          {date !== isoDate(new Date()) && ` · ${parseIso(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`}
        </p>
        {ex.notes && <p class="ex-notes muted small">{ex.notes}</p>}
        {members.length > 1 && (
          <div class="chips superset-bar" role="group" aria-label={t('superset')} style={{ borderColor: colors?.get(today[0]?.group ?? '') }}>
            {members.map((m) => (
              <button key={m} class={m === id ? 'chip on' : 'chip'} aria-pressed={m === id} onClick={() => m !== id && replaceTop({ kind: 'exercise', id: m, date })}>
                {exById.value.get(m)?.name}
              </button>
            ))}
          </div>
        )}
        <div class="chips" role="group" aria-label={ex.name}>
          {TABS.map((k) => (
            <button key={k} class={k === tab ? 'chip on' : 'chip'} aria-pressed={k === tab} onClick={() => setTab(k)}>
              {t(k)}
            </button>
          ))}
        </div>
        {tab === 'history' && counted && <History ex={ex} all={counted} rec={rec} st={st} />}
        {tab === 'graph' && counted && <Graph ex={ex} all={counted} st={st} />}
        {tab === 'records' && counted && <Records ex={ex} all={counted} st={st} />}
        {tab === 'track' && (
          <>
            <form
              class="card"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {fields.includes('weight') && (
                <Stepper id="f-weight" label={`${t('weight')} (${st.unit})`} value={form.weight} onChange={set('weight')} step={inc} />
              )}
              {fields.includes('reps') && <Stepper id="f-reps" label={t('reps')} value={form.reps} onChange={set('reps')} step={1} integer />}
              {fields.includes('distance') && (
                <Stepper id="f-distance" label={`${t('distance')} (${st.dist})`} value={form.distance} onChange={set('distance')} step={distStep} />
              )}
              {fields.includes('time') && <TimeField form={form} setForm={setForm} />}
              {showComment ? (
                <div class="field">
                  <label for="f-comment">{t('setComment')}</label>
                  <input id="f-comment" type="text" value={form.comment} onInput={(e) => set('comment')(e.currentTarget.value)} />
                </div>
              ) : (
                <button type="button" class="link" onClick={() => setShowComment(true)}>
                  + {t('addComment')}
                </button>
              )}
              <div class="actions">
                <button type="submit" class="btn primary" disabled={!values}>
                  {selected ? t('update') : t('save')}
                </button>
                <button type="button" class={selected ? 'btn danger' : 'btn'} onClick={() => void clearOrDelete()}>
                  {selected ? t('delete') : t('clear')}
                </button>
              </div>
            </form>

            {today.length > 0 ? (
              <div class="card">
                <ol class="sets">
                  {today.map((s, i) => (
                    <li key={s.id} class={sel === s.id ? 'sel' : undefined}>
                      <button type="button" class="set-row" onClick={() => select(s)} aria-pressed={sel === s.id}>
                        <span class="n">{i + 1}</span>
                        <span class="v">
                          {setText(s, ex.type, st)}
                          {s.comment && <span class="c">{s.comment}</span>}
                        </span>
                        {rec?.has(s.id) && <Trophy />}
                      </button>
                      {(st.markDone || s.planned) && (
                        <input
                          type="checkbox"
                          class="tick"
                          aria-label={`${t('setDone')} ${i + 1}`}
                          checked={!!s.done}
                          onChange={(e) => {
                            const next = { ...s, done: e.currentTarget.checked, planned: e.currentTarget.checked ? undefined : s.planned };
                            // Shown at once: the box mustn't snap back while the write is in flight (slow phones).
                            setAll((a) => a && a.map((x) => (x.id === s.id ? next : x)));
                            void saveSet(next);
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              all && <p class="muted center">{t('noSetsYet')}</p>
            )}

            {prev.length > 0 && (
              <div class="card prev-card">
                <h2 class="small muted">
                  {t('lastTime')} · {new Date(prev[0].date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </h2>
                <ol class="setlist prev">
                  {prev.map((s) => (
                    <li key={s.id}>
                      <span>{setText(s, ex.type, st)}</span>
                      {rec?.has(s.id) && <Trophy />}
                      {s.comment && <span class="note-line">{s.comment}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** The sets of `d` the screen knows about: the shown day's (with every exercise), else just this one's. */
function daySetsFor(d: string) {
  return d === shownDate.value ? daySets.value : [];
}

function Stepper(p: { id: string; label: string; value: string; onChange: (v: string) => void; step: number; integer?: boolean }) {
  const bump = (dir: number) => {
    const n = parse(p.value) ?? 0;
    const next = Math.max(0, n + dir * p.step);
    p.onChange(p.integer ? String(Math.round(next)) : num(next, 3));
  };
  return (
    <div class="field">
      <label for={p.id}>{p.label}</label>
      <div class="stepper">
        <button type="button" class="btn icon" aria-label={`${p.label} −${num(p.step, 3)}`} onClick={() => bump(-1)}>
          −
        </button>
        <input id={p.id} type="text" inputMode={p.integer ? 'numeric' : 'decimal'} autoComplete="off" value={p.value} onInput={(e) => p.onChange(e.currentTarget.value)} />
        <button type="button" class="btn icon" aria-label={`${p.label} +${num(p.step, 3)}`} onClick={() => bump(1)}>
          +
        </button>
      </div>
    </div>
  );
}

/** Minutes and seconds, with ±15 s buttons. */
function TimeField({ form, setForm }: { form: Form; setForm: (f: (f: Form) => Form) => void }) {
  const bump = (d: number) =>
    setForm((f) => {
      const total = Math.max(0, (parse(f.min) ?? 0) * 60 + (parse(f.sec) ?? 0) + d);
      return { ...f, min: String(Math.floor(total / 60)), sec: String(Math.round(total % 60)) };
    });
  const total = (parse(form.min) ?? 0) * 60 + (parse(form.sec) ?? 0);
  return (
    <div class="field">
      <span class="lbl">
        {t('time')} {total > 0 && <span class="num">({fmtTime(total)})</span>}
      </span>
      <div class="stepper">
        <button type="button" class="btn icon" aria-label={`${t('time')} −15 s`} onClick={() => bump(-15)}>
          −
        </button>
        <input type="text" inputMode="numeric" aria-label={`${t('time')} (${t('min')})`} placeholder={t('min')} value={form.min} onInput={(e) => setForm((f) => ({ ...f, min: e.currentTarget.value }))} />
        <span class="colon">:</span>
        <input type="text" inputMode="numeric" aria-label={`${t('time')} (${t('sec')})`} placeholder={t('sec')} value={form.sec} onInput={(e) => setForm((f) => ({ ...f, sec: e.currentTarget.value }))} />
        <button type="button" class="btn icon" aria-label={`${t('time')} +15 s`} onClick={() => bump(15)}>
          +
        </button>
      </div>
    </div>
  );
}
