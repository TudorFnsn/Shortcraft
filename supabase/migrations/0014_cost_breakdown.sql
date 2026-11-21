-- 0014: per-step API cost on render jobs (FinancePlan F1).
--
-- api_cost_usd stays the job total. cost_breakdown splits the same money by
-- pipeline step, with the provider that ran it and the billable units it
-- reported, e.g.
--   {"script": {"provider": "anthropic", "usd": 0.016, "credits": 120, "calls": 1,
--               "usage": {"inputTokens": 820, "outputTokens": 1430}},
--    "clips":  {"provider": "fal", "usd": 1.75, "credits": 30000, "calls": 5,
--               "usage": {"clipSec": 25}}}
-- Written by the render orchestrator with the service role; read by
-- scripts/finance-report.mts. The app tolerates the column being absent (it
-- skips the write), so deploy order does not matter. Re-runnable.
alter table public.render_jobs
  add column if not exists cost_breakdown jsonb not null default '{}'::jsonb;

comment on column public.render_jobs.cost_breakdown is
  'API cost split by step: {step: {provider, usd, credits, calls, usage}} (0014).';
