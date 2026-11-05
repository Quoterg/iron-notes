import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

async function openExercise(page: Page, search: string, name: string) {
  await page.getByRole('button', { name: /Start a workout|\+ Add exercise/ }).click();
  await page.getByRole('searchbox').fill(search);
  await page.getByRole('button', { name, exact: true }).click();
}

test('dumbbells per hand: shown per hand, volume counts both', async ({ page }) => {
  await page.goto('./');
  await openExercise(page, 'dumbbell curl', 'Dumbbell Curl');
  await sheet(page).getByLabel('Weight per hand (kg)', { exact: true }).fill('15');
  await sheet(page).getByLabel('Reps', { exact: true }).fill('10');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li').first()).toContainText('15 kg/hand × 10');
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.locator('.summary')).toContainText('300 kg volume');
});

test('body weight + added load: hint without a body weight, real load in records once logged', async ({ page }) => {
  await page.goto('./');
  await openExercise(page, 'dips', 'Dips');
  await expect(sheet(page).locator('.hint')).toContainText('Log your body weight on the Body screen');
  // Body weight alone (added weight empty), then + 20 kg.
  await sheet(page).getByLabel('Reps', { exact: true }).fill('12');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li').first()).toContainText('BW × 12');
  await sheet(page).getByLabel('Added weight (kg)', { exact: true }).fill('20');
  await sheet(page).getByLabel('Reps', { exact: true }).fill('8');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.sets li').nth(1)).toContainText('BW + 20 kg × 8');
  await page.getByRole('button', { name: /Back/ }).click();

  // Log 80 kg body weight: the records now use 80 + 20 kg.
  await page.getByRole('button', { name: 'Body', exact: true }).click();
  await page.getByRole('button', { name: /^Body weight/ }).click();
  await sheet(page).getByLabel('Value (kg)').fill('80');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).locator('.entries li')).toHaveCount(1);
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.locator('.ex-card').getByRole('button', { name: /Dips/ }).first().click();
  await expect(sheet(page).locator('.hint').filter({ hasText: 'body weight' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Records', exact: true }).click();
  await expect(sheet(page).getByText('100 kg').first()).toBeVisible();
});
