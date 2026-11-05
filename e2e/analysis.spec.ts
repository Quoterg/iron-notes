import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

async function log(page: Page, search: string, name: string, sets: [string, string][]) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill(search);
  await page.getByRole('button', { name, exact: true }).click();
  // Wait for the history (prefill) before typing: a late prefill mid-fill would append to the value.
  await expect(page.locator('div:not([hidden]) > .sheet').getByText('No sets logged yet.').or(page.locator('div:not([hidden]) > .sheet .sets li').first())).toBeVisible();
  for (const [w, r] of sets) {
    await page.getByLabel('Weight (kg)', { exact: true }).fill(w);
    await page.getByLabel('Reps', { exact: true }).fill(r);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('div:not([hidden]) > .sheet .sets li').filter({ hasText: `${w} kg × ${r}` }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /Back/ }).click();
}

test('statistics: totals, categories and top exercises for a period', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await log(page, 'flat barbell', 'Flat Barbell Bench Press', [['80', '8'], ['80', '8']]);
  await page.getByRole('button', { name: 'Next day' }).click();
  await log(page, 'flat barbell', 'Flat Barbell Bench Press', [['85', '5']]);
  await log(page, 'barbell squat', 'Barbell Squat', [['100', '5']]);

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Statistics' }).click();
  const sheet = page.locator('div:not([hidden]) > .sheet');
  const stats = sheet.locator('.stats-grid');
  await expect(stats).toContainText('2Workouts');
  await expect(stats).toContainText('4Sets');
  await expect(stats).toContainText('26Reps');
  await expect(stats).toContainText(`${80 * 16 + 85 * 5 + 100 * 5} kg`);
  await expect(sheet.locator('.cat-bars li').first()).toContainText('Chest');
  await expect(sheet.locator('.cat-bars li').first()).toContainText('3');
  await sheet.getByRole('button', { name: 'Volume', exact: true }).click();
  await expect(sheet.locator('.cat-bars li').first()).toContainText('1705 kg');
  // Bench: two workouts; best e1RM went from 101.3 kg (80 × 8) to 99.2 kg (85 × 5): −2.1 %.
  const bench = sheet.locator('.entries li').first();
  await expect(bench).toContainText('Flat Barbell Bench Press');
  await expect(bench).toContainText('2 ×');
  await expect(bench).toContainText('−2.1 %');

  // This week only (yesterday may belong to it or not): at least today's workout.
  await sheet.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(stats).toContainText('Workouts');

  // Tapping a top exercise opens its exercise screen.
  await sheet.locator('.entries button').first().click();
  await expect(sheet.getByRole('button', { name: 'Records' })).toBeVisible();
});

test('statistics: effective reps for the period and per muscle', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  // Three heavy sets to failure: 8 effective reps each (chest direct; triceps and front delts half).
  await log(page, 'flat barbell', 'Flat Barbell Bench Press', [['100', '8'], ['100', '8'], ['100', '8']]);

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Statistics' }).click();
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await expect(sheet.locator('.stat').filter({ hasText: 'Effective reps' })).toContainText('24');
  const rows = sheet.locator('.mu-bars li');
  await expect(rows.first()).toContainText('Chest');
  await expect(rows.first().locator('.mu-num')).toHaveText('24');
  await expect(rows.first()).toContainText('1 main session');
  await expect(rows.filter({ hasText: 'Triceps' }).locator('.mu-num')).toHaveText('12');
});

