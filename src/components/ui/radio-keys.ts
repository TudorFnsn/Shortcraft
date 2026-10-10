import type { KeyboardEvent } from 'react';

/**
 * Arrow-key handling for a role="radiogroup" of buttons (WAI-ARIA radio pattern):
 * arrows move focus and selection, Home/End jump to the ends, and only the
 * checked radio sits in the Tab order (`tabIndex={checked ? 0 : -1}`).
 */
export function onRadioKeyDown<T>(
  e: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  select: (value: T) => void,
): void {
  const i = values.indexOf(current);
  let next: number | null = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % values.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
    next = (i - 1 + values.length) % values.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = values.length - 1;
  if (next === null) return;

  e.preventDefault();
  const value = values[next];
  if (value === undefined) return;
  select(value);
  const radios = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
  radios[next]?.focus();
}
