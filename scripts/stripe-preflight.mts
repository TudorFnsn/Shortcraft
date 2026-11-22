/**
 * Stripe go-live preflight (READ-ONLY). Checks the account STRIPE_SECRET_KEY
 * points at against everything the app needs to take real money:
 *  - the key is a live key (or a test key with --test), the webhook secret is set
 *  - NEXT_PUBLIC_SITE_URL is the public https origin
 *  - a webhook endpoint for <site>/api/webhooks/stripe is enabled with the four
 *    events the app handles
 *  - every plan and top-up price exists by lookup_key with the catalog's amount,
 *    currency, interval and the credits/kind/planId metadata the webhook grants from
 *
 * It only lists prices and webhook endpoints; it never creates, updates or charges.
 * Exit code 0 = ready, 1 = something to fix.
 *
 * Run:  npx tsx scripts/stripe-preflight.mts           (expects a live key)
 *       npx tsx scripts/stripe-preflight.mts --test    (dry run on the sandbox)
 *       npx tsx scripts/stripe-preflight.mts --env-file .env.production.local
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Stripe from 'stripe';

const args = process.argv.slice(2);
const envFlag = args.indexOf('--env-file');
const envFile = resolve(envFlag >= 0 ? (args[envFlag + 1] ?? '.env.local') : '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { expectedStripeCatalog, formatPreflightReport, runGoLivePreflight } =
  await import('@/features/billing/go-live');
type PriceSnapshot = import('@/features/billing/go-live').PriceSnapshot;
type WebhookSnapshot = import('@/features/billing/go-live').WebhookSnapshot;

const expectMode = args.includes('--test') ? 'test' : 'live';
const secretKey = process.env.STRIPE_SECRET_KEY;

const prices: PriceSnapshot[] = [];
const webhooks: WebhookSnapshot[] = [];

if (secretKey) {
  const stripe = new Stripe(secretKey, { appInfo: { name: 'Shortcraft preflight' } });
  const keys = expectedStripeCatalog().map((e) => e.lookupKey);
  // lookup_keys accepts at most 10 per call.
  for (let i = 0; i < keys.length; i += 10) {
    const page = await stripe.prices.list({
      lookup_keys: keys.slice(i, i + 10),
      active: true,
      limit: 100,
      expand: ['data.product'],
    });
    for (const p of page.data) {
      const product = typeof p.product === 'string' ? null : p.product;
      prices.push({
        lookupKey: p.lookup_key ?? '',
        id: p.id,
        active: p.active,
        unitAmount: p.unit_amount,
        currency: p.currency,
        recurringInterval: p.recurring?.interval ?? null,
        metadata: p.metadata,
        productTaxCode:
          product && !('deleted' in product && product.deleted)
            ? typeof product.tax_code === 'string'
              ? product.tax_code
              : (product.tax_code?.id ?? null)
            : null,
      });
    }
  }
  for await (const w of stripe.webhookEndpoints.list({ limit: 100 })) {
    webhooks.push({ id: w.id, url: w.url, status: w.status, enabledEvents: w.enabled_events });
  }
}

const report = runGoLivePreflight({
  expectMode,
  secretKey,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  prices,
  webhooks,
});

console.log(`Stripe go-live preflight (expecting a ${expectMode} account)\n`);
console.log(formatPreflightReport(report));
process.exit(report.ready ? 0 : 1);
