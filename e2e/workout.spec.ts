import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

async function log(page: Page, search: string, name: string, w: string, r: string) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill(search);
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Weight (kg)', { exact: true }).fill(w);
  await page.getByLabel('Reps', { exact: true }).fill(r);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('div:not([hidden]) > .sheet .sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
}

test('copy, reorder and delete a workout', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await log(page, 'flat barbell', 'Flat Barbell Bench Press', '80', '8');
  await log(page, 'barbell squat', 'Barbell Squat', '120', '5');
  await page.getByRole('button', { name: 'Next day' }).click();

  // Copy yesterday into today.
  await page.getByRole('button', { name: 'Copy a previous workout' }).click();
  await page.locator('.copy-head').first().click();
  await page.getByRole('button', { name: 'Copy to this day' }).click();
  const cards = page.locator('main .ex-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Flat Barbell Bench Press');
  await expect(cards.nth(0)).toContainText('80 kg × 8');
  // Copies of equal sets are not new records.
  await expect(page.locator('main .trophy')).toHaveCount(0);

  // Reorder: squat first.
  await page.getByRole('button', { name: 'Reorder' }).click();
  await page.getByRole('button', { name: 'Move up: Barbell Squat' }).click();
  await expect(cards.nth(0)).toContainText('Barbell Squat');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.locator('main .ex-card').nth(0)).toContainText('Barbell Squat');

  // Delete the workout.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await expect(page.getByText('Nothing logged on this day.')).toBeVisible();
  // Yesterday is untouched.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.locator('main .ex-card')).toHaveCount(2);
});
