// Categories → exercises, with search across all. Picks an exercise to log on `date`, or (manage)
// opens exercises and categories for editing.
import { useEffect, useState } from 'preact/hooks';
import { recentExerciseIds } from '../lib/db';
import { t } from '../lib/i18n';
import type { Exercise, Routine, RoutineDay } from '../lib/model';
import { open, replaceTop } from '../nav';
import { defaultPlan } from '../lib/routines';
import { catById, categories, exById, exercises, routines, setFavorite, toast } from '../state';
import { loadRoutines, logRoutineDay, saveRoutine } from '../workout';
import { Dot } from './icons';
import { Sheet } from './Sheet';

const RECENT = 8;

/** Lower case without accents, so "presse" finds "Pressé". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function Picker({ date, manage, routine }: { date?: string; manage?: boolean; routine?: { routineId: string; dayId: string } }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // Saved workouts are offered when logging a day (not when managing, not when filling a routine).
  const logging = !manage && !routine && !!date;
  useEffect(() => {
    if (!manage) void recentExerciseIds(RECENT).then(setRecent);
    if (logging) void loadRoutines(); // reads storage once; later opens use the routines in memory
  }, [manage, logging]);
  const query = fold(q.trim());
  const workouts = logging ? (routines.value ?? []).flatMap((r) => r.days.filter((d) => d.items.length).map((d) => ({ r, d }))) : [];
  const addWorkout = async (d: RoutineDay) => {
    await logRoutineDay(d, date!);
    toast(t('workoutAdded', { name: d.name }));
    history.back();
  };

  const pick = (e: Exercise) => {
    if (routine) return void addToRoutine(e, routine.routineId, routine.dayId);
    if (manage || !date) open({ kind: 'editExercise', id: e.id });
    else replaceTop({ kind: 'exercise', id: e.id, date });
  };

  let body;
  if (query) {
    const words = query.split(/\s+/);
    const hits = exercises.value.filter((e) => {
      const n = fold(e.name);
      return words.every((w) => n.includes(w));
    });
    const wHits = workouts.filter(({ r, d }) => words.every((w) => fold(`${d.name} ${r.name}`).includes(w)));
    body =
      hits.length || wHits.length ? (
        <>
          {wHits.length > 0 && <WorkoutList list={wHits} onPick={addWorkout} />}
          {hits.length > 0 && <ExerciseList list={hits} onPick={pick} showCat />}
        </>
      ) : (
        <p class="pad muted">{t('noMatches')}</p>
      );
  } else if (cat && catById.value.has(cat)) {
    const c = catById.value.get(cat)!;
    body = (
      <>
        <button class="cat-back" onClick={() => setCat(null)}>
          ‹ <Dot color={c.color} /> {c.name}
        </button>
        <ExerciseList list={exercises.value.filter((e) => e.categoryId === cat)} onPick={pick} />
      </>
    );
  } else {
    const counts = new Map<string, number>();
    for (const e of exercises.value) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
    const favs = exercises.value.filter((e) => e.favorite);
    const recents = recent.map((id) => exById.value.get(id)).filter((e): e is Exercise => !!e && !e.favorite);
    body = (
      <>
        {workouts.length > 0 && <WorkoutList list={workouts} onPick={addWorkout} />}
        {favs.length > 0 && (
          <>
            <h3 class="list-title">{t('favourites')}</h3>
            <ExerciseList list={favs} onPick={pick} showCat />
          </>
        )}
        {recents.length > 0 && (
          <>
            <h3 class="list-title">{t('recent')}</h3>
            <ExerciseList list={recents} onPick={pick} showCat />
          </>
        )}
        {(favs.length > 0 || recents.length > 0 || workouts.length > 0) && <h3 class="list-title">{t('categories')}</h3>}
        <ul class="results">
          {categories.value.map((c) => (
            <li key={c.id} class="row-li">
              <button class="result entry" onClick={() => setCat(c.id)}>
                <Dot color={c.color} />
                <span class="entry-name">{c.name}</span>
                <span class="count">{counts.get(c.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <Sheet title={manage ? t('manageExercises') : routine ? `${t('addExercise')} · ${t('routines')}` : t('addExercise')}>
      <input class="search" type="search" placeholder={t('searchExercises')} aria-label={t('searchExercises')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      {body}
      <div class="pad actions">
        <button class="btn primary" onClick={() => open({ kind: 'editExercise', categoryId: cat ?? undefined, date: manage || routine ? undefined : date })}>
          + {t('newExercise')}
        </button>
        {manage && !query && (
          <button class="btn" onClick={() => (cat ? open({ kind: 'category', id: cat }) : open({ kind: 'category' }))}>
            {cat ? t('editCategory') : `+ ${t('newCategory')}`}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function ExerciseList({ list, onPick, showCat }: { list: Exercise[]; onPick: (e: Exercise) => void; showCat?: boolean }) {
  return (
    <ul class="results">
      {list.map((e) => (
        <li key={e.id} class="pick-row">
          <button class="result entry" onClick={() => onPick(e)}>
            {showCat && <Dot color={catById.value.get(e.categoryId)?.color} />}
            <span class="entry-name">{e.name}</span>
          </button>
          <button
            class={e.favorite ? 'star on' : 'star'}
            aria-pressed={!!e.favorite}
            aria-label={t('favourite')}
            onClick={() => void setFavorite(e, !e.favorite)}
          >
            {e.favorite ? '★' : '☆'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Adds an exercise (once) to a routine day with a default plan, then closes the picker. */
async function addToRoutine(e: Exercise, routineId: string, dayId: string) {
  const r = (await loadRoutines()).find((x) => x.id === routineId);
  if (r) {
    const days = r.days.map((d) =>
      d.id !== dayId || d.items.some((i) => i.exerciseId === e.id) ? d : { ...d, items: [...d.items, { exerciseId: e.id, sets: defaultPlan(e) }] },
    );
    await saveRoutine({ ...r, days });
  }
  history.back();
}

/** Saved workouts (routine days): one tap puts the whole workout on the day. */
function WorkoutList({ list, onPick }: { list: { r: Routine; d: RoutineDay }[]; onPick: (d: RoutineDay) => void }) {
  return (
    <>
      <h3 class="list-title">{t('workoutsSection')}</h3>
      <ul class="results">
        {list.map(({ r, d }) => (
          <li key={d.id}>
            <button class="result entry workout-row" onClick={() => onPick(d)} aria-label={`${t('addWorkout')}: ${d.name}`}>
              <span class="entry-name">
                <b>{d.name}</b>
                <span class="muted small"> · {r.name}</span>
              </span>
              <span class="count">
                {d.items.length} {t('exercises').toLowerCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
