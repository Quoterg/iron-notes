import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

async function days(page: Page, n: number) {
  const name = n < 0 ? 'Previous day' : 'Next day';
  for (let i = 0; i < Math.abs(n); i++) await page.getByRole('button', { name }).click();
}

async function bench(page: Page, w: string, r: string) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(sheet(page).getByText('No sets logged yet.')).toBeVisible();
  await sheet(page).getByLabel('Weight (kg)', { exact: true }).fill(w);
  await sheet(page).getByLabel('Reps', { exact: true }).fill(r);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
}

test('review the last weeks: strength, muscles, and a one-tap swap in the program', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // Three sessions of 100 × 10: no progress.
  await days(page, -9);
  for (const step of [0, 4, 4]) {
    await days(page, step);
    await bench(page, '100', '10');
  }
  // The day as the program's workout.
  await page.getByRole('button', { name: 'Save as workout' }).click();
  await sheet(page).getByLabel('Name').fill('Push');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Saved “Push”.');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await sheet(page).getByLabel('Program').selectOption({ label: 'My workouts' });
  await page.getByRole('button', { name: /Back/ }).click();

  await page.getByRole('button', { name: 'Review the last weeks' }).click();
  await expect(sheet(page).locator('.entries li').first()).toContainText('Flat Barbell Bench Press');
  await expect(sheet(page).locator('.entries li').first()).toContainText('±0 %');
  await expect(sheet(page).locator('.mu-bars li').first()).toContainText('Chest');
  const swap = sheet(page).locator('.swap').filter({ hasText: 'Flat Barbell Bench Press' });
  await expect(swap).toContainText('no progress');
  await swap.getByRole('button', { name: 'Swap in program: Cable Crossover' }).click();
  await expect(page.getByRole('status')).toContainText('Flat Barbell Bench Press → Cable Crossover in your program.');
});
