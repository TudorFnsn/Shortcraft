import type { ReactNode } from 'react';

/**
 * Boxes chips (DesignPlan §4 B.1, 50px pills). `tone`:
 * - soft (default): blush-red tint for plan names ("Pro") and render steps.
 * - blush: "Ready" on a video card.
 * - ink: the dark pill ("Posted", the cost line, small text on the ember box).
 * - danger: "Didn't finish" (white on the deep red, 5.7:1).
 * - surface: a white chip (a step that is done).
 */
type Tone = 'soft' | 'blush' | 'ink' | 'danger' | 'surface';

const tones: Record<Tone, string> = {
  soft: 'bg-ember-soft text-ember-ink',
  blush: 'bg-blush text-on-blush',
  ink: 'bg-[#212121] text-blush',
  danger: 'bg-[#c81e3a] text-white',
  surface: 'bg-white text-[#212121]',
};

export function Badge({
  children,
  tone = 'soft',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`${tones[tone]} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`.trim()}
    >
      {children}
    </span>
  );
}
