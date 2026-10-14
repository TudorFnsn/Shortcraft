import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { typedStart, typedStep, type TypedState } from '@/components/motion/typed';
import { ColourIn, Marquee, Pop, SplitLines, StepReveal, Typed } from '@/components/motion';
import { MOTION } from '@/components/motion/gsap';
import { motionInitScript } from '@/components/motion/motion-script';

function run(words: string[], steps: number) {
  let state: TypedState = typedStart(words);
  const frames: { text: string; wait: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const next = typedStep(words, state);
    state = next.state;
    frames.push({ text: next.text, wait: next.wait });
  }
  return frames;
}

describe('typed word', () => {
  it('backspaces the first word, types the next, holds it, and loops', () => {
    const frames = run(['ON', 'UP'], 8);
    expect(frames.map((f) => f.text)).toEqual(['O', '', 'U', 'UP', 'U', '', 'O', 'ON']);
    expect(frames[3]!.wait).toBe(MOTION.typed.hold);
    expect(frames[0]!.wait).toBe(MOTION.typed.perLetter);
  });

  it('copes with a single or empty word list', () => {
    expect(run(['GO'], 4).map((f) => f.text)).toEqual(['G', '', 'G', 'GO']);
    expect(run([], 2).map((f) => f.text)).toEqual(['', '']);
  });
});

describe('motion kit renders its final state on the server', () => {
  const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

  it('Typed shows the first word, and screen readers get one stable label', () => {
    const out = html(createElement(Typed, { words: ['UNPOSTED', 'ON PAUSE'], label: 'Unposted' }));
    expect(out).toContain('<span class="sr-only">Unposted</span>');
    expect(out).toContain('<span aria-hidden="true">UNPOSTED<span class="typed-caret">');
  });

  it('SplitLines keeps the heading text whole, marked for the pre-paint hide', () => {
    const out = html(createElement(SplitLines, { as: 'h1', className: 't' }, 'Your videos'));
    expect(out).toBe('<h1 data-split="" class="t">Your videos</h1>');
  });

  it('Pop, ColourIn and StepReveal render plain elements with their children', () => {
    expect(html(createElement(Pop, { className: 'box' }, 'x'))).toBe(
      '<section class="box">x</section>',
    );
    expect(html(createElement(ColourIn, null, 'img'))).toBe('<div>img</div>');
    expect(
      html(createElement(StepReveal, null, createElement('li', { key: 'a' }, 'Writing script'))),
    ).toBe('<ul><li>Writing script</li></ul>');
  });

  it('Marquee draws the list twice, hiding the copy from screen readers', () => {
    const out = html(createElement(Marquee, { items: ['A script that hooks', 'Captions'] }));
    expect(out.match(/A script that hooks/g)).toHaveLength(2);
    expect(out).toContain('<ul aria-hidden="true"');
    expect(out).toContain('motion-reduce:animate-none');
  });
});

describe('motion head script', () => {
  const runScript = (reduced: boolean) => {
    const attrs = new Map<string, string>();
    new Function('matchMedia', 'document', motionInitScript)(() => ({ matches: reduced }), {
      documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) },
    });
    return attrs.has('data-motion');
  };

  it('marks the page only when motion is allowed', () => {
    expect(runScript(false)).toBe(true);
    expect(runScript(true)).toBe(false);
  });
});
