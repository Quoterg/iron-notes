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
  // Starter exercises show their Swedish name; the English one still finds them.
  await page.getByRole('button', { name: 'Bänkpress med skivstång', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Bänkpress med skivstång' })).toBeVisible();
  await expect(page.getByText('No sets logged yet.').or(page.getByText('Inga set loggade än.'))).toBeVisible();
  await page.getByLabel('Vikt (kg)', { exact: true }).fill('82,5');
  await page.getByLabel('Reps', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Spara' }).click();
  await expect(page.locator('div:not([hidden]) > .sheet .sets li').first()).toContainText('82,5 kg × 5'); // decimal comma
  await page.getByRole('button', { name: /Tillbaka/ }).click();

  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
