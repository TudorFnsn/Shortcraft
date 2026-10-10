import { describe, expect, it } from 'vitest';
import {
  applyThemeAttribute,
  parseThemeChoice,
  readThemeChoice,
  saveThemeChoice,
  THEME_STORAGE_KEY,
  themeInitScript,
} from '@/components/theme/theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    removeAttribute: (n: string) => void attrs.delete(n),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('theme choice', () => {
  it('only accepts light and dark; anything else means system', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice('"><script>')).toBe('system');
  });

  it('pins data-theme for light/dark and clears it for system', () => {
    const root = fakeRoot();
    applyThemeAttribute('dark', root);
    expect(root.attrs.get('data-theme')).toBe('dark');
    applyThemeAttribute('system', root);
    expect(root.attrs.has('data-theme')).toBe(false);
  });

  it('round-trips through storage, and system removes the key', () => {
    const storage = memoryStorage();
    saveThemeChoice('light', storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('light');
    expect(readThemeChoice(storage)).toBe('light');
    saveThemeChoice('system', storage);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readThemeChoice(storage)).toBe('system');
  });

  it('survives blocked storage (private mode)', () => {
    expect(() => saveThemeChoice('dark', throwingStorage)).not.toThrow();
    expect(readThemeChoice(throwingStorage)).toBe('system');
  });

  it('init script applies a stored choice before paint and ignores junk', () => {
    const run = (stored: string | null) => {
      const root = fakeRoot();
      const localStorage = memoryStorage(stored === null ? {} : { [THEME_STORAGE_KEY]: stored });
      new Function('localStorage', 'document', themeInitScript)(localStorage, {
        documentElement: root,
      });
      return root.attrs.get('data-theme');
    };
    expect(run('dark')).toBe('dark');
    expect(run('light')).toBe('light');
    expect(run(null)).toBeUndefined();
    expect(run('purple')).toBeUndefined();
  });
});
