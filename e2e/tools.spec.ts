import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('calculators: plates and warm-up from the logging screen, 1RM table, own plate set', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('barbell squat');
  await page.getByRole('button', { name: 'Barbell Squat' }).click();
  await page.getByLabel('Weight (kg)', { exact: true }).fill('140');
  await page.getByLabel('Reps', { exact: true }).fill('5');
  await sheet.getByRole('button', { name: 'Calculators' }).click();

  // Prefilled with 140 kg: plates per side on a 20 kg bar.
  await expect(sheet.getByLabel('Weight (kg)')).toHaveValue('140');
  await expect(sheet.locator('.plate')).toHaveText(['25', '25', '10']);
  await sheet.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await expect(sheet.locator('.setlist li')).toHaveText(['20 kg × 10', '55 kg × 5', '82.5 kg × 3', '110 kg × 2', '140 kg — working set']);

  await sheet.getByRole('button', { name: '1RM', exact: true }).click();
  await sheet.getByLabel('Reps').fill('5');
  await expect(sheet.locator('.hero-num')).toContainText('163.3');
  await expect(sheet.locator('table.data tbody tr').first()).toContainText('100 %');

  // A home gym: 15 kg bar, 20/10/5 plates.
  await sheet.getByRole('button', { name: 'Plates', exact: true }).click();
  await sheet.getByText('Bar and plates').click();
  await sheet.getByLabel('Bar (kg)').fill('15');
  await sheet.getByLabel('Plates (comma and space between) (kg)').fill('20, 10, 5');
  await sheet.getByLabel('Plates (comma and space between) (kg)').blur();
  await sheet.getByLabel('Weight (kg)').fill('62');
  await expect(sheet.locator('.plate')).toHaveText(['20']);
  await expect(sheet).toContainText('7 kg can’t be loaded with these plates');
});
