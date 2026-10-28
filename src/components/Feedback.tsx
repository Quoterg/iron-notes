// The logging screen's feedback card (Dorian HIT / Lyle): when an exercise got weaker or stalled over its
// last sessions, find the cause first (a long gap, a cut, only this exercise, or real fatigue) and suggest
// the mode's own lever, with one tap where there is one. Reads more only when there is something to say.
import { useEffect, useState } from 'preact/hooks';
import { addDays } from '../lib/calc';
import { causeOf, daysBetween, isCutting, longestGap, sessions, trendOf, weeklyRate, type Cause } from '../lib/feedback';
import { entriesOf, getMetrics, setsBetween } from '../lib/db';
import { t } from '../lib/i18n';
import type { Exercise, WorkoutSet } from '../lib/model';
import { saveSettings, settings } from '../state';

export function Feedback({ ex, date, counted }: { ex: Exercise; date: string; counted: readonly WorkoutSet[] }) {
  const st = settings.value;
  const mode = st.mode;
  // Lyle: only the push weeks of the running cycle compare (run-up weeks are lighter on purpose).
  const since = mode === 'lyle' && st.cycle && st.cycle.start <= date ? addDays(st.cycle.start, 14) : '';
  const list = sessions(counted.filter((s) => s.date < date), st.formula, since);
  const trend = trendOf(list);
  const [ctx, setCtx] = useState<{ cutting: boolean; othersWeaker: number } | null>(null);

  useEffect(() => {
    if (trend !== 'weaker' && trend !== 'stalled') return;
    let live = true;
    void (async () => {
      // Body weight trend (the first weight measure) and, when weaker, the other exercises of 4 weeks.
      const metric = (await getMetrics()).filter((m) => m.kind === 'weight').sort((a, b) => a.order - b.order)[0];
      const rate = metric ? weeklyRate(await entriesOf(metric.id), date) : null;
      let othersWeaker = 0;
      if (trend === 'weaker') {
        const by = new Map<string, WorkoutSet[]>();
        for (const s of await setsBetween(addDays(date, -28), addDays(date, -1))) if (s.exerciseId !== ex.id) by.get(s.exerciseId)?.push(s) ?? by.set(s.exerciseId, [s]);
        for (const sets of by.values()) if (trendOf(sessions(sets, st.formula, since)) === 'weaker') othersWeaker++;
      }
      if (live) setCtx({ cutting: isCutting(st.diet, rate), othersWeaker });
    })();
    return () => {
      live = false;
    };
  }, [ex.id, date, trend, st.diet, mode]);

  if (mode === 'standard' || (trend !== 'weaker' && trend !== 'stalled') || !ctx) return null;
  const lyle = mode === 'lyle';

  if (trend === 'stalled') {
    const last = list[list.length - 1];
    const spacing = list.length > 1 ? daysBetween(list[list.length - 2].date, last.date) : 7;
    const text = ctx.cutting
      ? t('fbStalledCut')
      : lyle
        ? last.sore === 2
          ? t('fbStalledLyleSore')
          : t('fbStalledLyle')
        : spacing < 7
          ? t('fbStalledDorianSpacing', { n: spacing })
          : t('fbStalledDorian');
    return <p class="hint small">{text}</p>;
  }

  const cause: Cause = causeOf({ gapDays: longestGap(list), cutting: ctx.cutting, othersWeaker: ctx.othersWeaker });
  const key = {
    inconsistent: 'fbInconsistent',
    cutting: lyle ? 'fbCuttingLyle' : 'fbCuttingDorian',
    exercise: lyle ? 'fbExerciseLyle' : 'fbExerciseDorian',
    fatigue: lyle ? 'fbFatigueLyle' : 'fbFatigueDorian',
  } as const;
  return (
    <div class="hint small">
      <p>{t(key[cause], { n: longestGap(list) })}</p>
      {cause === 'fatigue' && (
        <button
          class="btn small"
          onClick={() => void saveSettings(lyle ? { cycle: { start: date, weeks: st.cycle?.weeks ?? 6 } } : { light: { start: date } })}
        >
          {t(lyle ? 'startCycle' : 'startLight')}
        </button>
      )}
    </div>
  );
}
