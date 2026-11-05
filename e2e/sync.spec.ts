import { expect, test, type Page } from '@playwright/test';

// Two devices = two browser contexts with separate storage, connected over a real WebRTC data channel.
// The codes are pasted as text (headless browsers have no camera). Ported from Iron Log.
test.use({ serviceWorkers: 'block' });

const sheet = (page: Page) => page.locator('div:not([hidden]) > .sheet');

const openSync = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
};

const codeText = async (page: Page) => {
  await page.getByText('Show as text').click();
  const box = page.getByRole('textbox', { name: 'Show as text' });
  await expect(box).toHaveValue(/^IN1\./);
  return box.inputValue();
};

const paste = async (page: Page, code: string) => {
  await page.getByLabel('Or paste the code').fill(code);
  await page.getByRole('button', { name: 'Use the code' }).click();
};

/** A backup with its own library ids and `n` sets on a past day, restored through the app. */
const restoreHistory = async (page: Page, n: number) => {
  page.on('dialog', (d) => d.accept());
  const backup = {
    app: 'iron-notes',
    version: 1,
    exported: '2026-01-20',
    categories: [{ id: 'bcat', name: 'Chest', color: '#f0566a', order: 0 }],
    exercises: [{ id: 'bbench', name: 'Flat Barbell Bench Press', categoryId: 'bcat', type: 'weight,reps' }],
    sets: Array.from({ length: n }, (_, i) => ({ id: `hist-${i}`, date: '2026-01-15', exerciseId: 'bbench', order: 1000 + i, weight: 80, reps: 8 })),
  };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Restore backup').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('status')).toContainText('Backup restored.', { timeout: 30_000 });
};

test('two devices pair with codes, sync in batches, and keep one starter library', async ({ browser }) => {
  test.slow();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  for (const [n, p] of [['A', a], ['B', b]] as const) p.on('console', (m) => m.type() === 'error' && console.log(n, m.text()));
  await a.goto('./');
  await b.goto('./');

  // A: a set today. B: a long history under its own library ids (several batches on the wire).
  await a.getByRole('button', { name: 'Start a workout' }).click();
  await a.getByRole('searchbox').fill('flat barbell');
  await a.getByRole('button', { name: 'Flat Barbell Bench Press', exact: true }).click();
  await expect(sheet(a).getByText('No sets logged yet.')).toBeVisible();
  await sheet(a).getByLabel('Weight (kg)', { exact: true }).fill('100');
  await sheet(a).getByLabel('Reps', { exact: true }).fill('8');
  await sheet(a).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(a).locator('.sets li')).toHaveCount(1);
  await a.getByRole('button', { name: /Back/ }).click();
  await restoreHistory(b, 1500);

  // A shows a code; B answers it; A takes the answer.
  await openSync(a);
  await a.getByRole('button', { name: 'Start here (show a code)' }).click();
  const offer = await codeText(a);
  expect(offer.length).toBeLessThan(900);
  await openSync(b);
  await b.getByRole('button', { name: 'Scan a code' }).click();
  await paste(b, offer);
  const answer = await codeText(b);
  expect(answer.length).toBeLessThan(900);
  await paste(a, answer);

  for (const p of [a, b]) await expect(p.getByRole('status').filter({ hasText: 'Done!' })).toBeVisible({ timeout: 60_000 });
  await expect(a.getByRole('status').filter({ hasText: 'Done!' })).toContainText(/1\d{3} changes received/);

  // After OK (reload): one bench press on A (B's was matched by name), and B shows A's set from today.
  for (const p of [a, b]) await p.getByRole('button', { name: 'OK', exact: true }).click();
  await a.getByRole('button', { name: 'Start a workout' }).or(a.getByRole('button', { name: '+ Add exercise' })).first().click();
  await a.getByRole('searchbox').fill('flat barbell bench');
  await expect(sheet(a).getByRole('button', { name: 'Flat Barbell Bench Press', exact: true })).toHaveCount(1);
  await b.reload();
  await expect(b.locator('.ex-card')).toContainText('Flat Barbell Bench Press');
  await expect(b.locator('.ex-card')).toContainText('100 kg × 8');
});

test('garbled or wrong-step codes are refused with a clear message', async ({ page }) => {
  await page.goto('./');
  await openSync(page);
  await page.getByRole('button', { name: 'Scan a code' }).click();
  await paste(page, 'IN1.this-is-not-a-code');
  await expect(page.getByRole('alert')).toContainText('The code couldn’t be read');

  // A first code (offer) pasted where the other device's answer belongs.
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Start here (show a code)' }).click();
  const offer = await codeText(page);
  await paste(page, offer);
  await expect(page.getByRole('alert')).toContainText('The code couldn’t be read');
});
