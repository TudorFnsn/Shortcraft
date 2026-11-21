/**
 * Stripe go-live preflight: a pure check of everything the app needs from a
 * Stripe account before it can take real money (TheMasterPlan §5 "Stripe
 * go-live checklist").
 *
 * The webhook grants credits from each price's metadata (`credits`, `kind`,
 * `planId`), so a live price with the wrong metadata is a money bug, not a
 * cosmetic one: too many credits leaks margin, too few short-changes a paying
 * customer. This compares the account against the committed catalog
 * (`config/plans.ts`) field by field.
 *
 * Pure: the caller (scripts/stripe-preflight.mts) fetches read-only snapshots
 * from Stripe and passes them in. Nothing here talks to the network.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';

/** Events the webhook route must receive (see features/billing/webhook.ts). */
export const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

export const WEBHOOK_PATH = '/api/webhooks/stripe';

/** All prices are sold in EUR (stripe-setup.mts). */
export const CATALOG_CURRENCY = 'eur';

export interface ExpectedPrice {
  lookupKey: string;
  unitAmount: number;
  currency: string;
  /** 'month' for a subscription, null for a one-time top-up. */
  recurringInterval: 'month' | 'year' | null;
  metadata: Record<string, string>;
}

/** What the account must sell, derived from the committed catalog. */
export function expectedStripeCatalog(): ExpectedPrice[] {
  const plans = Object.values(PLANS).map<ExpectedPrice>((plan) => ({
    lookupKey: `${plan.id}_monthly`,
    unitAmount: plan.priceCents,
    currency: CATALOG_CURRENCY,
    recurringInterval: 'month',
    metadata: { kind: 'subscription', planId: plan.id, credits: String(plan.monthlyCredits) },
  }));
  const packs = TOPUP_PACKS.map<ExpectedPrice>((pack) => ({
    lookupKey: pack.id,
    unitAmount: pack.priceCents,
    currency: CATALOG_CURRENCY,
    recurringInterval: null,
    metadata: { kind: 'topup', credits: String(pack.credits) },
  }));
  return [...plans, ...packs];
}

/** The fields of a Stripe price the preflight reads. */
export interface PriceSnapshot {
  lookupKey: string;
  id: string;
  active: boolean;
  unitAmount: number | null;
  currency: string;
  recurringInterval: string | null;
  metadata: Record<string, string>;
  productTaxCode: string | null;
}

/** The fields of a Stripe webhook endpoint the preflight reads. */
export interface WebhookSnapshot {
  id: string;
  url: string;
  status: string;
  enabledEvents: string[];
}

export interface PreflightInput {
  /** 'live' for the real go-live, 'test' to dry-run the checks on the sandbox. */
  expectMode: 'live' | 'test';
  secretKey: string | undefined;
  webhookSecret: string | undefined;
  siteUrl: string | undefined;
  /** Active prices found by lookup key (missing keys are simply absent). */
  prices: PriceSnapshot[];
  webhooks: WebhookSnapshot[];
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface PreflightCheck {
  id: string;
  status: CheckStatus;
  message: string;
}

export interface PreflightReport {
  checks: PreflightCheck[];
  /** True when no check failed (warnings allowed). */
  ready: boolean;
}

const pass = (id: string, message: string): PreflightCheck => ({ id, status: 'pass', message });
const warn = (id: string, message: string): PreflightCheck => ({ id, status: 'warn', message });
const fail = (id: string, message: string): PreflightCheck => ({ id, status: 'fail', message });

function keyMode(key: string): 'live' | 'test' | 'unknown' {
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return 'unknown';
}

function checkKeys(input: PreflightInput): PreflightCheck[] {
  const out: PreflightCheck[] = [];
  const key = input.secretKey;
  if (!key) {
    out.push(fail('secret_key', 'STRIPE_SECRET_KEY is not set'));
  } else {
    const mode = keyMode(key);
    if (mode === input.expectMode) {
      out.push(pass('secret_key', `STRIPE_SECRET_KEY is a ${mode} key`));
    } else {
      out.push(
        fail(
          'secret_key',
          `STRIPE_SECRET_KEY is a ${mode} key, expected ${input.expectMode} (sk_${input.expectMode}_… or rk_${input.expectMode}_…)`,
        ),
      );
    }
    if (key.startsWith('sk_') && mode === 'live') {
      out.push(
        warn(
          'restricted_key',
          'a full secret key is in use; a restricted key (rk_live_…) limited to what the app calls is safer',
        ),
      );
    }
  }
  const whsec = input.webhookSecret;
  if (!whsec) out.push(fail('webhook_secret', 'STRIPE_WEBHOOK_SECRET is not set'));
  else if (!whsec.startsWith('whsec_'))
    out.push(
      fail('webhook_secret', 'STRIPE_WEBHOOK_SECRET does not look like a signing secret (whsec_…)'),
    );
  else out.push(pass('webhook_secret', 'STRIPE_WEBHOOK_SECRET is set'));
  return out;
}

/** The public origin, or null when it can't receive Stripe's webhooks. */
export function publicOrigin(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null;
  return url.origin;
}

function checkWebhook(input: PreflightInput): PreflightCheck[] {
  const origin = publicOrigin(input.siteUrl);
  if (!origin) {
    return [
      fail(
        'site_url',
        `NEXT_PUBLIC_SITE_URL must be the public https origin (got ${input.siteUrl ?? 'nothing'})`,
      ),
    ];
  }
  const out = [pass('site_url', `site is ${origin}`)];
  const target = `${origin}${WEBHOOK_PATH}`;
  const endpoint = input.webhooks.find((w) => w.url.replace(/\/+$/, '') === target);
  if (!endpoint) {
    const others = input.webhooks.map((w) => w.url).join(', ') || 'none';
    out.push(fail('webhook_endpoint', `no webhook endpoint for ${target} (registered: ${others})`));
    return out;
  }
  if (endpoint.status !== 'enabled') {
    out.push(fail('webhook_endpoint', `${target} is ${endpoint.status}, not enabled`));
  } else {
    out.push(pass('webhook_endpoint', `${target} is registered and enabled (${endpoint.id})`));
  }
  const all = endpoint.enabledEvents.includes('*');
  const missing = all
    ? []
    : REQUIRED_WEBHOOK_EVENTS.filter((e) => !endpoint.enabledEvents.includes(e));
  if (missing.length > 0) {
    out.push(fail('webhook_events', `endpoint is missing events: ${missing.join(', ')}`));
  } else if (all) {
    out.push(
      warn(
        'webhook_events',
        'endpoint listens to every event (*); list only the four the app handles',
      ),
    );
  } else {
    out.push(pass('webhook_events', `endpoint sends all ${REQUIRED_WEBHOOK_EVENTS.length} events`));
  }
  return out;
}

function checkPrice(expected: ExpectedPrice, found: PriceSnapshot | undefined): PreflightCheck[] {
  const id = `price:${expected.lookupKey}`;
  if (!found || !found.active) {
    return [
      fail(
        id,
        `no active price with lookup_key "${expected.lookupKey}" (run scripts/stripe-setup.mts)`,
      ),
    ];
  }
  const problems: string[] = [];
  if (found.unitAmount !== expected.unitAmount)
    problems.push(`amount ${found.unitAmount ?? 'none'} ≠ ${expected.unitAmount}`);
  if (found.currency.toLowerCase() !== expected.currency)
    problems.push(`currency ${found.currency} ≠ ${expected.currency}`);
  if ((found.recurringInterval ?? null) !== expected.recurringInterval)
    problems.push(
      `interval ${found.recurringInterval ?? 'one-time'} ≠ ${expected.recurringInterval ?? 'one-time'}`,
    );
  for (const [k, v] of Object.entries(expected.metadata)) {
    if (found.metadata[k] !== v)
      problems.push(`metadata.${k} "${found.metadata[k] ?? ''}" ≠ "${v}"`);
  }
  const out: PreflightCheck[] = [];
  if (problems.length > 0) out.push(fail(id, `${found.id}: ${problems.join('; ')}`));
  else out.push(pass(id, `${found.id} matches the catalog`));
  if (!found.productTaxCode)
    out.push(warn(`${id}:tax_code`, `${found.id}'s product has no tax_code`));
  return out;
}

/** Run every check. `ready` is false if any check fails. */
export function runGoLivePreflight(input: PreflightInput): PreflightReport {
  const byKey = new Map(input.prices.map((p) => [p.lookupKey, p]));
  const checks = [
    ...checkKeys(input),
    ...checkWebhook(input),
    ...expectedStripeCatalog().flatMap((e) => checkPrice(e, byKey.get(e.lookupKey))),
  ];
  return { checks, ready: checks.every((c) => c.status !== 'fail') };
}

/** Plain-text report for the terminal. */
export function formatPreflightReport(report: PreflightReport): string {
  const icon: Record<CheckStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  const lines = report.checks.map((c) => `  ${icon[c.status]}  ${c.message}`);
  const fails = report.checks.filter((c) => c.status === 'fail').length;
  const warns = report.checks.filter((c) => c.status === 'warn').length;
  lines.push('');
  lines.push(
    report.ready
      ? `READY: no failures (${warns} warning${warns === 1 ? '' : 's'})`
      : `NOT READY: ${fails} failure${fails === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`,
  );
  return lines.join('\n');
}
