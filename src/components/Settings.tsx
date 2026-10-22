import { exportAll, importAll, validateBackup } from '../lib/backup';
import { t, type Key } from '../lib/i18n';
import type { DistUnit, WeightUnit } from '../lib/model';
import { setTheme, themeChoice, type ThemeChoice } from '../lib/theme';
import { open } from '../nav';
import { reloadAll, saveSettings, settings, toast } from '../state';

function Choice<T extends string>(p: { label: string; options: [T, string][]; value: T; onPick: (v: T) => void; hideLabel?: boolean }) {
  const { label, options, value, onPick } = p;
  return (
    <>
      {!p.hideLabel && <p class="muted small">{label}</p>}
      <div class="chips" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} class={v === value ? 'chip on' : 'chip'} aria-pressed={v === value} onClick={() => onPick(v)}>
            {l}
          </button>
        ))}
      </div>
    </>
  );
}

function Check({ label, checked, onChange }: { label: Key; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      {t(label)}
    </label>
  );
}

export default function Settings() {
  const s = settings.value;
  return (
    <div class="form">
      <section class="card">
        <h2>{t('units')}</h2>
        <Choice<WeightUnit> label={t('weightUnit')} options={[['kg', 'kg'], ['lb', 'lb']]} value={s.unit} onPick={(unit) => void saveSettings({ unit })} />
        <Choice<DistUnit> label={t('distanceUnit')} options={[['km', 'km'], ['mi', 'mi'], ['m', 'm']]} value={s.dist} onPick={(dist) => void saveSettings({ dist })} />
      </section>

      <section class="card">
        <h2>{t('appearance')}</h2>
        <Choice<ThemeChoice>
          label={t('appearance')}
          hideLabel
          options={[['auto', t('themeAuto')], ['day', t('themeDay')], ['night', t('themeNight')]]}
          value={themeChoice.value}
          onPick={setTheme}
        />
      </section>

      <section class="card">
        <h2>{t('timer')}</h2>
        <label>
          {t('defaultRest')}
          <input
            type="number"
            min="5"
            step="5"
            inputMode="numeric"
            value={s.rest}
            onChange={(e) => {
              const v = parseInt(e.currentTarget.value, 10);
              if (v > 0) void saveSettings({ rest: v });
            }}
          />
        </label>
        <Check label="autoTimer" checked={s.autoTimer} onChange={(autoTimer) => void saveSettings({ autoTimer })} />
        <Check label="timerSound" checked={s.timerSound} onChange={(timerSound) => void saveSettings({ timerSound })} />
      </section>

      <section class="card">
        <h2>{t('logging')}</h2>
        <Check label="markDone" checked={s.markDone} onChange={(markDone) => void saveSettings({ markDone })} />
        <Choice<'1' | '0'>
          label={t('weekStart')}
          options={[['1', t('monday')], ['0', t('sunday')]]}
          value={String(s.weekStart) as '1' | '0'}
          onPick={(v) => void saveSettings({ weekStart: v === '0' ? 0 : 1 })}
        />
        <Choice<'epley' | 'brzycki'>
          label={t('formula')}
          options={[['epley', 'Epley'], ['brzycki', 'Brzycki']]}
          value={s.formula}
          onPick={(formula) => void saveSettings({ formula })}
        />
        <button class="btn wide" onClick={() => open({ kind: 'library' })}>
          {t('manageExercises')}
        </button>
      </section>

      <section class="card">
        <h2>{t('yourData')}</h2>
        <p class="muted small">{t('storedOnDevice')}</p>
        <div class="actions">
          <button class="btn" onClick={() => void backup()}>
            {t('exportBackup')}
          </button>
          <label class="btn file">
            {t('importBackup')}
            <input type="file" accept="application/json,.json" onChange={(e) => void restore(e.currentTarget)} />
          </label>
        </div>
      </section>

      <section class="card">
        <h2>{t('about')}</h2>
        <p class="muted small">{t('aboutText')}</p>
      </section>
    </div>
  );
}

async function backup() {
  const data = await exportAll();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `iron-notes-${data.exported.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function restore(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !confirm(t('importQ'))) return;
  let data: unknown;
  try {
    data = validateBackup(JSON.parse(await file.text()));
  } catch {
    toast(t('notBackup'));
    return;
  }
  await backup(); // the current data first: a restore can't be undone otherwise
  try {
    await importAll(data);
  } catch {
    toast(t('notBackup'));
    return;
  }
  await reloadAll();
  (await import('../body-state')).resetBody();
  toast(t('restored'));
}
