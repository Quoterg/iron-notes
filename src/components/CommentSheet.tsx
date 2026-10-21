// The workout comment of a day (how it felt, sleep, anything).
import { useEffect, useState } from 'preact/hooks';
import { getComment } from '../lib/db';
import { t } from '../lib/i18n';
import { saveComment } from '../state';
import { dayLabel } from '../app';
import { Sheet } from './Sheet';

export default function CommentSheet({ date }: { date: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    void getComment(date).then(setText);
  }, [date]);

  return (
    <Sheet title={`${t('workoutComment')} · ${dayLabel(date)}`}>
      <form
        class="pad form"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveComment(date, text ?? '');
          history.back();
        }}
      >
        <label>
          {t('comment')}
          <textarea value={text ?? ''} disabled={text == null} onInput={(e) => setText(e.currentTarget.value)} autoFocus />
        </label>
        <div class="actions">
          <button type="submit" class="btn primary" disabled={text == null}>
            {t('save')}
          </button>
          {text && (
            <button
              type="button"
              class="btn danger"
              onClick={async () => {
                await saveComment(date, '');
                history.back();
              }}
            >
              {t('delete')}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
