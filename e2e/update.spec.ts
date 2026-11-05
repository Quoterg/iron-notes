import { expect, test } from '@playwright/test';

test('a new version found on resume offers the restart', async ({ page, context }) => {
  await page.goto('./');
  // The worker controls the page (second load) and has the app page cached.
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  // The host now serves a newer app page (same assets, changed page).
  await context.route(/\/$/, async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace('</body>', '<!-- v2 --></body>');
    await route.fulfill({ response: res, body: html });
  });
  // What coming back to the foreground sends (the 30-minute spacing aside).
  await page.evaluate(() => navigator.serviceWorker.controller!.postMessage({ type: 'check' }));
  await expect(page.getByRole('status').filter({ hasText: 'A new version is ready.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart' })).toBeVisible();
});
