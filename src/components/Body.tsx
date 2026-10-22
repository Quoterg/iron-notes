// The Body tab: every measure with its latest value and the change since the entry before; add a measure.
import { useEffect, useState } from 'preact/hooks';
import { addMetric, entries, loadBody, metrics } from '../body-state';
import { parseIso } from '../lib/calc';
import { fmtBody, latestChange, toUser } from '../lib/body';
import { t, type Key } from '../lib/i18n';
import type { BodyKind } from '../lib/model';
import { num } from '../lib/units';
import { open } from '../nav';
import { settings } from '../state';

const KINDS: BodyKind[] = ['weight', 'percent', 'length', 'number'];
const shortDate = (d: string) => parseIso(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function Body() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BodyKind>('length');
  useEffect(() => {
    void loadBody();
  }, []);
  const list = metrics.value;
  const st = settings.value;

  async function create(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    const m = await addMetric(name.trim(), kind);
    setName('');
    open({ kind: 'metric', id: m.id });
  }

  return (
    <>
      {list == null && <p class="muted center">{t('loading')}</p>}
      {list && list.length > 0 && (
        <ul class="card entries routine-list">
          {list.map((m) => {
            const lc = latestChange(entries.value.get(m.id) ?? []);
            const change = lc?.change != null ? toUser(lc.latest.value, m.kind, st) - toUser(lc.latest.value - lc.change, m.kind, st) : null;
            return (
              <li key={m.id}>
                <button class="entry" onClick={() => open({ kind: 'metric', id: m.id })}>
                  <span class="entry-name">{m.name}</span>
                  {lc ? (
                    <span class="num body-latest">
                      <b>{fmtBody(lc.latest.value, m.kind, st)}</b>
                      {change != null && change !== 0 && <span class={change > 0 ? 'delta up' : 'delta down'}> {change > 0 ? '+' : '−'}{num(Math.abs(change), 1)}</span>}
                      <span class="muted small"> · {shortDate(lc.latest.date)}</span>
                    </span>
                  ) : (
                    <span class="muted small">{t('noEntries')}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form class="card form" onSubmit={create}>
        <h2>{t('newMeasure')}</h2>
        <div class="grid2">
          <label>
            {t('name')}
            <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <div class="col">
            <label for="m-kind">{t('measureKind')}</label>
            <select id="m-kind" value={kind} onChange={(e) => setKind(e.currentTarget.value as BodyKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}` as Key)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button class="btn primary wide" disabled={!name.trim()}>
          + {t('newMeasure')}
        </button>
      </form>
    </>
  );
}
