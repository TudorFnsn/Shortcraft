# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine.
> Product and priority calls stay in `TheMasterPlan.md`; this file holds the
> numbers, the vendor watchlist and the experiments. Routine prompt: `docs/routines/finance-cfo.md`.
>
> Last updated: 2026-10-20

## 1. Charter

Maximise **cash return**: net MRR growth first, then gross margin per video, then fixed-cost burn.
Every run answers three questions with numbers, not opinions:

1. **Is MRR growing, and is it paying for itself?** (`npx tsx scripts/finance-report.mts`)
2. **What does one finished video cost us, per tier, and how does that compare to the credits it burns?** (`api_cost_usd` per job vs `actual_credits`; margin gate in `scripts/margin-report.mts`)
3. **What is the cheapest vendor/technique that keeps quality, and what does switching save per month?**

Guardrails (inherited from the CEO routine, PR-gated autonomy):

- Never merges, never touches live secrets, never writes to Stripe/Supabase/Vercel (read-only checks only; any write needs Tudor's explicit OK).
- A provider swap ships behind the existing adapter layer and the **margin gate** (3x worst case, fail-closed). No swap goes live on list prices alone: measure on real calls first (`scripts/live-providers-smoke.mts`).
- Pricing changes (plans, top-ups, credit scale) are **proposals with numbers** for Tudor; they are not merged by the routine.
- Quality floor: a cheaper model must pass a side-by-side on the same 5 prompts (hook strength, artefacts, lip/voice sync, caption timing) before it is proposed as default.

## 2. Metrics (the dashboard the routine fills in each run)

| Metric                                | Source                                          | Healthy                                  |
| ------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| MRR (ex-VAT) and net MRR              | `subscriptions` × `PLANS`                       | up week over week                        |
| ARPU, subscribers by plan             | same                                            | Pro/Ultra share rising                   |
| Top-up revenue (net)                  | `credit_transactions` reason `topup`            | up; "unpriced" must be 0                 |
| Cost per finished video, per tier     | `render_jobs.api_cost_usd` / `done`             | Standard ≤ $0.10 at 15s, Premium falling |
| Failed-job cost                       | `api_cost_usd` on `failed` jobs                 | < 5% of variable cost                    |
| COGS ratio (variable cost ÷ net rev.) | `finance-report`                                | < 33% (= the 3x gate)                    |
| Fixed costs and burn                  | `src/config/fixed-costs.ts` (+ vendor invoices) | no `null` left                           |
| Break-even subscribers                | `finance-report`                                | reached                                  |
| Trial burn per signup                 | `margin-report` (trial cost)                    | ≤ $0.25, ratio to trial→paid             |
| Trial → paid, churn                   | `scripts/metrics-report.mts`                    | trial→paid ↑                             |

Known gap: Stripe is the revenue truth (refunds, disputes, failed renewals, tax). Until the Stripe connector
is authorised for the routine, MRR is derived from our own `subscriptions` table and list prices, so it
overstates by refunds/discounts and is blind to yearly plans and coupons.

## 3. Cost stack and savings hypotheses

Per-video cost today comes from `src/config/models.ts` (see TheMasterPlan §7). Stack: Anthropic (script) · fal.ai FLUX (images) · fal.ai Kling (Premium clips) · ElevenLabs (voice) · in-house ffmpeg (render) · Vercel · Supabase · Resend · Sentry.

Hypotheses, each to be **verified by the Vendor Scout with current prices, then measured** (none is a decision yet):

| #   | Lever                                                                                                                                                                                                     | Why it might pay                                                                                                     | How to test                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| H1  | Premium video: replace Kling on fal.ai with a cheaper image-to-video model (Wan 2.x, Seedance, LTX-2, Hailuo) or the same model through a cheaper host (Replicate, WaveSpeed, Runware, Novita, DeepInfra) | Premium is the largest per-video cost ($1–2+ per 15s). Open-weight models are sold by many hosts at different prices | Price table per second of 720p output; 5-prompt A/B; adapter behind `FAL_VIDEO_MODEL`-style env |
| H2  | Hero-shot Premium (AI clip on scene 1 only, stills elsewhere)                                                                                                                                             | ≈ $0.45 vs ≈ $1.10 per 15s; keeps the "AI video" selling point                                                       | Already previewed via `--premium` smoke flag; ship as a tier                                    |
| H3  | Images: FLUX schnell on a cheaper host or smaller model                                                                                                                                                   | Standard video cost is mostly images + voice; per-image price differs ~5x across hosts                               | Same prompts, compare cost + look                                                               |
| H4  | Voice: cheaper TTS for Standard (e.g. Cartesia, OpenAI TTS, Deepgram, self-hosted Kokoro/F5) with ElevenLabs kept for Premium/custom voices                                                               | ElevenLabs is per-character plus a plan fee and voice slots                                                          | A/B listening test + word-timing quality (captions need timings)                                |
| H5  | Script: Claude Haiku-class model + prompt caching for the fixed system prompt (and Batch where latency allows)                                                                                            | Script is small per video, but caching/cheaper model is free margin                                                  | Compare script quality on the 8 themes; check token counts in logs                              |
| H6  | Cache and reuse: dedupe identical image/voice requests; cap retries; refund-safe failure paths                                                                                                            | Failed jobs still cost provider money                                                                                | `failedCostUsd` in the report                                                                   |
| H7  | Fewer failed renders (moderation before spend, pre-flight checks)                                                                                                                                         | Every failed job is pure loss                                                                                        | Failure rate in `metrics-report`                                                                |
| H8  | Self-host GPU burst (Modal / RunPod / Replicate-style per-second GPUs) for open-weight video/image                                                                                                        | Beats per-call pricing once volume is steady; adds ops cost                                                          | Only past a volume threshold the report states                                                  |
| H9  | Annual plans (2 months free) and Stripe-level cash upfront                                                                                                                                                | Pulls cash forward, lowers churn, improves fees ratio                                                                | Proposal with MRR/cash model                                                                    |
| H10 | Monetisation: watermark-removal and extra-voice add-ons, per-video Premium purchase, credit expiry, trial cost cap, usage-based overage                                                                   | Raises ARPU without raising list price                                                                               | Proposal with price points + margin gate output                                                 |
| H11 | Infra: stay on free/Hobby tiers until MRR covers the next tier; revisit Supabase/Vercel/Resend/Sentry plans quarterly                                                                                     | Fixed costs are zero-growth drag                                                                                     | `fixed-costs.ts` has no `null` and each line has an owner                                       |

## 4. Experiment log

_(none yet. One row per experiment: date · hypothesis · result in $/video and quality verdict · decision.)_

## 5. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recent PRs (list them; an item with an open PR is in review, not available).
- **Run the numbers first**, then spawn the sub-agents (see `docs/routines/finance-cfo.md`). If the database is unreachable, say so in the digest and work from the margin gate + vendor research.
- **One shipped change per run at most**, as a PR on a `finance/*` branch. Prefer measurement code, vendor adapters behind flags, and docs. Plan/price changes are proposals only.
- **Files it may change:** this file, `src/config/fixed-costs.ts`, `src/features/metrics/**`, `scripts/*report*.mts`, `scripts/*smoke*.mts`, `src/config/models.ts` (cost figures only, once measured), new provider adapters under `src/features/providers/live/**` (disabled by default), `docs/routines/**`, and its own lines in `TheMasterPlan.md`. It does not touch UI files owned by Design, migrations, webhooks or credit/ledger code.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `npx tsx scripts/margin-report.mts` still passes.
- **Notify** (PushNotification) only on: MRR drop > 10% week over week, COGS ratio above 33%, margin gate failing, a saving > $50/month found or shipped, an input the routine needs from Tudor, or a run that couldn't read its data. Otherwise stay silent.
- **Output:** digest with MRR and cost-per-video numbers, what changed since last run, savings found (in $/month), PR links, and a "needs Tudor" list.

## 6. Access the routine needs (checklist for Tudor)

- [ ] GitHub repo access on the routine (read + push to `finance/*`, open PRs).
- [ ] **Stripe connector** authorised for the routine (read-only is enough): real MRR, refunds, churn, fees, payouts. Today it shows "needs authentication".
- [ ] **Supabase** connector reachable from the routine (read-only `select`s: `subscriptions`, `render_jobs`, `credit_transactions`), or `SUPABASE_SERVICE_ROLE_KEY` in the routine's environment so `scripts/finance-report.mts` runs. Today the project MCP failed with a proxy tunnel error from the cloud session.
- [ ] **Vercel connector** (already configured): billing/usage via `list_billing_charges`, deployments, runtime errors.
- [ ] Vendor invoices/plan prices to fill `src/config/fixed-costs.ts` (Vercel, Supabase, ElevenLabs, Resend, Sentry, domain, Claude).
- [ ] fal.ai usage/billing export (monthly CSV or API key with usage read) and ElevenLabs + Anthropic usage dashboards, so provider invoices can be reconciled against `api_cost_usd`.
- [ ] A test `FAL_KEY` (and keys for any candidate vendor) in the routine's environment to run price/quality smokes. Spend cap on each key.
- [ ] Network access to vendor pricing pages (the CEO routine's note in §7 says provider pages were blocked; allow-list them or provide a pricing CSV).

## 7. Suggested tools, connectors and add-ons

- **Stripe connector** (authorise): revenue truth, Sigma SQL for MRR/churn cohorts.
- **Supabase connector**: read-only analytics; `get_advisors` for cost-driving issues (missing indexes, bloat).
- **Vercel connector**: `list_billing_charges`, `get_runtime_errors`; spot function-duration cost from long renders.
- **PostHog or Plausible** (privacy-friendly) to connect visitor → signup → paid; the plan has no analytics vendor yet, so CAC and conversion are guesses.
- **Sentry connector**: failed-render root causes → H7.
- **Google Sheets / Drive connector**: a monthly P&L sheet Tudor can read on his phone.
- **Slack or email connector** for the weekly digest beyond push notifications.
- **A pricing-feed source** (own CSV in `docs/finance/vendor-prices.csv`, updated by the Vendor Scout) so price history is versioned.
- Claude tools: `WebSearch`/`WebFetch` for vendor prices, `Agent` for the parallel split, `PushNotification` for alerts, `Workflow` only when Tudor opts in to a large fan-out.

## 8. Changelog (newest on top)

- **2026-10-20** — Finance track created: `FinancePlan.md`, `docs/routines/finance-cfo.md` (master + sub-agent split), `src/features/metrics/finance.ts` (MRR, cash, cost per video, burn, break-even; +6 tests), `scripts/finance-report.mts`, `src/config/fixed-costs.ts` (all `null` until Tudor fills them). (Finance CFO, interactive)
