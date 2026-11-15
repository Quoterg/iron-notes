import { expect, test } from '@playwright/test';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

test.describe('iPhone in Safari', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('Settings shows the install hint and no move to the Android app', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Install on iPhone: tap Share, then Add to Home Screen.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move to the Android app' })).toHaveCount(0);
  });
});

test.describe('Android in Chrome', () => {
  test('Settings has no install hint and offers the move to the Android app', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Install on iPhone')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move to the Android app' })).toBeVisible();
  });
});
