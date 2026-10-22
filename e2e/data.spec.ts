import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
});

const FITNOTES = [
  'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment',
  '2024-01-08,Flat Barbell Bench Press,Chest,80.0,kgs,8,,,,',
  '2024-01-08,Flat Barbell Bench Press,Chest,85.0,kgs,5,,,,"heavy, good"',
  '2024-01-09,Running (Treadmill),Cardio,,,,5.0,km,0:25:30,',
].join('\r\n');

test('import a FitNotes CSV, re-import skips duplicates, export CSV, delete all', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  // Import: a summary to confirm, then the sets are in the log of that day.
  let dialog = '';
  page.on('dialog', (d) => {
    dialog = d.message();
    void d.accept();
  });
  await page.getByLabel('Import from FitNotes (CSV)').setInputFiles({ name: 'FitNotes_Export.csv', mimeType: 'text/csv', buffer: Buffer.from(FITNOTES) });
  await expect(page.getByRole('status')).toContainText('3 sets imported.');
  expect(dialog).toContain('Import 3 sets (2024-01-08 to 2024-01-09)');
  expect(dialog).toContain('New: 1 exercises, 0 categories'); // Cardio is a starter category

  // Again: nothing new.
  await page.getByLabel('Import from FitNotes (CSV)').setInputFiles({ name: 'FitNotes_Export.csv', mimeType: 'text/csv', buffer: Buffer.from(FITNOTES) });
  await expect(page.getByRole('status')).toContainText('Nothing new to import (3 sets were already here).');

  // The imported running shows up in the exercise's history (distance and time).
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Statistics' }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('div:not([hidden]) > .sheet .stats-grid')).toContainText('2Workouts');
  await page.getByRole('button', { name: /Back/ }).click();

  // Export CSV: same columns, same values.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const text = readFileSync((await csv.path())!, 'utf8');
  expect(text.split('\r\n')[0]).toBe('Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment');
  expect(text).toContain('2024-01-08,Flat Barbell Bench Press,Chest,85,kgs,5,,,,"heavy, good"');
  expect(text).toContain('2024-01-09,Running (Treadmill),Cardio,,,,5,km,25:30,');

  // Delete all: a backup downloads first; then a fresh start with the starter library.
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Delete all data' }).click()]);
  expect(backup.suggestedFilename()).toMatch(/^iron-notes-.*\.json$/);
  await expect(page.getByRole('status')).toContainText('All data deleted.');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Statistics' }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByText('No workouts in this period.')).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Start a workout' }).click();
  await expect(page.getByRole('button', { name: /Chest/ })).toBeVisible();
});
