import { expect, test } from '@playwright/test';

// Runs against the production build (`pnpm build` first) on an emulated Moto G4
// with a 4× CPU slowdown, to keep us honest about old phones.
test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('log sets, see records, survive reload and offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a workout' }).click();

  // Category → exercise, or search.
  await page.getByRole('button', { name: /Chest/ }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).click();

  const weight = page.getByLabel('Weight (kg)', { exact: true });
  await weight.fill('60');
  await page.getByLabel('Reps', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.sets li')).toHaveCount(1);
  await expect(page.locator('.sets li').first()).toContainText('60 kg × 8');
  // The rest timer starts after saving.
  await expect(page.getByRole('timer')).toBeVisible();

  // Steppers: +2.5 kg, then save a heavier set: a new record.
  await page.getByRole('button', { name: 'Weight (kg) +2.5' }).click();
  await expect(weight).toHaveValue('62.5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'New personal record!' })).toBeVisible();
  await expect(page.locator('.sets li')).toHaveCount(2);
  // 62.5 × 8 beats 60 × 8: only the newer set holds a record.
  await expect(page.locator('.sets li').nth(1).getByRole('img', { name: 'Personal record' })).toBeVisible();
  await expect(page.locator('.sets li').nth(0).getByRole('img', { name: 'Personal record' })).toHaveCount(0);

  // Select a set, edit it, update.
  await page.locator('.set-row').first().click();
  await page.getByLabel('Reps', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.locator('.sets li').first()).toContainText('60 kg × 10');

  // Back on the log: the exercise with its sets.
  await page.getByRole('button', { name: /Back/ }).click();
  const card = page.locator('.ex-card');
  await expect(card).toContainText('Flat Barbell Bench Press');
  await expect(card).toContainText('60 kg × 10');
  await expect(card).toContainText('62.5 kg × 8');

  // Persisted in IndexedDB.
  await page.reload();
  await expect(page.locator('.ex-card')).toContainText('62.5 kg × 8');

  // Works offline once the service worker has cached the app.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.ex-card')).toContainText('62.5 kg × 8');
  await page.locator('.ex-head').click();
  await expect(page.getByLabel('Reps', { exact: true })).toBeVisible();
});

test('a new exercise of another type, found by search', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('button', { name: '+ New exercise' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Farmer Walk');
  await page.getByLabel('Type', { exact: true }).selectOption('weight,distance');
  await page.getByRole('button', { name: 'Save' }).click();
  // Straight to logging it.
  await page.getByLabel('Weight (kg)', { exact: true }).fill('40');
  await page.getByLabel('Distance (km)', { exact: true }).fill('0,05');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.sets li').first()).toContainText('40 kg · 0.05 km');

  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByRole('searchbox').fill('farmer');
  await expect(page.getByRole('button', { name: 'Farmer Walk' })).toBeVisible();
});

/** The weight unit as stored in IndexedDB (runs in the page). */
const storedUnit = () =>
  new Promise<string | undefined>((resolve) => {
    const r = indexedDB.open('iron-notes');
    r.onsuccess = () => {
      const get = r.result.transaction('kv').objectStore('kv').get('settings');
      get.onsuccess = () => {
        resolve((get.result?.value as { unit?: string } | undefined)?.unit);
        r.result.close();
      };
    };
  });

test('theme and units in settings', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  // Reload only once the setting is stored (the write is async; on a slow runner a reload can beat it).
  await expect.poll(() => page.evaluate(storedUnit)).toBe('lb');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('no CSP violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('button', { name: /Legs/ }).click();
  await page.getByRole('button', { name: 'Barbell Squat' }).click();
  await expect(page.getByLabel('Reps', { exact: true })).toBeVisible();
  expect(violations).toEqual([]);
});
