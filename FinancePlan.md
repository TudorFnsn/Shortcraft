# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`,
> which wins on product and priority; this file wins on cost, pricing evidence
> and cash. Every finance PR updates this file (scoreboard, backlog, changelog).
>
> Last updated: 2026-10-14

## 1. Charter

**Goal:** maximize cash return. Every run checks the **MRR ratio**, then proposes
or implements the change that moves it most.

**MRR ratio** = net MRR ÷ (variable API cost + fixed costs), same 30 days.
Net MRR = gross price × EUR→USD × share kept after VAT + Stripe fees
(`DEFAULT_ASSUMPTIONS` in `features/finance/unit-economics.ts`). Floor 1 (pays for
itself), target 3. Companion numbers: cost per finished video, cost of failed
jobs, trial burn per signup, gross margin %, paid churn, payback on any spend.

**Autonomy:** PR-gated like the other routines. Branches `ceo-finance/<slug>`;
never merges; never touches live secrets, live Stripe, or production data. Any
write to Stripe/Supabase/Vercel, any new paid vendor, and any customer price
change needs Tudor's explicit OK. Read-only checks are fine.

**Files it may change:** `FinancePlan.md`, `src/config/models.ts` (costs/credits
only after measurement), `src/config/fixed-costs.ts`, `src/features/finance/**`,
`src/features/providers/**` (new or cheaper adapters behind the registry),
`scripts/finance-*`, `tests/finance/**`, and finance lines of `TheMasterPlan.md`.
UI files belong to the Design CEO; migrations stay owner-applied.

## 2. Scoreboard (update every run)

| Date       | Net MRR | Paying | Cost / video | Failed-job cost | MRR ratio | Source                 |
| ---------- | ------- | ------ | ------------ | --------------- | --------- | ---------------------- |
| 2026-10-14 | n/a     | n/a    | n/a          | n/a             | n/a       | no live data reachable |

State of data on 2026-10-14 (honest): Stripe is **sandbox only** (no real MRR);
Vercel billing returns `costs_not_found` (Hobby, nothing billed); the Supabase
connector failed to connect (`ERR_PROXY_TUNNEL`) and there is no `.env.local`
in cloud runs, so `scripts/finance-report.mts` cannot read `render_jobs`. Fixed
costs in `src/config/fixed-costs.ts` are $0 placeholders. Until the gaps in §3
close, the ratio is computed from the catalog (`npx tsx scripts/margin-report.mts`),
not from measurements.

## 3. Data the routine needs (owner action)

1. **Read-only DB path.** Create a Postgres role with `select` on `render_jobs`,
   `subscriptions`, `credit_transactions`, `profiles` and store it as a routine
   environment variable (`FINANCE_DATABASE_URL`), or fix the Supabase connector
   in the routine's environment. Without it every ratio is an estimate.
2. **Real fixed costs.** Fill `src/config/fixed-costs.ts` (Vercel, Supabase,
   ElevenLabs plan, Resend, Sentry, domain) and set `confirmed: true`.
3. **Vendor spend.** Read-only API/billing access or a monthly CSV of: fal.ai
   usage, ElevenLabs usage, Anthropic usage (Console, per workspace). Needed to
   reconcile `api_cost_usd` (our estimate) against what was actually invoiced.
4. **Live Stripe (read-only restricted key)** once live mode is on, so MRR, churn
   and refunds are real.
5. **Token/usage capture.** `render_jobs` stores only `api_cost_usd`; token counts
   are not persisted, so "tokens vs spend" cannot be answered. First backlog
   item F1 adds it.

## 4. Backlog (ordered by expected cash impact; one item per run)

- [ ] **F1 Usage ledger.** Migration 0013 (owner-applied, additive): `render_jobs.usage jsonb` or a `provider_usage` table (job, step, provider, model, units, input/output tokens, cost_usd, latency). Adapters report usage; the orchestrator sums it. Gives tokens-vs-spend per video and a true cost per step. Prerequisite for everything below.
- [ ] **F2 Measure real unit costs.** Run `live-providers-smoke.mts` per step with real keys, replace the list-price `costUsdPerUnit` values, re-run the margin gate. Prices in `TheMasterPlan` §7 were researched from snippets and disagree up to 2x.
- [ ] **F3 Cheaper AI video (Premium).** fal.ai Kling 2.5 Turbo Pro is the only video model wired and the dominant cost (~$0.35 per 5s clip). Benchmark on the same 20 prompts for quality and $/clip: fal-hosted alternatives (Wan 2.x, LTX, Seedance, Hailuo), direct provider APIs, and aggregators (Replicate, WaveSpeed, Runware, Novita). Ship the winner behind `FAL_VIDEO_MODEL`/a new adapter; keep Kling as fallback. Pair with the **hero-shot** variant (AI clip on scene 1 only, ~$0.45 per 15s video).
- [ ] **F4 Cheaper images.** FLUX schnell is already ~$0.003. Check whether Premium images need FLUX dev ($0.025) or a cheaper model of equal quality; cache and reuse images for re-voice (already) and series.
- [ ] **F5 Script cost.** One Sonnet call per job (~$0.04). Try Haiku-class for Standard with an eval on script quality; use prompt caching for the static system prompt; batch where latency allows.
- [ ] **F6 Voice cost.** ElevenLabs Flash ~$0.05/1k chars. Compare other TTS (Cartesia, OpenAI, Google, Deepgram) on price and naturalness; keep ElevenLabs for designed voices only. Watch custom-voice slot pricing.
- [ ] **F7 Failure cost.** Cost of failed jobs is spend with no revenue. Add per-step retry budgets, fail before expensive steps (cheap checks first), and report failed-job cost in the scoreboard.
- [ ] **F8 Pricing and packaging.** Annual plans (cash up front, lower churn; price IDs already exist as `stripePriceIdYearly`), credit expiry/rollover rules, top-up nudge when a balance runs low, trial burn cap, and usage-based Premium add-on. Needs Tudor's OK per price change.
- [ ] **F9 Hosting.** Hobby is $0 now; model the Vercel Pro and Supabase Pro step-ups (function duration for ffmpeg, DB size, egress) and the MRR at which each pays for itself. Move heavy render off Vercel only if compute cost proves material.
- [ ] **F10 Churn and cash.** Dunning (Stripe Smart Retries is free), cancel-flow save offers, win-back email via the existing lifecycle emails, and failed-payment alerting.
- [ ] **F11 Distribution ROI.** Cost per acquired paying creator by channel; kill any channel where CAC exceeds first-month net revenue.

## 5. Evidence rules

- Cite a source and a date for every price. Prefer a measured call over a list price; mark list prices as "unmeasured".
- A cheaper vendor only wins if quality passes a blind side-by-side on the same prompts (record them under `docs/finance/`) and the margin gate still passes.
- Never quote a savings figure without the volume it assumes.
- Do not claim revenue. In sandbox mode MRR is zero by definition.

## 6. Recommended connectors and tools

Already connected: GitHub, Stripe (sandbox), Supabase (failing from cloud), Vercel.

| Add                                   | Why                                                                 |
| ------------------------------------- | ------------------------------------------------------------------- |
| Supabase read-only DB URL (env var)   | Real `render_jobs`/`subscriptions` for the ratio. Highest priority. |
| Stripe live, restricted read-only key | Real MRR, churn, refunds, payouts.                                  |
| fal.ai usage/billing export           | Reconcile estimated vs invoiced video/image spend.                  |
| Anthropic Console usage (admin key)   | Token spend per workspace, cache hit rate.                          |
| ElevenLabs usage API                  | Characters and slot use vs plan.                                    |
| Sentry connector                      | Failure rate by step, which is wasted spend.                        |
| PostHog (or Vercel Analytics)         | Visitor→signup→paid funnel for CAC and pricing tests.               |
| Google Sheets/Drive connector         | Owner's invoices and fixed-cost sheet.                              |
| WebSearch/WebFetch                    | Vendor price pages (already available; some hosts blocked).         |

## 7. Changelog (newest on top)

- **2026-10-14** — Finance track created (owner request): this plan, the routine prompt in `docs/routines/finance-cfo.md`, `features/finance/unit-economics.ts` (MRR, cost per video, MRR ratio) with tests, `scripts/finance-report.mts` (read-only), and `config/fixed-costs.ts` for the owner's real costs. No vendor change, no migration, no live data touched. (Finance CFO, interactive)
