// Log sets of one exercise on one day: fields for the exercise type with +/- steppers, Save/Clear
// (Update/Delete when a set is selected), the day's sets with record marks, and last time's sets.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fillEmpty, fmtTime, isoDate, oneRM, parseIso, previousWorkout, recordIds, round, uid } from '../lib/calc';
import { MAX_RIR, setEffective } from '../lib/effective';
import { DORIAN_TOP, dorianTargets, tooSoon, warmups, type Target } from '../lib/targets';
import { inLight, lightTargets, nextProgramDay, progressing } from '../lib/cycle';
import { daysBetween, GAP_DAYS } from '../lib/feedback';
import { Feedback } from './Feedback';
import { bestForRange, cycleWeek, lastFirstSet, lyleTarget, repRange, RUN_UP } from '../lib/lyle';
import { setsBetween } from '../lib/db';
import { t, type Key } from '../lib/i18n';
import { fieldsOf, type Exercise, type RoutineDay, type Settings, type WorkoutSet } from '../lib/model';
import { startTimer } from '../lib/timer';
import { dFromUser, defaultIncrement, dToUser, num, setText, weight as fmtWeight, wFromUser, wToUser } from '../lib/units';
import { groupColors, groupMembers, groupOf, nextInGroup } from '../lib/groups';
import { open, replaceTop } from '../nav';
import { allSetsOf, catById, date as shownDate, daySets, exById, exercises, loadRecords, nextOrder, records, removeSet, saveExercise, saveSet, setsVersion, settings, toast } from '../state';
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
  /** Lyle mode: '' (not given) or '0'…'5' (5 = 5+). */
  rir: string;
  /** Dorian HIT: reps after failure. */
  after: string;
  warmup: boolean;
}
type Tab = 'track' | 'history' | 'graph' | 'records';
const TABS: Tab[] = ['track', 'history', 'graph', 'records'];

const EMPTY: Form = { weight: '', reps: '', distance: '', min: '', sec: '', comment: '', rir: '', after: '', warmup: false };

/** Accepts "82,5" as well as "82.5". Empty or invalid → null. */
const parse = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** `own`: the set itself is being edited (its comment and effort); otherwise it only seeds the next set. */
function toForm(s: WorkoutSet, st: Settings, own = false): Form {
  return {
    weight: s.weight != null ? num(wToUser(s.weight, st.unit)) : '',
    reps: s.reps != null ? String(s.reps) : '',
    distance: s.distance != null ? num(dToUser(s.distance, st.dist), 3) : '',
    min: s.time != null ? String(Math.floor(s.time / 60)) : '',
    sec: s.time != null ? String(Math.round(s.time % 60)) : '',
    comment: own ? s.comment ?? '' : '',
    // RIR carries over to the next set (remembered per exercise); after-failure reps and warm-up don't.
    rir: s.rir != null && !s.warmup ? String(Math.min(s.rir, MAX_RIR)) : '',
    after: own && s.after ? String(s.after) : '',
    warmup: (own || !!s.planned) && !!s.warmup,
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

/** The effort the mode logs with a set (only for exercises with reps; Standard mode logs none). */
function effortOf(f: Form, ex: Exercise, st: Settings, light = false): Partial<WorkoutSet> {
  if (!fieldsOf(ex.type).includes('reps') || st.mode === 'standard') return {};
  if (st.mode === 'dorian') {
    if (f.warmup) return { warmup: true, rir: undefined, after: undefined, deload: undefined };
    // Lighter week: stopped short of failure, and kept out of progression.
    if (light) return { warmup: undefined, rir: 1, after: undefined, deload: true };
    const after = Math.round(parse(f.after) ?? 0);
    return { warmup: undefined, rir: 0, after: after > 0 ? after : undefined, deload: undefined };
  }
  const rir = parse(f.rir);
  return { warmup: undefined, after: undefined, rir: rir == null ? undefined : Math.min(Math.round(rir), MAX_RIR) };
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
  const keepOn = settings.value.keepScreenOn;
  useEffect(() => {
    if (!keepOn || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let live = true;
    // A refused request (e.g. battery saver) isn't retried until the app comes back to the front.
    const take = () => {
      if (document.visibilityState === 'visible') void navigator.wakeLock.request('screen').then((l) => (live ? (lock = l) : void l.release()), () => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [keepOn]);

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
  // Dorian HIT: each working set against the same set last time (double progression).
  const dorian = st.mode === 'dorian' && !!ex && fieldsOf(ex.type).includes('reps');
  const stepKg = ex ? wFromUser(ex.increment ?? defaultIncrement(st.unit), st.unit) : 0;
  const top = ex?.repTop ?? DORIAN_TOP;
  // `prev` is a new array each render: keyed on the history instead (targets change only with it).
  const light = dorian && inLight(st.light, date);
  // Targets come from the last normal session: lighter-week sets don't drive progression.
  const targets = useMemo(() => {
    if (!dorian || !counted) return [];
    const base = previousWorkout(counted.filter(progressing), date);
    return light ? lightTargets(base, stepKg) : dorianTargets(base, stepKg, top);
  }, [counted, date, dorian, light, stepKg, top]);
  const workingDone = today.filter((s) => !s.planned && !s.warmup && s.reps! > 0).length;
  // Days since this exercise's last normal session: after a long gap, targets start a step lower.
  const lastDate = useMemo(() => (counted ? previousWorkout(counted.filter(progressing), date)[0]?.date : undefined), [counted, date]);
  const gap = lastDate ? daysBetween(lastDate, date) : 0;
  const longGap = gap > GAP_DAYS;
  /** Dorian target after the gap and joint-pain rules: the last weight, no rep target / no weight increase. */
  const adjust = (tg: Target | undefined): Target | undefined => {
    if (!tg || tg.why === 'light') return tg;
    if (longGap) return { ...tg, weight: tg.prev.weight ?? tg.weight, reps: undefined, why: 'gap' };
    if (ex?.joint && tg.why === 'up') return { ...tg, weight: tg.prev.weight ?? tg.weight, reps: undefined, why: 'joint' };
    return tg;
  };
  const target: Target | undefined = adjust(targets[workingDone]);
  const seedOf = (tg: Target): WorkoutSet => ({ ...tg.prev, weight: tg.weight, reps: tg.reps });
  // Lyle: one target for the exercise, from the cycle week and its first set last time.
  const lyle = st.mode === 'lyle' && !!ex && fieldsOf(ex.type).includes('reps');
  const cycle = st.cycle;
  const week = lyle && cycle ? cycleWeek(cycle.start, date) : 0;
  const lyleT = useMemo(() => {
    if (!lyle || !counted || !ex) return null;
    const range = repRange(ex);
    const runUp = week >= 1 && week <= RUN_UP.length;
    const first = lastFirstSet(counted, date);
    // Back after a long gap: a run-up week 2 session (~92.5 % of the best) instead of pushing on.
    if (longGap && !runUp) {
      const tg = lyleTarget(2, bestForRange(counted, range.bottom, date), first, stepKg, range);
      if (tg) return { ...tg, why: 'gap' as const };
    }
    const tg = lyleTarget(runUp ? week : 0, runUp ? bestForRange(counted, range.bottom, cycle!.start) : 0, first, stepKg, range);
    if (tg && ex.joint && tg.why === 'up') return { ...tg, weight: tg.prev!.weight!, reps: range.top, why: 'joint' as const };
    return tg;
  }, [counted, date, lyle, week, stepKg, ex?.repTop, ex?.repBottom, cycle?.start, longGap, ex?.joint]);

  // Readiness, asked before a muscle's first set of the day (Dorian HIT / Lyle): saved with that set.
  const [sore, setSore] = useState<number | null>(null);
  const firstForMuscle =
    st.mode !== 'standard' &&
    !!ex?.muscles?.primary.length &&
    fieldsOf(ex.type).includes('reps') &&
    !today.some((s) => !s.planned) &&
    !(date === shownDate.value && daySets.value.some((s) => s.exerciseId !== id && !s.planned && exById.value.get(s.exerciseId)?.muscles?.primary.some((m) => ex.muscles!.primary.includes(m))));
  // Still sore in Dorian HIT with a program: the next workout of it that doesn't train these muscles.
  const [swapDay, setSwapDay] = useState<RoutineDay | null>(null);
  useEffect(() => {
    if (sore !== 2 || !dorian || !st.program || !ex?.muscles) return setSwapDay(null);
    void import('../workout').then(async (w) => {
      const r = (await w.loadRoutines()).find((x) => x.id === st.program!.routineId);
      if (!r) return setSwapDay(null);
      const start = r.days.indexOf(nextProgramDay(r, st.program!.lastDayId)!);
      const order = [...r.days.slice(start), ...r.days.slice(0, start)];
      const ok = order.find((d) => d.items.every((i) => !exById.value.get(i.exerciseId)?.muscles?.primary.some((m) => ex.muscles!.primary.includes(m))));
      setSwapDay(ok ?? null);
    });
  }, [sore, dorian, st.program?.routineId, st.program?.lastDayId, id]);

  // Muscles trained in a main session less than ~5 days ago (Dorian HIT): read once per screen.
  const [soon, setSoon] = useState<ReturnType<typeof tooSoon>>([]);
  useEffect(() => {
    if (!dorian || !ex?.muscles?.primary.length) return setSoon([]);
    let live = true;
    const from = parseIso(date);
    from.setDate(from.getDate() - 4);
    const to = parseIso(date);
    to.setDate(to.getDate() - 1);
    void setsBetween(isoDate(from), isoDate(to)).then(
      (sets) => live && setSoon(tooSoon(date, ex.muscles, sets, (x) => exById.value.get(x)?.muscles, (s) => setEffective(s, 0, st.formula).n)),
    );
    return () => {
      live = false;
    };
  }, [id, date, dorian, ex?.muscles, st.formula]);

  // Start from the last set logged (today, else last time), like a paper log.
  const [filled, setFilled] = useState(false);
  // Runs once, when the history first arrives (deliberately only on `all`; `filled` stops repeats).
  useEffect(() => {
    if (filled || !all) return;
    const lyleSeed = lyleT && !today.some((s) => !s.planned) ? ({ ...prev[0], weight: lyleT.weight, reps: lyleT.reps, rir: undefined } as WorkoutSet) : undefined;
    const last = planned ?? (target ? seedOf(target) : lyleSeed ?? today[today.length - 1] ?? prev[0]);
    // Only into empty fields: on a slow phone the user may have typed before the history arrived.
    // Lyle mode: RIR is the progression signal, so it is chosen for every set, never prefilled.
    if (last) setForm((f) => fillEmpty(f, toForm(last, st), lyle ? ['weight', 'reps', 'distance', 'min', 'sec'] : ['weight', 'reps', 'distance', 'min', 'sec', 'rir']));
    setFilled(true);
  }, [all]);

  if (!ex) return <Sheet title="">{null}</Sheet>;
  const fields = fieldsOf(ex.type);
  const rec = records.value.get(id);
  // The exercise's superset on the shown day (in rotation order), if any.
  const members = date === shownDate.value ? groupMembers(daySets.value, id) : [];
  const selected = sel ? today.find((s) => s.id === sel) : undefined;
  const fv = fromForm(form, ex, st);
  const values = fv && { ...fv, ...effortOf(form, ex, st, light) };
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inc = ex.increment ?? defaultIncrement(st.unit);
  const distStep = st.dist === 'm' ? 100 : 0.1;
  const hasReps = fields.includes('reps');
  // Effective reps of today's sets (computed once per change, not per keystroke): the best e1RM of the
  // working sets estimates the effort of sets logged without one.
  const effOf = useMemo(() => {
    const out = new Map<string, ReturnType<typeof setEffective>>();
    if (!counted) return out;
    let best = 0;
    for (const s of counted) if (!s.warmup) best = Math.max(best, oneRM(s.weight ?? 0, s.reps ?? 0, st.formula));
    for (const s of counted) if (s.date === date) out.set(s.id, setEffective(s, best, st.formula));
    return out;
  }, [counted, date, st.formula]);
  let effToday = 0;
  if (hasReps) for (const e of effOf.values()) effToday += e.n;

  async function save() {
    if (!values || !ex || !all) return;
    const comment = form.comment.trim() || undefined;
    if (selected) {
      // Editing a planned set means it was done.
      await saveSet(selected.planned ? { ...selected, ...values, comment, planned: undefined, done: true } : { ...selected, ...values, comment });
      setSel(null);
    } else {
      // A routine's next planned set is filled in (and done); otherwise a new set.
      const s: WorkoutSet = planned
        ? { ...planned, ...values, comment, planned: undefined, done: true }
        : { id: uid(), date, exerciseId: id, order: nextOrder(), ...values, comment, done: st.markDone ? true : undefined, group: groupOf(daySetsFor(date), id), sore: firstForMuscle && sore != null ? sore : undefined };
      // A record only counts as "new" when it beats earlier sets (the first ever set always holds one).
      if (counted!.some((x) => x.id !== s.id) && recordIds([...all.filter((x) => x.id !== s.id), s], ex.type).has(s.id)) toast(t('newRecord'));
      await saveSet(s);
      // Dorian HIT: after a working set the form moves on to the next set's target (a reverse pyramid's
      // back-off set is lighter); reps after failure never carry over.
      const next = dorian && !s.warmup ? adjust(targets[workingDone + 1]) : undefined;
      if (next) setForm((f) => ({ ...f, ...toForm(seedOf(next), st), comment: f.comment, after: '' }));
      else setForm((f) => ({ ...f, after: '', rir: lyle ? '' : f.rir }));
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
        {ex.muscles && ex.muscles.primary.length + ex.muscles.secondary.length > 0 && (
          <p class="muted small">
            {ex.muscles.primary.map((m) => t(`mu_${m}` as Key)).join(', ')}
            {ex.muscles.secondary.length > 0 &&
              `${ex.muscles.primary.length ? ' ' : ''}(+ ${ex.muscles.secondary.map((m) => t(`mu_${m}` as Key)).join(', ')})`}
          </p>
        )}
        {ex.notes && <p class="ex-notes muted small">{ex.notes}</p>}
        {soon.map((x) => (
          <p key={x.muscle} class="hint small">
            {t(x.days === 1 ? 'tooSoon1' : 'tooSoon', { muscle: t(`mu_${x.muscle}` as Key), n: x.days })}
          </p>
        ))}
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
            {firstForMuscle && !selected && (
              <div class="field">
                <span class="lbl">{t('recoveredQ', { muscle: ex.muscles!.primary.map((m) => t(`mu_${m}` as Key)).join(', ') })}</span>
                <div class="chips" role="group" aria-label={t('recoveredQ', { muscle: '' })}>
                  {(['fresh', 'bitSore', 'stillSore'] as const).map((k, i) => (
                    <button key={k} type="button" class={sore === i ? 'chip on' : 'chip'} aria-pressed={sore === i} onClick={() => setSore(sore === i ? null : i)}>
                      {t(k)}
                    </button>
                  ))}
                </div>
                {sore === 2 && (
                  <div class="hint small">
                    <p>{dorian ? (swapDay ? t('soreDorianSwap', { day: swapDay.name }) : t('soreDorian')) : t('soreLyle')}</p>
                    {swapDay && (
                      <button
                        type="button"
                        class="btn small"
                        onClick={() => void import('../workout').then((w) => w.logRoutineDay(swapDay, date)).then(() => history.back())}
                      >
                        {t('logInstead', { day: swapDay.name })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {(dorian || lyle) && !selected && counted && <Feedback ex={ex} date={date} counted={counted} />}
            {(dorian || lyle) && (
              <div class="chips">
                <button type="button" class={ex.joint ? 'chip on' : 'chip'} aria-pressed={!!ex.joint} onClick={() => void saveExercise({ ...ex, joint: ex.joint ? undefined : true })}>
                  {t('jointPain')}
                </button>
                {ex.joint &&
                  exercises.value
                    .filter((x) => x.id !== id && x.muscles?.primary[0] && x.muscles.primary[0] === ex.muscles?.primary[0])
                    .slice(0, 5)
                    .map((x) => (
                      <button key={x.id} type="button" class="chip" onClick={() => replaceTop({ kind: 'exercise', id: x.id, date })}>
                        {t('swapTo', { name: x.name })}
                      </button>
                    ))}
              </div>
            )}
            {lyle && !selected && cycle && week > cycle.weeks && <p class="hint small">{t('cycleDone')}</p>}
            {lyle && !selected && lyleT && (
              <p class="target small">
                <strong>
                  {week >= 1 && week <= (cycle?.weeks ?? 0) ? `${t('cycleWeek', { n: week, N: cycle!.weeks, phase: t(week <= RUN_UP.length ? 'runUp' : 'push') })} · ` : ''}
                  {t('target')}: {fmtWeight(lyleT.weight, st)} × {lyleT.reps}
                  {lyleT.why === 'runup' || lyleT.why === 'gap' ? '' : '+'}
                </strong>{' '}
                <span class="muted">
                  {lyleT.why === 'runup'
                    ? t('lyleRunUp', { rir: week === 1 ? '2–3' : '1–2' })
                    : lyleT.why === 'up'
                      ? t('lyleUp', { reps: lyleT.prev!.reps!, rir: lyleT.prev!.rir! })
                      : lyleT.why === 'grind'
                        ? t('lyleGrind', { reps: lyleT.prev!.reps! })
                        : lyleT.why === 'norir'
                        ? t('lyleNoRir', { reps: lyleT.prev!.reps! })
                        : lyleT.why === 'gap'
                        ? t('lyleGap', { n: gap })
                        : lyleT.why === 'joint'
                        ? t('jointHold')
                        : t('lyleReps', { reps: lyleT.prev!.reps! })}
                </span>
              </p>
            )}
            {dorian && !selected && target && (
              <p class="target small">
                <strong>
                  {t('targetSet', { n: workingDone + 1 })}: {fmtWeight(target.weight, st)}
                  {target.reps ? ` × ${target.reps}${target.why === 'light' ? '' : '+'}` : ''}
                </strong>{' '}
                <span class="muted">
                  {target.why === 'light'
                    ? t('targetLight')
                    : target.why === 'gap'
                    ? t('targetGap', { n: gap })
                    : target.why === 'joint'
                    ? t('jointHold')
                    : target.why === 'up'
                    ? t('targetUp', { reps: target.prev.reps!, top: ex.repTop ?? DORIAN_TOP })
                    : t('targetBeat', { reps: target.prev.reps! })}
                </span>
              </p>
            )}
            {dorian && !selected && workingDone === 0 && (target?.weight ?? 0) > 0 && (
              <div class="chips" aria-label={t('warmupsHint')}>
                <span class="muted small">{t('warmupsHint')}:</span>
                {warmups(target!.weight, stepKg).map((w) => (
                  <button
                    key={w.reps}
                    type="button"
                    class="chip"
                    onClick={() => setForm((f) => ({ ...f, weight: num(wToUser(w.weight, st.unit), 3), reps: String(w.reps), warmup: true, after: '' }))}
                  >
                    {fmtWeight(w.weight, st)} × {w.reps}
                  </button>
                ))}
              </div>
            )}
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
              {hasReps && st.mode === 'dorian' && (
                <>
                  <div class="chips" role="group" aria-label={t('warmup')}>
                    {[false, true].map((w) => (
                      <button key={String(w)} type="button" class={form.warmup === w ? 'chip on' : 'chip'} aria-pressed={form.warmup === w} onClick={() =>
                          // Back to working sets after warm-ups: the form takes the set's target again.
                          setForm((f) => (!w && f.warmup && target && !selected ? { ...f, ...toForm(seedOf(target), st), comment: f.comment, warmup: false } : { ...f, warmup: w }))
                        }>
                        {t(w ? 'warmup' : 'working')}
                      </button>
                    ))}
                  </div>
                  {!form.warmup && <Stepper id="f-after" label={t('afterFailure')} value={form.after} onChange={set('after')} step={1} integer />}
                </>
              )}
              {hasReps && st.mode === 'lyle' && (
                <div class="field">
                  <span class="lbl">
                    {t('rir')} <span class="muted small">({t('rirHint')})</span>
                  </span>
                  <div class="chips rir" role="group" aria-label={t('rir')}>
                    {['0', '1', '2', '3', '4', '5'].map((r) => (
                      <button key={r} type="button" class={form.rir === r ? 'chip on' : 'chip'} aria-pressed={form.rir === r} onClick={() => setForm((f) => ({ ...f, rir: f.rir === r ? '' : r }))}>
                        {r === '5' ? '5+' : r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
              {fields.includes('weight') && (
                <button type="button" class="link" onClick={() => open({ kind: 'tools', weight: values?.weight })}>
                  {t('tools')}
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
                {effToday > 0 && <p class="muted small eff-total">{t('effToday', { n: effToday })}</p>}
                <ol class="sets">
                  {today.map((s, i) => (
                    <li key={s.id} class={sel === s.id ? 'sel' : undefined}>
                      <button type="button" class="set-row" onClick={() => select(s)} aria-pressed={sel === s.id}>
                        <span class="n">{i + 1}</span>
                        <span class="v">
                          {setText(s, ex.type, st)}
                          {hasReps && <Effort s={s} />}
                          {s.comment && <span class="c">{s.comment}</span>}
                        </span>
                        {hasReps && effOf.has(s.id) && <EffBadge {...effOf.get(s.id)!} />}
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

/** What was logged about the effort: warm-up, RIR, reps after failure. */
function Effort({ s }: { s: WorkoutSet }) {
  const parts = [s.warmup ? t('warmup') : s.rir != null && s.rir > 0 ? t('rirShort', { n: s.rir >= MAX_RIR ? '5+' : s.rir }) : '', s.after ? `+${s.after}` : ''].filter(Boolean);
  return parts.length ? <span class="muted"> · {parts.join(' ')}</span> : null;
}

function EffBadge({ n, est }: { n: number; est: boolean }) {
  return <span class={n > 0 ? 'eff' : 'eff zero'}>{t('effShort', { n: (est ? '≈' : '') + n })}</span>;
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
