# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (prompt: `docs/routines/finance-ceo.md`). `TheMasterPlan.md` wins on product and
> priority; this file wins on cost, pricing and cash. Every finance PR updates
> this file (baseline + changelog) in the same change.
>
> Last updated: 2026-10-18 (track created)

## 1. Charter (set by the owner 2026-10-18, do not change without Tudor)

- **Goal:** maximise cash return. Order of priority: (1) never lose money on usage, (2) grow MRR, (3) cut cost per finished video, (4) cut fixed costs.
- **Always check:** MRR, net MRR, API cost ÷ net MRR (the cost ratio), contribution (net MRR − API cost − fixed costs), and the margin gate (`npx tsx scripts/margin-report.mts`, 3x floor).
- **Autonomy:** PR-gated, same as the CEO routine. It never merges, never touches live secrets, never changes Stripe prices or plans in the live account. Price and plan changes are proposals for Tudor, with the numbers.
- **Swap rule:** a cheaper provider replaces an incumbent only after a measured side-by-side (same 10 prompts, quality judged by the owner) and a passing margin gate on measured costs.

## 2. How to measure

| Question                   | Source                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MRR, plan mix, cost ratio  | `npx tsx scripts/finance-report.mts [--fixed=<usd>] [--json]` or the Supabase connector (`subscriptions`, `render_jobs`). Maths in `src/features/metrics/finance.ts`. |
| Real card revenue, refunds | Stripe connector (balance, charges, subscriptions). Needs reconnecting.                                                                                               |
| Hosting / platform spend   | Vercel connector (`list_billing_charges`); Supabase billing page.                                                                                                     |
| Provider spend             | fal.ai, ElevenLabs and Anthropic usage pages (no connector yet; see §5).                                                                                              |
| Tokens per video           | Anthropic only (script step). Measured cost is `costUsdFor` in `anthropic-script.ts`; token counts are **not stored** (see §6, item 3).                               |
| Margin gate                | `npx tsx scripts/margin-report.mts`, 3x floor. The gate fails closed on live providers.                                                                               |

**Caveat:** `render_jobs.api_cost_usd` is the cost the code computes from the catalog (`config/models.ts`), not an invoice. Until provider invoices are compared with it, treat it as an estimate.

## 3. Baseline (Supabase, read 2026-10-18; Stripe is in test mode)

| Metric                | Value                                                           |
| --------------------- | --------------------------------------------------------------- |
| Profiles              | 6                                                               |
| Live subscriptions    | 2 Pro (test mode, almost surely owner tests), so real MRR ≈ €0  |
| Paid grants in ledger | 8 (test)                                                        |
| Jobs, last 30d        | 14 done, 3 failed (failed jobs billed $0)                       |
| Standard done         | 11 videos, $2.37 API cost → **$0.22 per video**, 13,012 credits |
| Premium done          | 3 videos, $5.76 API cost → **$1.92 per video**, 42,636 credits  |
| API cost 30d          | $8.13 (all owner testing, no customer revenue yet)              |
| Fixed costs           | **Unknown, owner to fill in §5**                                |

Reading: Standard's cost per video is about 3x what the gate assumes ($0.07 for 15s); find out why (script step $0.04, voice, ken-burns, render, longer videos?) before trusting the margin table. Premium is $1.92 per video for ~14.7k credits (≈ $0.13 per 1k credits) against Standard's ≈ $0.18 per 1k: Premium is not the bad deal the catalog fears, Standard is.

## 4. Roadmap (priority order)

Status: `[ ]` todo · `[~]` in progress · `[x]` shipped.

### F0: Know the numbers

- [x] `finance.ts` + `scripts/finance-report.mts` + tests (this PR).
- [ ] Fixed-cost table filled in (owner, §5).
- [ ] Stripe connector reconnected, so MRR can be cross-checked against real subscriptions.
- [ ] Store token counts per job (`render_jobs.usage jsonb`: script input/output tokens, billed clip seconds, voice characters). Migration + orchestrator write. Lets us price per unit with facts.
- [ ] Reconcile one week of `api_cost_usd` against fal.ai / ElevenLabs / Anthropic invoices.

### F1: Cut cost per video

- [ ] **Script step:** Sonnet 5.5 costs $0.04 per video. A Haiku-class model with prompt caching of the (static) system prompt and a structured-output schema should cost a fraction. A/B on 20 topics, owner judges quality.
- [ ] **Premium video:** compare Kling 2.5 Turbo (current, ~$0.07/s on fal) with the candidates in §7. Bill only the clip seconds used (Kling bills fixed 5s clips; a 3s scene wastes 40%). Hero-shot variant (AI clip on scene 1 only, ≈ $0.45 per 15s).
- [ ] **Failed-job spend:** every failed job after the clip step still costs money. Measure, then fail earlier (moderation before images already done) and reuse finished clips on retry.
- [ ] **Voice:** ElevenLabs Flash is $0.05/1k chars. Compare with cheaper TTS only if voice cost per video is above 10% of the total.
- [ ] **Cache:** same topic + theme within a window reuses the script and stills.

### F2: Grow MRR

- [ ] Annual plans (2 months free) for cash up front; Stripe price ids are still null in `plans.ts`.
- [ ] Trial economics: trial burn per signup vs trial → paid (`metrics-report.mts`). Cap trial cost; no card, no premium.
- [ ] Credit expiry / rollover policy: unused monthly credits are pure margin, but breakage drives churn. Decide with data.
- [ ] Top-up nudge when a subscriber is out of credits mid-cycle (lifecycle email exists).
- [ ] Price test per tier once there are ≥ 30 paying users (proposal only).
- [ ] Reduce involuntary churn: Stripe Smart Retries and card-updater emails.

### F3: Cut fixed costs

- [ ] Review Vercel plan, Supabase plan (compute add-ons), Resend, Sentry quotas vs use. Drop anything idle.

## 5. Owner inputs needed (the routine asks for these in its digest until filled)

| Item                                                                                                                                                       | Status                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Monthly fixed costs in USD: Vercel, Supabase, ElevenLabs plan, fal.ai minimum, Resend, Sentry, domain, any seat                                            | **missing**             |
| Stripe: reconnect the connector (status: needs reconnect)                                                                                                  | **missing**             |
| Stripe go-live date                                                                                                                                        | unknown                 |
| Revenue target (MRR in EUR) and runway/cash-in-bank                                                                                                        | **missing**             |
| Read access for provider spend: fal.ai usage export, ElevenLabs usage, Anthropic Console usage (CSV or API admin key in a secret store, never in the repo) | **missing**             |
| Whether the routine may open PRs that change `config/models.ts` prices                                                                                     | assume **yes, PR only** |

## 6. Findings log

1. Standard cost per video is $0.22 measured vs $0.07 assumed (2026-10-18). Unexplained.
2. Stripe connector is disconnected, so no real revenue is visible.
3. Token counts are not persisted, so "tokens vs spend" can only be inferred from `api_cost_usd`.

## 7. Provider candidates (list prices from search snippets 2026-10-18, **unverified**, vendor blogs disagree)

| Slot           | Incumbent                        | Candidates                                                                                                                                                     |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image-to-video | Kling 2.5 Turbo on fal ≈ $0.07/s | Wan 2.2 Turbo ≈ $0.02/s, Pruna P-Video ≈ $0.02/s (720p), Grok Imagine ≈ $0.05–0.07/s, Kling 3 ≈ $0.07–0.11/s, Seedance 2 Fast ≈ $0.08/s, LTX-2.3 Fast $0.06+/s |
| Aggregators    | fal.ai                           | Atlas Cloud, Replicate, direct vendor APIs (often 20–60% below fal for the same model); self-host Wan/LTX on a rented GPU only past ~5k clips a month          |
| Script         | Sonnet 5.5                       | Haiku 5.5 with prompt caching and the Batch API (50% off, not for interactive use)                                                                             |
| Images         | FLUX schnell $0.003              | Already near the floor.                                                                                                                                        |

Sources: [invideo pricing roundup](https://invideo.io/blog/ai-video-model-pricing), [fal.ai image-to-video ranking](https://fal.ai/learn/tools/best-image-to-video-apis-2026), [Atlas Cloud comparison](https://www.atlascloud.ai/blog/case-studies/Top-5-ai-video-apis-compared-speed-latency-and-cost-per-second-2026).

## 8. Suggested connectors and tools

- **Stripe** (installed, needs reconnect): MRR, churn, refunds, disputes, payouts. The biggest gap.
- **Supabase** (works): usage and job tables.
- **Vercel** (works): billing charges, usage, function duration.
- **GitHub** (works): PRs.
- **Firecrawl** (installed, off in chat): scrape provider pricing pages, which block the cloud network. Enable it for this routine.
- **Google Drive / Sheets**: a cost ledger the owner can edit (fixed costs, invoices). Optional.
- **Provider usage:** none exist as connectors; the owner can add an admin-key reader later. The Anthropic Admin API exposes cost and usage reports.

## 9. Changelog

- **2026-10-18** — Track created: charter, baseline, roadmap, `finance.ts` + `finance-report.mts` (+4 tests, 524 total). No migration, no runtime change. (interactive)
