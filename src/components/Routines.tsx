// The Routines tab: the user's routines; tap one to edit its days or log a day.
import { useEffect, useState } from 'preact/hooks';
import { uid } from '../lib/calc';
import { t } from '../lib/i18n';
import { open } from '../nav';
import { loadRoutines, routines, saveRoutine } from '../state';

export default function Routines() {
  const [name, setName] = useState('');
  useEffect(() => {
    void loadRoutines();
  }, []);
  const list = routines.value;

  async function create(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const id = uid();
    const order = Math.max(-1, ...(list ?? []).map((r) => r.order)) + 1;
    await saveRoutine({ id, name: n, order, days: [{ id: uid(), name: t('dayN', { n: 1 }), items: [] }] });
    setName('');
    open({ kind: 'routine', id });
  }

  return (
    <>
      {list == null && <p class="muted center">{t('loading')}</p>}
      {list?.length === 0 && <p class="muted center">{t('noRoutines')}</p>}
      {list && list.length > 0 && (
        <ul class="card entries routine-list">
          {list.map((r) => (
            <li key={r.id}>
              <button class="entry" onClick={() => open({ kind: 'routine', id: r.id })}>
                <span class="entry-name">{r.name}</span>
                <span class="count">
                  {r.days.length} {t('days')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form class="row new-row" onSubmit={create}>
        <label>
          {t('newRoutine')}
          <input type="text" value={name} placeholder={t('routineName')} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <button class="btn primary" disabled={!name.trim()}>
          + {t('newRoutine')}
        </button>
      </form>
    </>
  );
}
