import { afterEach, describe, expect, it } from 'vitest';
import { applyLang, catName, coreStrings, exName, gymEnglish, lang, metricName, t } from '../i18n';
import { defaultMetrics } from '../body';
import { starterLibrary } from '../seed';
import { dnum } from '../units';
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

describe('starter names in Swedish', () => {
  afterEach(() => {
    lang.value = 'en';
    gymEnglish.value = false;
  });
  it('every starter exercise, category and body measure has a Swedish name', () => {
    const { categories, exercises } = starterLibrary();
    for (const e of exercises) expect(sv.exercises[e.name.toLowerCase()], e.name).toBeTruthy();
    for (const c of categories) expect(sv.categories[c.name.toLowerCase()], c.name).toBeTruthy();
    for (const m of defaultMetrics()) expect(sv.metrics[m.name.toLowerCase()], m.name).toBeTruthy();
  });
  it('shown in Swedish; own names as stored; gym English by setting; decimal comma', async () => {
    await applyLang('sv');
    expect(exName({ name: 'Flat Barbell Bench Press' })).toBe('Bänkpress med skivstång');
    expect(exName({ name: 'My Odd Lift' })).toBe('My Odd Lift');
    expect(catName({ name: 'Legs' })).toBe('Ben');
    expect(metricName({ name: 'Body weight' })).toBe('Kroppsvikt');
    expect(dnum(82.5)).toBe('82,5');
    gymEnglish.value = true;
    expect(exName({ name: 'Flat Barbell Bench Press' })).toBe('Flat Barbell Bench Press');
    expect(catName({ name: 'Legs' })).toBe('Ben'); // categories stay Swedish
    await applyLang('en');
    expect(exName({ name: 'Flat Barbell Bench Press' })).toBe('Flat Barbell Bench Press');
    expect(dnum(82.5)).toBe('82.5');
  });
});

