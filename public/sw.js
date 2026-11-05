// Offline support. Hand-written to stay tiny.
// - The app page: cache-first, updated in the background a start never waits for the
//   network. A new version is stored only once every script and style it lists (its
//   "iron-notes-assets" meta) is cached, so a cached page never lacks its code — offline, or after
//   the host replaced the files of the version still running. The app is told, and offers a
//   restart. Only Iron Notes' own page is stored (never a Wi-Fi login page). First visit: network.
// - Other pages: cache-first, updated in the background (HTML only).
// - Hashed assets (/assets/*): cache-first, they never change.
// - Anything else (icons, manifest): stale-while-revalidate.
// Adapted from Iron Log's worker.
const CACHE = 'iron-notes-v1';

const SCOPE = self.registration.scope;
/**
 * Our files are immutable (hashed) or our own pages: a lookup ignores `Vary`. Without this, a file
 * cached by the worker's own request (no Origin header) didn't match the page's module request
 * (with one) — a miss, and offline a blank start.
 */
const ANY = { ignoreVary: true };
/** Stored (as a cache entry, so it survives the worker being stopped) when a newer app page is ready. */
const UPDATE_MARK = `${SCOPE}__update-ready`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // The app page and what it needs to start, right away: offline from the first visit on (that
  // visit's page load happened before this worker was in control). The other screens' files follow
  // at the next start, in the background — a light first visit on a slow phone.
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        const hit = await c.match(SCOPE, ANY);
        const res = await fetch(SCOPE, { cache: 'no-cache' });
        if (isHtml(res)) await storeAppPage(c, res, hit ? await hit.text() : null, true);
      })
      .catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  // Back in the foreground (an installed app is resumed, not reloaded): look for a newer app page now;
  // a new one is stored with its assets and the app offers the restart, as at a start.
  if (event.data?.type === 'check') {
    event.waitUntil(checkForUpdate().catch(() => {}));
    return;
  }
  // The app asks once it listens (a message sent before that would be lost).
  if (event.data?.type !== 'update?') return;
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.match(UPDATE_MARK))
      .then((m) => m && event.source?.postMessage({ type: 'update-ready' })),
  );
});

// The rest-timer notification: back to the app (an open window, else a new one).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./'))),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    const appPage = `${url.origin}${url.pathname}` === SCOPE || `${url.origin}${url.pathname}` === `${SCOPE}index.html`;
    event.respondWith(appPage ? appPageCacheFirst(event, req) : pageCacheFirst(event, req));
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

/** The scripts and styles a build of the app page lists; null if it isn't Iron Notes' page. */
function assetsOf(html) {
  const m = html.match(/<meta name="iron-notes-assets" content="([^"]*)"/);
  return m && html.includes('id="app"') ? m[1].split(' ').filter(Boolean) : null;
}

const isHtml = (res) => res.ok && (res.headers.get('content-type') || '').includes('text/html');

/** What the page itself loads to start: its <script src> and <link href> (style, modulepreload). */
function entryOf(html) {
  return [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(?:\.\/)?(assets\/[^"]+)"/g)].map((m) => m[1]);
}

/** Caches the assets a page lists (or only what it starts with) that aren't cached yet; throws if one can't be fetched. */
async function cacheAssets(cache, html, entryOnly = false) {
  const missing = [];
  for (const a of (entryOnly ? entryOf(html) : assetsOf(html)) ?? []) {
    const href = new URL(a, SCOPE).href;
    if (!(await cache.match(href, ANY))) missing.push(href);
  }
  if (missing.length) await cache.addAll(missing);
}

/**
 * Stores a fetched app page as the one to start from — after its whole asset set is cached, so a
 * half-fetched update never becomes the start page. Returns whether it replaced a different page.
 */
async function storeAppPage(cache, res, oldText, atInstall = false) {
  const text = await res.text();
  if (assetsOf(text) == null) return false; // a login page or an error page: never stored
  // A new version: its whole set before switching to it. At install, the page already running:
  // what it needs to start (the rest at the next start, completing the current version's set).
  await cacheAssets(cache, text, atInstall && (oldText == null || text === oldText));
  if (text === oldText) return false;
  await cache.put(SCOPE, new Response(text, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  if (oldText == null) return false;
  await cache.put(UPDATE_MARK, new Response('1'));
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'update-ready' });
  return true;
}

/** Fetches the app page and stores it if it's new (storeAppPage tells the app). */
async function checkForUpdate() {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(SCOPE, ANY);
  if (!hit) return;
  const oldText = await hit.text();
  const res = await fetch(SCOPE, { cache: 'no-cache' });
  if (isHtml(res)) await storeAppPage(cache, res, oldText);
}

async function appPageCacheFirst(event, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(SCOPE, ANY);
  if (!hit) {
    // First visit: the network; its asset set is cached in the background.
    const res = await fetch(req);
    if (isHtml(res)) event.waitUntil(storeAppPage(cache, res.clone(), null).catch(() => {}));
    return res;
  }
  // This start shows the newest page cached so far; read it before handing it out (a body can be
  // read only once).
  const oldText = await hit.clone().text();
  event.waitUntil(
    cache
      .delete(UPDATE_MARK)
      .then(() => fetch(SCOPE, { cache: 'no-cache' }))
      .then((res) => (isHtml(res) ? storeAppPage(cache, res, oldText) : false))
      .catch(() => {}),
  );
  return hit;
}

async function pageCacheFirst(event, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ...ANY, ignoreSearch: true });
  const update = fetch(req).then((res) => {
    if (isHtml(res)) cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(update.catch(() => {}));
    return hit;
  }
  return update;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, ANY);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, ANY);
  const update = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(update.catch(() => {}));
    return hit;
  }
  return update;
}
