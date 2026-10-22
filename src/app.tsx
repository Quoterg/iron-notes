import { addDays, isoDate, parseIso } from './lib/calc';
import { t } from './lib/i18n';
import { Log } from './components/Log';
import { RestTimer } from './components/RestTimer';
import { lazyView } from './lazy';
import { stack, top, type Screen } from './nav';
import { date, loadDay, toastAction, toastText, updateReady, view, type View } from './state';

const TABS: View[] = ['log', 'calendar', 'routines', 'body', 'settings'];

// Not needed for the first screen: split out and prefetched when idle (main.tsx).
export const pickView = lazyView(() => import('./components/Picker'));
export const exerciseView = lazyView(() => import('./components/ExerciseScreen'));
export const editExerciseView = lazyView(() => import('./components/ExerciseEditor'));
export const categoryView = lazyView(() => import('./components/CategoryEditor'));
export const commentView = lazyView(() => import('./components/CommentSheet'));
export const copyView = lazyView(() => import('./components/CopySheet'));
export const routinesView = lazyView(() => import('./components/Routines'));
export const bodyView = lazyView(() => import('./components/Body'));
export const analysisView = lazyView(() => import('./components/Analysis'));
export const toolsView = lazyView(() => import('./components/Tools'));
export const metricView = lazyView(() => import('./components/MetricSheet'));
export const routineView = lazyView(() => import('./components/RoutineSheet'));
export const routineDayView = lazyView(() => import('./components/RoutineDaySheet'));
export const settingsView = lazyView(() => import('./components/Settings'));
export const calendarView = lazyView(() => import('./components/Calendar'));

const PREFETCH: Partial<Record<View, () => void>> = {
  settings: () => void settingsView.prefetch(),
  calendar: () => void calendarView.prefetch(),
  routines: () => void routinesView.prefetch(),
  body: () => void bodyView.prefetch(),
};

export function App() {
  const s = top.value;
  return (
    <>
      {/* Stays rendered under the full-screen sheet so its scroll position survives. */}
      <div aria-hidden={!!s}>
        <header class="top">{view.value === 'log' ? <DateNav /> : <h1>{t(view.value)}</h1>}</header>
        {updateReady.value && (
          <p class="update-bar" role="status">
            <span>{t('updateReady')}</span>
            <button class="btn small" onClick={() => location.reload()}>
              {t('restart')}
            </button>
          </p>
        )}
        <main onTouchStart={view.value === 'log' ? swipeStart : undefined} onTouchEnd={view.value === 'log' ? swipeEnd : undefined}>
          {view.value === 'log' && <Log />}
          {view.value === 'calendar' && <calendarView.Lazy />}
          {view.value === 'routines' && <routinesView.Lazy />}
          {view.value === 'body' && <bodyView.Lazy />}
          {view.value === 'settings' && <settingsView.Lazy />}
        </main>
        <nav class="tabs">
          {TABS.map((v) => (
            <button key={v} class={view.value === v ? 'active' : ''} onPointerDown={PREFETCH[v]} onClick={() => (view.value = v)}>
              {t(v)}
            </button>
          ))}
        </nav>
      </div>
      {/* Every sheet in the stack stays mounted (only the top is shown), so going back restores it. */}
      {stack.value.map((screen, i) => (
        <div key={i} hidden={i !== stack.value.length - 1}>
          <ScreenView screen={screen} />
        </div>
      ))}
      <RestTimer />
      {toastText.value && (
        <p class="toast" role="status">
          {toastText.value}
          {toastAction.value && (
            <button
              class="toast-action"
              onClick={() => {
                const a = toastAction.value!;
                toastText.value = '';
                toastAction.value = null;
                a.run();
              }}
            >
              {toastAction.value.label}
            </button>
          )}
        </p>
      )}
    </>
  );
}

function ScreenView({ screen: s }: { screen: Screen }) {
  switch (s.kind) {
    case 'pick':
      return <pickView.Lazy date={s.date} routine={s.routine} />;
    case 'tools':
      return <toolsView.Lazy weight={s.weight} />;
    case 'analysis':
      return <analysisView.Lazy />;
    case 'metric':
      return <metricView.Lazy id={s.id} />;
    case 'routine':
      return <routineView.Lazy id={s.id} />;
    case 'routineDay':
      return <routineDayView.Lazy routineId={s.routineId} dayId={s.dayId} />;
    case 'library':
      return <pickView.Lazy manage />;
    case 'exercise':
      return <exerciseView.Lazy key={s.id + s.date} id={s.id} date={s.date} />;
    case 'editExercise':
      return <editExerciseView.Lazy id={s.id} categoryId={s.categoryId} date={s.date} />;
    case 'category':
      return <categoryView.Lazy id={s.id} />;
    case 'comment':
      return <commentView.Lazy date={s.date} />;
    case 'copy':
      return <copyView.Lazy date={s.date} />;
  }
}

// Swipe left/right on the log to change day.
let x0: number | null = null;
let y0 = 0;
function swipeStart(e: TouchEvent) {
  x0 = e.touches[0].clientX;
  y0 = e.touches[0].clientY;
}
function swipeEnd(e: TouchEvent) {
  if (x0 == null) return;
  const dx = e.changedTouches[0].clientX - x0;
  const dy = e.changedTouches[0].clientY - y0;
  x0 = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) void loadDay(addDays(date.value, dx < 0 ? 1 : -1));
}

function DateNav() {
  const d = date.value;
  return (
    <div class="datenav">
      <button class="btn icon" aria-label={t('prevDay')} onClick={() => void loadDay(addDays(d, -1))}>
        ‹
      </button>
      <button class="date" onClick={() => void loadDay(isoDate(new Date()))}>
        {dayLabel(d)}
      </button>
      <button class="btn icon" aria-label={t('nextDay')} onClick={() => void loadDay(addDays(d, 1))}>
        ›
      </button>
    </div>
  );
}

export function dayLabel(d: string): string {
  const today = isoDate(new Date());
  if (d === today) return t('today');
  if (d === addDays(today, -1)) return t('yesterday');
  if (d === addDays(today, 1)) return t('tomorrow');
  return parseIso(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
