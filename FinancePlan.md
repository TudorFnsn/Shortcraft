# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine,
> a DM-style master agent that splits the work across specialist sub-agents.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on cost, pricing experiments and cash. Every finance PR updates
> this file (ledger + changelog) in the same change.
>
> Last updated: 2026-10-15 (created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-15, do not change without Tudor)

| Question       | Owner's answer                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mission        | Maximise **profit and cash return**. Watch the MRR ratio, find ways to monetise better, and cut the cost of every video without hurting quality.                    |
| Always check   | **MRR and its ratios** (MRR, net new MRR, churn, ARPU, trial→paid, gross margin per plan, cost per video vs revenue per video, API cost ÷ credits sold).            |
| Known pain     | **fal.ai looks expensive** for video. Find cheaper or better providers and fresh techniques (see §4 backlog); prove with measured calls, not list prices.           |
| Analyse        | Tokens/units consumed per video vs dollars spent making it, plus hosting and every other recurring payment (§3).                                                     |
| Priority order | 1. cash in (conversion, pricing, retention) 2. cost per video 3. fixed costs 4. everything else.                                                                      |
| Autonomy       | **Analyse + PR-gated code.** Branches `ceo-finance/<slug>`; never merge; never touch live secrets; any write to Stripe, Supabase data or a vendor account needs Tudor's OK. |
| Cadence        | Weekly cloud routine **"Shortcraft Finance CEO"**, Mondays 07:00 UTC (after the daily CEO). Weekly because month-scale data needs no daily churn.                    |
| Notify         | Push a notification only for what Tudor must act on (see §6). Silence when nothing changed.                                                                         |

## 2. The numbers it must produce every run

Run read-only: `npx tsx scripts/metrics-report.mts --json`, `npx tsx scripts/margin-report.mts`, plus Supabase `select`s and Stripe reads (when the connectors are up).

| Metric                         | Source                                                        | Healthy target (starting guess) |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------- |
| MRR, net new MRR, churn %      | Stripe subscriptions (`stripe_analytics`)                     | grow week on week; churn < 6%/mo |
| ARPU, trial → paid             | `scripts/metrics-report.mts`                                  | trial → paid ≥ 5%               |
| Gross margin per plan          | `margin.ts` and measured `render_jobs.api_cost_usd`           | ≥ 3x (gate), aim 5x on Standard |
| Cost per finished video        | `render_jobs.api_cost_usd` grouped by tier and length         | Standard ≤ $0.10 (15s)          |
| Cost per credit vs price       | `credit_transactions` vs `api_cost_usd`                       | no tier below the gate          |
| Failed-render cost             | failed jobs with non-zero `api_cost_usd`                      | → 0 (refund must not eat margin) |
| Fixed costs                    | §3 table                                                      | each earns its place            |
| Break-even                     | fixed costs ÷ (ARPU × gross margin)                           | paying users needed to cover §3 |

Units per video (for "tokens vs spend"): Claude input/output tokens (script + moderation), image megapixels, fal video seconds, ElevenLabs characters, ffmpeg seconds. Where `api_cost_usd` is a single sum, the routine's first PR adds a per-provider breakdown (see backlog F1).

## 3. Cost ledger (owner fills the blanks; the routine keeps the rest current)

| Item                  | Type     | Monthly cost | Status                                        |
| --------------------- | -------- | ------------ | --------------------------------------------- |
| Anthropic API (script)| variable | measured TBD | key live; ~$0.04/script list price            |
| fal.ai (images, video)| variable | measured TBD | `FAL_KEY` pending as of 2026-10-09            |
| ElevenLabs            | var+fixed| **ask Tudor**| plan tier and custom-voice slots matter       |
| Supabase              | fixed    | **ask Tudor**| project `iqvrovjwoavvmhaithwn`; free vs Pro?  |
| Vercel                | fixed    | **ask Tudor**| Hobby vs Pro (Hobby bars commercial use)      |
| Stripe fees           | variable | ~2.9% + fixed| from Stripe balance transactions              |
| Resend (email)        | fixed    | **ask Tudor**| free tier?                                    |
| Sentry                | fixed    | **ask Tudor**| free tier?                                    |
| Domain, other         | fixed    | **ask Tudor**|                                               |
| Ads / affiliates      | variable | 0            | not started                                   |

## 4. Backlog (priority order; the routine takes the top unchecked item not already in an open `ceo-finance/*` PR)

- [ ] **F0 Measure.** A read-only `scripts/cost-report.mts`: per-tier and per-length cost per video, per-provider units and dollars, failed-job spend, MRR ratios, break-even. Pure math in `features/finance/`, tested. No migration.
- [ ] **F1 Meter by provider.** Store the cost per provider per job (additive migration for Tudor to apply; code tolerates its absence).
- [ ] **F2 Video provider bake-off.** Replace or complement fal.ai for Premium. Candidates to price on a real 5s 720p image-to-video call: Kling direct API, Seedance/ByteDance (BytePlus), Wan 2.x open weights, LTX-2, Hailuo/MiniMax, Runway, Luma, Veo Fast; hosted alternatives to fal: Replicate, Together, Fireworks, WaveSpeed, Novita, and self-hosting open models on serverless GPU (Modal, RunPod, Vast). Output: a table of measured $/s, latency, quality notes, then an adapter behind the existing provider port. Quality is judged by Tudor on side-by-side clips.
- [ ] **F3 Cheaper stills, voice and script.** FLUX schnell is already ~$0.003; check cheaper image hosts, ElevenLabs vs cheaper TTS (OpenAI, Cartesia, Deepgram Aura, self-hosted Kokoro/Piper), Claude Haiku-class for the script and moderation, prompt caching and batch pricing, shorter prompts.
- [ ] **F4 Hero-shot Premium** (AI clip on the hook scene only, §7 of the master plan): price near Standard, add as a new tier.
- [ ] **F5 Monetisation.** Annual plans (cash up front, ~2 months free), a first-month discount for trials that ran out of credits, top-up nudges at <20% credits, credit expiry/rollover rules, a pay-per-video tier, watermark-removal add-on, referral credits, a Team/agency seat plan, upsell to Pro when Starter users hit the video limit. Each is a PR behind a flag or config with an expected effect on MRR written in the PR.
- [ ] **F6 Churn and recovery.** Stripe smart retries and dunning emails, cancel-flow offer (pause or downgrade), win-back email in the lifecycle cron.
- [ ] **F7 Fixed-cost audit.** Right-size each §3 line; flag anything on a paid plan that a free tier covers.
- [ ] **F8 Cache and dedupe.** Reuse images/voice for repeated prompts, cap retries, kill runaway jobs (cost guards), per-user spend ceilings.

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7, §8, §9), this file, `git log -20`, open and recent PRs (GitHub MCP `list_pull_requests`). An item with an open PR is in review, not available.
- **Master agent, not a solo worker.** Split each run into parallel sub-agents (one message, several `Agent` calls), each with a narrow brief and the files to read; then merge and cross-check their numbers:
  1. **Revenue analyst:** MRR, churn, ARPU, trial→paid from Stripe + the metrics script.
  2. **Cost analyst:** cost per video and unit consumption from Supabase `render_jobs`, `scenes`, `credit_transactions`.
  3. **Fixed-cost auditor:** Vercel billing/usage (`list_billing_charges`), Supabase and other vendors, §3 ledger.
  4. **Provider scout:** web research on cheaper/better video, image, TTS and LLM options (use `WebSearch`; mode `extended` for prices). Prices from search snippets are leads, not facts: mark them "unmeasured".
  5. **Monetisation strategist:** pricing, packaging, retention experiments tied to the data above.
  6. **Implementer:** only after the master picks one item; builds it on `ceo-finance/<slug>`.
  Do the work yourself if it is a handful of calls; spawn agents only when the pieces are independent.
- **Evidence rule:** every recommendation states the number it moves (e.g. "-$0.40 per Premium 15s, +$X gross margin per Pro user/mo") and whether that number is measured or list price.
- **Files it may change:** this file, `src/features/finance/**`, `scripts/cost-report.mts`, `scripts/*bakeoff*.mts`, `src/config/models.ts` and provider adapters under `src/features/providers/**` (cost and swaps only), `src/features/billing/margin.ts` and `config` plan/price tables, the Finance lines of `TheMasterPlan.md`. It never touches auth, RLS, webhooks' security logic, UI files owned by a `ceo-design/*` PR, or live secrets. A price change that customers see (plan prices, credit grants) is **proposed** in the PR and needs Tudor's explicit OK before the Stripe side changes.
- **Money safety:** read-only on Stripe/Supabase/Vercel/vendors. No purchases, plan upgrades, refunds, subscription edits or key creation. Any write needs Tudor.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode; the margin gate still passes (fail-closed) or the PR explains why.
- **Output:** one PR at most per run, a digest, and a notification only when §6 applies.

## 6. When to notify Tudor

Notify (PushNotification) when: MRR dropped week on week or churn spiked; any plan or tier fell below the 3x margin gate on measured data; a vendor bill is rising faster than revenue; a provider swap would cut cost per video by ≥ 25%; a blocker needs him (missing access, a question from §7, a PR awaiting a decision). Do not notify for "ran, nothing changed".

## 7. Access and tools — what the routine needs (open questions for Tudor)

- **Already connected in this environment:** GitHub, Stripe (sandbox/test mode: **MRR will read as 0 until live mode is connected**), Vercel, Supabase (the cloud connection failed with `ERR_PROXY_TUNNEL` on 2026-10-15; retry or check the connector).
- **Needed for real numbers:**
  1. Connect **Stripe live mode (read-only restricted key)**, scope: Subscriptions, Invoices, Balance transactions, Customers read.
  2. A **read-only Postgres role/URL** (or a working Supabase connector) so cost and metrics queries run. Never the service role in a routine.
  3. **Vendor spend:** read-only usage/billing for fal.ai, Anthropic (Console usage + cost API with an Admin key), ElevenLabs (subscription/usage endpoint). Export monthly invoices into a private folder or paste totals in §3.
  4. The **fixed-cost blanks** in §3 (plan tiers and monthly price per vendor).
- **Suggested additions:** PostHog or Vercel Web Analytics for funnel/CAC; a Sentry connector for failed-render cost; Google Sheets for a shared cost ledger; Brave/Exa search or the deep-research skill for provider price scouting; the Claude API skill for token-cost modelling (prompt caching, batch). Revenue tools worth evaluating: Stripe Billing features (smart retries, customer portal downgrade-to-pause, annual prices, coupons), Lemon Squeezy/Paddle as merchant of record only if EU VAT admin outweighs their fee.

## 8. Changelog

- **2026-10-15** — Finance track created: charter, metrics, cost ledger, backlog F0–F8, routine rules and the routine prompt (`docs/routines/finance-ceo.md`). No code changes. (Finance CEO, setup)

## 9. Decision log

- **Separate weekly routine** (2026-10-15, owner request) → cost and pricing need accumulated data, not daily churn; the daily CEO and Design CEO keep their slots.
- **Measure before switching providers** (2026-10-15) → master plan §7 notes list prices from snippets disagree by 2x; a swap needs a measured call and Tudor's quality OK.
