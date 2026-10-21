import { t } from '../lib/i18n';

/** The personal-record mark. */
export function Trophy() {
  return (
    <svg class="trophy" viewBox="0 0 24 24" role="img" aria-label={t('record')}>
      <title>{t('record')}</title>
      <path
        fill="currentColor"
        d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z"
      />
    </svg>
  );
}

export function Dot({ color }: { color?: string }) {
  return <span class="dot" style={{ background: color ?? '#888' }} aria-hidden="true" />;
}
