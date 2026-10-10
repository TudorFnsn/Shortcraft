'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import {
  applyThemeAttribute,
  readThemeChoice,
  saveThemeChoice,
  THEME_STORAGE_KEY,
  type ThemeChoice,
} from './theme';

const CHANGE_EVENT = 'shortcraft-theme-change';

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = (): ThemeChoice => readThemeChoice(window.localStorage);
// The server can't know the stored choice; "system" matches the server HTML.
const getServerSnapshot = (): ThemeChoice => 'system';

const OPTIONS: { id: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  {
    id: 'system',
    label: 'System',
    icon: (
      <path d="M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    id: 'light',
    label: 'Light',
    icon: (
      <>
        <circle cx="8" cy="8" r="2.75" />
        <path
          d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" strokeLinejoin="round" />,
  },
];

/** System / Light / Dark picker. Applies instantly and remembers the choice. */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Dev Strict Mode remounts <html> and drops the attribute the init script set;
  // re-apply it before paint (a no-op in production).
  useLayoutEffect(() => {
    applyThemeAttribute(readThemeChoice(window.localStorage), document.documentElement);
  }, []);

  function pick(next: ThemeChoice) {
    saveThemeChoice(next, window.localStorage);
    applyThemeAttribute(next, document.documentElement);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="bg-raised flex gap-1 rounded-xl p-1">
      {OPTIONS.map((o) => {
        const on = o.id === choice;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => pick(o.id)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 text-sm transition-colors ${
              on ? 'bg-surface font-semibold shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              {o.icon}
            </svg>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
