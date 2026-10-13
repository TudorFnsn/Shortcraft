# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **CFO** routine (prompt: `docs/routines/cfo.md`).
> It sits under `TheMasterPlan.md` (which wins on product and priority; §7 stays the pricing record).
> Every CFO PR updates this file (metrics snapshot, backlog, changelog) in the same change.
>
> Last updated: 2026-10-13 (routine created; no live data read yet)

---

## 1. Charter (proposed 2026-10-13, owner to confirm)

| Question       | Answer                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal           | **Maximise cash return**: MRR growth first, then gross margin per video, then fixed-cost trimming. Never trade away the north star (paying-retained creators).                                                                                                     |
| Watched number | **MRR** (list price of live subscriptions), next to **30-day net revenue ÷ (API + fixed costs)** — "coverage". Target ≥ 3x on API cost (the margin gate).                                                                                                          |
| Autonomy       | **PR-gated.** Branches `cfo/<slug>`, never merge, never touch live secrets or live-mode Stripe. Price, plan and credit changes need the owner's OK in the PR.                                                                                                      |
| Cadence        | Daily cloud routine **"Shortcraft CFO"**, 07:00 UTC (after the CEO at 06:00, before Design at 09:00).                                                                                                                                                              |
| Files          | May edit `src/config/models.ts`, `src/config/plans.ts`, `src/features/providers/**`, `src/features/billing/**`, `src/features/metrics/**`, `scripts/`, docs. **Not** UI files while a `ceo-design/*` PR is open (pricing copy goes in the PR description instead). |

## 2. How the routine works (master agent + workers)

The CFO routine is a **dispatcher**. It reads this file, runs `npx tsx scripts/finance-report.mts` (read-only), lists open and recently closed PRs (an item with an open PR is in review, not available), then splits the day into independent jobs and sends them to sub-agents in one parallel batch. It merges their answers, picks **one** win to ship as a PR, and sends the digest.

| Worker                | Job                                                                                                                                                       | Output                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Ledger analyst**    | Run the finance + margin + north-star reports; read Stripe (balance, subscriptions, MRR, churn, refunds, fees) and Supabase via connectors, read-only.    | Metrics snapshot + anomalies              |
| **Spend auditor**     | Every bill: Vercel (`list_billing_charges`), Supabase, Anthropic, fal.ai, ElevenLabs, Sentry, Resend, Stripe fees. Compare to what `api_cost_usd` booked. | Cost table, "booked vs billed" gap        |
| **Provider scout**    | Web research (extended mode) for cheaper/better models per slot: image, image-to-video, voice, script. Prices from official pages; flag aggregator-only.  | Ranked swaps with $/unit and quality risk |
| **Monetisation lead** | Pricing, packaging, annual plans, top-up mix, trial burn, upsell triggers, referral/affiliate, churn saves. Uses real conversion data when it exists.     | Experiments with expected € impact        |
| **Cost engineer**     | Implements the picked win: adapter swap behind the catalog, cost instrumentation, caching, waste cuts. Tests + `margin-report` before and after.          | The PR                                    |

Rules: workers get a self-contained brief and only the files they need; they return numbers with sources, not prose. The dispatcher re-checks any number it will put in a PR. A provider swap ships only with (a) a measured-or-sourced cost, (b) the margin gate still passing, (c) a quality note and a fallback to the current provider.

## 3. Data access (what exists, what is missing)

| Source                     | Status                                                                                      | What it gives                                     | Ask / action                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo                | Connected (`TudorFnsn/Shortcraft`)                                                          | Code, PRs                                         | —                                                                                                                                                                           |
| Stripe connector           | Connected, **sandbox only**                                                                 | Real MRR, churn, fees once live                   | Connect the **live** account read-only (restricted key / connector) at go-live.                                                                                             |
| Supabase connector         | Configured; **failed to connect from the cloud session on 2026-10-13** (proxy tunnel error) | `render_jobs.api_cost_usd`, subscriptions, ledger | Re-authenticate at claude.ai → Connectors; or give the routine `SUPABASE_URL` + a read-only DB role in the environment. `finance-report.mts` needs `.env.local`-style vars. |
| Vercel connector           | Connected                                                                                   | Billing charges, runtime errors, usage            | Confirm the team/project scope.                                                                                                                                             |
| Anthropic usage            | **Missing**                                                                                 | Real token spend per workspace                    | Add an **Admin API key** (Usage & Cost API) as `ANTHROPIC_ADMIN_KEY` in the routine environment.                                                                            |
| fal.ai usage               | **Missing**                                                                                 | Billed $ per endpoint                             | Add a fal **admin/usage key** as `FAL_ADMIN_KEY`, or paste the monthly invoice.                                                                                             |
| ElevenLabs usage           | **Missing**                                                                                 | Characters used, plan tier                        | `ELEVENLABS_API_KEY` already exists; the usage endpoint reads with it.                                                                                                      |
| Fixed costs (hosting etc.) | **Missing**                                                                                 | Vercel, Supabase, domain, tools, per month        | Fill §5 below, or let the spend auditor read the invoices.                                                                                                                  |
| Product analytics          | **Missing** (no PostHog/Plausible)                                                          | Funnel: visit → signup → first video → paid       | Add a PostHog (or Plausible) connector; the monetisation lead is blind without it.                                                                                          |
| Sentry                     | Installed in app, no connector                                                              | Failure causes behind wasted spend                | Optional connector.                                                                                                                                                         |

**Known blind spot — tokens.** Only the script step records tokens (`costUsdFor` in `anthropic-script.ts`) and only the _dollar total_ is stored (`render_jobs.api_cost_usd`). There is no per-step, per-provider or per-token record, so "tokens used vs money spent" cannot be answered per provider today. Backlog item F1 fixes this (needs a migration, so owner-gated).

## 4. Connectors, tools and add-ons that would help most (ranked)

1. **Live Stripe, read-only** — the only honest MRR/churn/refund source. Stripe Sigma through the Stripe connector for cohort revenue.
2. **Supabase connector working again** (or a read-only DB role) — unlocks every per-job cost number.
3. **Anthropic Admin/Usage & Cost API key + fal usage key** — reconcile what the app _thinks_ it spent against what the vendors _billed_.
4. **PostHog (or Plausible) connector** — funnel and paywall conversion; without it pricing experiments are guesses.
5. **Vercel connector** (present) — billing charges and function duration; render runs on serverless compute, so long ffmpeg runs show up here.
6. **Claude Code features:** the `Workflow` tool for the parallel worker fan-out, extended `WebSearch` for provider pricing, the `claude-api` skill when touching the script adapter (prompt caching, Haiku-class models), `/loop` for a mid-day cost-anomaly check.
7. **Possible later:** a pricing-page A/B tool (Vercel Edge Config flags are already reachable), Stripe Tax (replaces the flat 20% VAT assumption), Resend dashboards for lifecycle-email revenue.

## 5. Cost model (fill in; unknown = ask)

Variable (booked per job in `api_cost_usd`): script (Claude), images (fal FLUX), Premium video (fal Kling), voice (ElevenLabs), render (in-house ffmpeg on Vercel compute).

Fixed per month — **owner to fill, or the spend auditor reads invoices**:

| Item                       | USD / month | Source |
| -------------------------- | ----------- | ------ |
| Vercel                     | ?           |        |
| Supabase                   | ?           |        |
| ElevenLabs plan (min tier) | ?           |        |
| Sentry / Resend / domain   | ?           |        |
| Claude Code routines usage | ?           |        |

Pass the total to the report with `--fixed-usd=<n>`.

## 6. Backlog (priority = cash impact ÷ effort; owner-gated items marked 🔒)

Prices below are **unverified search results** (aggregators disagree up to 2x; see TheMasterPlan §7). The provider scout replaces them with official figures before any swap.

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                      | Expected effect                                                   | Gate               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------ |
| F1  | **Per-step cost ledger** (`job_cost_events`: job, step, provider, units, tokens in/out, usd). Lets us show tokens vs spend and reconcile with vendor bills.                                                                                                                                                                                                                               | Visibility; prerequisite for everything below                     | 🔒 migration       |
| F2  | **Cheaper Premium video.** Premium AI video is the only large variable cost (Kling 2.5 Turbo Pro ≈ $0.07/s on fal, booked at $0.12/s). Candidates: Wan 2.5 (≈ $0.05–0.10/s by resolution on fal), Seedance Lite/Fast, Grok Imagine Video (≈ $0.07/s on fal), Wan 2.2 (≈ $0.02/s on one reseller). Add as a second `FAL_VIDEO_MODEL`-style option, A/B on quality, keep Kling as fallback. | Premium cost −30–70% → can lower `creditsPerUnit` or raise margin | measure first      |
| F3  | **Skip fal's markup:** call the model vendors' own APIs, or a cheaper host (Replicate, Together, Atlas Cloud, WaveSpeed), for the same model. Price check required; reliability and rate limits matter more than cents.                                                                                                                                                                   | Same model, lower $/s                                             | owner picks vendor |
| F4  | **Cheaper script model:** try a Haiku-class model with structured output (+ prompt caching for the theme prompt). Today: Sonnet 5.5, ≈ $0.04/script booked, flat 100 credits.                                                                                                                                                                                                             | Small, but free once quality is checked                           | quality check      |
| F5  | **Stop wasted spend:** jobs that fail after paid steps (images, video) still cost money. Measure `wastedApiCostUsd`; add earlier moderation/validation and per-step retry caps.                                                                                                                                                                                                           | Direct cost cut                                                   | needs F1 data      |
| F6  | **Annual plans** (2 months free) — cash up front, lower churn. Stripe prices are `null` in `plans.ts` today; add `stripePriceIdYearly` flow and a pricing toggle.                                                                                                                                                                                                                         | Cash timing + retention                                           | 🔒 price, UI       |
| F7  | **Credit expiry / rollover rules.** Check what happens to unused monthly credits; breakage is margin. Decide and state it in Terms.                                                                                                                                                                                                                                                       | Margin                                                            | 🔒 policy          |
| F8  | **Top-up and upgrade nudges** at the moment of "not enough credits" (the cost meter already knows). Offer the smallest pack that covers the video, else the next plan.                                                                                                                                                                                                                    | ARPU                                                              | UI (Design CEO)    |
| F9  | **Trial burn control.** Trial costs $0.25/signup on paper; confirm with real data and cap abuse (one trial per card/email-domain/device).                                                                                                                                                                                                                                                 | Acquisition cost                                                  | needs data         |
| F10 | **Revenue add-ons:** extra-length packs, brand kits, bulk/series scheduling for Pro+, an affiliate/referral credit for creators who post watermarked videos.                                                                                                                                                                                                                              | MRR                                                               | 🔒 product         |
| F11 | **Stripe fees and tax:** enable Stripe Tax (replace flat 20% VAT assumption), check card-fee tier, consider Link/wallets to lift conversion.                                                                                                                                                                                                                                              | Margin accuracy                                                   | live Stripe        |
| F12 | **Reconcile booked vs billed** monthly (app's `api_cost_usd` vs vendor invoices); a persistent gap means the catalog `costUsdPerUnit` is wrong and the margin gate is lying.                                                                                                                                                                                                              | Gate accuracy                                                     | needs keys         |

## 7. Metrics snapshot

_None yet — the first run that can read Supabase fills this in._ Fields: date, MRR (€), subscribers by plan, 30d net revenue, 30d API spend, wasted spend, cost per finished video (standard / premium), coverage, trial → paid.

## 8. Changelog (newest first)

- **2026-10-13** — Track created: `FinancePlan.md`, `docs/routines/cfo.md`, `scripts/finance-report.mts` + pure `features/metrics/unit-economics.ts` (MRR, 30-day net revenue vs API spend, cost per finished video, waste on unfinished jobs). +4 tests. No migration, no new dependency, no runtime change.
