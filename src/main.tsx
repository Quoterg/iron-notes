import { render } from 'preact';
import { App, calendarView, commentView, copyView, editExerciseView, exerciseView, pickView, settingsView } from './app';
import { isoDate } from './lib/calc';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { initNav, open } from './nav';
import { date, loadDay, loadLibrary, loadSettings, updateReady } from './state';
import './styles.css';

async function start() {
  initNav();
  applyTheme(); // the boot script already set it; this also sets the bar colour
  watchSystemTheme();
  performance.mark('in:start');
  await Promise.all([loadSettings(), loadLibrary()]);
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
  idle(() => prefetchInTurn([pickView, exerciseView, editExerciseView, commentView, calendarView, copyView, settingsView]));
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
