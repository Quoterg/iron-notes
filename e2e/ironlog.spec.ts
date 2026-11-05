import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const BACKUP = {
  format: 'iron-log-backup',
  version: 1,
  exportedAt: '2026-10-20T10:00:00Z',
  entries: [],
  body: [
    { date: '2026-10-01', weightKg: 82.4, waistCm: 88, updatedAt: 1 },
    { date: '2026-10-08', weightKg: 81.9, bodyFatPct: 16.5, updatedAt: 2 },
  ],
  settings: { lang: 'sv', profile: { sex: 'male', kcal: 2200, age: 30, weightKg: 82, heightCm: 180, pal: 1.55 } },
};

test('Iron Log backup: body measurements imported, diet phase from its energy target', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Lyle effective reps', exact: true }).click();
  let dialog = '';
  page.on('dialog', (d) => {
    dialog = d.message();
    void d.accept();
  });
  await page.getByLabel('Import from Iron Log (backup)').setInputFiles({ name: 'iron-log-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BACKUP)) });
  await expect(page.getByRole('status')).toContainText('4 measurements imported (0 already here).');
  expect(dialog).toContain('Import 2 days of body measurements (2026-10-01 to 2026-10-08)?');
  expect(dialog).toContain('diet phase → Cutting');
  await expect(page.getByRole('button', { name: 'Cutting', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Body', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Body weight/ })).toContainText('81.9 kg');

  // Importing again adds nothing.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Import from Iron Log (backup)').setInputFiles({ name: 'iron-log-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BACKUP)) });
  await expect(page.getByRole('status')).toContainText('0 measurements imported (4 already here).');
});
