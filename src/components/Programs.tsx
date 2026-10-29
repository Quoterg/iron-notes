// Programs: start a ready-made one (Dorian 4-day split, Lyle's upper/lower), or make your own from a
// routine folder (saved workouts) and the weekdays you train. The workouts rotate; a missed day moves the
// rest along instead of skipping one.
import { useEffect, useState } from 'preact/hooks';
import { cycleWeek } from '../lib/lyle';
import { isoDate } from '../lib/calc';
import { t } from '../lib/i18n';
import type { Routine } from '../lib/model';
import { buildProgram, TEMPLATES, type Template } from '../lib/programs';
import { exercises, routines, saveExercise, saveSettings, settings, toast } from '../state';
import { loadRoutines, saveRoutine } from '../workout';
import { Sheet } from './Sheet';

const NAME = { dorian4: 'tplDorian', lyleGbr: 'tplLyle' } as const;
const HINT = { dorian4: 'tplDorianHint', lyleGbr: 'tplLyleHint' } as const;

export default function Programs() {
  const st = settings.value;
  const [list, setList] = useState<Routine[] | null>(routines.value);
  useEffect(() => {
    void loadRoutines().then(setList);
  }, []);
  const p = st.program;

  async function start(tpl: Template) {
    if (p && !confirm(t('replaceProgramQ'))) return;
    const name = t(NAME[tpl.id]);
    const { routine, ranges, missing } = buildProgram(tpl, name, exercises.value, (await loadRoutines()).length);
    await saveRoutine(routine);
    for (const e of ranges) await saveExercise(e);
    const today = isoDate(new Date());
    // Lyle: a cycle starts with the program unless one is running.
    const running = st.cycle && cycleWeek(st.cycle.start, today) <= st.cycle.weeks;
    await saveSettings({
      mode: tpl.mode,
      program: { routineId: routine.id, weekdays: tpl.weekdays },
      ...(tpl.mode === 'lyle' && !running ? { cycle: { start: today, weeks: st.cycle?.weeks ?? 6 } } : {}),
    });
    setList(routines.value);
    toast(missing.length ? t('programStartedMissing', { name, n: missing.length, list: missing.join(', ') }) : t('programStarted', { name }));
  }

  // Weekdays in the calendar's order; names from a known week (25 Oct 2026 is a Sunday).
  const order = Array.from({ length: 7 }, (_, i) => (i + st.weekStart) % 7);
  const dayName = (wd: number) => new Date(Date.UTC(2026, 9, 25 + wd)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  const days = p?.weekdays ?? [];

  return (
    <Sheet title={t('programs')}>
      <div class="pad">
        <section class="card">
          <h2>{t('readyToStart')}</h2>
          {TEMPLATES.map((tpl) => (
            <div key={tpl.id} class="program">
              <h3>{t(NAME[tpl.id])}</h3>
              <p class="muted small">{t(HINT[tpl.id])}</p>
              <button class="btn" onClick={() => void start(tpl)}>
                {t('startProgram')}: {t(NAME[tpl.id])}
              </button>
            </div>
          ))}
        </section>
        <section class="card">
          <h2>{t('yourProgram')}</h2>
          <label>
            {t('program')}
            <select
              value={p?.routineId ?? ''}
              onChange={(e) => {
                const id = e.currentTarget.value;
                void saveSettings({ program: id ? { routineId: id, lastDayId: p?.routineId === id ? p.lastDayId : undefined, weekdays: p?.weekdays } : undefined });
              }}
            >
              <option value="">{t('programNone')}</option>
              {(list ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <p class="muted small">{t('programHint')}</p>
          {p && (
            <>
              <p class="muted small">{t('trainingDays')}</p>
              <div class="chips">
                {order.map((wd) => {
                  const on = days.includes(wd);
                  return (
                    <button
                      key={wd}
                      class={on ? 'chip on' : 'chip'}
                      aria-pressed={on}
                      onClick={() => void saveSettings({ program: { ...p, weekdays: on ? days.filter((x) => x !== wd) : [...days, wd].sort() } })}
                    >
                      {dayName(wd)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </Sheet>
  );
}
