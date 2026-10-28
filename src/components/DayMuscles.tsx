// Effective reps per muscle on the day log (a quiet lazy chunk under the day summary): main sessions
// against the mode's goal ("Chest 22/20"), smaller direct work as extra ("Triceps +8 extra"). Indirect
// work is on the Muscles screen. Tapping opens it.
import { useEffect, useState } from 'preact/hooks';
import { effectiveOf } from '../effort';
import { t, type Key } from '../lib/i18n';
import { dayMuscles, GOALS, statusOf, type DayMuscle } from '../lib/volume';
import { open } from '../nav';
import { daySets, exById, settings } from '../state';

export default function DayMuscles() {
  const sets = daySets.value;
  const mode = settings.value.mode;
  const goal = GOALS[mode];
  const [rows, setRows] = useState<{ list: DayMuscle[]; est: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void effectiveOf(sets).then((eff) => {
      if (!live) return;
      let est = false;
      const list = dayMuscles(sets, (id) => exById.value.get(id)?.muscles, (s) => {
        const e = eff(s);
        if (e.est && e.n > 0) est = true;
        return e.n;
      }, goal);
      setRows({ list: list.filter((d) => d.direct > 0), est });
    });
    return () => {
      live = false;
    };
  }, [sets, mode, settings.value.formula]);
  if (!rows?.list.length) return null;
  const approx = rows.est ? '≈' : '';
  return (
    <button class="day-muscles" aria-label={t('muscles')} onClick={() => open({ kind: 'muscles' })}>
      {rows.list.map((d) => {
        const name = t(`mu_${d.muscle}` as Key);
        const n = Math.round(d.direct + d.indirect);
        if (!d.main) return <span key={d.muscle} class="chip mu extra">{t('muExtra', { muscle: name, n: approx + Math.round(d.direct) })}</span>;
        return (
          <span key={d.muscle} class={`chip mu ${goal ? statusOf(n, goal) : ''}`}>
            {name} {approx}
            {n}
            {goal && `/${goal.label}`}
          </span>
        );
      })}
    </button>
  );
}
