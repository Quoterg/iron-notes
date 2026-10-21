/**
 * Content-Security-Policy of the app, added to production builds by vite.config.ts as a meta tag
 * (static hosting can't send headers). Widen only for a proven need; csp.test.ts and
 * e2e/csp.spec.ts guard it.
 */
/**
 * Theme boot, written inline in index.html's head before the stylesheet, so the theme (and the
 * browser bar colour for an explicit choice) is set before first paint: the saved choice
 * (Settings → Appearance), else the phone's setting. Allowed by its hash only — change index.html,
 * THEME_BOOT and THEME_BOOT_HASH together (csp.test.ts checks all three match).
 */
export const THEME_BOOT =
  "(function(){var t;try{t=localStorage.getItem('iron-notes-theme')}catch(e){}var n=t==='night'||(t!=='day'&&!!window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);var d=document;d.documentElement.setAttribute('data-theme',n?'night':'day');if(t){var m=d.querySelectorAll('meta[name=theme-color]');for(var i=0;i<m.length;i++)m[i].content=n?'#050912':'#eef1f8'}})()";
export const THEME_BOOT_HASH = 'sha256-9NuCz/7yw39wxx9z1qBqL39j27NNRGo35zcLoUrYdKg=';

export const CSP_DIRECTIVES: [directive: string, sources: string][] = [
  ['default-src', "'self'"],
  // The hash: the theme boot script above, nothing else inline.
  ['script-src', `'self' '${THEME_BOOT_HASH}'`],
  ['worker-src', "'self'"], // service worker
  ['connect-src', "'self'"],
  ['img-src', "'self'"],
  // Only stylesheets from this site. Preact sets style={…} via the CSSOM (element.style), which
  // style-src doesn't restrict — never build style="…" attribute strings by hand.
  ['style-src', "'self'"],
  ['font-src', "'self'"],
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
];

export const CSP = CSP_DIRECTIVES.map(([d, s]) => `${d} ${s}`).join('; ');
