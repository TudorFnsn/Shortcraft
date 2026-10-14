import type { HTMLAttributes } from 'react';

/** Motion wrappers render whichever element the layout needs (a box, a heading, a list item). */
export type MotionTag =
  | 'div'
  | 'section'
  | 'article'
  | 'aside'
  | 'header'
  | 'footer'
  | 'main'
  | 'li'
  | 'ul'
  | 'ol'
  | 'span'
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3';

export type MotionProps = HTMLAttributes<HTMLElement> & { as?: MotionTag };
