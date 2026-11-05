// All UI strings go through t(). English only for now. Only the first screen's strings are here; the
// later screens' strings are a lazy chunk (strings-later.ts) that every lazy screen loads with its code
// (lazy.tsx), as in Iron Log. i18n.test.ts checks first-paint code only uses keys from here.
import { signal } from '@preact/signals';
import type { later as LaterTable } from './strings-later';

const core = {
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  prevDay: 'Previous day',
  nextDay: 'Next day',
  log: 'Log',
  settings: 'Settings',
  body: 'Body',
  loading: 'Loading…',
  loadFailed: "Couldn't load this screen.",
  retry: 'Try again',
  updateReady: 'A new version is ready.',
  restart: 'Restart',
  emptyDay: 'Nothing logged on this day.',
  startWorkout: 'Start a workout',
  addExercise: 'Add exercise',
  comment: 'Comment',
  workoutComment: 'Workout comment',
  editComment: 'Edit comment',
  sets: 'sets',
  volume: 'volume',
  record: 'Personal record',
  exercises: 'Exercises',
  restOver: 'Rest over',
  stopTimer: 'Stop timer',
  calendar: 'Calendar',
  copyPrevious: 'Copy a previous workout',
  moveUp: 'Move up',
  moveDown: 'Move down',
  routines: 'Routines',
  dbBlocked: 'Iron Notes is open in another tab or window. Close it to finish updating.',
  superset: 'Superset',
  ungroup: 'Ungroup',
  pickForSuperset: 'Pick the exercises to do in rotation.',
  selectExercise: 'Select',
  bwShort: 'BW',
  perHandShort: '/hand',
} as const;

type Later = typeof LaterTable;
export type Key = keyof typeof core | keyof Later;
let laterStrings: Partial<Later> = {};

/** Called by strings-later.ts when it loads. */
export function setLater(table: Later): void {
  laterStrings = table;
}

// ---- Language: English is built in; Swedish is a lazy pack (lang/sv.ts), loaded before it's shown ----
export type Lang = 'en' | 'sv';
interface Pack {
  strings: Partial<Record<Key, string>>;
  types: Record<string, string>;
  /** Starter names by their stored (English) name in lower case: exercises, categories, body measures. */
  exercises: Record<string, string>;
  categories: Record<string, string>;
  metrics: Record<string, string>;
}
let sv: Pack | null = null;
/** The language shown; components re-render when it changes (t() reads it). */
export const lang = signal<Lang>('en');

/** The phone's language if we have it (Norwegian reads Swedish), else English. */
export function detectLang(): Lang {
  const l = (typeof navigator === 'undefined' ? '' : navigator.language ?? '').toLowerCase().slice(0, 2);
  return l === 'sv' || l === 'nb' || l === 'nn' || l === 'no' ? 'sv' : 'en';
}

const LANG_KEY = 'iron-notes-lang';
/** The language used last on this device: a startup hint (settings stay the truth). */
export function lastLang(): Lang | undefined {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return l === 'en' || l === 'sv' ? l : undefined;
  } catch {
    return undefined;
  }
}

/** Loads the language's pack if needed, then shows it. */
export async function setLang(l: Lang): Promise<void> {
  if (l === 'sv' && !sv) sv = (await import('./lang/sv')).default;
  lang.value = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // private mode etc.: only the startup hint is lost
  }
}

/** Shows the stored language preference (unset = the phone's): at startup and after a restore or erase. */
export async function applyLang(pref: Lang | undefined): Promise<void> {
  const want = pref ?? detectLang();
  // A pack that can't load (offline before it was ever cached) leaves the UI in English.
  if (want !== lang.value) await setLang(want).catch(() => {});
}

/**
 * A string in every language loaded: English always (built in), Swedish when its pack is loaded. For
 * search, where lifters mix languages (a Swedish UI, English gym terms). Loads nothing itself.
 */
export function allLabels(key: Key): string[] {
  const en = (core as Record<string, string>)[key] ?? (laterStrings as Record<string, string>)[key] ?? key;
  const s = sv?.strings[key];
  return s && s !== en ? [en, s] : [en];
}

/** Keep the starter library's gym-English names even in Swedish (setting). */
export const gymEnglish = signal(false);
const shown = (table: 'exercises' | 'categories' | 'metrics', name: string) =>
  (lang.value === 'sv' && !(table === 'exercises' && gymEnglish.value) ? sv?.[table][name.toLowerCase()] : undefined) ?? name;
/**
 * Display names: a starter exercise, category or body measure in the UI language; anything the user
 * named or renamed as stored. Stored names never change (programs, imports and backups use them).
 */
export const exName = (e: { name: string }): string => shown('exercises', e.name);
export const catName = (c: { name: string }): string => shown('categories', c.name);
export const metricName = (m: { name: string }): string => shown('metrics', m.name);

/** Displayed numbers use a decimal comma in Swedish (inputs and CSV keep the dot). */
export const decimalComma = (): boolean => lang.value === 'sv';

/** The pack's exercise-type names (strings-later falls back to English). */
export const packTypes = (): Record<string, string> | undefined => (lang.value === 'sv' ? sv?.types : undefined);

export function t(key: Key, vars?: Record<string, string | number>): string {
  const pack = lang.value === 'sv' ? sv?.strings : undefined;
  let s: string = pack?.[key] ?? (core as Record<string, string>)[key] ?? (laterStrings as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Keys of the first screen's table (for tests). */
export const coreKeys = (): string[] => Object.keys(core);
/** The first screen's English strings (for tests). */
export const coreStrings = (): Record<string, string> => ({ ...core });

/** Locale for dates: Swedish when shown in Swedish, else the browser's. */
export const locale = (): string | undefined => (lang.value === 'sv' ? 'sv-SE' : undefined);
