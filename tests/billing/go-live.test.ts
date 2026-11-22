import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import {
  expectedStripeCatalog,
  formatPreflightReport,
  publicOrigin,
  REQUIRED_WEBHOOK_EVENTS,
  runGoLivePreflight,
  WEBHOOK_PATH,
  type PreflightInput,
  type PriceSnapshot,
} from '@/features/billing/go-live';

const SITE = 'https://shortcraft.example';

/** The account exactly as stripe-setup.mts would create it. */
function goodPrices(): PriceSnapshot[] {
  return expectedStripeCatalog().map((e, i) => ({
    lookupKey: e.lookupKey,
    id: `price_${i}`,
    active: true,
    unitAmount: e.unitAmount,
    currency: e.currency,
    recurringInterval: e.recurringInterval,
    metadata: { ...e.metadata },
    productTaxCode: 'txcd_10000000',
  }));
}

function input(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    expectMode: 'live',
    secretKey: 'rk_live_abc',
    webhookSecret: 'whsec_abc',
    siteUrl: SITE,
    prices: goodPrices(),
    webhooks: [
      {
        id: 'we_1',
        url: `${SITE}${WEBHOOK_PATH}`,
        status: 'enabled',
        enabledEvents: [...REQUIRED_WEBHOOK_EVENTS],
      },
    ],
    ...overrides,
  };
}

const failing = (i: PreflightInput) =>
  runGoLivePreflight(i)
    .checks.filter((c) => c.status === 'fail')
    .map((c) => c.id);

describe('expectedStripeCatalog', () => {
  it('covers every plan and top-up with the webhook metadata', () => {
    const cat = expectedStripeCatalog();
    expect(cat).toHaveLength(Object.keys(PLANS).length + TOPUP_PACKS.length);
    expect(new Set(cat.map((c) => c.lookupKey)).size).toBe(cat.length);
    const pro = cat.find((c) => c.lookupKey === 'pro_monthly');
    expect(pro).toMatchObject({
      unitAmount: PLANS.pro.priceCents,
      recurringInterval: 'month',
      metadata: { kind: 'subscription', planId: 'pro', credits: String(PLANS.pro.monthlyCredits) },
    });
    const pack = TOPUP_PACKS[0]!;
    expect(cat.find((c) => c.lookupKey === pack.id)).toMatchObject({
      recurringInterval: null,
      metadata: { kind: 'topup', credits: String(pack.credits) },
    });
  });

  it('matches what scripts/stripe-setup.mts creates (lookup keys + currency)', () => {
    const setup = readFileSync(resolve('scripts/stripe-setup.mts'), 'utf8');
    expect(setup).toContain('lookupKey: `${plan.id}_monthly`');
    expect(setup).toContain('lookupKey: pack.id');
    expect(setup).toContain("currency: 'eur'");
  });
});

describe('runGoLivePreflight', () => {
  it('is ready for a correctly configured live account', () => {
    const report = runGoLivePreflight(input());
    expect(report.ready).toBe(true);
    expect(report.checks.filter((c) => c.status !== 'pass')).toEqual([]);
  });

  it('fails on a test key when expecting live, and passes it in --test mode', () => {
    expect(failing(input({ secretKey: 'sk_test_x' }))).toEqual(['secret_key']);
    expect(runGoLivePreflight(input({ secretKey: 'sk_test_x', expectMode: 'test' })).ready).toBe(
      true,
    );
  });

  it('warns (not fails) on a full live secret key', () => {
    const r = runGoLivePreflight(input({ secretKey: 'sk_live_x' }));
    expect(r.ready).toBe(true);
    expect(r.checks.find((c) => c.id === 'restricted_key')?.status).toBe('warn');
  });

  it('fails on missing keys and a malformed webhook secret', () => {
    expect(failing(input({ secretKey: undefined, webhookSecret: undefined }))).toEqual([
      'secret_key',
      'webhook_secret',
    ]);
    expect(failing(input({ webhookSecret: 'abc' }))).toEqual(['webhook_secret']);
  });

  it('fails when the site is not a public https origin', () => {
    for (const siteUrl of [
      undefined,
      'http://shortcraft.example',
      'https://localhost:3000',
      'nope',
    ]) {
      expect(failing(input({ siteUrl }))).toEqual(['site_url']);
    }
  });

  it('fails when the endpoint is missing, disabled or lacks events', () => {
    expect(failing(input({ webhooks: [] }))).toEqual(['webhook_endpoint']);
    const base = input().webhooks[0]!;
    expect(failing(input({ webhooks: [{ ...base, status: 'disabled' }] }))).toEqual([
      'webhook_endpoint',
    ]);
    const r = runGoLivePreflight(
      input({ webhooks: [{ ...base, enabledEvents: ['checkout.session.completed'] }] }),
    );
    const events = r.checks.find((c) => c.id === 'webhook_events');
    expect(events?.status).toBe('fail');
    expect(events?.message).toContain('customer.subscription.updated');
  });

  it('accepts a trailing slash and warns on a wildcard endpoint', () => {
    const base = input().webhooks[0]!;
    const r = runGoLivePreflight(
      input({ webhooks: [{ ...base, url: `${base.url}/`, enabledEvents: ['*'] }] }),
    );
    expect(r.ready).toBe(true);
    expect(r.checks.find((c) => c.id === 'webhook_events')?.status).toBe('warn');
  });

  it('fails a missing price and names it', () => {
    const prices = goodPrices().filter((p) => p.lookupKey !== 'ultra_monthly');
    expect(failing(input({ prices }))).toEqual(['price:ultra_monthly']);
  });

  it('fails a price whose credits metadata would grant the wrong amount', () => {
    const prices = goodPrices().map((p) =>
      p.lookupKey === 'topup_20k' ? { ...p, metadata: { ...p.metadata, credits: '200000' } } : p,
    );
    const r = runGoLivePreflight(input({ prices }));
    const check = r.checks.find((c) => c.id === 'price:topup_20k');
    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('metadata.credits');
    expect(r.ready).toBe(false);
  });

  it('fails on wrong amount, currency, interval or planId', () => {
    const prices = goodPrices().map((p) =>
      p.lookupKey === 'starter_monthly'
        ? {
            ...p,
            unitAmount: 999,
            currency: 'usd',
            recurringInterval: 'year',
            metadata: { ...p.metadata, planId: 'pro' },
          }
        : p,
    );
    const msg = runGoLivePreflight(input({ prices })).checks.find(
      (c) => c.id === 'price:starter_monthly',
    )?.message;
    expect(msg).toContain('amount 999');
    expect(msg).toContain('currency usd');
    expect(msg).toContain('interval year');
    expect(msg).toContain('metadata.planId');
  });

  it('warns on a product without a tax code', () => {
    const prices = goodPrices().map((p) => ({ ...p, productTaxCode: null }));
    const r = runGoLivePreflight(input({ prices }));
    expect(r.ready).toBe(true);
    expect(r.checks.filter((c) => c.status === 'warn')).toHaveLength(prices.length);
  });
});

describe('publicOrigin', () => {
  it('keeps only the origin of a public https URL', () => {
    expect(publicOrigin('https://shortcraft-rho.vercel.app/some/path')).toBe(
      'https://shortcraft-rho.vercel.app',
    );
    expect(publicOrigin('http://127.0.0.1')).toBeNull();
  });
});

describe('webhook coverage', () => {
  it('every required event is handled by the webhook route', () => {
    const src = readFileSync(resolve('src/features/billing/webhook.ts'), 'utf8');
    for (const event of REQUIRED_WEBHOOK_EVENTS) expect(src).toContain(`case '${event}'`);
  });
});

describe('formatPreflightReport', () => {
  it('summarises the verdict', () => {
    expect(formatPreflightReport(runGoLivePreflight(input()))).toContain('READY');
    expect(formatPreflightReport(runGoLivePreflight(input({ webhooks: [] })))).toContain(
      'NOT READY: 1 failure',
    );
  });
});
