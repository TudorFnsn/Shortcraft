/**
 * Margin gate report: net revenue vs worst-case API cost for every plan and
 * top-up, using the current model catalog. No secrets, no network.
 *
 * Run: npx tsx scripts/margin-report.mts   (exits 1 when the gate fails)
 */
const { assessMargins, REVENUE_ASSUMPTIONS, TARGET_MARGIN_MULTIPLE } =
  await import('@/features/billing/margin');

const report = assessMargins();
const usd = (n: number) => `$${n.toFixed(2)}`;

console.log(`Assumptions: ${JSON.stringify(REVENUE_ASSUMPTIONS)}`);
console.log(`Target: revenue >= ${TARGET_MARGIN_MULTIPLE}x worst-case API cost\n`);
console.table(
  [...report.plans, ...report.topUps].map((r) => ({
    product: r.name,
    credits: r.credits,
    netRevenue: usd(r.netRevenueUsd),
    worstCaseCost: usd(r.worstCaseCostUsd),
    worstShape: `${r.worstShape.targetDurationSec}s ${r.worstShape.modelTier}`,
    multiple: `${r.multiple.toFixed(2)}x`,
    maxCreditsAtTarget: r.maxCreditsAtTarget,
    passes: r.passes ? 'yes' : 'NO',
  })),
);
console.log(`\nTrial burn (acquisition cost per signup): ${usd(report.trialCostUsd)}`);
console.log(`Gate: ${report.ok ? 'PASS' : 'FAIL — do not enable live providers'}`);
process.exit(report.ok ? 0 : 1);
