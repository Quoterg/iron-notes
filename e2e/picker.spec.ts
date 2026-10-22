import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('favourites and recent exercises at the top of the picker', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await expect(sheet.getByText('Recent', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('deadlift');
  // The row of exactly "Deadlift" (the search also finds Romanian Deadlift).
  await sheet.locator('.pick-row', { has: page.getByRole('button', { name: 'Deadlift', exact: true }) }).getByRole('button', { name: 'Favourite' }).click();
  await page.getByRole('searchbox').fill('');
  await expect(sheet.getByText('Favourites', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: /Legs/ }).click();
  await sheet.getByRole('button', { name: 'Barbell Squat', exact: true }).click();
  await page.getByLabel('Weight (kg)', { exact: true }).fill('100');
  await page.getByLabel('Reps', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Back/ }).click();

  await page.getByRole('button', { name: '+ Add exercise' }).click();
  const recent = sheet.locator('.list-title', { hasText: 'Recent' });
  await expect(recent).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Barbell Squat', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Deadlift', exact: true })).toBeVisible();

  // Editing a favourite keeps it a favourite.
  await sheet.getByRole('button', { name: 'Deadlift', exact: true }).click();
  await sheet.getByRole('button', { name: 'Edit' }).click();
  await sheet.getByLabel('Notes').fill('Hook grip');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await expect(sheet.locator('.pick-row', { has: page.getByRole('button', { name: 'Deadlift', exact: true }) }).first().getByRole('button', { name: 'Favourite' })).toHaveAttribute('aria-pressed', 'true');
});

test("what's new: shown once after an update, never on a first install", async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: "What's new" })).toHaveCount(0);

  // An "older version" that saw entry 1 and has data.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open('iron-notes');
        r.onsuccess = () => {
          const tx = r.result.transaction(['kv', 'sets'], 'readwrite');
          tx.objectStore('kv').put({ key: 'whatsNewSeen', value: 1 });
          tx.objectStore('sets').put({ id: 'x', date: '2026-01-01', exerciseId: 'e', order: 1, reps: 5 });
          tx.oncomplete = () => (r.result.close(), resolve());
        };
      }),
  );
  await page.reload();
  const sheet = page.getByRole('dialog', { name: "What's new" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Calculators');
  await sheet.getByRole('button', { name: 'OK' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: "What's new" })).toHaveCount(0);
});
