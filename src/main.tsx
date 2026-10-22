import { render } from 'preact';
import { App, calendarView, commentView, copyView, editExerciseView, exerciseView, pickView, routinesView, bodyView, settingsView } from './app';
import { isoDate } from './lib/calc';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { initNav, open } from './nav';
import { setBlockedHandler } from './lib/db';
import { t } from './lib/i18n';
import { date, loadDay, loadLibrary, loadSettings, updateReady } from './state';
import './styles.css';

async function start() {
  initNav();
  // An older version open in another tab blocks a database upgrade, and with it the first render: a
  // plain-DOM notice (the app isn't rendered yet), removed once the database opens.
  setBlockedHandler(() => {
    if (document.getElementById('db-blocked')) return;
    const p = document.createElement('p');
    p.id = 'db-blocked';
    p.className = 'update-bar';
    p.setAttribute('role', 'alert');
    p.textContent = t('dbBlocked');
    document.body.prepend(p);
  });
  applyTheme(); // the boot script already set it; this also sets the bar colour
  watchSystemTheme();
  performance.mark('in:start');
  await Promise.all([loadSettings(), loadLibrary()]);
  document.getElementById('db-blocked')?.remove();
  performance.mark('in:library');
  render(<App />, document.getElementById('app')!);
  performance.mark('in:render'); // measured by e2e tests
  await loadDay(date.value);
  performance.mark('in:day');
  runShortcut();
  // Back in the foreground on a new day: show today.
  let shownToday = isoDate(new Date());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const today = isoDate(new Date());
    if (today !== shownToday && date.value === shownToday) void loadDay(today);
    shownToday = today;
  });
  // The other screens when idle, one at a time, so they open instantly and work offline.
  const workoutChunk = { prefetch: () => import('./workout').then(() => {}) };
  idle(() => prefetchInTurn([pickView, exerciseView, editExerciseView, commentView, calendarView, copyView, routinesView, bodyView, settingsView, workoutChunk]));
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    navigator.serviceWorker.addEventListener('message', (e) => {
      if ((e.data as { type?: string } | null)?.type === 'update-ready') updateReady.value = true;
    });
    navigator.serviceWorker.controller?.postMessage({ type: 'update?' });
  }
  // Ask the browser not to evict our local data (matters on iOS/low-storage devices).
  void navigator.storage?.persist?.();
}

/** Home-screen shortcut (manifest.webmanifest): `?add` opens the exercise picker for today. */
function runShortcut() {
  const q = new URLSearchParams(location.search);
  if (!q.has('add')) return;
  history.replaceState(history.state, '', location.pathname + location.hash);
  open({ kind: 'pick', date: date.value });
}

function prefetchInTurn(views: { prefetch: () => Promise<void> }[]) {
  const next = () => {
    const v = views.shift();
    if (v) idle(() => void v.prefetch().finally(next), 300);
  };
  next();
}

function idle(fn: () => void, timeout = 2000) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 300);
}

void start();
