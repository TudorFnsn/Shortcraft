# Shortcraft Finance Plan

> **Source of truth for the money track.** Owned by the **Finance CFO** routine (a master agent that splits work across sub-agents). Product, priority and pricing _decisions_ still live in `TheMasterPlan.md`; this file holds the financial model, the KPIs, the vendor-swap backlog and the routine's rules.

## 1. Goal

Maximise **profit and cash return**, not just revenue. Every run answers three questions with numbers:

1. **What is the MRR ratio?** Net MRR ÷ (API spend + trial burn), plus profit after fixed costs. Target: ≥ 3x on the variable side (the margin gate in `features/billing/margin.ts`) and a positive monthly profit.
2. **Where does each euro go?** Per-video API cost (script tokens, images, voice, video, render), failed-job waste, trial burn, hosting, DB, email, monitoring, Stripe fees, VAT.
3. **What is the next cheapest way to get the same output?** A cheaper or better provider, a pricing change, a packaging change, or a growth lever with the best payback.

## 2. Measure first (run every time)

```
npx tsx scripts/finance-report.mts --json --days 30 --fixed-usd <monthly fixed costs>
npx tsx scripts/margin-report.mts
npx tsx scripts/metrics-report.mts --json
```

`finance-report.mts` is read-only and prints: paying subscribers, gross/net MRR and ARR, API spend (30-day scaled), cost per finished video, cost by tier, money wasted on failed jobs, trial burn, profit/month, margin and the MRR ÷ variable-cost ratio. Math is pure and tested (`features/finance/unit-economics.ts`).

**Known measurement gaps (fix them, in this order):**

1. **Tokens are not stored per job.** `render_jobs.api_cost_usd` holds one USD number; the Anthropic adapter computes it from `usage.input_tokens/output_tokens` (`live/anthropic-script.ts`) and throws the tokens away. Add a `job_cost_lines` table (job_id, step, provider, units, unit, cost_usd) via an additive migration so cost per step and tokens per video are queryable. Needs owner to apply the migration.
2. **Fixed costs are not in the repo.** The report takes `--fixed-usd`; the owner supplies the real figure (§4).
3. **Costs are list prices, not measured.** `TheMasterPlan.md` §7 says so. Until a live run's `api_cost_usd` matches the catalog, the margin gate is a model, not a fact.
4. **No subscription history.** Churn and LTV can't be computed from `subscriptions` alone; read them from Stripe (Sigma / `stripe_analytics`) instead.

## 3. Routine design (master agent + sub-agents)

The master agent never does the deep work itself. It measures, then fans out **independent** sub-agents in one parallel batch, merges their reports, and ships at most **one** PR.

| Sub-agent                  | Question it answers                                                                                                                                                                                                    | Reads                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Unit economics**         | Cost per video by step and tier; tokens vs spend; failed-job waste; trial burn; which credit prices break the 3x gate.                                                                                                 | `finance-report`, `margin-report`, `config/models.ts`, `config/plans.ts`, Supabase `render_jobs`  |
| **Vendor scout**           | For each paid dependency (video, image, voice, LLM, render, hosting, DB, email, monitoring): a cheaper or better alternative, with a price per unit and a source URL. Must price _our_ job shape, not a headline rate. | Web search / provider docs, `config/models.ts`, `providers/live/*`                                |
| **Revenue & pricing**      | Plan/credit pricing vs willingness to pay and competitors; annual plan discount, top-up packs, upsell path, trial length, refund/chargeback rate; what lifts ARPU without lifting cost.                                | Stripe (read), `config/plans.ts`, `TheMasterPlan.md` §6–7                                         |
| **Cash & infra**           | Monthly bill from Vercel, Supabase, Resend, Sentry, ElevenLabs, fal, Anthropic; plan right-sizing; free-tier cliffs; anything idle that costs money.                                                                   | Vercel `list_billing_charges` / `list_contract_commitments`, Supabase advisors, provider invoices |
| **Growth ROI**             | Which acquisition lever (SEO pages, templates, referral, lifecycle email) has the best payback given CAC ≈ trial burn.                                                                                                 | `metrics-report`, `features/seo`, `features/email`                                                |
| **Implementer** (optional) | Builds the single approved change as a PR: adapter swap behind a flag, price/credit change, cost metering, or a cache.                                                                                                 | Whole repo                                                                                        |

Rules the master enforces:

- **Fan out once, in parallel, then merge.** Sub-agents get a self-contained brief (goal, files, what is ruled out, output format). Their findings are claims: re-check the number that drives the decision.
- **One PR per run**, on a `ceo-finance/*` branch, the highest expected cash impact per unit of risk. Before picking, list open + recently closed PRs; an item with an open PR is in review, not available.
- **Never** merge, change live secrets, switch Stripe to live mode, run a migration, change live prices, or spend provider credits without the owner's OK. A vendor swap ships as an adapter **behind a flag, default off**, with a measurement script and the margin gate unchanged.
- **Margin gate stays fail-closed.** A change that drops any product below 3x is rejected, not tuned around.
- **Numbers carry a source and a date.** "Researched, not measured" is labelled as such (see §7 of the master plan: figures disagreed by 2x).
- **Notify only when something needs the owner**: gate fails, spend spike, a swap worth >X% savings, a decision or data is needed, or the run couldn't read its data. A healthy, unchanged week sends nothing.
- Record every run in §8 with the date, the MRR ratio and the decision taken.

## 4. Data the routine needs (owner: please supply or connect)

| Need                                                                                                                      | Why                                                        | How                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Supabase read access from the cloud routine** (the `supabase` MCP in `.mcp.json` failed to connect: `ERR_PROXY_TUNNEL`) | Every cost/MRR number comes from `render_jobs`.            | Re-authenticate the claude.ai Supabase connector, or add a read-only Postgres role + `SUPABASE_*` env on the routine. |
| **Stripe (live) read-only restricted key** or the Stripe connector on the live account                                    | Real MRR, churn, refunds, fees, LTV. Today: sandbox only.  | Restricted key with read on charges, subscriptions, invoices, balance transactions. Never a write key.                |
| **Monthly fixed costs** (Vercel, Supabase, Resend, Sentry, domain, any other)                                             | Profit needs more than API spend.                          | Fill the table in §5; the routine reads it.                                                                           |
| **Provider invoices/usage** (fal.ai, ElevenLabs, Anthropic console)                                                       | Reconcile `api_cost_usd` against what was actually billed. | Read-only usage export/CSV, or admin/usage API keys scoped to read.                                                   |
| **fal.ai current spend and the models actually used**                                                                     | Largest variable cost after Premium launches.              | `FAL_KEY` is "pending" in the ops runbook: tell the routine when live runs start.                                     |
| **Targets**: monthly profit goal, acceptable payback on acquisition, risk appetite on quality                             | Lets it rank ideas.                                        | Add to §6.                                                                                                            |

## 5. Fixed-cost ledger (owner to fill)

| Item                   | Plan / tier | USD per month | Billing date | Notes |
| ---------------------- | ----------- | ------------- | ------------ | ----- |
| Vercel                 | Hobby?      | ?             |              |       |
| Supabase               | Free?       | ?             |              |       |
| Resend                 |             | ?             |              |       |
| Sentry                 |             | ?             |              |       |
| Domain                 |             | ?             |              |       |
| Claude Code / routines |             | ?             |              |       |
| Other                  |             | ?             |              |       |

## 6. Owner targets (owner to fill)

- Monthly net profit goal: ?
- Minimum variable-cost multiple: 3x (current gate)
- Max acceptable quality drop for a cheaper provider: ?
- Payback window for paid acquisition: ?

## 7. Optimisation backlog (hypotheses to measure, not facts)

Ranked by expected cash impact. The vendor scout re-prices every item with a source before anything ships.

1. **Premium video cost.** fal.ai Kling is the biggest per-video cost (~$1.10 per 15s Premium, list price). Candidates to price on _our_ job shape: other image-to-video models on fal (LTX-2 Fast, Wan, Seedance), Replicate, direct provider APIs (Kling, Runway, Luma, Google Veo), and open-weight Wan/LTX on a serverless GPU (Modal, RunPod, Replicate deployments) which wins only above a volume threshold. Also: the **hero-shot** variant (AI clip on scene 1 only, ≈ $0.45) and lower resolution/shorter clips for the hook.
2. **Images.** FLUX schnell is already ~$0.003. Check cheaper hosted FLUX/SDXL providers and cache identical prompts (theme stills) before generating again.
3. **Voice.** ElevenLabs Flash (~$0.05/1k chars) is the largest cost in Standard besides the LLM. Price OpenAI TTS, Cartesia, Deepgram Aura, Google/Azure neural voices, and self-hosted Kokoro/XTTS; keep ElevenLabs as the premium voice.
4. **Script LLM.** ~$0.04 per script on Sonnet 5.5. Try Haiku 5.5 for scripts that pass a quality check, prompt caching for the fixed system prompt, and Batch API where latency allows. Store `usage` per job to measure it.
5. **Failure waste.** Every failed job after the image step burns money the user is refunded. Measure `wastedOnFailedUsd`; add earlier moderation/validation and idempotent retries before paid steps.
6. **Trial burn.** ~$0.25 per signup. Compare with activation and trial → paid; if low, shrink the trial or gate it behind email verification.
7. **Pricing.** Annual plans (cash up front, lower churn), top-up pack margins, a Premium add-on priced per second, and a credit expiry/rollover policy. Needs an owner decision.
8. **Fixed cost.** Right-size the hosting plan; check Vercel Fluid/function duration cost for the in-house ffmpeg render; keep Supabase on the lowest tier that fits.
9. **Payment fees.** Stripe EEA cards ~1.5% + €0.25; check Stripe Tax cost vs a merchant-of-record (Paddle, Lemon Squeezy) that removes VAT admin but takes a larger cut. Decide with real volume.

## 8. Run log

- **2026-10-13** — Plan, report script and routine prompt created (interactive/routine setup). No live numbers yet: no Supabase read path from the cloud, Stripe is sandbox-only, `FAL_KEY` pending. First measured run happens once §4 is connected.

## 9. Routine prompt (paste into claude.ai/code/routines)

> Cloud routines are created at https://claude.ai/code/routines; a session cannot create one itself. Schedule suggestion: **daily 07:00 UTC** (after the CEO at 06:00 and before Design at 09:00), repo `TudorFnsn/Shortcraft`, model Opus, PR-gated. Connectors: GitHub, Supabase, Stripe, Vercel.

```
You are the Shortcraft Finance CFO, the master agent of the money track. Your goal is maximum profit and cash return for github.com/TudorFnsn/Shortcraft. Read AGENTS.md, FinancePlan.md and TheMasterPlan.md §7 first.

1. MEASURE. Run `npm ci`, then `npx tsx scripts/finance-report.mts --json --days 30 --fixed-usd <sum of FinancePlan.md §5>`, `scripts/margin-report.mts`, `scripts/metrics-report.mts --json`. If the DB or Stripe cannot be read, say exactly which connector failed and notify the owner; do not invent numbers. Always state the MRR ratio (net MRR / variable cost), profit/month, cost per finished video, failed-job waste and trial burn.
2. LIST open and recently closed PRs (ceo/*, ceo-design/*, ceo-finance/*). An item with an open PR is in review.
3. FAN OUT in ONE parallel batch of sub-agents with self-contained briefs: Unit economics, Vendor scout (web research, sourced prices for OUR job shape: video, image, voice, LLM, render, hosting, DB, email), Revenue & pricing, Cash & infra, Growth ROI. Each returns: finding, number, source/date, expected monthly saving or gain, risk, effort.
4. MERGE. Re-verify the one number behind the top decision. Rank by expected cash impact per unit of risk.
5. SHIP at most one PR on a `ceo-finance/<slug>` branch: a flagged-off provider adapter, cost metering (e.g. per-step cost lines with token usage), a pricing/credit proposal with updated margin report, or a cache. Run format:check, lint, typecheck, test, build. Never merge, never change live secrets/prices/Stripe mode, never run migrations or spend provider credits without the owner's explicit OK; put such asks in the PR as a decision list.
6. RECORD the run in FinancePlan.md §8 (date, MRR ratio, decision).
7. NOTIFY (PushNotification, <routine_summary>) only when something needs the owner: margin gate fails, spend or failure spike, a swap that saves a material share of cost, a missing data/connector, or a decision. Otherwise stay silent.
Also suggest connectors, skills or tools that would improve your measurements, and ask for any missing data.
```

## 10. Suggested connectors, tools and add-ons

- **Already available:** GitHub, Supabase (needs re-auth in the cloud), Stripe (sandbox; add live read-only), Vercel (billing and runtime logs, `list_billing_charges`).
- **Worth adding:** a **PostHog** or Vercel Web Analytics connector (funnel: visit → signup → first video → paid, for Growth ROI); a **Sentry** connector (failed-job causes = wasted spend); **Google Sheets/Drive** for the fixed-cost ledger and invoices; **Resend** (email volume vs tier); **fal.ai / ElevenLabs / Anthropic** usage exports (reconcile billed vs metered cost). Use `SearchMcpRegistry` from an interactive session to check which exist.
- **Skills/plugins:** the `xlsx` skill for a monthly P&L workbook, `dataviz` for a finance dashboard artifact, `deep-research` for vendor price research, `claude-api` for token/caching/Batch cost levers.
