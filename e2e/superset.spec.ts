import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

async function log(page: Page, search: string, name: string, w: string, r: string) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill(search);
  await page.getByRole('button', { name, exact: true }).click();
  // Wait for the history (prefill) before typing: a late prefill mid-fill would append to the value.
  await expect(page.locator('div:not([hidden]) > .sheet').getByText('No sets logged yet.').or(page.locator('div:not([hidden]) > .sheet .sets li').first())).toBeVisible();
  await page.getByLabel('Weight (kg)', { exact: true }).fill(w);
  await page.getByLabel('Reps', { exact: true }).fill(r);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
}

test('superset: group, rotate on save, rest after the round', async ({ page }) => {
  await page.goto('./');
  await log(page, 'flat barbell', 'Flat Barbell Bench Press', '80', '8');
  await log(page, 'barbell squat', 'Barbell Squat', '100', '5');
  await log(page, 'barbell row', 'Barbell Row', '60', '10');
  await page.getByRole('button', { name: 'Stop timer' }).click();

  // Bench + row as a superset: row moves up next to bench.
  await page.getByRole('button', { name: 'Superset', exact: true }).click();
  await page.getByLabel('Select: Flat Barbell Bench Press').check();
  await page.getByLabel('Select: Barbell Row').check();
  await page.getByRole('button', { name: 'Make superset (2)' }).click();
  const cards = page.locator('main .ex-card');
  await expect(cards.nth(0)).toContainText('Flat Barbell Bench Press');
  await expect(cards.nth(1)).toContainText('Barbell Row');
  await expect(cards.nth(2)).toContainText('Barbell Squat');
  await expect(page.locator('main .ex-card.grouped')).toHaveCount(2);

  // Saving bench goes on to row without a rest timer; saving row rests and goes back to bench.
  await cards.nth(0).locator('.ex-head').click();
  await expect(sheet(page).getByRole('group', { name: 'Superset' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('h2')).toHaveText('Barbell Row');
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('h2')).toHaveText('Flat Barbell Bench Press');
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(cards.nth(0)).toContainText('80 kg × 8');
  await expect(cards.nth(1).locator('li')).toHaveCount(2);

  // Ungroup: the superset dissolves (one member left).
  await page.getByRole('button', { name: 'Superset', exact: true }).click();
  await cards.nth(1).getByRole('button', { name: 'Ungroup' }).click();
  await expect(page.locator('main .ex-card.grouped')).toHaveCount(0);
});
