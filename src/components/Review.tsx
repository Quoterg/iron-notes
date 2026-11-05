// Cycle / block review (M27): before the next cycle — strength per exercise over the period, effective
// reps per muscle per week, readiness answers, and swaps for stalled, weaker or joint-flagged exercises
// (one tap in the program's routine when the exercise is in it). One date-range read of the sets.
import { useEffect, useState } from 'preact/hooks';
import { addDays, isoDate } from '../lib/calc';
import { effectiveOf } from '../effort';
import { setsBetween } from '../lib/db';
import { exName, type Key, t } from '../lib/i18n';
import { loadOf, usesBodyWeight, withRealLoad } from '../lib/load';
import { cycleWeek } from '../lib/lyle';
import type { Exercise, MuscleId, WorkoutSet } from '../lib/model';
import { alternatives, exerciseChanges, soreness, swapInRoutine, toSwap, type ExerciseChange } from '../lib/review';
import { num, weight } from '../lib/units';
import { GOALS, periodMuscles } from '../lib/volume';
import { replaceTop } from '../nav';
import { bodyWeights, exById, exercises, routines, settings, toast } from '../state';
import { loadRoutines, saveRoutine } from '../workout';
import { Sheet } from './Sheet';

type Span = 'cycle' | 4 | 6 | 8;

interface Data {
  changes: ExerciseChange[];
  muscles: ReturnType<typeof periodMuscles>;
  sore: Map<MuscleId, [number, number, number]>;
}

export default function Review() {
  const st = settings.value;
  const today = isoDate(new Date());
  const cycle = st.mode === 'lyle' ? st.cycle : undefined;
  const [span, setSpan] = useState<Span>(cycle ? 'cycle' : 6);
  // The cycle's own dates (up to today while it runs), or the last n weeks.
  const from = span === 'cycle' && cycle ? cycle.start : addDays(today, -7 * (span === 'cycle' ? 6 : span) + 1);
  const cycleEnd = cycle ? addDays(cycle.start, cycle.weeks * 7 - 1) : today;
  const to = span === 'cycle' && cycleEnd < today ? cycleEnd : today;
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    void (async () => {
      const sets = (await setsBetween(from, to)).filter((s) => !s.planned);
      const at = sets.some((s) => usesBodyWeight(loadOf(exById.value.get(s.exerciseId)))) ? await bodyWeights() : () => undefined;
      const by = new Map<string, WorkoutSet[]>();
      for (const s of sets) if (exById.value.get(s.exerciseId)?.type.includes('reps')) by.get(s.exerciseId)?.push(s) ?? by.set(s.exerciseId, [s]);
      const real = new Map([...by].map(([id, list]) => [id, withRealLoad(list, loadOf(exById.value.get(id)), at)]));
      const eff = await effectiveOf(sets);
      const muscles = periodMuscles(sets, (id) => exById.value.get(id)?.muscles, (s) => eff(s).n, GOALS[st.mode], from, to);
      if (st.program) await loadRoutines();
      if (live) setData({ changes: exerciseChanges(real, from, to, st.formula), muscles, sore: soreness(sets, (id) => exById.value.get(id)?.muscles, from, to) });
    })();
    return () => {
      live = false;
    };
  }, [from, to, st.mode, st.formula]);

  const program = st.program ? routines.value?.find((r) => r.id === st.program!.routineId) : undefined;
  const inProgram = new Set(program?.days.flatMap((d) => d.items.map((i) => i.exerciseId)) ?? []);
  const week = cycle ? cycleWeek(cycle.start, today) : 0;

  async function swap(from: Exercise, to: Exercise) {
    if (!program) return;
    await saveRoutine(swapInRoutine(program, from.id, to.id));
    toast(t('swapped', { from: exName(from), to: exName(to) }));
  }

  const spans: Span[] = cycle ? ['cycle', 4, 6, 8] : [4, 6, 8];
  // Weight and reps: e1RM in the user's unit; reps-only exercises: their best reps.
  const changeText = (c: ExerciseChange, ex: Exercise) =>
    ex.type === 'weight,reps' ? `${weight(c.first, st)} → ${weight(c.last, st)}` : `${Math.round(c.first)} → ${Math.round(c.last)}`;

  return (
    <Sheet title={t('review')}>
      <div class="pad">
        <div class="chips" role="group" aria-label={t('range')}>
          {spans.map((s) => (
            <button key={s} class={s === span ? 'chip on' : 'chip'} aria-pressed={s === span} onClick={() => setSpan(s)}>
              {s === 'cycle' ? t('thisCycle') : t('weeksN', { n: s })}
            </button>
          ))}
        </div>
        {span === 'cycle' && cycle && <p class="muted small">{week > cycle.weeks ? t('cycleDone') : t('cycleWeek', { n: week, N: cycle.weeks, phase: t(week <= 2 ? 'runUp' : 'push') })}</p>}
        {!data ? (
          <p class="muted center">{t('loading')}</p>
        ) : !data.changes.length ? (
          <p class="muted center">{t('noWorkoutsInPeriod')}</p>
        ) : (
          <>
            <section class="card">
              <h2>{t('strength')}</h2>
              <p class="muted small">{t('strengthHint')}</p>
              <ul class="entries">
                {data.changes.map((c) => {
                  const ex = exById.value.get(c.exerciseId);
                  if (!ex) return null;
                  return (
                    <li key={c.exerciseId} class="entry entry-static">
                      <span class="entry-name">{exName(ex)}</span>
                      <span class="muted small num">
                        {changeText(c, ex)}
                        {c.change != null &&
                          (Math.abs(c.change) < 0.0005 ? (
                            <b class="delta"> ±0 %</b>
                          ) : (
                            <b class={c.change > 0 ? 'delta up' : 'delta down'}> {c.change > 0 ? '+' : '−'}{num(Math.abs(c.change) * 100, 1)} %</b>
                          ))}
                        {` · ${c.sessions} ${t('workoutsCount')}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {data.muscles.list.length > 0 && (
              <section class="card">
                <h2>{t('effPerMuscle')}</h2>
                <ul class="mu-bars">
                  {data.muscles.list.map((m) => {
                    const s = data.sore.get(m.muscle);
                    return (
                      <li key={m.muscle}>
                        <span class="mu-name">{t(`mu_${m.muscle}` as Key)}</span>
                        <span class="mu-track">
                          <span class="mu-fill" style={{ width: `${(m.total / data.muscles.list[0].total) * 100}%` }} />
                        </span>
                        <span class="mu-num num">{Math.round(m.total / data.muscles.weeks)}</span>
                        <span class="mu-sessions small">
                          {t('effPerWeek', { n: Math.round(m.total / data.muscles.weeks) })} · {m.sessions === 1 ? t('mainSession1') : t('mainSessions', { n: m.sessions })}
                          {s && s[2] > 0 && ` · ${t('stillSoreN', { n: s[2], of: s[0] + s[1] + s[2] })}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <SwapList changes={data.changes} inProgram={inProgram} program={!!program} onSwap={swap} />
          </>
        )}
      </div>
    </Sheet>
  );
}

function SwapList(p: { changes: ExerciseChange[]; inProgram: ReadonlySet<string>; program: boolean; onSwap: (from: Exercise, to: Exercise) => void }) {
  const rows = p.changes.flatMap((c) => {
    const ex = exById.value.get(c.exerciseId);
    return ex && toSwap(c, ex) ? [{ c, ex }] : [];
  });
  if (!rows.length) return null;
  return (
    <section class="card">
      <h2>{t('toSwap')}</h2>
      <p class="muted small">{t('toSwapHint')}</p>
      {rows.map(({ c, ex }) => {
        const alts = alternatives(ex, exercises.value, p.inProgram);
        const why = ex.joint ? t('jointPain') : c.trend === 'weaker' ? t('trendWeaker') : t('trendStalled');
        const swapHere = p.program && p.inProgram.has(ex.id);
        return (
          <div key={ex.id} class="swap">
            <p>
              <strong>{exName(ex)}</strong> <span class="muted small">· {why}</span>
            </p>
            <div class="chips">
              {alts.length ? (
                alts.map((a) => (
                  <button key={a.id} class="chip" onClick={() => (swapHere ? p.onSwap(ex, a) : replaceTop({ kind: 'exercise', id: a.id, date: isoDate(new Date()) }))}>
                    {swapHere ? t('swapInProgram', { name: exName(a) }) : exName(a)}
                  </button>
                ))
              ) : (
                <span class="muted small">{t('noAlternatives')}</span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
