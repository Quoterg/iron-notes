import preact from '@preact/preset-vite';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { CSP, headersFile } from './src/csp';

export default defineConfig({
  // Relative base: the same build works at a domain root or under a sub-path.
  base: './',
  plugins: [
    preact(),
    {
      // Production builds only: the dev server injects inline styles. Injected as a head tag (not a
      // string replace), so a reformatted index.html can't silently ship without the policy.
      name: 'iron-notes-csp',
      apply: 'build',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
      ],
    },
    {
      // Cloudflare Pages headers (CSP with frame-ancestors, caching), from the same policy as the meta tag.
      name: 'iron-notes-headers',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
      },
    },
    {
      // Every script and style of this build, listed in the page: the service worker caches a new
      // version's whole set before switching to it, so a cached page never lacks its code.
      name: 'iron-notes-asset-list',
      apply: 'build',
      enforce: 'post',
      async writeBundle(options, bundle) {
        const assets = Object.keys(bundle).filter((f) => f.startsWith('assets/') && /\.(js|css)$/.test(f)).sort();
        const file = join(options.dir ?? 'dist', 'index.html');
        const html = await readFile(file, 'utf8');
        const meta = `<meta name="iron-notes-assets" content="${assets.join(' ')}">`;
        await writeFile(file, html.replace('</head>', `${meta}\n</head>`));
      },
    },
  ],
  build: {
    target: 'es2019', // Chrome 80+ / Safari 14+ — covers old Android phones.
    cssTarget: 'chrome80',
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
