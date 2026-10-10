import type { ReactNode } from 'react';

/** Small ember-tinted label for plan names ("Pro") and render steps ("Step 2 of 6"). */
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`bg-ember-soft text-ember-ink inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`.trim()}
    >
      {children}
    </span>
  );
}
