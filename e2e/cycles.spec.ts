import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

async function openBench(page: Page) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill('flat barbell');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
}

async function settingsTab(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

test('Dorian lighter week: ~10 % lighter, short of failure, and progression skips it afterwards', async ({ page }) => {
  await page.goto('./');
  await settingsTab(page);
  await page.getByRole('button', { name: 'Dorian HIT', exact: true }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // A normal session yesterday: 100 kg × 10 to failure.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await openBench(page);
  await sheet(page).getByLabel('Weight (kg)', { exact: true }).fill('100');
  await sheet(page).getByLabel('Reps', { exact: true }).fill('10');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();

  await settingsTab(page);
  await page.getByRole('button', { name: 'Start a lighter week' }).click();
  await expect(page.getByText(/^Lighter week until/)).toBeVisible();
  await page.getByRole('button', { name: 'Log', exact: true }).click();

  // Today, in the lighter week: 90 kg × 10, logged 1 short of failure.
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.locator('.day-plan .phase')).toHaveText('Lighter week');
  await openBench(page);
  await expect(sheet(page).locator('.target')).toContainText('Set 1 target: 90 kg × 10');
  await expect(sheet(page).locator('.target')).toContainText('Lighter week');
  await expect(sheet(page).getByLabel('Weight (kg)', { exact: true })).toHaveValue('90');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li').first()).toContainText('RIR 1');
  await page.getByRole('button', { name: /Back/ }).click();

  // After the lighter week, tomorrow's target comes from yesterday's normal session, not today's.
  await settingsTab(page);
  await page.getByRole('button', { name: 'End the lighter week' }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await openBench(page);
  await expect(sheet(page).locator('.target')).toContainText('Set 1 target: 100 kg × 11+');
});

test('program: an empty day offers the next workout of the chosen routine', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await openBench(page);
  await sheet(page).getByLabel('Weight (kg)', { exact: true }).fill('80');
  await sheet(page).getByLabel('Reps', { exact: true }).fill('10');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Save as workout' }).click();
  await sheet(page).getByLabel('Name').fill('Push A');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Saved “Push A”.');

  await settingsTab(page);
  await page.getByLabel('Program').selectOption({ label: 'My workouts' });
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Next: Push A (My workouts)' }).click();
  await expect(page.locator('.ex-card')).toHaveCount(1);
  await expect(page.locator('.ex-card')).toContainText('Flat Barbell Bench Press');
});
