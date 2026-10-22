// Calculators: estimated 1RM with a % table, plates per side, warm-up sets. In the user's weight unit;
// the bar and plate sizes are saved per unit (Settings stores them with the unit they were set in).
import { useState } from 'preact/hooks';
import { t, type Key } from '../lib/i18n';
import { DEFAULT_PLATES, estimate, percentTable, platesPerSide, warmup } from '../lib/tools';
import { num, wToUser } from '../lib/units';
import { saveSettings, settings } from '../state';
import { Sheet } from './Sheet';

type Tab = 'orm' | 'plates' | 'warmup';
const TABS: Tab[] = ['orm', 'plates', 'warmup'];
const parse = (v: string) => (/^\d+([.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN);

export default function Tools({ weight }: { weight?: number }) {
  const st = settings.value;
  const [tab, setTab] = useState<Tab>(weight ? 'plates' : 'orm');
  const [w, setW] = useState(weight ? num(wToUser(weight, st.unit), 2) : '');
  const [reps, setReps] = useState('5');
  const cfg = st.plates?.unit === st.unit ? st.plates : { unit: st.unit, ...DEFAULT_PLATES[st.unit], sizes: [...DEFAULT_PLATES[st.unit].sizes] };
  const target = parse(w);

  return (
    <Sheet title={t('tools')}>
      <div class="pad">
        <div class="chips" role="group" aria-label={t('tools')}>
          {TABS.map((k) => (
            <button key={k} class={k === tab ? 'chip on' : 'chip'} aria-pressed={k === tab} onClick={() => setTab(k)}>
              {t(`tool_${k}` as Key)}
            </button>
          ))}
        </div>
        <div class="card form">
          <div class="grid2">
            <label>
              {`${t('weight')} (${st.unit})`}
              <input type="text" inputMode="decimal" value={w} onInput={(e) => setW(e.currentTarget.value)} />
            </label>
            {tab === 'orm' && (
              <label>
                {t('repsCol')}
                <input type="text" inputMode="numeric" value={reps} onInput={(e) => setReps(e.currentTarget.value)} />
              </label>
            )}
          </div>
        </div>
        {Number.isFinite(target) && target > 0 && tab === 'orm' && <Orm weight={target} reps={Math.round(parse(reps))} unit={st.unit} formula={st.formula} />}
        {Number.isFinite(target) && target > 0 && tab === 'plates' && <Plates target={target} bar={cfg.bar} sizes={cfg.sizes} unit={st.unit} />}
        {Number.isFinite(target) && target > 0 && tab === 'warmup' && <Warmup target={target} bar={cfg.bar} sizes={cfg.sizes} unit={st.unit} />}
        {tab !== 'orm' && <PlateSettings bar={cfg.bar} sizes={cfg.sizes} />}
      </div>
    </Sheet>
  );
}

function Orm({ weight, reps, unit, formula }: { weight: number; reps: number; unit: string; formula: 'epley' | 'brzycki' }) {
  if (!(reps >= 1)) return null;
  const orm = estimate(weight, reps, formula);
  return (
    <>
      <div class="card hero">
        <div class="hero-head">
          <span>{t('est1rm')}</span>
        </div>
        <div class="hero-num num">
          {num(orm, 1)} <small>{unit}</small>
        </div>
      </div>
      <div class="card">
        <table class="data num">
          <thead>
            <tr>
              <th>{t('repsCol')}</th>
              <th>%</th>
              <th>{t('weightCol')}</th>
            </tr>
          </thead>
          <tbody>
            {percentTable(orm, formula).map((r) => (
              <tr key={r.reps}>
                <td>{r.reps}</td>
                <td>{r.pct} %</td>
                <td>
                  {num(r.weight, 1)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Plates({ target, bar, sizes, unit }: { target: number; bar: number; sizes: number[]; unit: string }) {
  const r = platesPerSide(target, bar, sizes);
  return (
    <div class="card">
      <h2>{t('perSide')}</h2>
      {r.plates.length ? (
        <div class="plates" aria-label={`${t('perSide')}: ${r.plates.join(', ')}`}>
          {r.plates.map((p, i) => (
            <span key={i} class="plate num" style={{ height: `${28 + Math.min(1, p / sizes.reduce((a, b) => Math.max(a, b), 1)) * 52}px` }}>
              {num(p, 2)}
            </span>
          ))}
        </div>
      ) : (
        <p class="muted">{t('barOnly')}</p>
      )}
      <p class="muted small num">
        {t('barWeight')}: {num(bar, 2)} {unit}
        {r.rest > 0 && ` · ${t('cantLoad', { w: `${num(r.rest, 2)} ${unit}` })}`}
      </p>
    </div>
  );
}

function Warmup({ target, bar, sizes, unit }: { target: number; bar: number; sizes: number[]; unit: string }) {
  const sets = warmup(target, bar, sizes);
  return (
    <div class="card">
      <h2>{t('warmupSets')}</h2>
      <ol class="setlist">
        {sets.map((s, i) => (
          <li key={i} class="num">
            {num(s.weight, 2)} {unit} × {s.reps}
          </li>
        ))}
        <li class="num">
          <b>
            {num(target, 2)} {unit}
          </b>{' '}
          — {t('workingSet')}
        </li>
      </ol>
    </div>
  );
}

/** Bar and plate sizes, saved for the current unit. */
function PlateSettings({ bar, sizes }: { bar: number; sizes: number[] }) {
  const st = settings.value;
  const [b, setB] = useState(num(bar, 2));
  const [list, setList] = useState(sizes.join(', '));
  const save = () => {
    const nb = parse(b);
    const ns = list.split(/[;\s]+|,\s+/).map((x) => parse(x)).filter((x) => Number.isFinite(x) && x > 0);
    if (Number.isFinite(nb) && ns.length) void saveSettings({ plates: { unit: st.unit, bar: nb, sizes: [...new Set(ns)].sort((x, y) => y - x) } });
  };
  return (
    <details class="card">
      <summary>{t('plateSettings')}</summary>
      <div class="form grid2">
        <label>
          {`${t('barWeight')} (${st.unit})`}
          <input type="text" inputMode="decimal" value={b} onInput={(e) => setB(e.currentTarget.value)} onBlur={save} />
        </label>
        <label>
          {`${t('plateSizes')} (${st.unit})`}
          <input type="text" inputMode="decimal" value={list} onInput={(e) => setList(e.currentTarget.value)} onBlur={save} />
        </label>
      </div>
    </details>
  );
}
