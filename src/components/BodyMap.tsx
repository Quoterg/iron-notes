// A front and back figure for the Muscles screen (M23): hand-drawn shapes (no images, no library), each
// muscle coloured by this week's status; tapping a muscle selects it. Colours come from the theme.
import { type Key, t } from '../lib/i18n';
import type { MuscleId } from '../lib/model';

type Shape = ['e', number, number, number, number] | ['r', number, number, number, number];

// [muscle, shapes] — two figures side by side in a 200 × 190 box (front at x 0–95, back at x 105–200).
const REGIONS: [MuscleId, Shape[]][] = [
  ['frontDelts', [['e', 28, 37, 6, 5], ['e', 67, 37, 6, 5]]],
  ['sideDelts', [['e', 21, 40, 3, 6], ['e', 74, 40, 3, 6], ['e', 126, 40, 3, 6], ['e', 179, 40, 3, 6]]],
  ['chest', [['e', 40, 46, 8, 6], ['e', 55, 46, 8, 6]]],
  ['biceps', [['e', 22, 57, 4, 9], ['e', 73, 57, 4, 9]]],
  ['forearms', [['e', 20, 80, 3.5, 10], ['e', 75, 80, 3.5, 10], ['e', 125, 80, 3.5, 10], ['e', 180, 80, 3.5, 10]]],
  ['abs', [['r', 41, 55, 13, 30]]],
  ['quads', [['e', 40, 118, 7, 19], ['e', 55, 118, 7, 19]]],
  ['calves', [['e', 40, 160, 4.5, 12], ['e', 55, 160, 4.5, 12], ['e', 145, 160, 5, 13], ['e', 160, 160, 5, 13]]],
  ['traps', [['e', 152.5, 34, 13, 5]]],
  ['rearDelts', [['e', 133, 38, 6, 5], ['e', 172, 38, 6, 5]]],
  ['lats', [['e', 143, 56, 7, 12], ['e', 162, 56, 7, 12]]],
  ['lowerBack', [['r', 146, 69, 13, 15]]],
  ['triceps', [['e', 127, 57, 4, 9], ['e', 178, 57, 4, 9]]],
  ['glutes', [['e', 145, 95, 8, 8], ['e', 160, 95, 8, 8]]],
  ['hamstrings', [['e', 145, 120, 7, 16], ['e', 160, 120, 7, 16]]],
];

/** The figure's outline (head, torso, arms, legs) for one side at x offset `dx`. */
function Outline({ dx }: { dx: number }) {
  return (
    <g class="mm-base" transform={`translate(${dx} 0)`}>
      <circle cx="47.5" cy="16" r="10" />
      <rect x="44" y="25" width="7" height="6" />
      <rect x="27" y="31" width="41" height="58" rx="10" />
      <rect x="15" y="34" width="12" height="58" rx="6" />
      <rect x="68" y="34" width="12" height="58" rx="6" />
      <rect x="31" y="87" width="16" height="90" rx="7" />
      <rect x="48" y="87" width="16" height="90" rx="7" />
    </g>
  );
}

export function BodyMap(p: { status: (m: MuscleId) => string; label: (m: MuscleId) => string; selected: MuscleId | null; onSelect: (m: MuscleId) => void }) {
  return (
    <svg class="body-map" viewBox="0 0 200 190" role="group" aria-label={t('muscles')}>
      <Outline dx={0} />
      <Outline dx={105} />
      {REGIONS.map(([m, shapes]) => (
        <g
          key={m}
          class={`mm ${p.status(m)}${p.selected === m ? ' sel' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={p.label(m)}
          aria-pressed={p.selected === m}
          onClick={() => p.onSelect(m)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), p.onSelect(m))}
        >
          {shapes.map((s, i) => (s[0] === 'e' ? <ellipse key={i} cx={s[1]} cy={s[2]} rx={s[3]} ry={s[4]} /> : <rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx="3" />))}
        </g>
      ))}
      <text x="47.5" y="188" class="mm-cap">{t('figureFront')}</text>
      <text x="152.5" y="188" class="mm-cap">{t('figureBack')}</text>
    </svg>
  );
}

export const muscleKey = (m: MuscleId) => `mu_${m}` as Key;
