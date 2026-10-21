// Renders public/icon.svg to the PNG icons the manifest and iOS need.
// Usage: node scripts/make-icons.mjs  (needs `pnpm exec playwright install chromium`)
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true });
  await page.close();
}
// Maskable: full-bleed background (launchers apply their own shape); the artwork already sits
// inside the 80 % safe zone (ring radius 172 of 256).
{
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const full = svg.replace(' rx="96"', '').replace('<svg ', '<svg width="512" height="512" ');
  await page.setContent(`<body style="margin:0">${full}</body>`);
  await page.screenshot({ path: 'public/icon-maskable-512.png' });
  await page.close();
}
await browser.close();
console.log('Wrote public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png');
