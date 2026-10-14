import type { ReactNode } from 'react';

/**
 * Marquee (B.1 motion #9): an endless vertical list, linear 18s. Pure CSS: the
 * list is drawn twice (the copy hidden from screen readers) and slides up by
 * half. It stands still under reduced motion. Landing only.
 */
export function Marquee({
  items,
  className = '',
  itemClassName = '',
}: {
  items: readonly ReactNode[];
  className?: string;
  itemClassName?: string;
}) {
  const list = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="m-0 list-none p-0">
      {items.map((item, i) => (
        <li key={i} className={itemClassName}>
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`overflow-hidden ${className}`.trim()}>
      <div className="animate-marquee motion-reduce:animate-none">
        {list(false)}
        {list(true)}
      </div>
    </div>
  );
}
