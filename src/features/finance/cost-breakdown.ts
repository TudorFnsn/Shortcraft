/**
 * Per-step API cost of a render job (`render_jobs.cost_breakdown`, 0014).
 *
 * `api_cost_usd` is one number per job; this keeps the same money split by
 * pipeline step, with the provider that did the work and the billable units it
 * reported (script tokens, voice characters, image megapixels, clip seconds).
 * That is what a provider comparison or a token-vs-spend check needs. Pure: the
 * orchestrator folds each metered step in, the finance report sums jobs.
 */
import type { ProviderUsage } from '@/features/providers/types';

export interface StepCost {
  /** Provider id of the adapter that ran the step (last one, if it changed). */
  provider: string;
  usd: number;
  credits: number;
  /** Provider calls metered (scenes for images/clips, 1 for the others). */
  calls: number;
  /** Units summed over the calls. */
  usage: Record<string, number>;
}

export type CostBreakdown = Record<string, StepCost>;

export interface MeteredCall {
  credits: number;
  usd: number;
  usage?: ProviderUsage;
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function addUsage(into: Record<string, number>, usage: ProviderUsage | undefined): void {
  for (const [unit, value] of Object.entries(usage ?? {})) {
    if (!Number.isFinite(value)) continue;
    into[unit] = round((into[unit] ?? 0) + value, 4);
  }
}

/**
 * Folds one metered step into the breakdown and returns a new object. A step
 * metered twice (clips are polled over several calls) accumulates.
 */
export function addStepCost(
  breakdown: CostBreakdown,
  step: string,
  provider: string,
  calls: readonly MeteredCall[],
): CostBreakdown {
  const prev = breakdown[step];
  const next: StepCost = {
    provider,
    usd: prev?.usd ?? 0,
    credits: prev?.credits ?? 0,
    calls: prev?.calls ?? 0,
    usage: { ...prev?.usage },
  };
  for (const c of calls) {
    next.usd = round(next.usd + c.usd, 6);
    next.credits += c.credits;
    next.calls += 1;
    addUsage(next.usage, c.usage);
  }
  return { ...breakdown, [step]: next };
}

export interface StepTotal {
  step: string;
  /** Jobs that recorded this step. */
  jobs: number;
  usd: number;
  /** Share of the API cost of all jobs with a breakdown. */
  share: number;
  /** Mean USD per job that ran the step. */
  usdPerJob: number;
  providers: string[];
  usage: Record<string, number>;
}

/** Sums breakdowns across jobs, most expensive step first. Jobs without one are skipped. */
export function summarizeBreakdowns(breakdowns: ReadonlyArray<CostBreakdown | null | undefined>): {
  jobsWithBreakdown: number;
  usd: number;
  steps: StepTotal[];
} {
  const steps = new Map<string, StepTotal>();
  let jobsWithBreakdown = 0;
  let usd = 0;
  for (const b of breakdowns) {
    if (!b || Object.keys(b).length === 0) continue;
    jobsWithBreakdown += 1;
    for (const [step, cost] of Object.entries(b)) {
      const t = steps.get(step) ?? {
        step,
        jobs: 0,
        usd: 0,
        share: 0,
        usdPerJob: 0,
        providers: [],
        usage: {},
      };
      t.jobs += 1;
      t.usd += cost.usd;
      usd += cost.usd;
      if (!t.providers.includes(cost.provider)) t.providers.push(cost.provider);
      addUsage(t.usage, cost.usage);
      steps.set(step, t);
    }
  }
  const list = [...steps.values()].map((t) => ({
    ...t,
    usd: round(t.usd, 4),
    share: usd > 0 ? round(t.usd / usd, 3) : 0,
    usdPerJob: round(t.usd / t.jobs, 4),
  }));
  list.sort((a, b) => b.usd - a.usd);
  return { jobsWithBreakdown, usd: round(usd, 4), steps: list };
}
