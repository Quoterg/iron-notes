import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('effective reps per muscle: day chips vs goal, extra work, Muscles screen', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // Bench to failure: 8 + 8 + 6 heavy reps = 22 for chest.
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  for (const [w, r] of [['100', '8'], ['100', '8'], ['90', '6']]) {
    await sheet.getByLabel('Weight (kg)', { exact: true }).fill(w);
    await sheet.getByLabel('Reps', { exact: true }).fill(r);
    await sheet.getByRole('button', { name: 'Save' }).click();
  }
  await expect(sheet.locator('.sets li')).toHaveCount(3);
  await page.getByRole('button', { name: /Back/ }).click();

  // One set of dips: 8 direct for triceps (extra work), 4 more for chest.
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByRole('searchbox').fill('dips');
  await page.getByRole('button', { name: 'Dips', exact: true }).click();
  await sheet.getByLabel('Reps', { exact: true }).fill('8'); // body weight: counts with its logged effort
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();

  const chips = page.locator('.day-muscles .chip');
  await expect(chips).toHaveText(['Chest 26/20', 'Triceps +8 extra']);
  await expect(chips.first()).toHaveClass(/\bin\b/);

  await page.getByRole('button', { name: 'Muscles' }).click();
  await expect(sheet.getByText('Goal per main session: 20')).toBeVisible();
  const chest = sheet.locator('.mu-bars li').filter({ hasText: 'Chest' });
  await expect(chest.locator('.mu-num')).toHaveText('26');
  await expect(chest.locator('.mu-sessions')).toContainText('26');
  await expect(sheet.locator('.mu-bars li').filter({ hasText: 'Front delts' }).locator('.mu-num')).toHaveText('15');
  await expect(sheet.locator('.mu-hist li')).not.toHaveCount(0);
});
