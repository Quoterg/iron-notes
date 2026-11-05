import { describe, expect, it } from 'vitest';
import { coreKeys } from '../i18n';
import { later } from '../strings-later';
import sv from './sv';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Swedish pack', () => {
  const english: Record<string, string> = { ...Object.fromEntries(coreKeys().map((k) => [k, k])), ...later };
  it('has every key and nothing else', () => {
    expect(Object.keys(sv.strings).sort()).toEqual(Object.keys(english).sort());
  });
  it('keeps the placeholders of every string', () => {
    for (const k of Object.keys(later)) expect([k, placeholders(sv.strings[k as keyof typeof sv.strings])]).toEqual([k, placeholders(english[k])]);
  });
});
