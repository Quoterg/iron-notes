import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('start Lyle’s upper/lower: mode, cycle, rotation and the training days', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await sheet.getByRole('button', { name: 'Start: Lyle’s upper/lower (GBR)' }).click();
  await expect(page.getByRole('status')).toContainText('“Lyle’s upper/lower (GBR)” started.');

  // The program and its schedule (Mon, Tue, Thu, Fri).
  await expect(sheet.getByLabel('Program')).toHaveValue(/.+/);
  const pressed = sheet.locator('.chips button[aria-pressed="true"]');
  await expect(pressed).toHaveCount(4);
  await sheet.locator('.chips button[aria-pressed="false"]').first().click();
  await expect(pressed).toHaveCount(5);
  await page.getByRole('button', { name: /Back/ }).click();

  // Lyle mode with a cycle running.
  await expect(page.getByRole('button', { name: 'Lyle effective reps', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cycle').first()).toContainText('Week 1 of 6 (run-up)');

  // An empty day offers the first workout; logging it moves the rotation on.
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Next: Lower (Lyle’s upper/lower (GBR))' }).click();
  await expect(page.locator('.ex-card')).toHaveCount(5);
  await expect(page.locator('.ex-card').first()).toContainText('Barbell Squat');
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('button', { name: 'Next: Upper (Lyle’s upper/lower (GBR))' })).toBeVisible();
});
