import { describe, expect, it } from 'vitest';
import { getModel, MODELS, type ModelSpec } from '@/config/models';
import { PLANS } from '@/config/plans';
import {
  allowedShapes,
  assessMargins,
  describeFailures,
  jobBill,
  MIN_VIDEO_SEC,
  netRevenueUsd,
  TARGET_MARGIN_MULTIPLE,
  worstCase,
} from '@/features/billing/margin';
import {
  estimateJobCredits,
  estimateSceneCount,
  MAX_SCENE_SEC,
  revoiceBill,
  VOICE_DESIGN_ROUND_CREDITS,
} from '@/features/render/pricing';
import { assertMarginGate } from '@/features/providers/registry';

/** Catalog where every model earns 20,000 credits per API dollar. */
const cheapModels: ModelSpec[] = MODELS.map((m) => ({
  ...m,
  costUsdPerUnit: m.creditsPerUnit / 20_000,
}));

const noFees = { vatRate: 0, stripePercentFee: 0, stripeFixedFeeEur: 0, usdPerEur: 1 } as const;

describe('jobBill', () => {
  it('charges exactly the reserve estimate for every allowed shape', () => {
    for (const shape of allowedShapes(PLANS.ultra)) {
      const expected = shape.voiceDesign
        ? VOICE_DESIGN_ROUND_CREDITS
        : shape.revoice
          ? revoiceBill(estimateSceneCount(shape.targetDurationSec) * MAX_SCENE_SEC).credits
          : estimateJobCredits(shape);
      expect(jobBill(shape).credits).toBe(expected);
    }
  });

  it('prices API cost with the same upper-bound formula', () => {
    // 15s standard = 3 scenes: script + 3 × (image + 6s video + 6s voice) + render.
    const c = (id: string) => getModel(id).costUsdPerUnit;
    const cost =
      c('script-default') +
      3 * (c('image-standard') + 6 * c('video-standard') + 6 * c('voice-default')) +
      c('render-default');
    expect(jobBill({ targetDurationSec: 15, modelTier: 'standard' }).costUsd).toBeCloseTo(cost);
  });
});

describe('allowedShapes', () => {
  it('covers every length and tier a plan unlocks, a re-voice of each length and a voice design round', () => {
    const shapes = allowedShapes(PLANS.starter);
    const lengths = PLANS.starter.limits.maxVideoDurationSec - MIN_VIDEO_SEC + 1;
    expect(shapes.every((s) => s.modelTier === 'standard')).toBe(true);
    expect(shapes.filter((s) => !s.revoice && !s.voiceDesign)).toHaveLength(lengths);
    expect(shapes.filter((s) => s.revoice)).toHaveLength(lengths);
    expect(shapes.filter((s) => s.voiceDesign)).toHaveLength(1);
    expect(allowedShapes(PLANS.pro).some((s) => s.modelTier === 'premium')).toBe(true);
  });
});

describe('worstCase', () => {
  it('picks the shape with the highest API cost per credit', () => {
    const shapes = allowedShapes(PLANS.pro);
    const worst = worstCase(shapes);
    for (const s of shapes) {
      const bill = jobBill(s);
      expect(bill.costUsd / bill.credits).toBeLessThanOrEqual(worst.usdPerCredit + 1e-12);
    }
  });

  it('rejects an empty shape list', () => {
    expect(() => worstCase([])).toThrow();
  });
});

describe('netRevenueUsd', () => {
  it('strips VAT and Stripe fees, then converts to USD', () => {
    const a = { vatRate: 0.2, stripePercentFee: 0.015, stripeFixedFeeEur: 0.25, usdPerEur: 1 };
    expect(netRevenueUsd(1200, a)).toBeCloseTo(12 / 1.2 - (0.18 + 0.25));
    expect(netRevenueUsd(1000, noFees)).toBe(10);
  });
});

describe('assessMargins', () => {
  it('passes when every product clears the target at full burn', () => {
    const report = assessMargins({ models: cheapModels, assumptions: noFees });
    expect(report.ok).toBe(true);
    expect(describeFailures(report)).toBe('');
    // Starter: €14.99 for 30k credits at its worst shape's cost per credit (a
    // re-voice or voice design: their fixed 13k credits per $ is below these
    // models' 20k credits per $).
    const worst = worstCase(allowedShapes(PLANS.starter), cheapModels);
    expect(worst.shape.revoice || worst.shape.voiceDesign).toBe(true);
    const starter = report.plans.find((p) => p.id === 'starter');
    expect(starter?.multiple).toBeCloseTo(14.99 / (30_000 * worst.usdPerCredit));
  });

  it('fails and suggests a credit ceiling when a product loses money', () => {
    const report = assessMargins({
      models: cheapModels,
      assumptions: noFees,
      plans: [{ ...PLANS.starter, monthlyCredits: 200_000 }], // $10 cost on €14.99
    });
    expect(report.ok).toBe(false);
    const [starter] = report.plans;
    expect(starter?.passes).toBe(false);
    const worst = worstCase(allowedShapes(PLANS.starter), cheapModels);
    expect(starter?.maxCreditsAtTarget).toBe(
      Math.floor(14.99 / (TARGET_MARGIN_MULTIPLE * worst.usdPerCredit)),
    );
    expect(describeFailures(report)).toContain('Starter');
  });

  it('prices top-ups at the worst shape any plan allows', () => {
    const report = assessMargins();
    const premiumWorst = worstCase(Object.values(PLANS).flatMap(allowedShapes));
    for (const t of report.topUps) {
      expect(t.worstCaseCostUsd).toBeCloseTo(t.credits * premiumWorst.usdPerCredit);
    }
  });

  it('reports the trial burn cost', () => {
    const report = assessMargins({ models: cheapModels, trialCredits: 3000 });
    const worst = worstCase(allowedShapes(PLANS.starter), cheapModels);
    expect(report.trialCostUsd).toBeCloseTo(3000 * worst.usdPerCredit);
  });
});

describe('shipped catalog', () => {
  // Guards owner-approved pricing (2026-10-05): any catalog or plan edit that
  // drops a product below 3x must be a deliberate decision, not a side effect.
  it('passes the margin gate for every plan and top-up', () => {
    const report = assessMargins();
    expect(describeFailures(report)).toBe('');
    expect(report.ok).toBe(true);
    expect(() => assertMarginGate(report)).not.toThrow();
  });
});

describe('assertMarginGate', () => {
  it('blocks live providers while pricing is unprofitable', () => {
    const failing = assessMargins({
      models: cheapModels,
      plans: [{ ...PLANS.starter, monthlyCredits: 10_000_000 }],
    });
    expect(() => assertMarginGate(failing)).toThrow(/Margin gate failed/);
  });

  it('allows live providers once pricing is profitable', () => {
    const passing = assessMargins({ models: cheapModels, assumptions: noFees });
    expect(() => assertMarginGate(passing)).not.toThrow();
  });
});
