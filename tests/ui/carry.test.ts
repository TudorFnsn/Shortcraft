import { describe, expect, it } from 'vitest';
import { createHrefAfterLogin, loginHrefFor, readCarried } from '@/features/auth/carry';
import { createHref } from '@/components/ideas';

describe('carrying an idea through sign-up', () => {
  it('reads a trimmed idea and a known theme', () => {
    expect(readCarried({ idea: '  Why honey never spoils ', theme: 'fun-facts' })).toEqual({
      idea: 'Why honey never spoils',
      theme: 'fun-facts',
    });
  });

  it('drops unknown themes, empty ideas and caps the idea at 300 chars', () => {
    expect(readCarried({ idea: '   ', theme: 'nope' })).toEqual({ idea: null, theme: null });
    expect(readCarried({ idea: 'x'.repeat(400) }).idea).toHaveLength(300);
    expect(readCarried({ idea: ['first', 'second'] }).idea).toBe('first');
  });

  it('sends a signed-out /create visitor to login with idea + theme, and back to Create', () => {
    const href = createHref({ themeId: 'horror-story', topic: 'A voicemail from tomorrow' });
    const params = Object.fromEntries(new URL(href, 'https://s.app').searchParams);
    const login = loginHrefFor(params);
    expect(login).toBe('/login?idea=A+voicemail+from+tomorrow&theme=horror-story');

    const back = createHrefAfterLogin(
      readCarried(Object.fromEntries(new URL(login, 'https://s.app').searchParams)),
    );
    expect(back).toBe('/create?idea=A+voicemail+from+tomorrow&theme=horror-story');
  });

  it('falls back to bare paths when nothing is carried', () => {
    expect(loginHrefFor({})).toBe('/login');
    expect(createHrefAfterLogin({ idea: null, theme: null })).toBe('/create');
  });
});
