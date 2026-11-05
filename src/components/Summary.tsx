// A workout's summary (M26): duration, sets, volume, effective reps, records and the muscles that met the
// goal — shared as text, or as an image drawn on a canvas (no image files, nothing outside the app: the
// strict CSP stays as it is).
import { useEffect, useState } from 'preact/hooks';
import { dayTotals, parseIso } from '../lib/calc';
import { effectiveOf } from '../effort';
import { setsOn } from '../lib/db';
import { catName, exName, type Key, locale, t } from '../lib/i18n';
import { loadOf, volumeWeight } from '../lib/load';
import type { WorkoutSet } from '../lib/model';
import { workoutText } from '../lib/share';
import { fmtDuration, summaryOf, type Summary as Data } from '../lib/summary';
import { weight } from '../lib/units';
import { dayMuscles, GOALS, statusOf } from '../lib/volume';
import { byOrder } from '../lib/calc';
import { catById, date as shownDate, dayComment, daySets, exById, loadRecords, records, settings, toast } from '../state';
import { Sheet } from './Sheet';

export default function Summary({ date }: { date: string }) {
  const st = settings.value;
  const [sets, setSets] = useState<WorkoutSet[] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const all = (date === shownDate.value ? daySets.value : await setsOn(date)).filter((s) => !s.planned && exById.value.has(s.exerciseId));
      const ids = [...new Set(all.map((s) => s.exerciseId))];
      await loadRecords(ids);
      const eff = await effectiveOf(all);
      const goal = GOALS[st.mode];
      const muscles = dayMuscles(all, (id) => exById.value.get(id)?.muscles, (s) => eff(s).n, goal).map((m) => {
        const n = m.direct + m.indirect;
        return { muscle: m.muscle, n, met: m.main && (!goal || statusOf(n, goal) !== 'under') };
      });
      const recordIds = new Set(ids.flatMap((id) => [...(records.value.get(id) ?? [])]));
      const volume = dayTotals(all, (s) => volumeWeight(s.weight, loadOf(exById.value.get(s.exerciseId)))).volume;
      if (!live) return;
      setSets(all.sort(byOrder));
      setData(summaryOf({ sets: all, volume, effective: (s) => eff(s).n, recordIds, muscles }));
    })();
    return () => {
      live = false;
    };
  }, [date, st.mode]);

  const title = parseIso(date).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const stats = (d: Data): [string, string][] =>
    [
      d.duration != null ? [t('duration'), fmtDuration(d.duration)] : null,
      [t('statSets'), String(d.sets)],
      d.volume > 0 ? [t('statVolume'), weight(d.volume, st)] : null,
      d.effective > 0 ? [t('statEffective'), String(d.effective)] : null,
      d.records > 0 ? [t('records'), String(d.records)] : null,
    ].filter((x): x is [string, string] => !!x);
  const goalsText = (d: Data) => d.goalsMet.map((g) => `${t(`mu_${g.muscle}` as Key)} ${g.n}`).join(', ');

  function text(d: Data, list: WorkoutSet[]) {
    const groups = [...new Set(list.map((s) => s.exerciseId))].map((id) => ({ ex: exById.value.get(id)!, sets: list.filter((s) => s.exerciseId === id) }));
    const head = [stats(d).map(([k, v]) => `${k}: ${v}`).join(' · '), d.goalsMet.length ? `${t('goalsMet')}: ${goalsText(d)}` : ''].filter(Boolean).join('\n');
    return `${workoutText(title, groups, st, date === shownDate.value ? dayComment.value : '').replace(title, `${title}\n${head}`)}\n\n— Iron Notes`;
  }

  async function shareText(d: Data, list: WorkoutSet[]) {
    const body = text(d, list);
    try {
      if (navigator.share) return void (await navigator.share({ text: body }));
    } catch {
      return; // cancelled
    }
    try {
      await navigator.clipboard.writeText(body);
      toast(t('shared'));
    } catch {
      toast(t('shareFailed'));
    }
  }

  async function shareImage(d: Data, list: WorkoutSet[]) {
    const blob = await drawCard(title, stats(d), d.goalsMet.length ? `${t('goalsMet')}: ${goalsText(d)}` : '', exerciseLines(list));
    if (!blob) return toast(t('shareFailed'));
    const file = new File([blob], `iron-notes-${date}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) return void (await navigator.share({ files: [file] }));
    } catch {
      return; // cancelled
    }
    // No share sheet for files: save it.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  /** "Bench press — 3 sets · best 100 kg × 8" per exercise. */
  function exerciseLines(list: WorkoutSet[]): string[] {
    return [...new Set(list.map((s) => s.exerciseId))].map((id) => {
      const ex = exById.value.get(id)!;
      const ss = list.filter((s) => s.exerciseId === id);
      const best = ss.filter((s) => s.weight != null).sort((a, b) => b.weight! - a.weight! || (b.reps ?? 0) - (a.reps ?? 0))[0];
      return `${exName(ex)} — ${ss.length} ${t('sets')}${best && best.weight! > 0 ? ` · ${weight(best.weight!, st)} × ${best.reps ?? '–'}` : ''}`;
    });
  }

  return (
    <Sheet title={t('summary')}>
      <div class="pad">
        <p class="muted small">{title}</p>
        {!data || !sets ? (
          <p class="muted center">{t('loading')}</p>
        ) : !sets.length ? (
          <p class="muted center">{t('emptyDay')}</p>
        ) : (
          <>
            <div class="stats-grid num">
              {stats(data).map(([k, v]) => (
                <div key={k} class="stat card">
                  <span class="stat-value">{v}</span>
                  <span class="muted small">{k}</span>
                </div>
              ))}
            </div>
            {data.goalsMet.length > 0 && (
              <section class="card">
                <h2>{t('goalsMet')}</h2>
                <div class="chips">
                  {data.goalsMet.map((g) => (
                    <span key={g.muscle} class="chip mu in">
                      {t(`mu_${g.muscle}` as Key)} {g.n}
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section class="card">
              <h2>{t('exercises')}</h2>
              <ul class="entries">
                {exerciseLines(sets).map((l) => (
                  <li key={l} class="entry entry-static">
                    <span class="entry-name">{l}</span>
                  </li>
                ))}
              </ul>
              <p class="muted small">{[...new Set(sets.map((s) => exById.value.get(s.exerciseId)?.categoryId))].map((c) => (c && catById.value.get(c) ? catName(catById.value.get(c)!) : '')).filter(Boolean).join(' · ')}</p>
            </section>
            <div class="actions">
              <button class="btn" onClick={() => void shareText(data, sets)}>
                {t('shareText')}
              </button>
              <button class="btn primary" onClick={() => void shareImage(data, sets)}>
                {t('shareImage')}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** The summary card as a PNG, drawn with the theme's colours (1080 × 1350, a common share size). */
function drawCard(title: string, stats: [string, string][], goals: string, lines: string[]): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return Promise.resolve(null);
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = v('--bg', '#050912');
  const text = v('--text', '#e6fffa');
  const muted = v('--muted', '#8a94a6');
  const accent = v('--accent', '#2bffcf');
  const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = accent;
  g.font = font(40, true);
  g.fillText('Iron Notes', 72, 110);
  g.fillStyle = muted;
  g.font = font(34);
  g.fillText(title, 72, 165);
  // Stats in two columns.
  stats.forEach(([k, val], i) => {
    const x = 72 + (i % 2) * 480;
    const y = 280 + Math.floor(i / 2) * 150;
    g.fillStyle = text;
    g.font = font(72, true);
    g.fillText(val, x, y);
    g.fillStyle = muted;
    g.font = font(30);
    g.fillText(k, x, y + 46);
  });
  let y = 280 + Math.ceil(stats.length / 2) * 150 + 20;
  const wrap = (s: string, px: number, color: string, bold = false) => {
    g.font = font(px, bold);
    g.fillStyle = color;
    let line = '';
    for (const word of s.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > W - 144 && line) {
        g.fillText(line, 72, y);
        y += px * 1.35;
        line = word;
      } else line = next;
    }
    if (line) {
      g.fillText(line, 72, y);
      y += px * 1.35;
    }
  };
  if (goals) {
    wrap(goals, 34, accent, true);
    y += 20;
  }
  for (const l of lines.slice(0, 9)) {
    if (y > H - 80) break;
    wrap(l, 32, text);
  }
  if (lines.length > 9) wrap(`+ ${lines.length - 9}`, 30, muted);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}
