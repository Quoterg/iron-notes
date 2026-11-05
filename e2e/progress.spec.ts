import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

async function logSets(page: Page, sets: [string, string][]) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).click();
  for (const [w, r] of sets) {
    await page.getByLabel('Weight (kg)', { exact: true }).fill(w);
    await page.getByLabel('Reps', { exact: true }).fill(r);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.sets li').filter({ hasText: `${w} kg × ${r}` }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /Back/ }).click();
}

test('history, graph and records of an exercise', async ({ page }) => {
  await page.goto('./');
  // Two days ago, yesterday, today.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await logSets(page, [['80', '8'], ['80', '7']]);
  await page.getByRole('button', { name: 'Next day' }).click();
  await logSets(page, [['85', '5']]);
  await page.getByRole('button', { name: 'Next day' }).click();
  await logSets(page, [['90', '3'], ['70', '12']]);

  await page.locator('.ex-head').click();
  // The open sheet only (the day log stays mounted underneath).
  const sheet = page.locator('div:not([hidden]) > .sheet');
  // Tapping a set in "Last time" copies its weight and reps into the form.
  await sheet.getByRole('button', { name: 'Last time: 85 kg × 5' }).click();
  await expect(sheet.getByLabel('Weight (kg)', { exact: true })).toHaveValue('85');
  await expect(sheet.getByLabel('Reps', { exact: true })).toHaveValue('5');
  await page.getByRole('button', { name: 'History' }).click();
  await expect(sheet.locator('.ex-card')).toHaveCount(3);
  await expect(sheet.locator('.ex-card').first()).toContainText('90 kg × 3');
  await expect(sheet.locator('.ex-card').last()).toContainText('80 kg × 8');

  await page.getByRole('button', { name: 'Graph' }).click();
  await expect(page.getByRole('img', { name: /Estimated 1RM \(kg\): 3 workouts/ })).toBeVisible();
  await page.getByLabel('Measure').selectOption('maxWeight');
  await page.getByRole('button', { name: 'Show as table' }).click();
  await expect(page.locator('table.data tbody tr')).toHaveCount(3);
  await expect(page.locator('table.data tbody tr').first()).toContainText('90');

  await page.getByRole('button', { name: 'Records' }).click();
  // Best estimated 1RM (Epley): 80 × 8 → 101.3 kg (beats 70 × 12 → 98 kg).
  await expect(page.locator('.hero-num')).toContainText('101.3');
  const rows = page.locator('table.data tbody tr');
  await expect(rows.first()).toContainText('90 kg'); // 1 rep
  await expect(rows.nth(4)).toContainText('85 kg'); // 5 reps
  await expect(rows.nth(11)).toContainText('70 kg'); // 12 reps
  await expect(page.getByText('Most reps')).toBeVisible();

  // A history day opens that day's sets.
  await page.getByRole('button', { name: 'History' }).click();
  await sheet.locator('.ex-head').last().click();
  await expect(sheet.locator('.sets li')).toHaveCount(2);
  await expect(sheet.locator('.sets li').first()).toContainText('80 kg × 8');
});
