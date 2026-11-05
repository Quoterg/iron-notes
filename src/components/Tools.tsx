// Calculators: estimated 1RM with a % table, plates per side, warm-up sets. In the user's weight unit;
// the bar and plate sizes are saved per unit (Settings stores them with the unit they were set in).
import { useState } from 'preact/hooks';
import { t, type Key } from '../lib/i18n';
import { cleanPlates, DEFAULT_PLATES, estimate, MAX_SIZES, MAX_TARGET, MIN_PLATE, MAX_PLATE, percentTable, platesPerSide, warmup } from '../lib/tools';
import { num, wToUser } from '../lib/units';
import { saveSettings, settings } from '../state';
import { Sheet } from './Sheet';

type Tab = 'orm' | 'plates' | 'warmup';
const TABS: Tab[] = ['orm', 'plates', 'warmup'];
const parse = (v: string) => (/^\d+([.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN);

export default function Tools({ weight, reps: initReps }: { weight?: number; reps?: number }) {
  const st = settings.value;
  const [tab, setTab] = useState<Tab>(weight ? 'plates' : 'orm');
  const [w, setW] = useState(weight ? num(wToUser(weight, st.unit), 2) : '');
  const [reps, setReps] = useState(initReps && initReps > 0 ? String(initReps) : '5');
  const cfg = st.plates?.unit === st.unit ? st.plates : { unit: st.unit, ...DEFAULT_PLATES[st.unit], sizes: [...DEFAULT_PLATES[st.unit].sizes] };
  const target = parse(w);
  const tooHeavy = target > MAX_TARGET;

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
        {tooHeavy && <p class="error-text">{t('tooHeavy', { max: `${MAX_TARGET} ${st.unit}` })}</p>}
        {Number.isFinite(target) && target > 0 && !tooHeavy && tab === 'orm' && <Orm weight={target} reps={Math.round(parse(reps))} unit={st.unit} formula={st.formula} />}
        {Number.isFinite(target) && target > 0 && !tooHeavy && tab === 'plates' && <Plates target={target} bar={cfg.bar} sizes={cfg.sizes} unit={st.unit} />}
        {Number.isFinite(target) && target > 0 && !tooHeavy && tab === 'warmup' && <Warmup target={target} bar={cfg.bar} sizes={cfg.sizes} unit={st.unit} />}
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
  const heaviest = Math.max(...sizes, 1);
  return (
    <div class="card">
      <h2>{t('perSide')}</h2>
      {r.plates.length ? (
        <div class="plates" aria-label={`${t('perSide')}: ${r.plates.join(', ')}`}>
          {r.plates.map((p, i) => (
            <span key={i} class="plate num" style={{ height: `${28 + Math.min(1, p / heaviest) * 52}px` }}>
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
      {target <= bar && <p class="muted small">{t('belowBar')}</p>}
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

/** Bar and plate sizes, saved for the current unit: plates as chips (× removes), added one at a time. */
function PlateSettings({ bar, sizes }: { bar: number; sizes: number[] }) {
  const st = settings.value;
  const [b, setB] = useState(num(bar, 2));
  const [add, setAdd] = useState('');
  const save = (nb: number, ns: number[]) => {
    const clean = cleanPlates(nb, ns);
    if (clean) void saveSettings({ plates: { unit: st.unit, ...clean } });
    return !!clean;
  };
  const badBar = !Number.isFinite(parse(b)) || !cleanPlates(parse(b), sizes);
  const newPlate = parse(add);
  const canAdd = Number.isFinite(newPlate) && newPlate >= MIN_PLATE && newPlate <= MAX_PLATE && !sizes.includes(newPlate) && sizes.length < MAX_SIZES;
  return (
    <details class="card">
      <summary>{t('plateSettings')}</summary>
      <div class="form">
        <label>
          {`${t('barWeight')} (${st.unit})`}
          <input type="text" inputMode="decimal" value={b} aria-invalid={badBar} onInput={(e) => setB(e.currentTarget.value)} onBlur={() => save(parse(b), sizes)} />
        </label>
        <span class="muted">{`${t('plateSizes')} (${st.unit})`}</span>
        <div class="chips">
          {sizes.map((p) => (
            <button
              key={p}
              class="chip"
              aria-label={`${t('removePlate')} ${num(p, 2)}`}
              disabled={sizes.length === 1}
              onClick={() => save(parse(b), sizes.filter((x) => x !== p))}
            >
              {num(p, 2)} ×
            </button>
          ))}
        </div>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAdd && save(parse(b), [...sizes, newPlate])) setAdd('');
          }}
        >
          <label>
            {t('addPlate')}
            <input type="text" inputMode="decimal" value={add} onInput={(e) => setAdd(e.currentTarget.value)} />
          </label>
          <button class="btn" disabled={!canAdd}>
            +
          </button>
        </form>
      </div>
    </details>
  );
}
