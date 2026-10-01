/**
 * Margin gate — proves every paid product stays profitable at FULL BURN before
 * we spend real money on providers.
 *
 * For each plan / top-up we take its net revenue (after VAT + Stripe fees, in
 * USD) and divide by the API cost of spending all its credits on the most
 * expensive job shape the buyer is allowed to make (cost per credit varies by
 * length and quality tier). The result is a revenue/cost multiple; the gate
 * passes when every product clears TARGET_MARGIN_MULTIPLE (the 3x rule from
 * `config/models.ts`).
 *
 * The registry refuses to resolve live adapters while the gate fails, so
 * flipping MOCK_PROVIDERS=false with loss-making prices fails loudly instead of
 * silently burning cash. Full report: `npx tsx scripts/margin-report.mts`.
 *
 * Pure: every function takes the catalog as input (defaults to the real one),
 * so tests can exercise the math with fixtures.
 */
import { siteConfig } from '@/config/site';
import { MODELS, type ModelKind, type ModelSpec, type ModelTier } from '@/config/models';
import { PLANS, TOPUP_PACKS, type Plan } from '@/config/plans';
import { estimateSceneCount, MAX_SCENE_SEC } from '@/features/render/pricing';
import { FREE_PLAN_ID } from './entitlements';

/** Revenue must be at least this multiple of worst-case API cost. */
export const TARGET_MARGIN_MULTIPLE = 3;

/** Shortest video the API accepts (`POST /api/jobs`). */
export const MIN_VIDEO_SEC = 6;

export interface RevenueAssumptions {
  /** VAT included in our consumer prices. */
  vatRate: number;
  stripePercentFee: number;
  stripeFixedFeeEur: number;
  usdPerEur: number;
}

/**
 * Conservative revenue assumptions. Prices are consumer EUR prices (VAT
 * inclusive); Stripe's standard EEA card fee; a round FX rate. Review when
 * Stripe Tax / real FX data exists.
 */
export const REVENUE_ASSUMPTIONS: Readonly<RevenueAssumptions> = {
  vatRate: 0.2,
  stripePercentFee: 0.015,
  stripeFixedFeeEur: 0.25,
  usdPerEur: 1.08,
};

export interface JobShape {
  targetDurationSec: number;
  modelTier: ModelTier;
}

export interface JobBill {
  /** Credits held for the job (same formula as `estimateJobCredits`). */
  credits: number;
  /** Our provider cost for that job at the same upper bound. */
  costUsd: number;
}

function pick(models: readonly ModelSpec[], kind: ModelKind, tier: ModelTier): ModelSpec {
  const m =
    models.find((x) => x.kind === kind && x.tier === tier) ?? models.find((x) => x.kind === kind);
  if (!m) throw new Error(`No model registered for kind "${kind}"`);
  return m;
}

/** Credits and API cost of one job, priced at the reserve's upper bound. */
export function jobBill(shape: JobShape, models: readonly ModelSpec[] = MODELS): JobBill {
  const scenes = estimateSceneCount(shape.targetDurationSec);
  const script = pick(models, 'script', 'standard');
  const image = pick(models, 'image', shape.modelTier);
  const video = pick(models, 'video', shape.modelTier);
  const voice = pick(models, 'voice', 'standard');
  const render = pick(models, 'render', 'standard');

  const sum = (unit: (m: ModelSpec) => number): number =>
    unit(script) +
    scenes * (unit(image) + MAX_SCENE_SEC * (unit(video) + unit(voice))) +
    unit(render);

  return { credits: sum((m) => m.creditsPerUnit), costUsd: sum((m) => m.costUsdPerUnit) };
}

/** Every job shape a plan's limits allow. */
export function allowedShapes(plan: Plan): JobShape[] {
  const shapes: JobShape[] = [];
  for (const modelTier of plan.limits.modelTiers) {
    for (let sec = MIN_VIDEO_SEC; sec <= plan.limits.maxVideoDurationSec; sec++) {
      shapes.push({ targetDurationSec: sec, modelTier });
    }
  }
  return shapes;
}

export interface WorstCase {
  shape: JobShape;
  usdPerCredit: number;
}

/** The shape that burns the most API dollars per credit spent. */
export function worstCase(
  shapes: readonly JobShape[],
  models: readonly ModelSpec[] = MODELS,
): WorstCase {
  let worst: WorstCase | null = null;
  for (const shape of shapes) {
    const bill = jobBill(shape, models);
    const usdPerCredit = bill.costUsd / bill.credits;
    if (!worst || usdPerCredit > worst.usdPerCredit) worst = { shape, usdPerCredit };
  }
  if (!worst) throw new Error('worstCase needs at least one job shape');
  return worst;
}

/** What we keep from a sale, in USD, after VAT and Stripe fees. */
export function netRevenueUsd(
  priceCents: number,
  a: RevenueAssumptions = REVENUE_ASSUMPTIONS,
): number {
  const grossEur = priceCents / 100;
  const netEur = grossEur / (1 + a.vatRate) - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur);
  return netEur * a.usdPerEur;
}

export interface ProductMargin {
  id: string;
  name: string;
  credits: number;
  netRevenueUsd: number;
  /** API cost if every credit is spent on the worst-case shape. */
  worstCaseCostUsd: number;
  worstShape: JobShape;
  /** netRevenue / worstCaseCost. */
  multiple: number;
  passes: boolean;
  /** Most credits this product could grant at its price and still pass. */
  maxCreditsAtTarget: number;
}

function assess(
  id: string,
  name: string,
  credits: number,
  priceCents: number,
  worst: WorstCase,
  a: RevenueAssumptions,
): ProductMargin {
  const revenue = netRevenueUsd(priceCents, a);
  const cost = credits * worst.usdPerCredit;
  const multiple = cost > 0 ? revenue / cost : Number.POSITIVE_INFINITY;
  return {
    id,
    name,
    credits,
    netRevenueUsd: revenue,
    worstCaseCostUsd: cost,
    worstShape: worst.shape,
    multiple,
    passes: multiple >= TARGET_MARGIN_MULTIPLE,
    maxCreditsAtTarget: Math.max(
      0,
      Math.floor(revenue / (TARGET_MARGIN_MULTIPLE * worst.usdPerCredit)),
    ),
  };
}

export interface MarginReport {
  ok: boolean;
  plans: ProductMargin[];
  topUps: ProductMargin[];
  /** API cost of a new signup burning the whole trial (acquisition cost, not gated). */
  trialCostUsd: number;
}

export interface MarginCatalog {
  models?: readonly ModelSpec[];
  plans?: readonly Plan[];
  topUps?: readonly { id: string; name: string; credits: number; priceCents: number }[];
  trialCredits?: number;
  assumptions?: RevenueAssumptions;
}

export function assessMargins(catalog: MarginCatalog = {}): MarginReport {
  const models = catalog.models ?? MODELS;
  const plans = catalog.plans ?? Object.values(PLANS);
  const topUps = catalog.topUps ?? TOPUP_PACKS;
  const a = catalog.assumptions ?? REVENUE_ASSUMPTIONS;

  const planResults = plans.map((p) =>
    assess(p.id, p.name, p.monthlyCredits, p.priceCents, worstCase(allowedShapes(p), models), a),
  );

  // Top-up credits can be spent under any plan, so price them at the worst shape overall.
  const anyPlanWorst = worstCase(plans.flatMap(allowedShapes), models);
  const topUpResults = topUps.map((t) =>
    assess(t.id, t.name, t.credits, t.priceCents, anyPlanWorst, a),
  );

  const freePlan = plans.find((p) => p.id === FREE_PLAN_ID) ?? PLANS[FREE_PLAN_ID];
  const trialCredits = catalog.trialCredits ?? siteConfig.trialCredits;
  const trialCostUsd = trialCredits * worstCase(allowedShapes(freePlan), models).usdPerCredit;

  return {
    ok: [...planResults, ...topUpResults].every((r) => r.passes),
    plans: planResults,
    topUps: topUpResults,
    trialCostUsd,
  };
}

/** One-line summary of failing products, for errors and logs. */
export function describeFailures(report: MarginReport): string {
  return [...report.plans, ...report.topUps]
    .filter((r) => !r.passes)
    .map(
      (r) =>
        `${r.name}: ${r.multiple.toFixed(2)}x (needs ${TARGET_MARGIN_MULTIPLE}x; ` +
        `max ${r.maxCreditsAtTarget.toLocaleString('en-US')} credits at this price)`,
    )
    .join('; ');
}
