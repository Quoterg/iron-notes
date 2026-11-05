import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('workout summary: duration on the day log, stats, share as text and as an image', async ({ page, context }) => {
  // No share sheet here: text goes to the clipboard, the image is downloaded.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'canShare', { value: undefined });
  });
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(sheet.getByText('No sets logged yet.')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await sheet.getByLabel('Weight (kg)', { exact: true }).fill('100');
    await sheet.getByLabel('Reps', { exact: true }).fill('8');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.locator('.sets li')).toHaveCount(i + 1);
  }
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.locator('.summary')).toContainText('1 min');

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const stat = (label: string) => sheet.locator('.stat').filter({ hasText: label }).locator('.stat-value');
  await expect(stat('Sets')).toHaveText('3');
  await expect(stat('Volume')).toHaveText('2400 kg');
  await expect(stat('Effective reps')).toHaveText('24');
  await expect(stat('Records')).toHaveText('1');
  await expect(stat('Duration')).toHaveText('1 min');
  await expect(sheet.locator('.chip.mu')).toHaveText(['Chest 24']);

  await sheet.getByRole('button', { name: 'Share as text' }).click();
  await expect(page.getByRole('status')).toContainText('Workout copied to the clipboard.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Sets: 3');
  expect(text).toContain('Goals met: Chest 24');
  expect(text).toContain('100 kg × 8');

  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Share as image' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^iron-notes-\d{4}-\d{2}-\d{2}\.png$/);
  await file.saveAs('test-results/summary.png');
});
