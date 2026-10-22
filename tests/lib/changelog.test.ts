import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOLD_MARKER,
  FRAGMENT_DIR,
  foldFragments,
  parseFragment,
  type Fragment,
} from '@/lib/changelog';
import { unwrap } from '@/lib/result';

const frag = (name: string, date: string): Fragment => ({
  name,
  date,
  line: `- **${date}** — ${name}`,
});

describe('parseFragment', () => {
  it('accepts a well-formed fragment', () => {
    const f = unwrap(parseFragment('2026-10-22-x-y.md', '- **2026-10-22** — Did a thing.\n'));
    expect(f).toEqual({
      name: '2026-10-22-x-y.md',
      date: '2026-10-22',
      line: '- **2026-10-22** — Did a thing.',
    });
  });

  it.each([
    ['2026-10-22_x.md', '- **2026-10-22** — a', /name/],
    ['2026-10-22-X.md', '- **2026-10-22** — a', /name/],
    ['2026-02-30-x.md', '- **2026-02-30** — a', /real date/],
    ['2026-10-22-x.md', '- **2026-10-21** — a', /must start/],
    ['2026-10-22-x.md', '- **2026-10-22** — a\n- **2026-10-22** — b', /one line/],
    ['2026-10-22-x.md', '', /one line/],
  ])('rejects %s', (name, content, msg) => {
    const r = parseFragment(name, content);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe('foldFragments', () => {
  const plan = ['## 10. Changelog', '', FOLD_MARKER, '', '- **2026-10-01** — old', ''].join('\n');

  it('inserts newest first right below the marker, above older entries', () => {
    const out = unwrap(
      foldFragments(plan, [
        frag('2026-10-20-b.md', '2026-10-20'),
        frag('2026-10-22-a.md', '2026-10-22'),
        frag('2026-10-20-a.md', '2026-10-20'),
      ]),
    );
    expect(out.split('\n')).toEqual([
      '## 10. Changelog',
      '',
      FOLD_MARKER,
      '',
      '- **2026-10-22** — 2026-10-22-a.md',
      '- **2026-10-20** — 2026-10-20-a.md',
      '- **2026-10-20** — 2026-10-20-b.md',
      '- **2026-10-01** — old',
      '',
    ]);
  });

  it('leaves the plan alone with no fragments', () => {
    expect(unwrap(foldFragments(plan, []))).toBe(plan);
  });

  it('fails without the marker', () => {
    expect(foldFragments('## 10. Changelog\n', [frag('2026-10-22-a.md', '2026-10-22')]).ok).toBe(
      false,
    );
  });
});

describe('the repo', () => {
  it('TheMasterPlan.md has exactly one fold marker', () => {
    const plan = readFileSync(resolve('TheMasterPlan.md'), 'utf8');
    expect(plan.split('\n').filter((l) => l.trim() === FOLD_MARKER)).toHaveLength(1);
  });

  it('every fragment in docs/changelog is well-formed', () => {
    const dir = resolve(FRAGMENT_DIR);
    for (const name of readdirSync(dir)) {
      if (name === 'README.md') continue;
      const r = parseFragment(name, readFileSync(join(dir, name), 'utf8'));
      expect(r.ok ? 'ok' : r.error).toBe('ok');
    }
  });
});
