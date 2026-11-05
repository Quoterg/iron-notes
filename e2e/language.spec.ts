import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('Swedish: chosen in Settings, kept after a reload, back to English', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Svenska', exact: true }).click();

  // The whole UI switches at once, including the first screen's strings.
  await expect(page.getByRole('heading', { name: 'Språk' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logg', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv');

  // Reloaded: Swedish before the first render (no English flash to wait through).
  await page.reload();
  await expect(page.getByRole('button', { name: 'Starta ett pass' })).toBeVisible();
  await page.getByRole('button', { name: 'Starta ett pass' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toBeVisible(); // exercise names stay as stored
  await page.getByRole('button', { name: /Tillbaka/ }).click();

  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
