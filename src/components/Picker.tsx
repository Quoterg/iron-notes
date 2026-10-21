// Categories → exercises, with search across all. Picks an exercise to log on `date`, or (manage)
// opens exercises and categories for editing.
import { useState } from 'preact/hooks';
import { t } from '../lib/i18n';
import type { Exercise } from '../lib/model';
import { open, replaceTop } from '../nav';
import { catById, categories, exercises } from '../state';
import { Dot } from './icons';
import { Sheet } from './Sheet';

/** Lower case without accents, so "presse" finds "Pressé". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Picker({ date, manage }: { date?: string; manage?: boolean }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const query = fold(q.trim());

  const pick = (e: Exercise) => {
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
    body = hits.length ? <ExerciseList list={hits} onPick={pick} showCat /> : <p class="pad muted">{t('noMatches')}</p>;
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
    body = (
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
    );
  }

  return (
    <Sheet title={manage ? t('manageExercises') : t('addExercise')}>
      <input class="search" type="search" placeholder={t('searchExercises')} aria-label={t('searchExercises')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      {body}
      <div class="pad actions">
        <button class="btn primary" onClick={() => open({ kind: 'editExercise', categoryId: cat ?? undefined, date: manage ? undefined : date })}>
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
        <li key={e.id}>
          <button class="result entry" onClick={() => onPick(e)}>
            {showCat && <Dot color={catById.value.get(e.categoryId)?.color} />}
            <span class="entry-name">{e.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
