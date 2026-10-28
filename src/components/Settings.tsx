import { useEffect, useState } from 'preact/hooks';
import { exportAll, importAll, validateBackup } from '../lib/backup';
import { isoDate } from '../lib/calc';
import { allSets, clearAll, importRows } from '../lib/db';
import { t, type Key } from '../lib/i18n';
import type { DistUnit, TrainingMode, WeightUnit } from '../lib/model';
import { setTheme, themeChoice, type ThemeChoice } from '../lib/theme';
import { open } from '../nav';
import { categories, catById, exById, exercises, reloadAll, reserveOrders, saveSettings, settings, toast } from '../state';

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
        <h2>{t('trainingMode')}</h2>
        <Choice<TrainingMode>
          label={t('trainingMode')}
          hideLabel
          options={[['standard', t('modeStandard')], ['dorian', t('modeDorian')], ['lyle', t('modeLyle')]]}
          value={s.mode}
          onPick={(mode) => void saveSettings({ mode })}
        />
        <p class="muted small">{t(s.mode === 'dorian' ? 'modeDorianHint' : s.mode === 'lyle' ? 'modeLyleHint' : 'modeStandardHint')}</p>
      </section>

      <section class="card">
        <h2>{t('logging')}</h2>
        <Check label="markDone" checked={s.markDone} onChange={(markDone) => void saveSettings({ markDone })} />
        <Check label="keepScreenOn" checked={s.keepScreenOn} onChange={(keepScreenOn) => void saveSettings({ keepScreenOn })} />
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
        <button class="btn wide" onClick={() => open({ kind: 'tools' })}>
          {t('tools')}
        </button>
      </section>

      <section class="card">
        <h2>{t('yourData')}</h2>
        <p class="muted small">{t('storedOnDevice')}</p>
        <Persistence />
        <div class="actions">
          <button class="btn" onClick={() => void backup()}>
            {t('exportBackup')}
          </button>
          <label class="btn file">
            {t('importBackup')}
            <input type="file" accept="application/json,.json" onChange={(e) => void restore(e.currentTarget)} />
          </label>
        </div>
        <div class="actions">
          <button class="btn" onClick={() => void exportCsv()}>
            {t('exportCsv')}
          </button>
          <label class="btn file">
            {t('importFitNotes')}
            <input type="file" accept="text/csv,.csv" onChange={(e) => void importCsv(e.currentTarget)} />
          </label>
        </div>
        <p class="muted small">{t('fitNotesHint')}</p>
        <button class="btn danger wide" onClick={() => void deleteAll()}>
          {t('deleteAll')}
        </button>
      </section>

      <section class="card">
        <h2>{t('about')}</h2>
        <p class="muted small">{t('aboutText')}</p>
      </section>
    </div>
  );
}

/** Whether the browser keeps the data even when space runs low (it can evict "best effort" storage). */
function Persistence() {
  const [kept, setKept] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setKept, () => setKept(null));
  }, []);
  if (kept == null) return null;
  return (
    <p class="muted small">
      {kept ? t('storageKept') : t('storageBestEffort')}{' '}
      {!kept && (
        <button
          class="link inline"
          onClick={() =>
            void navigator.storage.persist().then(
              (ok) => (setKept(ok), ok || toast(t('persistDenied'))),
              () => toast(t('persistDenied')),
            )
          }
        >
          {t('keepData')}
        </button>
      )}
    </p>
  );
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000); // slow phones may start the download late
}

async function exportCsv() {
  const [{ toCsv }, sets] = await Promise.all([import('../lib/csv'), allSets()]);
  const text = toCsv(sets, (id) => exById.value.get(id), (id) => catById.value.get(id), settings.value);
  download(`iron-notes-${isoDate(new Date())}.csv`, text, 'text/csv');
}

async function importCsv(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const { planImport } = await import('../lib/csv');
  const [text, sets] = await Promise.all([file.text(), allSets()]); // a storage error surfaces as such
  let plan;
  try {
    plan = planImport(text, { categories: categories.value, exercises: exercises.value, sets }, reserveOrders(text.split('\n').length));
  } catch {
    toast(t('notFitNotes'));
    return;
  }
  if (!plan.sets.length) {
    toast(t('nothingToImport', { dup: plan.duplicates }));
    return;
  }
  const summary = t('importSummary', {
    n: plan.sets.length, from: plan.first!, to: plan.last!, ex: plan.exercises.length, cat: plan.categories.length, dup: plan.duplicates, bad: plan.skipped,
  });
  if (!confirm(summary)) return;
  await importRows(plan.categories, plan.exercises, plan.sets);
  await reloadAll();
  toast(t('imported', { n: plan.sets.length }));
}

async function deleteAll() {
  if (!confirm(t('deleteAllQ'))) return;
  await backup(); // the last copy, in case it was a mistake
  // The download can't be verified from here (a browser may block it): ask once more after it started.
  if (!confirm(t('deleteAllAfterBackup'))) return;
  await clearAll();
  (await import('../body-state')).resetBody();
  await reloadAll(); // a first start again: the starter library comes back
  toast(t('deletedAll'));
}

async function backup() {
  const data = await exportAll();
  download(`iron-notes-${data.exported.slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
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
