import type { HTMLAttributes } from 'react';
import { Pop } from '@/components/motion/pop';

/**
 * A Boxes colour box (DesignPlan §4 B.1): 8px corners, no border, and a tone
 * that re-scopes the text tokens so everything inside reads at AA on its fill
 * in both themes (see the `box-*` utilities in globals.css).
 *
 * - ember: Create, CTAs, Create a voice, Pro. White text 24px+ only; small
 *   text inside goes in the dark pill (`<Badge tone="ink">`).
 * - blush: Today's idea, steps, My voices.
 * - sky: This week, looks, the Look sheet (navy text; deepens in dark mode).
 * - hero: the landing hero and sign-in.
 * - dark: the player, the account sheet, the footer.
 *
 * `pop` adds the section pop on scroll (stacked boxes on landing, Your videos,
 * pricing); `alternate` tilts it the other way.
 */
export type BoxTone = 'ember' | 'blush' | 'sky' | 'hero' | 'dark';

const tones: Record<BoxTone, string> = {
  ember: 'box-ember',
  blush: 'box-blush',
  sky: 'box-sky',
  hero: 'box-hero',
  dark: 'box-dark',
};

type BoxTag = 'div' | 'section' | 'article' | 'aside' | 'main' | 'header' | 'footer';

export function boxClasses(tone: BoxTone, className = ''): string {
  return `${tones[tone]} rounded-box ${className}`.trim();
}

export function Box({
  tone,
  as = 'section',
  pop = false,
  alternate = false,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone: BoxTone;
  as?: BoxTag;
  pop?: boolean;
  alternate?: boolean;
}) {
  const cls = boxClasses(tone, className);
  if (pop) return <Pop as={as} alternate={alternate} className={cls} {...props} />;
  const Tag = as;
  return <Tag className={cls} {...props} />;
}
