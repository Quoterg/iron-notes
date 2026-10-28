import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('Dorian HIT: per-set targets, warm-ups, next set prefilled, too-soon hint', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // Yesterday: a reverse pyramid, top set at the top of the range (12), back-off set at 10.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  for (const [w, r] of [['100', '12'], ['80', '10']]) {
    await sheet.getByLabel('Weight (kg)', { exact: true }).fill(w);
    await sheet.getByLabel('Reps', { exact: true }).fill(r);
    await sheet.getByRole('button', { name: 'Save' }).click();
  }
  await expect(sheet.locator('.sets li')).toHaveCount(2);
  await page.getByRole('button', { name: /Back/ }).click();

  // Today: the top set goes up one step with no rep target; chest was a main session yesterday.
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(sheet.locator('.hint')).toHaveText('Chest was trained yesterday. Dorian rests a muscle about a week.');
  await expect(sheet.locator('.target')).toContainText('Set 1 target: 102.5 kg');
  await expect(sheet.locator('.target')).toContainText('top 12 reached');
  await expect(sheet.getByLabel('Weight (kg)', { exact: true })).toHaveValue('102.5');
  await expect(sheet.getByLabel('Reps', { exact: true })).toHaveValue('');

  // Warm-ups 50 % / 75 %, rounded down to the 2.5 kg step.
  await sheet.getByRole('button', { name: '50 kg × 10' }).click();
  await expect(sheet.getByRole('button', { name: 'Warm-up', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await sheet.getByRole('button', { name: '75 kg × 6' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.sets li')).toHaveCount(2);

  // Back to working sets: the target weight again; to failure gets 8.
  await sheet.getByRole('button', { name: 'Working set', exact: true }).click();
  await expect(sheet.getByLabel('Weight (kg)', { exact: true })).toHaveValue('102.5');
  await sheet.getByLabel('Reps', { exact: true }).fill('8');
  await sheet.getByRole('button', { name: 'Save' }).click();

  // The back-off set: same weight as last time, one rep more to beat.
  await expect(sheet.locator('.target')).toContainText('Set 2 target: 80 kg × 11+');
  await expect(sheet.locator('.target')).toContainText('10 reps last time: beat it');
  await expect(sheet.getByLabel('Weight (kg)', { exact: true })).toHaveValue('80');
  await expect(sheet.getByLabel('Reps', { exact: true })).toHaveValue('11');
});
