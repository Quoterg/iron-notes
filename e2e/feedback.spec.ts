import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

async function dorian(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
}

async function logBench(page: Page, w: string, r: string) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await sheet(page).getByLabel('Weight (kg)', { exact: true }).fill(w);
  await sheet(page).getByLabel('Reps', { exact: true }).fill(r);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
}

async function days(page: Page, n: number) {
  const name = n < 0 ? 'Previous day' : 'Next day';
  for (let i = 0; i < Math.abs(n); i++) await page.getByRole('button', { name }).click();
}

async function openBench(page: Page) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
}

test('readiness before the first chest set; joint pain holds the weight and offers swaps', async ({ page }) => {
  await page.goto('./');
  await dorian(page);
  await days(page, -1);
  await logBench(page, '100', '12');
  await days(page, 1);
  await openBench(page);

  // At the top of the range: the weight would go up…
  await expect(sheet(page).locator('.target')).toContainText('Set 1 target: 102.5 kg');
  // …asked how chest feels first; still sore without a program: train other muscles.
  await expect(sheet(page).getByText('Recovered? Chest')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Still sore', exact: true }).click();
  await expect(sheet(page).locator('.hint')).toContainText('Still sore: train other muscles today');

  // Joint pain: no weight increase, swaps for the same muscle.
  await sheet(page).getByRole('button', { name: 'Joint pain', exact: true }).click();
  await expect(sheet(page).locator('.target')).toContainText('Set 1 target: 100 kg');
  await expect(sheet(page).locator('.target')).toContainText('Joint pain flagged: no weight increase.');
  await sheet(page).getByRole('button', { name: 'Swap: Incline Barbell Bench Press' }).click();
  await expect(page.getByRole('dialog', { name: 'Incline Barbell Bench Press' })).toBeVisible();
});

test('after a long gap the target starts at the last weight; stalled sessions get a suggestion', async ({ page }) => {
  await page.goto('./');
  await dorian(page);

  // Three sessions of 100 × 10, two days apart: stalled, and too close together.
  await days(page, -18);
  for (const step of [0, 2, 2]) {
    await days(page, step);
    await logBench(page, '100', '10');
  }
  // 14 days later (today): a long gap.
  await days(page, 14);
  await openBench(page);
  await expect(sheet(page).locator('.target')).toContainText('Set 1 target: 100 kg');
  await expect(sheet(page).locator('.target')).toContainText('14 days since last time');
  await expect(sheet(page).locator('.hint').filter({ hasText: 'No new best for two sessions' })).toContainText('only 2 days apart');
});
