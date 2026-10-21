// Theme (same as Iron Log): Auto (follows the phone), Day ("Daylight") or Night ("Hologram"). Kept per
// device; the boot script in index.html (src/csp.ts THEME_BOOT) applies it before first paint.
import { signal } from '@preact/signals';

export type ThemeChoice = 'auto' | 'day' | 'night';
const KEY = 'iron-notes-theme';
const BAR = { day: '#eef1f8', night: '#050912' };

function saved(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'day' || t === 'night' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export const themeChoice = signal<ThemeChoice>(typeof document === 'undefined' ? 'auto' : saved());

const dark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Set the page's theme from a choice, including the browser bar colour. */
export function applyTheme(choice = themeChoice.value): void {
  const theme = choice === 'night' || (choice === 'auto' && dark()) ? 'night' : 'day';
  document.documentElement.setAttribute('data-theme', theme);
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.content = choice === 'auto' ? (m.media.includes('dark') ? BAR.night : BAR.day) : BAR[theme];
  }
}

export function setTheme(choice: ThemeChoice): void {
  themeChoice.value = choice;
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: applies until the app closes.
  }
  applyTheme(choice);
}

/** Auto follows the phone switching between light and dark while the app is open. */
export function watchSystemTheme(): void {
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (themeChoice.value === 'auto') applyTheme();
  });
}
