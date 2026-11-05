import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('targets round to the bar and plates: a weight increase rounds up, plates per side shown', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByText('Round targets and warm-ups to my bar and plates').click();

  // A home gym without the small plates: 25, 20, 15, 10, 5 kg.
  await page.getByRole('button', { name: 'Calculators', exact: true }).click();
  await sheet.getByRole('button', { name: 'Plates', exact: true }).click();
  await sheet.getByText('Bar and plates').click();
  for (const p of ['2.5', '1.25']) await sheet.getByRole('button', { name: `Remove plate ${p}`, exact: true }).click();
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await sheet.getByLabel('Weight (kg)', { exact: true }).fill('100');
  await sheet.getByLabel('Reps', { exact: true }).fill('12');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();

  // 12 reaches the top: + 2.5 kg would be 102.5, which these plates can't make — up to 110, not back to 100.
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(sheet.locator('.target')).toContainText('Set 1 target: 110 kg');
  await expect(sheet.locator('.plates-line')).toHaveText('Plates per side: 25 + 20');
  await expect(sheet.getByLabel('Weight (kg)', { exact: true })).toHaveValue('110');
  // Warm-ups rounded too: 55 → 50 (nearest; 60 is as far), 82.5 → 80.
  await expect(sheet.getByRole('button', { name: '50 kg × 10' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '80 kg × 6' })).toBeVisible();
});
