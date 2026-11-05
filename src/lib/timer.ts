// The rest timer: one at a time, shown above the tab bar on every screen. Counts from a stored end
// time, so it stays right when the phone throttles the page in the background.
import { t } from './i18n';
import { signal } from '@preact/signals';

/** End time (ms), or 0 when no timer runs. */
export const timerEnd = signal(0);
/** Seconds left (negative while "Rest over" shows). Updated 4× a second only while a timer runs. */
export const timerLeft = signal(0);

let tick: ReturnType<typeof setInterval> | undefined;
let alerted = false;
let audio: AudioContext | undefined;
let sound = true;
let notify = false;

/** Rest for an exercise: its own, else its category's, else the setting. */
export const restFor = (ex: { rest?: number } | undefined, cat: { rest?: number } | undefined, fallback: number): number =>
  ex?.rest ?? cat?.rest ?? fallback;

/** Whether the end of rest should also be a notification: the page can't be seen and it's allowed. */
export const shouldNotify = (enabled: boolean, hidden: boolean, permission: string | undefined): boolean =>
  enabled && hidden && permission === 'granted';

export function startTimer(seconds: number, withSound: boolean, withNotification = false): void {
  sound = withSound;
  notify = withNotification;
  // Created on the tap that started the timer: browsers only allow audio after a user gesture.
  if (withSound && !audio && typeof AudioContext === 'function') {
    try {
      audio = new AudioContext();
    } catch {
      audio = undefined;
    }
  }
  timerEnd.value = Date.now() + seconds * 1000;
  alerted = false;
  update();
  clearInterval(tick);
  tick = setInterval(update, 250);
}

export function addTime(seconds: number): void {
  if (!timerEnd.value) return;
  timerEnd.value = Math.max(Date.now() + 1000, timerEnd.value + seconds * 1000);
  alerted = false;
  update();
}

export function stopTimer(): void {
  clearInterval(tick);
  tick = undefined;
  timerEnd.value = 0;
  timerLeft.value = 0;
}

function update() {
  const left = Math.ceil((timerEnd.value - Date.now()) / 1000);
  timerLeft.value = left;
  if (left <= 0 && !alerted) {
    alerted = true;
    alert();
  }
  if (left <= -5) stopTimer(); // "Rest over" shows for 5 s
}

function alert() {
  navigator.vibrate?.([250, 120, 250]);
  // Hidden page or screen off: a system notification (vibrates and shows on the lock screen) through the
  // service worker; tapping it brings the app back (sw.js).
  if (typeof document !== 'undefined' && shouldNotify(notify, document.hidden, typeof Notification === 'undefined' ? undefined : Notification.permission)) {
    void navigator.serviceWorker?.ready.then((r) =>
      r.showNotification(t('restOver'), { tag: 'rest', renotify: true, silent: false, vibrate: [250, 120, 250], icon: 'icon-192.png' } as NotificationOptions),
    );
  }
  if (!sound || !audio) return;
  try {
    void audio.resume();
    for (const at of [0, 0.3]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, audio.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + at);
      o.stop(audio.currentTime + at + 0.25);
    }
  } catch {
    // No sound; the vibration and the bar still tell.
  }
}
