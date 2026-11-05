// One body measure: add an entry, its graph (with a 7-entry trend for body weight), and its entries.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { addEntry, entries, loadBody, loadEntries, metrics, removeEntry, removeMetric, renameMetric } from '../body-state';
import { isoDate, parseIso } from '../lib/calc';
import { fmtBody, fromUser, toUser, trend, unitOf } from '../lib/body';
import { locale, metricName, t } from '../lib/i18n';
import { num } from '../lib/units';
import { back } from '../nav';
import { settings, toast } from '../state';
import { LineChart } from './LineChart';
import { Sheet } from './Sheet';

const PAGE = 30;
/** Stable empty list (a fresh [] each render would re-run the chart memo). */
const EMPTY: never[] = [];
const longDate = (d: string) => parseIso(d).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default function MetricSheet({ id }: { id: string }) {
  useEffect(() => {
    void loadBody().then(() => loadEntries(id));
  }, [id]);
  const m = metrics.value?.find((x) => x.id === id);
  const list = entries.value.get(id) ?? EMPTY;
  const st = settings.value;
  const [value, setValue] = useState('');
  const [day, setDay] = useState(isoDate(new Date()));
  const [shown, setShown] = useState(PAGE);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  // Graph in display units, with the trend for body weight (where day-to-day noise is large).
  const chart = useMemo(() => {
    if (!m) return null;
    const pts = list.map((e) => ({ date: e.date, value: toUser(e.value, m.kind, st) }));
    const tr = m.kind === 'weight' && pts.length >= 3 ? trend(pts.map((p) => p.value)).map((v, i) => ({ date: pts[i].date, value: v })) : undefined;
    return { pts, tr };
  }, [list, m?.kind, st.unit]);

  if (!m) return <Sheet title={t('body')}>{null}</Sheet>;
  const unit = unitOf(m.kind, st);
  // Strict: "12abc" or "1,234.5" isn't a value (parseFloat would read 12 and 1.234).
  const parsed = /^\d+([.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;
  const today = isoDate(new Date());
  const valid = Number.isFinite(parsed) && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today;
  const last = list[list.length - 1];

  async function save(e: Event) {
    e.preventDefault();
    if (!valid) return;
    await addEntry(id, day, fromUser(parsed, m!.kind, st));
    setValue('');
  }

  return (
    <Sheet title={metricName(m)}>
      <div class="pad">
        <form class="card form" onSubmit={save}>
          <div class="grid2">
            <label>
              {unit ? `${t('value')} (${unit})` : t('value')}
              <input type="text" inputMode="decimal" value={value} placeholder={last ? num(toUser(last.value, m.kind, st), 1) : ''} onInput={(e) => setValue(e.currentTarget.value)} autoFocus />
            </label>
            <label>
              {t('dateCol')}
              <input type="date" value={day} max={today} onInput={(e) => setDay(e.currentTarget.value)} />
            </label>
          </div>
          <button class="btn primary wide" disabled={!valid}>
            {t('save')}
          </button>
        </form>

        {chart && chart.pts.length >= 2 && (
          <div class="card">
            <LineChart title={unit ? `${metricName(m)} (${unit})` : metricName(m)} points={chart.pts} trend={chart.tr} fmt={(v) => num(v, 1)} countWord={t('entriesCount')} />
          </div>
        )}

        {list.length > 0 && (
          <ul class="card entries routine-list">
            {[...list].reverse().slice(0, shown).map((e) => (
              <li key={e.id} class="entry-row">
                <span class="entry entry-static">
                  <span class="entry-name">{longDate(e.date)}</span>
                  <b class="num">{fmtBody(e.value, m.kind, st)}</b>
                </span>
                <button class="btn icon small" aria-label={`${t('delete')}: ${longDate(e.date)}`} onClick={async () => {
                    const undo = await removeEntry(e);
                    toast(t('entryDeleted'), { label: t('undo'), run: () => void undo() });
                  }}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {shown < list.length && (
          <button class="btn wide" onClick={() => setShown(shown + PAGE)}>
            {t('showMore')}
          </button>
        )}

        {renaming ? (
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void renameMetric(m, name.trim());
              setRenaming(false);
            }}
          >
            <label>
              {t('name')}
              <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
            </label>
            <button class="btn primary">{t('save')}</button>
          </form>
        ) : (
          <div class="actions">
            <button
              class="btn"
              onClick={() => {
                setName(m.name);
                setRenaming(true);
              }}
            >
              {t('rename')}
            </button>
            <button
              class="btn danger"
              onClick={async () => {
                if (!confirm(t('deleteMeasureQ', { n: list.length }))) return;
                await removeMetric(m.id);
                back();
              }}
            >
              {t('deleteMeasure')}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
