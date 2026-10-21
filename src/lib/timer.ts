// The rest timer: one at a time, shown above the tab bar on every screen. Counts from a stored end
// time, so it stays right when the phone throttles the page in the background.
import { signal } from '@preact/signals';

/** End time (ms), or 0 when no timer runs. */
export const timerEnd = signal(0);
/** Seconds left (negative while "Rest over" shows). Updated 4× a second only while a timer runs. */
export const timerLeft = signal(0);

let tick: ReturnType<typeof setInterval> | undefined;
let alerted = false;
let audio: AudioContext | undefined;
let sound = true;

export function startTimer(seconds: number, withSound: boolean): void {
  sound = withSound;
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
