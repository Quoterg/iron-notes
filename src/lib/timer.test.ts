import { describe, expect, it } from 'vitest';
import { restFor, shouldNotify } from './timer';

describe('rest timer', () => {
  it('rest: the exercise’s own, else its category’s, else the setting', () => {
    expect(restFor({ rest: 45 }, { rest: 180 }, 90)).toBe(45);
    expect(restFor({}, { rest: 180 }, 90)).toBe(180);
    expect(restFor(undefined, undefined, 90)).toBe(90);
  });
  it('a notification only when enabled, the page is hidden and it is allowed', () => {
    expect(shouldNotify(true, true, 'granted')).toBe(true);
    expect(shouldNotify(true, false, 'granted')).toBe(false); // on screen: the bar and the beep
    expect(shouldNotify(false, true, 'granted')).toBe(false);
    expect(shouldNotify(true, true, 'denied')).toBe(false);
    expect(shouldNotify(true, true, undefined)).toBe(false); // no Notification API
  });
});
