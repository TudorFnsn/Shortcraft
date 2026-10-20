# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (prompt in `docs/routines/finance-ceo.md`). It sits under `TheMasterPlan.md`:
> the master plan wins on product and priority; this file wins on cost, pricing
> and cash. Every finance PR updates this file (§3 numbers, §5 backlog, §7 log).
>
> Last updated: 2026-10-20 (track created; no live revenue data read yet)

---

## 1. Charter (owner request 2026-10-20; change only with Tudor)

| Question  | Answer                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash first.** Raise MRR and cash collected; cut cost per finished video; never trade away the 3x margin gate (`features/billing/margin.ts`). |
| Every run | Check the **MRR ratio** (net revenue ÷ API cost + fixed costs) and propose or implement the change with the best cash return per hour of work.                 |
| Scope     | Provider choice (fal.ai looks expensive), model catalog costs, plans / top-ups / trial, payment fees and tax, hosting and tooling spend, upsell and retention. |
| Autonomy  | **PR-gated.** Branches `ceo-finance/<slug>`; never merge; no live secrets; no Stripe, DB or vendor-account writes without the owner's explicit OK.             |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after CEO 06:00 and Design 09:00). Weekly deep run on Mondays (vendor scan + pricing review).     |
| Silence   | The routine pings the owner only when something needs them (margin gate at risk, a cost spike, a decision, a blocked data source). A healthy run says nothing. |

## 2. How the routine works (DM-style master + sub-agents)

The master reads this file, the margin gate and the data sources in §4, picks the
day's one highest-leverage win, and **splits the work across sub-agents in
parallel**, then merges their answers into one PR plus a short digest.

| Sub-agent           | Reads                                                                           | Returns                                                                 |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Revenue analyst** | `scripts/finance-report.mts --json`, Stripe (MRR, churn, trials, refunds, fees) | MRR, net MRR, churn, trial → paid, ARPU, failed payments, top-up share  |
| **Cost auditor**    | `api_cost_usd` per job, provider usage pages, Vercel billing, Supabase plan     | Cost per finished video by tier, credits ÷ dollars, failed-job burn     |
| **Vendor scout**    | Live web: provider pricing pages, benchmarks, changelogs                        | Cheaper or better options per slot (§6), with measured-or-sourced price |
| **Pricing analyst** | Plans, top-ups, margin report, competitors' public prices                       | Price / plan / trial / annual-billing experiments with expected cash    |
| **Implementer**     | The chosen item                                                                 | Code + tests on a `ceo-finance/*` branch; `npm run` checks green        |

Rules: sub-agents get a self-contained brief and the file paths to read; their
answers are claims to verify, not facts. Price figures from search snippets are
**unverified** until a real call or an invoice confirms them (the 2026-10-04
research disagreed by up to 2x per model).

## 3. Current numbers (update every run)

Baseline from `TheMasterPlan.md` §7 (catalog, not measured): Standard 15s ≈ $0.07,
Premium 15s (Kling 2.5 Turbo Pro via fal) ≈ $1.10–2.30, hero-shot Premium ≈ $0.45.
Margin gate: Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x; trial burn $0.14.

| Metric (30 days)                     | Value          | Source                              |
| ------------------------------------ | -------------- | ----------------------------------- |
| MRR (gross / net)                    | _not read yet_ | `finance-report.mts`, Stripe        |
| API cost / failed-job share          | _not read yet_ | `finance-report.mts`                |
| Fixed costs                          | **unknown**    | owner → `src/config/fixed-costs.ts` |
| Cost per finished video (std / prem) | _not read yet_ | `finance-report.mts`                |
| Revenue ÷ (API + fixed)              | _not read yet_ | `finance-report.mts`                |

## 4. Data sources and what is missing

| Source                                | Status (2026-10-20)                                        | Needed for                                               |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Repo + `scripts/finance-report.mts`   | ✅ built (reads `.env.local` service role)                 | MRR, API cost per job and tier                           |
| Supabase connector                    | ⚠️ failed to connect from the cloud session (proxy tunnel) | Read-only SQL when no `.env.local` exists                |
| Stripe connector                      | ⚠️ needs the owner to authorize it (claude.ai connectors)  | Real MRR, churn, fees, refunds (sandbox only until live) |
| Vercel connector                      | ✅ connected (`list_billing_charges`, usage)               | Hosting and bandwidth spend                              |
| fal.ai / Anthropic / ElevenLabs usage | ❌ no connector; invoices or usage exports needed          | Reconcile metered `api_cost_usd` with real bills         |
| Per-step cost                         | ❌ only the job total is stored                            | Which step (clips, images, voice) to attack              |
| Fixed costs                           | ❌ unknown                                                 | True profit                                              |

**Asked of the owner (answer in the PR thread or edit the file):**

1. Fill `src/config/fixed-costs.ts` (Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, any other subscription).
2. Authorize the **Stripe** connector in claude.ai settings; add the live account when Stripe is live.
3. Re-authenticate the **Supabase** connector (it failed to connect), or add the service-role key to the routine's environment as a secret so `finance-report.mts` can run in the cloud.
4. Export last month's usage/invoice totals from **fal.ai, Anthropic and ElevenLabs** (or create read-only/admin usage keys, never the production keys) so metered cost can be reconciled.
5. Say whether yearly billing is wanted (a discount for cash up front is the cheapest MRR lever; `stripePriceIdYearly` already exists in the catalog).

## 5. Backlog (ordered by cash return ÷ effort; the routine re-orders it)

- [ ] **Measure first.** Run `finance-report.mts` against production; paste §3. Until then every price below is a list price.
- [ ] **Per-step cost metering** (migration, owner-applied): a `job_cost_events` table (job, step, provider, model, units, usd) so cost per step is queryable; the orchestrator already returns `costUsd` per step.
- [ ] **Premium video: cheaper path.** fal.ai is the expensive slot (Kling ≈ $0.07/s billed in fixed 5s clips). Scout and benchmark (§6): direct provider APIs, other hosts, open weights. Keep the adapter interface; swap is one row in `models.ts` plus one adapter.
- [ ] **Hero-shot Premium** (AI clip on scene 1 only, stills for the rest): ≈ $0.45 vs $1.10, priced near Standard. Highest margin-per-feature idea already in the plan.
- [ ] **Annual plans** (pay 10 months, get 12): cash up front, lower churn, lower Stripe fixed-fee share.
- [ ] **Trial economics:** trial burn is $0.14 per signup; compare with trial → paid before changing it. Card-required trial and a "first video free, second needs a card" gate are the usual levers.
- [ ] **Retry / dunning:** Stripe Smart Retries + failed-payment emails (Resend is wired) recover 20–40% of failed renewals.
- [ ] **Payment fees and tax:** compare Stripe + Stripe Tax against a merchant of record (Paddle, Lemon Squeezy, Polar) that handles EU VAT. Higher fee, zero VAT filing work; decide on the numbers once volume exists.
- [ ] **Script step:** Sonnet-class at ~$0.04 per script; test Haiku-class with the same prompts and prompt caching, keep it if quality holds.
- [ ] **Voice:** ElevenLabs Flash ≈ $0.05 per 1k chars; compare Cartesia, Deepgram Aura, OpenAI TTS, Google Chirp for Standard, keep ElevenLabs for designed voices.
- [ ] **Images:** FLUX schnell at $0.003 is already cheap; compare Runware / Together / Replicate batch prices only if the measured image share is material.
- [ ] **Failed-job burn:** refunds are right, but the provider money is gone. Cut it with earlier validation (moderate before spend, retry the failed step only).
- [ ] **Upsell surfaces:** top-up prompt when a hold fails, "unlock Premium" on a finished Standard video, referral credit, affiliate (30% recurring, §6.3 of the master plan).

## 6. Vendor watchlist (verify before acting; prices move monthly)

| Slot          | Today                        | Candidates to scout                                                                                                                                                   |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI video clip | fal.ai → Kling 2.5 Turbo Pro | Kling / MiniMax Hailuo / ByteDance Seedance direct APIs, Wan 2.x and LTX-2 (open weights) on Replicate, WaveSpeed, Novita, Runpod/Modal GPU, fal's own cheaper models |
| Image         | fal.ai FLUX schnell / dev    | Runware, Together AI, Replicate, self-hosted FLUX on a GPU function                                                                                                   |
| Voice         | ElevenLabs Flash             | Cartesia Sonic, Deepgram Aura, OpenAI TTS, Google Chirp, open-source (Kokoro) for Standard                                                                            |
| Script        | Claude Sonnet 5.5            | Claude Haiku 5.5 + prompt caching, batch API for non-urgent work                                                                                                      |
| Render        | in-house ffmpeg              | Already ≈ $0.01; watch Vercel function minutes                                                                                                                        |
| Payments      | Stripe                       | Paddle / Lemon Squeezy / Polar (merchant of record), Stripe Tax                                                                                                       |
| Hosting / DB  | Vercel Hobby + Supabase      | Watch the free-tier limits; Hobby forbids commercial use, so budget the Pro plan before go-live                                                                       |

Decision rule for a swap: same or better quality on 10 real prompts side by side
(owner reviews), cost per finished video down by ≥ 25%, adapter behind the same
interface, margin gate still ≥ 3x, no sensitive data sent to a vendor that is not
in the privacy policy's sub-processor list (legal update in the same PR).

## 7. Changelog (newest on top)

- **2026-10-20** — Finance track created: this plan, the routine prompt (`docs/routines/finance-ceo.md`), `features/metrics/unit-economics.ts` (MRR, net MRR, top-ups, API cost per tier, failed-job burn, profit and coverage; pure and tested), `scripts/finance-report.mts` (read-only) and `src/config/fixed-costs.ts` (owner fills). No migration, no dependency, no runtime change. (Finance CEO, setup)
