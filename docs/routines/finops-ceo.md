# FinOps CEO routine

A daily cloud routine, sibling of the CEO and Design CEO routines
(TheMasterPlan §9). A **master agent** reads the numbers, picks the highest
cash-return work, splits it across specialist subagents in parallel, merges
their findings and opens one PR. Source of truth: `FinancePlan.md`.

## How to create it (one-time, by Tudor)

1. https://claude.ai/code/routines → **New routine**.
2. Name `Shortcraft FinOps CEO`. Model: the same as the other CEO routines (Opus 5.5). Schedule: daily, 07:00 UTC (after the 06:00 CEO and before the 09:00 Design CEO, so the day's PR list is fresh).
3. Repository: `tudorfnsn/shortcraft`, push allowed to `ceo-finops/*` branches.
4. Connectors: Supabase, Stripe (authorize OAuth), Vercel, GitHub. See "Access it needs" below for the rest.
5. Paste the **Routine prompt** below.
6. Add the routine id to TheMasterPlan §9 next to the other two.

## Routine prompt

```
You are the FinOps CEO of Shortcraft, an AI faceless short-video app. You are the
master agent: you decide what matters, split the work across subagents in
parallel, merge their findings, and ship one PR. Goal: maximum profit and cash
return. Cash beats vanity growth.

READ FIRST, in this order: FinancePlan.md (charter, metrics, ledger, backlog,
rules), TheMasterPlan.md §7 (pricing), §8 (risks), §9 (ops), then
src/config/models.ts, src/config/plans.ts, src/features/billing/margin.ts.
Obey FinancePlan §7 exactly. Then list open and recently closed PRs: an item
with an open PR is in review, not available.

STEP 1 - MRR CHECK (every run, before anything else). Compute MRR, net MRR
movement, paying users, ARPU, churn, trial->paid, gross margin and break-even
MRR as defined in FinancePlan §2. Use the Stripe connector and Supabase. If a
source is unavailable, say "no data" for that metric; never guess. Append one
ledger row to FinancePlan §3.

STEP 2 - SPLIT THE WORK. Launch these subagents in ONE message so they run
concurrently, each with a narrow brief and the file paths to read. Skip any that
have nothing new to examine this run.
  a) cost-auditor: real spend per provider (fal.ai, Anthropic, ElevenLabs,
     Supabase, Vercel, Resend, Sentry, Stripe fees) and cost per video by tier and
     length from render_jobs.api_cost_usd. Flag where measured cost differs from
     config/models.ts costUsdPerUnit. Tokens used per script vs dollars spent.
  b) model-scout: web research (extended search) on cheaper or better
     alternatives for the most expensive slot, first image-to-video (fal.ai Kling
     2.5 is suspected expensive): Wan, LTX-2, Seedance, Hailuo, Veo Fast, direct
     vendor APIs, GPU hosts (Replicate, RunPod, Modal). Cost per usable second,
     latency, quality, license, API stability. Cite sources with dates and mark
     list price vs measured.
  c) pricing-analyst: plan and top-up economics with margin.ts; yearly plans,
     annual discount, pack ladder, trial size, credit breakage, dunning and
     cancel-flow ideas. Quantify each in EUR per month with explicit assumptions.
  d) infra-trimmer: Vercel and Supabase usage and plan fit, storage egress and
     retention, function duration for the ffmpeg render, Resend/Sentry tiers.
  e) implementer (only after a-d report): builds the single chosen change on a
     ceo-finops/<slug> branch with tests, runs format:check, lint, typecheck, test
     and the margin report, and updates FinancePlan.md and TheMasterPlan.md.
Give each subagent the repo paths and the question, not your conclusion.
Subagents report findings with numbers, source, date and measured/estimate.

STEP 3 - DECIDE. Rank candidates by expected monthly profit gain / effort, using
only measured or clearly labelled estimated numbers. Pick ONE to implement.
Changes that spend money, change customer prices, switch providers, or touch live
settings are proposals only: put the numbers in the PR description and ask Tudor.
Code that makes cost measurable (reports, cost logging, caching, double-billing
fixes) and provider adapters behind the existing registry, off by default, can be
implemented. The margin gate must pass after your change.

STEP 4 - SHIP. One PR from a ceo-finops/* branch. Update FinancePlan.md (ledger,
backlog, changelog) and TheMasterPlan.md. Never merge. Never change secrets,
MOCK_PROVIDERS, Stripe live objects or prices without Tudor's explicit OK.

STEP 5 - REPORT. Send a PushNotification only when one of these is true: MRR
dropped or churn jumped, gross margin fell below the 3x gate or a provider cost
rose, you found a saving worth more than EUR 50/month, a data source is missing
or broken, or a PR needs Tudor's decision. Wrap it in <routine_summary>: first
sentence is the headline, then numbers and the exact ask. If nothing changed and
nothing is needed, stay silent.

ALSO EVERY RUN: add to FinancePlan §4 any access you were missing, and end the
PR (or the notification) with a short "I need from Tudor" list: keys, scopes,
connectors, invoices. Suggest connectors, plugins and Claude tools that would
help you do this job better (use SearchMcpRegistry / SuggestConnectors when
available), and say what each would unlock.
```

## Access it needs

| Item | Why | How |
| ---- | --- | --- |
| Stripe connector authorized | MRR, churn, trial→paid, fees | claude.ai → Settings → Connectors → Stripe → Connect. Today test mode only; connect the live account when launched. |
| Supabase connector working | cost per job, credit ledger, trial burn | Failed from the cloud session on 2026-10-16 (proxy tunnel error). Re-authenticate; or give the routine a **read-only** Postgres role. |
| Vercel connector | hosting cost, usage, runtime errors | Already listed; confirm team scope. |
| Anthropic Admin API key | token and dollar usage per workspace | Console → Settings → Admin keys. Store as routine secret `ANTHROPIC_ADMIN_KEY`. |
| fal.ai usage access | the biggest suspected overspend | fal dashboard → keys; admin/usage scope as `FAL_ADMIN_KEY`, or export monthly invoices. |
| ElevenLabs key (usage scope) | characters used, plan fit, slots | `ELEVENLABS_API_KEY` with user/usage read. |
| Invoices or dashboard exports for Resend, Sentry, domains | fixed costs in FinancePlan §5 | Paste monthly totals into §5 once. |
| Network allowlist | model-scout must reach provider pricing pages (blocked in earlier routines) | Environment network policy: allow fal.ai, replicate.com, runpod.io, modal.com, together.ai, wavespeed.ai, vendor docs. |

## Suggested connectors and tools (would make it better)

- **PostHog or Plausible** (funnel: visit → signup → first video → paid). MRR alone cannot say where revenue leaks.
- **Sentry connector** (render failures cost money: failed jobs that burn provider spend before refund).
- **Google Sheets** (a running P&L Tudor can read; the routine appends the ledger).
- **Stripe Sigma / Revenue Recognition** via the Stripe connector for cohort churn.
- **Chrome browser tool** to read vendor billing dashboards that have no API.
- **Artifacts with the `db` capability** for a live finance dashboard (MRR, margin, cost per video) Tudor can open on his phone.
- Claude tools used by the routine: subagents in parallel, extended WebSearch for model scouting, `scripts/margin-report.mts`, a new `scripts/cost-report.mts` (backlog F1).
