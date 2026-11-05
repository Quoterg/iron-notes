import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('body map: muscles coloured by the week, tap for what trained it and what could', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Muscles' }).click();
  const chest = sheet.locator('.body-map').getByRole('button', { name: 'Chest: 24' });
  await expect(chest).toHaveClass(/\bin\b/); // 24 within Dorian's 20–30 for the week
  await expect(sheet.locator('.body-map').getByRole('button', { name: 'Quads: 0' })).toHaveClass(/\bnone\b/);
  await sheet.locator('.body-map').screenshot({ path: 'test-results/body-map.png' });

  await chest.click();
  const drill = sheet.locator('.drill');
  await expect(drill).toContainText('Chest · 24 effective reps');
  await expect(drill.locator('.entries li')).toHaveText([/Flat Barbell Bench Press\s*24/]);
  // An untrained muscle: nothing yet, exercises to train it today.
  // (a tap on one of the two thighs: the region's centre falls between them)
  await sheet.locator('.body-map').getByRole('button', { name: 'Quads: 0' }).locator('ellipse').first().click();
  await expect(drill).toContainText('Not trained this week.');
  await drill.getByRole('button', { name: 'Barbell Squat' }).click();
  await expect(page.getByRole('dialog', { name: 'Barbell Squat' })).toBeVisible();
});
