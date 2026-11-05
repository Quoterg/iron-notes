import { afterEach, describe, expect, it } from 'vitest';
import { applyLang, coreStrings, lang, t } from '../i18n';
import { later } from '../strings-later';
import sv from './sv';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const english: Record<string, string> = { ...coreStrings(), ...later };

describe('Swedish pack', () => {
  it('has every key and nothing else', () => {
    expect(Object.keys(sv.strings).sort()).toEqual(Object.keys(english).sort());
  });
  it('keeps the placeholders of every string (first screen and later screens)', () => {
    for (const k of Object.keys(english)) expect([k, placeholders(sv.strings[k as keyof typeof sv.strings])]).toEqual([k, placeholders(english[k])]);
  });
});

describe('switching language', () => {
  afterEach(() => {
    lang.value = 'en';
  });
  it('a stored preference shows at once (startup, restore, erase)', async () => {
    await applyLang('sv');
    expect(lang.value).toBe('sv');
    expect(t('startWorkout')).toBe('Starta ett pass');
    await applyLang('en');
    expect(t('startWorkout')).toBe('Start a workout');
  });
  it('without a loaded pack the UI stays English', () => {
    // As when the pack can't load offline: t() falls back to English, never to the key.
    expect(t('back')).toBe('Back');
  });
});
