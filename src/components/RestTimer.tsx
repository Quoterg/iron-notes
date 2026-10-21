import { fmtTime } from '../lib/calc';
import { t } from '../lib/i18n';
import { addTime, stopTimer, timerEnd, timerLeft } from '../lib/timer';

/** The running rest timer, floating above the tab bar on every screen. */
export function RestTimer() {
  if (!timerEnd.value) return null;
  const left = timerLeft.value;
  const over = left <= 0;
  return (
    <div class={over ? 'timer over' : 'timer'} role="timer" aria-live={over ? 'assertive' : 'off'}>
      <span class="left">{over ? t('restOver') : fmtTime(left)}</span>
      {!over && (
        <>
          <button onClick={() => addTime(-15)} aria-label="−15 s">
            −15
          </button>
          <button onClick={() => addTime(15)} aria-label="+15 s">
            +15
          </button>
        </>
      )}
      <button onClick={stopTimer} aria-label={t('stopTimer')}>
        ✕
      </button>
    </div>
  );
}
