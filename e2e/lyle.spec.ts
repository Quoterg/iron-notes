import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('Lyle: a cycle starts with a run-up from the best weight for the rep range', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Lyle effective reps', exact: true }).click();
  await expect(page.getByText('none yet')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Cycle length' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // Before the cycle: a best of 100 kg × 8 (range 8–12 by default).
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await sheet.getByLabel('Weight (kg)', { exact: true }).fill('100');
  await sheet.getByLabel('Reps', { exact: true }).fill('8');
  await sheet.getByRole('button', { name: '0', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();

  // Start a cycle today (6 weeks), then switch it to Lyle's own 8.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Start a new cycle today' }).click();
  await expect(page.locator('.cycle')).toContainText('Week 1 of 6 (run-up)');
  await page.getByRole('button', { name: '8 weeks', exact: true }).click();
  await expect(page.locator('.cycle')).toContainText('Week 1 of 8 (run-up)');
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // Week 1: ≈ 82.5 % of 100 kg, rounded down to the step, to the top of the range, well short of failure.
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(sheet.locator('.target')).toContainText('Week 1 of 8 (run-up) · Target: 82.5 kg × 12');
  await expect(sheet.locator('.target')).toContainText('stop 2–3 reps short of failure');
  await expect(sheet.getByLabel('Weight (kg)', { exact: true })).toHaveValue('82.5');
  await expect(sheet.getByLabel('Reps', { exact: true })).toHaveValue('12');
});
