import type { CSSProperties, ReactNode } from 'react';

/**
 * The handwritten note (DesignPlan §4 B.1): Shadows Into Light Two, tilted and
 * a touch blurred. Decorative only, so it is hidden from screen readers; at
 * most one per screen, and never the only place something is said.
 */
type NoteColour = 'ember' | 'orange' | 'cyan' | 'blush';

const colours: Record<NoteColour, string> = {
  ember: 'text-ember',
  orange: 'text-orange',
  cyan: 'text-[#12d0de]',
  blush: 'text-blush',
};

export function Note({
  children,
  rotate = -8,
  colour = 'ember',
  className = '',
  style,
}: {
  children: ReactNode;
  /** Degrees; lil-boxes uses ±8–23. */
  rotate?: number;
  colour?: NoteColour;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p
      aria-hidden="true"
      className={`font-note pointer-events-none m-0 leading-[.9] blur-[.5px] select-none ${colours[colour]} ${className}`.trim()}
      style={{ transform: `rotate(${rotate}deg)`, ...style }}
    >
      {children}
    </p>
  );
}
