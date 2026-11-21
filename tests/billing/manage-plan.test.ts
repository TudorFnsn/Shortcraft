import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ManagePlanButton } from '@/components/manage-plan-button';
import { TERMS } from '@/config/legal';

const src = (p: string) => readFileSync(resolve(p), 'utf8');

describe('self-serve cancellation', () => {
  it('renders a Manage plan button that posts to the billing portal', () => {
    const html = renderToStaticMarkup(createElement(ManagePlanButton));
    expect(html).toContain('Manage plan');
    expect(html).toContain('type="button"');
    expect(src('src/components/manage-plan-button.tsx')).toContain("'/api/billing/portal'");
  });

  it('backs the Terms promise ("cancel … from the billing portal") with a button on /pricing', () => {
    const terms = JSON.stringify(TERMS);
    expect(terms).toMatch(/cancel at any time from the billing portal/i);
    expect(src('src/app/pricing/pricing-view.tsx')).toMatch(
      /canManagePlan && <ManagePlanButton \/>/,
    );
    expect(src('src/app/pricing/page.tsx')).toContain('hasPaid(user.id)');
  });
});
