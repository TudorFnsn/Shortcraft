/**
 * Theme choice (DesignPlan §4 B): Light is the default, Dark is the partner and
 * System follows the OS. Light sets nothing on <html>; Dark and System set
 * `data-theme`, and the CSS resolves "system" with prefers-color-scheme, so it
 * follows OS changes live. The choice lives in localStorage and is applied
 * before first paint by `themeInitScript` (see layout.tsx), so there is no
 * flash on load.
 */
export const THEME_STORAGE_KEY = 'shortcraft-theme';
export const THEME_CHOICES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'dark' || value === 'system' ? value : 'light';
}

/** Inline <head> script: runs during HTML parsing, before React or paint. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="system")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

interface ThemeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Reflects a choice on the root element (no attribute for the Light default). */
export function applyThemeAttribute(choice: ThemeChoice, root: ThemeTarget): void {
  if (choice === 'light') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Persists a choice; storage can be unavailable (private mode), which is fine. */
export function saveThemeChoice(choice: ThemeChoice, storage: ThemeStorage): void {
  try {
    if (choice === 'light') storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The choice still applies for this page view.
  }
}

export function readThemeChoice(storage: ThemeStorage): ThemeChoice {
  try {
    return parseThemeChoice(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}
