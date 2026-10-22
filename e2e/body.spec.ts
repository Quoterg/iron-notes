import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

test('body: log weight on several days, see latest, change and graph; custom measure', async ({ page }) => {
  await page.goto('./');
  const sheet = page.locator('div:not([hidden]) > .sheet');
  await page.getByRole('button', { name: 'Body', exact: true }).click();
  await page.getByRole('button', { name: /^Body weight/ }).click();

  const iso = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  for (const [ago, kg] of [[3, '82,4'], [2, '82.0'], [0, '81.5']] as const) {
    await sheet.getByLabel('Date').fill(iso(ago));
    await sheet.getByLabel('Value (kg)').fill(kg);
    await sheet.getByRole('button', { name: 'Save' }).click();
  }
  await expect(sheet.locator('.entries li')).toHaveCount(3);
  await expect(sheet.locator('.entries li').first()).toContainText('81.5 kg');
  // Graph with the trend readout.
  await expect(sheet.getByRole('img', { name: /Body weight \(kg\): 3 entries/ })).toBeVisible();

  await page.getByRole('button', { name: /Back/ }).click();
  const row = page.getByRole('button', { name: /^Body weight/ });
  await expect(row).toContainText('81.5 kg');
  await expect(row).toContainText('−0.5');

  // A custom measure.
  await page.getByLabel('Name').fill('Resting pulse');
  await page.getByLabel('Kind').selectOption('number');
  await page.getByRole('button', { name: '+ New measure' }).click();
  await sheet.getByLabel('Value').fill('58');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.locator('.entries li').first()).toContainText('58');

  // Units follow the setting: lb shows the weight converted.
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await page.getByRole('button', { name: 'Body', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Body weight/ })).toContainText('179.7 lb');
});
