// Fails the build when the performance budget in docs/ARCHITECTURE.md is exceeded.
import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const BUDGET = {
  initialJs: 30 * KB, // entry chunk(s) referenced by index.html
  css: 8 * KB,
};

const gz = async (p) => gzipSync(await readFile(p), { level: 9 }).length;
const html = await readFile('dist/index.html', 'utf8');
// Loaded by the page itself: <script src> and <link href> (modulepreload). Not the asset list the
// service worker reads (the "iron-notes-assets" meta), which names every chunk.
const loaded = new Set([...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(?:\.\/)?assets\/([^"]+)"/g)].map((m) => m[1]));
const assets = await readdir('dist/assets');

const sizes = { initialJs: 0, css: 0 };
for (const f of assets) {
  const size = await gz(`dist/assets/${f}`);
  if (f.endsWith('.css')) sizes.css += size;
  else if (f.endsWith('.js') && loaded.has(f)) sizes.initialJs += size;
}

let failed = false;
for (const [k, limit] of Object.entries(BUDGET)) {
  const ok = sizes[k] <= limit;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(10)} ${(sizes[k] / KB).toFixed(1).padStart(6)} KB gzip (budget ${limit / KB} KB)`);
}
if (failed) {
  console.error('Performance budget exceeded.');
  process.exit(1);
}
