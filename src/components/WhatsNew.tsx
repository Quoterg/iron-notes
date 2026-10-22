// What's new since the last entry this device saw (opened once after an update by main.tsx).
import { CHANGELOG } from '../changelog';
import { t } from '../lib/i18n';
import { back } from '../nav';
import { Sheet } from './Sheet';

export default function WhatsNew({ since }: { since: number }) {
  const items = CHANGELOG.filter((e) => e.id > since).flatMap((e) => e.items);
  return (
    <Sheet title={t('whatsNew')}>
      <div class="pad">
        <ul class="card news">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <button class="btn primary wide" onClick={back}>
          {t('ok')}
        </button>
      </div>
    </Sheet>
  );
}
