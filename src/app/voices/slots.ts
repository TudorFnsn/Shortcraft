/**
 * Saved-voice slots on the creator's plan (Voice Studio V4): how many are used,
 * whether "Create a voice" is open, and which plan gives more. Pure, tested
 * (tests/ui/voice-slots.test.ts).
 */
import { PLANS, type PlanId } from '@/config/plans';

export interface Slots {
  used: number;
  limit: number;
  atLimit: boolean;
  /** "2 of 3 on Pro" */
  line: string;
  /** The cheapest plan with more saved voices, or null on the top plan. */
  more: { name: string; limit: number } | null;
}

const ORDER: PlanId[] = ['starter', 'pro', 'ultra'];

export function slotsFor(used: number, planId: PlanId): Slots {
  const plan = PLANS[planId];
  const limit = plan.limits.savedVoices;
  const next = ORDER.slice(ORDER.indexOf(planId) + 1)
    .map((id) => PLANS[id])
    .find((p) => p.limits.savedVoices > limit);
  return {
    used,
    limit,
    atLimit: used >= limit,
    line: `${used} of ${limit} on ${plan.name}`,
    more: next ? { name: next.name, limit: next.limits.savedVoices } : null,
  };
}
