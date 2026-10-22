import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('starter exercises show their muscles; the editor cycles them', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).click();
  await expect(sheet).toContainText('Chest (+ Front delts, Triceps)');

  await sheet.getByRole('button', { name: 'Edit' }).click();
  // Triceps: secondary → none; Side delts: none → primary.
  await sheet.getByRole('button', { name: 'Triceps: secondary' }).click();
  await expect(sheet.getByRole('button', { name: 'Triceps: not trained' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Side delts: not trained' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toContainText('Chest, Side delts (+ Front delts)');
});
