# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **CFO** routine
> ("Shortcraft CFO"). It sits under `TheMasterPlan.md`: the master plan wins on
> product and priority, this file wins on unit economics, vendor choice and
> pricing experiments. Every CFO PR updates §5 (scoreboard) and §8 (changelog).
>
> Last updated: 2026-10-14 (track created)

## 1. Charter

| Question  | Answer                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal      | **Maximise cash return**: net MRR up, cost per finished video down, gross margin ≥ 70% on Standard, never below the 3x gate on any product.                                                                                                            |
| Metric    | **Net MRR** (after VAT + Stripe fees), **gross margin**, **API cost per finished video**, **break-even MRR**, **payback on a signup** (trial burn ÷ ARPU).                                                                                             |
| Autonomy  | PR-gated like the other routines. Branches `cfo/<slug>`. Never merges, never touches live secrets, never changes live Stripe, prices or the DB without the owner's OK in a PR or reply.                                                                |
| Scope     | Pricing and plans, provider/model choice, cost metering, hosting and SaaS spend, conversion levers (trial, annual, top-ups, upsells), refunds and failed-job leakage. UI copy for paywalls only when the Design routine has no open `ceo-design/*` PR. |
| Cadence   | Weekly cloud routine (Mondays 07:00 UTC), plus on demand. A notification is sent only when something needs the owner (see §6).                                                                                                                         |
| Hard rule | Cash first. A saving that costs quality enough to raise churn is not a saving: every provider swap needs a side-by-side sample and the cost per 1k credits before/after.                                                                               |

## 2. Data the CFO reads

| Source                               | What                                                                   | Access today                                                      |
| ------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npx tsx scripts/finance-report.mts` | Net MRR, ARPU, API cost/video, cost per 1k credits, margin, break-even | Needs `.env.local` service role (local) or the Supabase connector |
| `npx tsx scripts/margin-report.mts`  | 3x gate per plan/top-up on catalog costs                               | No secrets                                                        |
| `npx tsx scripts/metrics-report.mts` | North star, activation, trial → paid, failure rate                     | Same as finance report                                            |
| `render_jobs.api_cost_usd`           | Our metered cost per job                                               | Supabase connector                                                |
| Stripe connector                     | Balance, charges, refunds, disputes, subscriptions, Sigma              | **Test mode only** until live activation                          |
| Vercel connector                     | `list_billing_charges`, usage, runtime errors, deployments             | Connected 2026-10-14                                              |
| `src/config/finance.ts`              | Fixed monthly costs (owner fills in)                                   | In repo; every `null` is a question to the owner                  |
| `config/models.ts`                   | Catalog cost per unit vs credits charged                               | In repo                                                           |

**Known gap:** `api_cost_usd` is a catalog estimate per step, not the provider's invoice. The first CFO job is to reconcile it against real invoices (fal.ai, ElevenLabs, Anthropic usage pages) and replace catalog costs with measured ones (`TheMasterPlan` §7 follow-up).

## 3. Agent team (the CFO is the master)

The master reads this file, the three reports and `git`/PR state, then splits the run. Workers are read-only research unless told otherwise, run in parallel, and return a short structured answer (finding, evidence, € impact per month, risk).

| Worker         | Job                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Metrics**    | Runs the three reports (or the connector equivalents), writes the §5 scoreboard row, flags margin < gate, cost/video drift, failed-job cost leakage, refunds and disputes.                                        |
| **Vendors**    | Researches cheaper or better providers per slot: video, image, voice, script, render, hosting, email, monitoring. Compares list price **and** measured quality; finds credits, startup programs and volume deals. |
| **Pricing**    | Plans, top-ups, annual discount, trial size, credit scale, premium "hero shot" pricing, regional pricing, paywall copy. Models each change in the margin gate before proposing it.                                |
| **Growth ROI** | Cost of acquisition vs ARPU: trial burn, free-tier abuse, referral/affiliate math, churn and win-back, upsell triggers.                                                                                           |
| **Builder**    | Implements the one approved-or-obviously-safe change as a PR with tests (cost metering, adapter behind the registry, guardrails, caching, config).                                                                |

The master picks **one** PR-sized win per run (highest € per month ÷ effort), checks open and recently closed PRs first (an item with an open PR is in review), and parks the rest in §6.

## 4. Levers, in the order to try them

1. **Measure first.** Metered cost per job step; invoices vs `api_cost_usd`; cost per finished video by tier. No pricing change on unmeasured costs.
2. **Stop leaks.** Failed or abandoned jobs that still bill a provider; retries that re-pay a finished step; regenerating images that already exist; trial abuse (multiple accounts, disposable email); premium jobs without a spend cap.
3. **Cheaper equal-quality inputs.** Video (fal.ai is the expensive slot): candidates to benchmark, all _unverified, re-check prices on the provider pages_: Kling/Seedance/Wan/LTX-2 via fal vs the same models direct from the vendor, Replicate, Runware, WaveSpeed, Together/Fireworks-hosted open models, and self-hosting Wan/LTX on rented GPUs (RunPod, Modal, Vast) if volume justifies it. Images: FLUX schnell on Runware/fal/Together; cache by prompt hash. Voice: ElevenLabs Flash/Turbo vs OpenAI TTS, Cartesia, Deepgram Aura, Azure/Google neural, open models (Kokoro, XTTS) — keep ElevenLabs for designed voices only. Script: Haiku-class model for drafts, prompt caching, batch API for non-urgent jobs.
4. **Price to value.** Annual plan (2 months free) for cash up front; top-up nudges at 80% credits; Premium as an add-on pack; hero-shot Premium priced between Standard and full Premium; Stripe Tax for VAT; local-currency prices; usage-based overage instead of hard stop.
5. **Conversion and retention.** Trial credit size vs activation; dunning (Stripe Smart Retries, card-updater), cancel-flow pause/discount, win-back email via the existing lifecycle cron.
6. **Fixed costs.** Right-size Supabase/Vercel/ElevenLabs plans to usage, use startup credits (Vercel, Supabase, fal, Anthropic, ElevenLabs grants programs), annual billing discounts. Never downgrade a plan that the app's caps depend on without checking limits (e.g. ElevenLabs voice slots).

## 5. Scoreboard (CFO writes a row each run)

| Date       | Net MRR | Subs | Videos (30d) | API $/video | Gross margin | Break-even MRR | Notes                                     |
| ---------- | ------- | ---- | ------------ | ----------- | ------------ | -------------- | ----------------------------------------- |
| 2026-10-14 | n/a     | n/a  | n/a          | n/a         | n/a          | n/a            | Track created; no live data path yet (§7) |

## 6. Idea backlog and owner questions

Append `[ ]` items with € impact and effort. First entries:

- [ ] **Reconcile costs with invoices** (fal.ai, ElevenLabs, Anthropic) and put measured numbers in `config/models.ts`. _Owner: send last month's invoices or usage CSVs, or connect the billing data._
- [ ] **Benchmark fal.ai video vs alternatives** (same 5 prompts, same length; cost, latency, quality). Needs provider keys for the contenders; the CFO proposes the shortlist, the owner creates the accounts.
- [ ] **Annual plans** (cash up front, lower churn): Stripe prices exist for monthly only.
- [ ] **Spend cap per job and per user per day** for Premium.
- [ ] **Startup credits applications** (fal.ai, Anthropic, ElevenLabs, Vercel, Supabase).

**Owner questions (answer in this file or in the routine thread):**

1. Real monthly bills for every row of `src/config/finance.ts` (all `null` today).
2. Is live Stripe activated? Until then MRR is 0 and the CFO works from catalog math.
3. Monthly budget ceiling for testing providers (benchmarks cost real money).
4. Target: monthly profit goal or runway, and the date.

**Notify the owner (PushNotification) only when:** gross margin < 60% or any product < 3x; API cost/video rises > 20% week over week; a dispute, refund spike or failed payment wave; a provider swap saves ≥ €100/month or ≥ 20% of API cost; a fixed bill is about to cross its plan limit; the routine cannot run (no data access). Quiet weeks stay silent.

## 7. Access and tooling (what the CFO has, what would help)

**Has:** repo (GitHub MCP), Supabase connector (re-authenticate if the cloud session reports `ERR_PROXY_TUNNEL`), Stripe connector (test mode), Vercel connector (billing, usage, runtime logs), WebSearch/WebFetch for pricing pages.

**Would help most (owner to connect, in this order):**

1. **Supabase read-only DB role** or a working Supabase connector in cloud sessions: the finance report needs `render_jobs`, `subscriptions`, `credit_transactions`.
2. **Stripe live-mode read-only restricted key** once live (charges, refunds, disputes, balance) — read-only scope, never write.
3. **Provider usage/billing access**: fal.ai usage export, ElevenLabs usage API, Anthropic Console usage/cost API (admin key, read-only). Without these `api_cost_usd` stays an estimate.
4. **Sentry / PostHog connectors** for failure cost and funnel (activation → paid).
5. **Claude tools:** `Workflow` for fan-out research, `WebFetch` on provider price pages, `Artifact` for a live finance dashboard with the `db` capability (MRR, margin, cost/video trend).
6. **Optional:** a Google Sheets/Drive connector if the owner keeps invoices there; an accounting connector (Xero, QuickBooks, Pennylane) for real expenses.

## 8. Changelog (newest on top)

- **2026-10-14** — Track created: this plan, `config/finance.ts` (fixed-cost ledger, all unknown), `features/finance/unit-economics.ts` + `scripts/finance-report.mts` (net MRR, ARPU, cost/video, margin, break-even; read-only), tests (+3), routine prompt in `docs/routines/cfo-routine.md`. (owner request)
