import { describe, expect, it } from 'vitest';
import { isIos, needsIosInstallHint } from './ios';

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const SAFARI_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CHROME_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Moto G30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

describe('iOS install hint', () => {
  it('shows in Safari on an iPhone or iPad that is not installed yet', () => {
    expect(needsIosInstallHint(SAFARI_IPHONE, false)).toBe(true);
    expect(needsIosInstallHint(SAFARI_IPAD, false)).toBe(true);
  });

  it('is hidden once it runs from the Home Screen (navigator.standalone or display-mode)', () => {
    expect(needsIosInstallHint(SAFARI_IPHONE, true)).toBe(false);
  });

  it('is hidden in other iOS browsers and on other devices', () => {
    expect(needsIosInstallHint(CHROME_IPHONE, false)).toBe(false);
    expect(needsIosInstallHint(ANDROID_CHROME, false)).toBe(false);
    expect(needsIosInstallHint(MAC_SAFARI, false)).toBe(false);
    expect(needsIosInstallHint('', false)).toBe(false);
  });

  it('detects iPhone, iPod and iPad, not Android or desktop', () => {
    expect(isIos(SAFARI_IPHONE)).toBe(true);
    expect(isIos(SAFARI_IPAD)).toBe(true);
    expect(isIos(ANDROID_CHROME)).toBe(false);
    expect(isIos(MAC_SAFARI)).toBe(false);
  });
});
