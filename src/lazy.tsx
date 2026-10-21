// Code-splitting without preact/compat: a component that loads its module on first render.
// `prefetch()` loads it ahead of time (e.g. when idle) so the service worker caches the chunk
// and the screen also opens instantly offline. Same as Iron Log.
import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import { t } from './lib/i18n';

/** `quiet`: render nothing (not "Loading…") until loaded — for parts below a screen that's already shown. */
export function lazyView<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, { quiet = false } = {}) {
  const comp = signal<ComponentType<P> | null>(null);
  const failed = signal(false);
  let pending: Promise<void> | undefined;
  // The later screens' strings come with any of them (one shared chunk, cached after the first).
  const prefetch = () =>
    (pending ??= Promise.all([load(), import('./lib/strings-later')]).then(
      ([m]) => {
        failed.value = false;
        comp.value = m.default;
      },
      () => {
        pending = undefined; // allow a retry, e.g. after coming back online
        failed.value = true;
      },
    ));
  function Lazy(props: P) {
    const C = comp.value;
    if (C) return <C {...props} />;
    if (failed.value && quiet) return null; // a part, not a screen: no error UI
    if (failed.value) {
      reloadOnce();
      return (
        <div class="pad center">
          <p class="muted">{t('loadFailed')}</p>
          <button
            class="btn"
            onClick={() => {
              failed.value = false;
              void prefetch();
            }}
          >
            {t('retry')}
          </button>
        </div>
      );
    }
    void prefetch();
    return quiet ? null : <p class="muted center">{t('loading')}</p>;
  }
  return { Lazy, prefetch };
}

/**
 * Online but a screen being opened couldn't load its code: most likely the version running was
 * replaced on the server. Reload once per session, which starts the current version.
 */
function reloadOnce() {
  if (!navigator.onLine) return;
  try {
    if (sessionStorage.getItem('in-reloaded')) return;
    sessionStorage.setItem('in-reloaded', '1');
  } catch {
    return;
  }
  location.reload();
}
