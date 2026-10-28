import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
}

test('training modes: warm-up and reps after failure, RIR, estimated effective reps', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  const rows = sheet.locator('.sets li');

  // Dorian HIT: a warm-up counts nothing, a working set to failure counts every heavy rep plus the
  // reps after failure.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await expect(page.getByText('Working sets to failure')).toBeVisible();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await sheet.getByLabel('Weight (kg)', { exact: true }).fill('60');
  await sheet.getByLabel('Reps', { exact: true }).fill('10');
  await sheet.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await expect(sheet.getByLabel('Reps after failure', { exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(rows.nth(0)).toContainText('Warm-up');
  await expect(rows.nth(0)).toContainText('0 eff.');

  await sheet.getByRole('button', { name: 'Working set', exact: true }).click();
  await sheet.getByLabel('Weight (kg)', { exact: true }).fill('100');
  await sheet.getByLabel('Reps', { exact: true }).fill('8');
  await sheet.getByLabel('Reps after failure', { exact: true }).fill('2');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(rows.nth(1)).toContainText('+2');
  await expect(rows.nth(1)).toContainText('10 eff.');
  await expect(sheet.locator('.eff-total')).toHaveText('Effective reps: 10');
  await page.getByRole('button', { name: /Back/ }).click();

  // Lyle: 8 reps with 2 in reserve ≈ 3 effective reps.
  await mode(page, 'Lyle effective reps');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await sheet.getByRole('button', { name: '2', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(rows.nth(2)).toContainText('RIR 2');
  await expect(rows.nth(2)).toContainText('3 eff.');
  await expect(sheet.locator('.eff-total')).toHaveText('Effective reps: 13');
  await page.getByRole('button', { name: /Back/ }).click();

  // Standard: no effort input; estimated from the best e1RM (100 kg is an 8RM here, 6 reps ≈ 2 RIR).
  await mode(page, 'Standard');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await expect(sheet.getByRole('group', { name: 'Reps in reserve' })).toHaveCount(0);
  await sheet.getByLabel('Reps', { exact: true }).fill('6');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(rows.nth(3)).toContainText('≈6 eff.');
  // Sets logged in other modes keep their own effort.
  await expect(rows.nth(1)).toContainText('10 eff.');
});
