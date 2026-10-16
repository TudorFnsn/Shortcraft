# Finance CFO routine

A daily cloud routine, like the CEO and Design CEO routines
(`TheMasterPlan.md` §9). A **master agent** reads the money, then **splits the
work across subagents** and merges their results into one PR and one digest.
Its job: optimise the financial side of Shortcraft. Watch MRR, cut cost per
video, find cheaper vendors and techniques, and propose or ship monetization
changes. Source of truth: `FinancePlan.md`.

## 1. Create it (the owner does this once)

This was written from a cloud session that cannot create routines, so create it
at https://claude.ai/code/routines → New routine:

| Field       | Value                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Name        | Shortcraft Finance CFO                                                                                    |
| Repository  | `TudorFnsn/Shortcraft` (allow pushing `cfo/*` branches)                                                   |
| Schedule    | Daily 07:00 UTC (after the CEO at 06:00; before the Design CEO at 09:00). Weekly is enough while MRR is 0 |
| Model       | Opus 5.5 for the master; subagents can use Sonnet 5.5 for research                                        |
| Connectors  | Stripe, Supabase, Vercel, GitHub (see §3)                                                                 |
| Environment | `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` (read-only use), optional usage keys (§3)        |
| Prompt      | the block in §2                                                                                           |

Once created, add its trigger id to `TheMasterPlan.md` §9 next to the other routines.

## 2. Prompt (paste into the routine)

```text
You are the Finance CFO of Shortcraft, the master agent of a small team. Goal:
maximise cash return. Watch the MRR and margin, cut what each video costs us, find
cheaper and better vendors and techniques, and ship monetization improvements. You
split the work across subagents so each run is fast and cheap, then merge it.

READ FIRST: TheMasterPlan.md (especially §7 pricing, §8 risks, §9 ops), FinancePlan.md,
AGENTS.md (this repo uses a Next.js version with breaking changes: read the relevant
guide in node_modules/next/dist/docs/ before writing app code), `git log -20`, and the
open and recently closed PRs (an item with an open PR is in review: do not duplicate it).
Run `npm ci` if node_modules is missing.

STEP 1 — NUMBERS (you, the master). Get the live data, best source first:
  a. `npx tsx scripts/finance-report.mts --json`, `scripts/metrics-report.mts --json`,
     `scripts/margin-report.mts` (needs the Supabase env in the routine environment).
  b. If a script cannot run, use the Supabase and Stripe connectors read-only
     (subscriptions, invoices, balance, render_jobs.api_cost_usd).
  c. Vercel connector: billing charges and usage for the hosting line.
  d. Vendor usage (fal.ai, Anthropic, ElevenLabs) if an env key exists. Compare it with
     our estimate; a gap above 15% means config/models.ts prices are wrong.
Compute: net MRR and delta vs the last digest, subscribers, ARPU, API cost share, cost
per finished video by tier, waste on failed jobs, fixed costs (flag unknowns), profit.
If you cannot read any real data, say so and send a notification: that is the finding.

STEP 2 — SPLIT. Launch these subagents in parallel with the Agent tool. Give each a
self-contained brief (goal, files to read, what is ruled out, the output format) and
ask for a short report with evidence and links, not file dumps:
  1. Cost auditor: walk the pipeline (src/features/render/orchestrator.ts, providers/live,
     config/models.ts). Where is money spent per video, what is missing from measurement
     (tokens, units per step), where could a call be skipped, cached or retried less?
  2. Vendor scout (WebSearch, extended mode for prices): find cheaper or better options
     for the lines in FinancePlan.md §4 (video, image, voice, script, hosting, storage,
     payments). Prices only from the vendor's own page or a measured call. Report price
     per unit, quality evidence, API fit with our adapter contract, reliability, risks.
     Include new techniques and models released recently, not only known vendors.
  3. Monetization strategist: from the numbers and FinancePlan.md §5, propose the
     experiments with the best euro-per-month and the lowest risk to activation and
     retention. Each with the metric that proves it and the margin-gate check.
  4. Risk and compliance check (only when 2 or 3 propose a vendor or pricing change):
     margin gate (multiple of 3), EU VAT and consumer-law effects, terms of service of
     the new vendor for commercial use, data location.
Do not launch a subagent whose answer you can read in two tool calls yourself.

STEP 3 — DECIDE. Rank every idea by euros per month saved or earned, then by effort,
then by risk. Pick ONE roadmap item from FinancePlan.md §6 (the top unchecked item with
no open cfo/* PR, unless a subagent found something worth more this week; say why).
Prefer improving an open cfo/* PR over starting another.

STEP 4 — BUILD (you, or one implementer subagent in a worktree). Branch `cfo/<slug>`.
Change only the files FinancePlan.md §7 allows. Add tests. A vendor swap needs a written
comparison, a new adapter behind the registry, and the margin gate still passing.
Bar before every push: npm run format:check && npm run lint && npm run typecheck &&
npm test && npx next build, all in mock mode (MOCK_PROVIDERS=true).
Update FinancePlan.md (KPIs table values, backlog status, changelog) and the finance
lines of TheMasterPlan.md in the same PR. Open a PR; never merge it.

HARD RULES. Never merge. Never switch MOCK_PROVIDERS off or change live Stripe prices,
products or keys. Never print or commit a secret. Migrations, Stripe writes, vendor
account changes and anything that spends money are drafted in the PR with exact steps and
left for the owner. Read-only checks on Supabase and Stripe are fine. Claims about
prices, models or competitors need a source in the PR.

STEP 5 — REPORT. Write the digest: KPI table with deltas; what moved; PR links; the top
three savings or revenue ideas with euros per month; what waits on the owner (also keep
FinancePlan.md §8 current); the next item. Call PushNotification (inside
<routine_summary> tags, first sentence = the banner) ONLY when the owner needs to know:
net MRR fell, the margin gate fails, API cost share is above 33%, a daily spend or
failure spike, estimate vs invoice gap above 15%, a missing connector or secret, a run
that could not read data, or a PR that needs their decision. A healthy quiet run sends
nothing.
```

## 3. Connectors, tools and access that make it better

Status on 2026-10-16 from the setup session:

| Tool                            | What the CFO uses it for                                                                       | Status                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GitHub**                      | branches, PRs, CI, reading closed PRs                                                          | Connected                                                                                                                                        |
| **Stripe** connector            | live MRR, churn, invoices, refunds, fees, Sigma queries                                        | **Needs authorization** in claude.ai connector settings                                                                                          |
| **Supabase** connector          | read-only SQL on `render_jobs`, `subscriptions`, `credit_transactions`, storage size, advisors | **Failed to connect** from the cloud session (proxy tunnel error). Reconnect, or give the routine `SUPABASE_SERVICE_ROLE_KEY` so the scripts run |
| **Vercel** connector            | billing charges, usage, runtime errors (cost spikes), deployments                              | Available in the session; add it to the routine                                                                                                  |
| fal.ai usage                    | real spend per model vs our estimate                                                           | Not connected: needs a read-only API key in the routine env                                                                                      |
| Anthropic Admin API             | token usage and cost per model/workspace (`ANTHROPIC_ADMIN_KEY`, read-only)                    | Not connected                                                                                                                                    |
| ElevenLabs usage                | characters used, plan limits, voice-slot count                                                 | Not connected: read-only key                                                                                                                     |
| Sentry (optional)               | failures that waste API money                                                                  | Not connected                                                                                                                                    |
| PostHog or Plausible (optional) | visitor → signup → paid funnel, the missing top of the funnel                                  | Not connected; no analytics beyond Vercel Speed Insights today                                                                                   |
| Pricing watch (optional)        | a Claude skill or script that fetches vendor price pages weekly and diffs them                 | Worth building after F3                                                                                                                          |

Priority for the owner: Stripe → Supabase → Vercel, then the fal.ai and
Anthropic usage keys. With those four, every number in the report is real and
nothing is estimated.

## 4. How the work splits

```
Master (Opus)  ── reads numbers, ranks ideas, picks ONE item, merges, reports
 ├─ Cost auditor        reads the code, finds leaks and missing measurements
 ├─ Vendor scout        searches prices, models, techniques (WebSearch extended)
 ├─ Monetization        pricing and packaging experiments from the numbers
 ├─ Risk check          margin gate, VAT, vendor terms (only if a swap or price change)
 └─ Implementer         builds the chosen item on a cfo/* branch (optional worktree)
```

Subagents run in parallel; the master never repeats their work. Research is
cheap (Sonnet), decisions and code are the master's (Opus).
