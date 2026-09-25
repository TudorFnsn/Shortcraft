import { describe, expect, it } from 'vitest';
import {
  advance,
  fail,
  isTerminal,
  progress,
  RENDER_STEPS,
  type RenderStatus,
} from '@/features/render/machine';

describe('advance', () => {
  it('walks the full happy path in order', () => {
    const seen: RenderStatus[] = ['draft'];
    let s: RenderStatus = 'draft';
    while (!isTerminal(s)) {
      s = advance(s);
      seen.push(s);
    }
    expect(seen).toEqual(['draft', ...RENDER_STEPS, 'done']);
  });

  it('throws when advancing a terminal status', () => {
    expect(() => advance('done')).toThrow();
    expect(() => advance('failed')).toThrow();
  });
});

describe('fail', () => {
  it('sends any non-terminal status to failed', () => {
    expect(fail('images')).toBe('failed');
    expect(fail('draft')).toBe('failed');
  });
  it('throws on terminal statuses', () => {
    expect(() => fail('done')).toThrow();
  });
});

describe('progress', () => {
  it('is 0 at draft, 1 at done, 0 at failed', () => {
    expect(progress('draft')).toBe(0);
    expect(progress('done')).toBe(1);
    expect(progress('failed')).toBe(0);
  });

  it('increases monotonically across steps', () => {
    let prev = -1;
    let s: RenderStatus = 'draft';
    while (s !== 'done') {
      const p = progress(s);
      expect(p).toBeGreaterThan(prev);
      prev = p;
      s = advance(s);
    }
    expect(progress('done')).toBeGreaterThan(prev);
  });
});
