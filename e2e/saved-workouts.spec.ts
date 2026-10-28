import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

async function log(page: Page, search: string, name: string, sets: [string, string][]) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill(search);
  await page.getByRole('button', { name, exact: true }).click();
  for (const [w, r] of sets) {
    await page.getByLabel('Weight (kg)', { exact: true }).fill(w);
    await page.getByLabel('Reps', { exact: true }).fill(r);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(sheet(page).locator('.sets li').filter({ hasText: `${w} kg × ${r}` }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /Back/ }).click();
}

test('save a day as a workout, then add it to another day from the picker', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await log(page, 'flat barbell', 'Flat Barbell Bench Press', [['80', '10'], ['70', '12']]);
  await log(page, 'overhead press', 'Overhead Press', [['40', '8']]);

  // Save as workout: a new folder "My workouts" (no routines yet).
  await page.getByRole('button', { name: 'Save as workout' }).click();
  await sheet(page).getByLabel('Name').fill('Push A');
  await expect(sheet(page).getByLabel('Folder')).toHaveValue('');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Saved “Push A”.');

  // Today: the workout is at the top of Add exercise, and found by search.
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Add workout: Push A' })).toBeVisible();
  await page.getByRole('searchbox').fill('push');
  await sheet(page).getByRole('button', { name: 'Add workout: Push A' }).click();

  // Planned sets: reps from the workout, weights from last time set by set (the pyramid keeps its shape).
  const cards = page.locator('main .ex-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Flat Barbell Bench Press');
  await expect(cards.nth(0).locator('li.undone')).toHaveText(['80 kg × 10', '70 kg × 12']);
  await expect(cards.nth(1).locator('li.undone')).toHaveText(['40 kg × 8']);

  // It lives in the Routines tab as a folder with the workout as a day.
  await page.getByRole('button', { name: 'Routines', exact: true }).click();
  await expect(page.getByRole('button', { name: /My workouts/ })).toContainText('1 days');
});
