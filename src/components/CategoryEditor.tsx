// Create or edit a category: name and colour. Only empty categories can be deleted.
import { useState } from 'preact/hooks';
import { uid } from '../lib/calc';
import { t } from '../lib/i18n';
import { COLORS } from '../lib/seed';
import { catById, categories, exercises, removeCategory, saveCategory } from '../state';
import { Sheet } from './Sheet';

export default function CategoryEditor({ id }: { id?: string }) {
  const old = id ? catById.value.get(id) : undefined;
  const [name, setName] = useState(old?.name ?? '');
  const [color, setColor] = useState(old?.color ?? COLORS[categories.value.length % COLORS.length]);
  const [error, setError] = useState('');
  const inUse = !!id && exercises.value.some((e) => e.categoryId === id);

  async function save(e: Event) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError(t('nameRequired'));
    const order = old?.order ?? Math.max(-1, ...categories.value.map((c) => c.order)) + 1;
    await saveCategory({ id: id ?? uid(), name: n, color, order });
    history.back();
  }

  async function remove() {
    if (!id || inUse || !confirm(t('deleteCategoryQ'))) return;
    await removeCategory(id);
    history.back();
  }

  return (
    <Sheet title={id ? t('editCategory') : t('newCategory')}>
      <form class="pad form" onSubmit={save}>
        <label>
          {t('name')}
          <input type="text" value={name} required onInput={(e) => (setName(e.currentTarget.value), setError(''))} />
        </label>
        {error && <p class="error-text" role="alert">{error}</p>}
        <span class="muted">{t('colour')}</span>
        <div class="swatches" role="radiogroup" aria-label={t('colour')}>
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              class={c === color ? 'swatch on' : 'swatch'}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div class="actions">
          <button type="submit" class="btn primary">
            {t('save')}
          </button>
          {id && (
            <button type="button" class="btn danger" disabled={inUse} onClick={() => void remove()}>
              {t('delete')}
            </button>
          )}
        </div>
        {inUse && <p class="muted small">{t('categoryInUse')}</p>}
      </form>
    </Sheet>
  );
}
