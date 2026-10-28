// The day's place in the cycle on the day log (a quiet lazy chunk): "Week 2 of 6 (run-up)" or "Lighter
// week", and on an empty day the program's next workout, added with one tap.
import { useEffect, useState } from 'preact/hooks';
import { nextProgramDay, phaseOn } from '../lib/cycle';
import { t } from '../lib/i18n';
import type { Routine } from '../lib/model';
import { date, daySets, routines, settings } from '../state';

export default function DayPlan() {
  const st = settings.value;
  const d = date.value;
  const empty = !daySets.value.length;
  const [ready, setReady] = useState(!!routines.value);
  useEffect(() => {
    if (st.program && !routines.value) void import('../workout').then((w) => w.loadRoutines()).then(() => setReady(true));
  }, [st.program?.routineId]);

  const ph = phaseOn(st, d);
  const routine: Routine | undefined = ready && st.program ? routines.value?.find((r) => r.id === st.program!.routineId) : undefined;
  const next = empty ? nextProgramDay(routine, st.program?.lastDayId) : undefined;
  if (!ph && !next) return null;
  return (
    <div class="day-plan">
      {ph && (
        <p class={`phase ${ph.phase} small`}>
          {ph.phase === 'light' ? t('lightWeek') : t('cycleWeek', { n: ph.week!, N: ph.weeks!, phase: t(ph.phase === 'runup' ? 'runUp' : 'push') })}
        </p>
      )}
      {next && (
        <button class="btn primary wide" onClick={() => void import('../workout').then((w) => w.logRoutineDay(next, d))}>
          {t('nextWorkout', { day: next.name, routine: routine!.name })}
        </button>
      )}
    </div>
  );
}
