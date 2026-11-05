import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('rest per category: the exercise’s category sets its timer', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  // Chest: 2 minutes.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Exercises and categories' }).click();
  await sheet.getByRole('button', { name: /^Chest/ }).click();
  await sheet.getByRole('button', { name: 'Edit category' }).click();
  await sheet.getByLabel('Rest timer for its exercises (seconds)').fill('120');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Back/ }).click(); // the library (the category is a view inside it)
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await sheet.getByRole('button', { name: 'Start rest timer' }).click();
  await expect(page.getByRole('timer')).toContainText(/^(2:00|1:5\d)/);
});
