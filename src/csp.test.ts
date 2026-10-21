import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP, THEME_BOOT, THEME_BOOT_HASH } from './csp';

describe('CSP', () => {
  it('allows the inline theme boot script by its hash, and nothing else inline', () => {
    const hash = 'sha256-' + createHash('sha256').update(THEME_BOOT).digest('base64');
    expect(THEME_BOOT_HASH).toBe(hash);
    const html = readFileSync('index.html', 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline).toEqual([THEME_BOOT]);
    expect(CSP).not.toContain('unsafe-inline');
    expect(CSP).not.toContain('unsafe-eval');
  });
});
