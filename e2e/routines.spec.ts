import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('build a routine, log a day, fill in its planned sets', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');

  // A previous bench session sets the weight the plan starts from.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).click();
  await page.getByLabel('Weight (kg)', { exact: true }).fill('80');
  await page.getByLabel('Reps', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Next day' }).click();

  // Routine "Push" with bench (default 3 × 8) and dips.
  await page.getByRole('button', { name: 'Routines', exact: true }).click();
  await page.getByPlaceholder('Routine name').fill('Push');
  await page.getByRole('button', { name: '+ New routine' }).click();
  await sheet.getByRole('button', { name: 'Day 1' }).click();
  await sheet.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).click();
  await sheet.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByRole('searchbox').fill('dips');
  await page.getByRole('button', { name: 'Dips', exact: true }).click();
  await expect(sheet.locator('.plan-line').first()).toHaveText('3 × 8');
  await expect(sheet.locator('.plan-line').nth(1)).toHaveText('3 × 10');

  // Log it into today: planned sets, greyed out, bench at last time's 80 kg.
  await sheet.getByRole('button', { name: 'Log to Today' }).click();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  const bench = page.locator('main .ex-card').first();
  await expect(bench).toContainText('Flat Barbell Bench Press');
  await expect(bench.locator('li.undone')).toHaveCount(3);
  await expect(bench).toContainText('80 kg × 8');
  // Planned sets are no records.
  await expect(page.locator('main .trophy')).toHaveCount(0);

  // Save fills the first planned set and marks it done.
  await bench.locator('.ex-head').click();
  await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('80');
  await page.getByLabel('Weight (kg)', { exact: true }).fill('82.5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(3);
  await expect(sheet.locator('.sets li').first()).toContainText('82.5 kg × 8');
  await expect(sheet.locator('.sets li').first().getByRole('img', { name: 'Personal record' })).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(bench.locator('li.undone')).toHaveCount(2);
});

test('mark sets complete: unticked sets still count, Save adds a new set, copies count', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Mark sets complete (tick off planned sets)').check();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).click();
  await page.getByLabel('Weight (kg)', { exact: true }).fill('80');
  await page.getByLabel('Reps', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save' }).click();
  // Untick it: still the record, still in history.
  await sheet.getByLabel('Set done 1').uncheck();
  await expect(sheet.locator('.sets li').first().getByRole('img', { name: 'Personal record' })).toBeVisible();
  await sheet.getByRole('button', { name: 'History' }).click();
  await expect(sheet.locator('.ex-card')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Track' }).click();
  // Save adds a new set; the unticked one keeps its values.
  await page.getByLabel('Weight (kg)', { exact: true }).fill('85');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(2);
  await expect(sheet.locator('.sets li').first()).toContainText('80 kg × 8');
  await page.getByRole('button', { name: /Back/ }).click();

  // Copied into today (unticked copies): they still count, so the calendar shows today as trained.
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Copy a previous workout' }).click();
  await page.locator('.copy-head').first().click();
  await page.getByRole('button', { name: 'Copy to this day' }).click();
  await expect(page.locator('main .ex-card li.undone')).toHaveCount(2);
  await page.locator('main .ex-head').click();
  await sheet.getByRole('button', { name: 'History' }).click();
  await expect(sheet.locator('.ex-card')).toHaveCount(2);
});
