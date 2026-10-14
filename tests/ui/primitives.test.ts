import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/badge';
import { Box, boxClasses } from '@/components/ui/box';
import { buttonClasses } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Note } from '@/components/ui/note';

describe('Boxes primitives', () => {
  it('buttons press in, and filled ones speak in Fraunces from lg up', () => {
    expect(buttonClasses()).toContain('press');
    expect(buttonClasses()).toContain('bg-blush');
    expect(buttonClasses({ size: 'lg' })).toContain('font-display');
    expect(buttonClasses({ variant: 'secondary', size: 'lg' })).not.toContain('font-display');
    expect(buttonClasses({ variant: 'ghost' })).not.toContain('press');
  });

  it('never makes white-on-ember text smaller than 24px', () => {
    const small = buttonClasses({ variant: 'ember', size: 'sm' });
    expect(small).toContain('text-[30px]');
    expect(small).not.toContain('text-[15px]');
  });

  it('every touch size is at least 44px tall', () => {
    for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
      expect(buttonClasses({ size })).toMatch(/min-h-(11|\[(5[4-9]|[6-9]\d)px\])/);
    }
  });

  it('boxes carry their tone (which re-scopes the text tokens)', () => {
    expect(boxClasses('sky')).toBe('box-sky rounded-box');
    expect(renderToStaticMarkup(createElement(Box, { tone: 'blush', as: 'div' }, 'x'))).toBe(
      '<div class="box-blush rounded-box">x</div>',
    );
  });

  it('handwritten notes are hidden from screen readers', () => {
    const out = renderToStaticMarkup(createElement(Note, null, 'post one today!'));
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('font-note');
  });

  it('fields tie their label, hint and error to the input', () => {
    const out = renderToStaticMarkup(
      createElement(Field, { id: 'n', label: 'Name', hint: 'Shown on cards', error: 'Too short' }),
    );
    expect(out).toContain('<label for="n"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby="n-hint n-error"');
    expect(out).toContain('role="alert"');
  });

  it('chips come in the canvas tones', () => {
    expect(renderToStaticMarkup(createElement(Badge, { tone: 'ink' }, 'Posted'))).toContain(
      'rounded-full',
    );
  });
});
