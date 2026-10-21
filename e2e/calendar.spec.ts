import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('calendar shows trained days and opens them', async ({ page }) => {
  await page.goto('./');
  // Log a leg exercise yesterday.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('barbell squat');
  await page.getByRole('button', { name: 'Barbell Squat' }).click();
  await page.getByLabel('Weight (kg)', { exact: true }).fill('100');
  await page.getByLabel('Reps', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Next day' }).click();

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  // Yesterday may be in last month: go there if needed.
  if (yesterday.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Previous month' }).click();
  const label = yesterday.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const cell = page.getByRole('button', { name: `${label}: Legs` });
  await expect(cell).toBeVisible();
  await expect(cell.locator('.dot')).toHaveCount(1);
  await expect(page.getByText('1 workouts this month')).toBeVisible();

  await cell.click();
  await expect(page.getByRole('button', { name: 'Yesterday' })).toBeVisible();
  await expect(page.locator('.ex-card')).toContainText('Barbell Squat');
});
