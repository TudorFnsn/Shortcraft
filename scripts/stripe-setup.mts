/**
 * Idempotently create Stripe products + prices for Shortcraft's plans and
 * top-up packs in whatever account STRIPE_SECRET_KEY points at (sandbox now).
 *
 * Prices are keyed by a stable `lookup_key` so the app resolves them at runtime
 * without hardcoding environment-specific price IDs. Each price carries metadata
 * (kind, planId, credits) that the webhook reads to grant the right credits.
 * Products get a tax_code (required when Managed Payments is enabled).
 *
 * Run: npx tsx scripts/stripe-setup.mts
 * Safe to re-run — existing prices (by lookup_key) are reused, not duplicated.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Stripe from 'stripe';

for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const { PLANS, TOPUP_PACKS } = await import('@/config/plans');

const key = process.env.STRIPE_SECRET_KEY;
if (!key || key.includes('your_key_here')) throw new Error('STRIPE_SECRET_KEY not set');
const stripe = new Stripe(key);

// General - Electronically Supplied Services (fine for a digital video product).
const TAX_CODE = 'txcd_10000000';

async function ensureProductTaxCode(productId: string): Promise<void> {
  const p = await stripe.products.retrieve(productId);
  if (!p.tax_code) {
    await stripe.products.update(productId, { tax_code: TAX_CODE });
    console.log(`    set tax_code on ${productId}`);
  }
}

async function ensurePrice(opts: {
  lookupKey: string;
  productName: string;
  unitAmount: number;
  currency: string;
  recurring?: Stripe.PriceCreateParams.Recurring;
  metadata: Record<string, string>;
}): Promise<string> {
  const existing = await stripe.prices.list({
    lookup_keys: [opts.lookupKey],
    limit: 1,
    active: true,
    expand: ['data.product'],
  });
  const found = existing.data[0];
  if (found) {
    const prod = found.product;
    await ensureProductTaxCode(typeof prod === 'string' ? prod : prod.id);
    console.log(`  reuse   ${opts.lookupKey} -> ${found.id}`);
    return found.id;
  }
  const product = await stripe.products.create({
    name: opts.productName,
    tax_code: TAX_CODE,
    metadata: opts.metadata,
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: opts.unitAmount,
    currency: opts.currency,
    lookup_key: opts.lookupKey,
    ...(opts.recurring ? { recurring: opts.recurring } : {}),
    metadata: opts.metadata,
  });
  console.log(`  create  ${opts.lookupKey} -> ${price.id}`);
  return price.id;
}

console.log('Subscriptions:');
for (const plan of Object.values(PLANS)) {
  await ensurePrice({
    lookupKey: `${plan.id}_monthly`,
    productName: `Shortcraft ${plan.name}`,
    unitAmount: plan.priceCents,
    currency: 'eur',
    recurring: { interval: 'month' },
    metadata: { kind: 'subscription', planId: plan.id, credits: String(plan.monthlyCredits) },
  });
}

console.log('Top-up packs:');
for (const pack of TOPUP_PACKS) {
  await ensurePrice({
    lookupKey: pack.id,
    productName: `Shortcraft ${pack.name}`,
    unitAmount: pack.priceCents,
    currency: 'eur',
    metadata: { kind: 'topup', credits: String(pack.credits) },
  });
}

console.log('Done.');
