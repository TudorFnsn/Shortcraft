# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (prompt in `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`,
> which wins on product and priority; this file wins on cost, pricing and cash.
> Every finance PR updates this file (metrics snapshot + changelog).
>
> Last updated: 2026-10-19 (created; no live data yet)

## 1. Charter

| Question  | Answer                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Maximise cash return: MRR up, API + hosting cost per video down, every vendor euro justified.                                                   |
| Autonomy  | Same as the other routines: **PR-gated**. Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe or production data. |
| Scope     | Pricing/credits (`config/plans.ts`, `config/models.ts`, `features/billing`), provider adapters, cost reporting, vendor and hosting spend.       |
| Off-limit | UI files owned by Design CEO while a `ceo-design/*` PR is open; migrations are owner-applied.                                                   |
| Cadence   | Weekly (Monday 07:00 UTC), after the main CEO. Notifies the owner only when something needs them.                                               |

## 2. Metrics the routine must report every run

1. **MRR** (Stripe, live mode when it exists), net new, expansion, churned, **MRR ratio** = net new MRR ÷ opening MRR, trial → paid, paid churn.
2. **Cost per finished video** by tier (`npx tsx scripts/finance-report.mts --days 30`), spend on failed jobs (lost), cost per 1k credits.
3. **Gross margin** = (net revenue − API cost − Stripe fees − VAT) ÷ net revenue; margin gate (`scripts/margin-report.mts`) must stay ≥ 3x.
4. **Fixed + variable vendor spend**: fal.ai, Anthropic, ElevenLabs, Supabase, Vercel (`list_billing_charges`), Resend, Sentry, domain. Per vendor: € this month, € per video, trend.
5. **Cash return ranking**: every proposal is scored `expected € / month ÷ effort`, highest first; cost cuts on the biggest line item before small ones.
6. **Acquisition cost**: trial burn per signup ($ from the gate) vs trial → paid.

## 3. Sub-agent split (the master routine delegates, then merges)

| Agent          | Reads                                                         | Returns                                                                |
| -------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Revenue        | Stripe connector (MRR, churn, refunds, fees), pricing page    | MRR table, MRR ratio, pricing/packaging experiments                    |
| Unit economics | `finance-report.mts`, `margin-report.mts`, Supabase read-only | cost per video/tier, failed-job loss, credits vs cost drift            |
| Vendor costs   | Vercel billing, provider dashboards the owner exports, repo   | € per vendor, waste (idle plans, over-provisioning, cache misses)      |
| Market scout   | Web search + provider pricing pages                           | cheaper/better models and tech with measured $/s, quality, licence     |
| Builder        | The above                                                     | one small, tested PR for the highest-€ item (adapter, price, cache...) |

## 4. Vendor watchlist (list prices, 2026-10-19, search snippets, **unmeasured**)

Current premium clip: Kling 2.5 Turbo Pro on fal.ai, ~$0.07/s (catalog books $0.12/s conservatively).
Image-to-video alternatives to benchmark on identical prompts (cost, wall time, quality, commercial licence, audio):

| Candidate                    | Reported $/s               | Note                                                           |
| ---------------------------- | -------------------------- | -------------------------------------------------------------- |
| Seedance 2.0 Fast / Mini     | ~0.022 – 0.045             | ByteDance; cheapest seen, via Atlas Cloud and others           |
| Hailuo 02                    | ~0.017 – 0.045             | verify on MiniMax's own page                                   |
| Wan 2.5 / 2.6 (and Flash)    | ~0.05 – 0.10 (Flash ~0.05) | open weights lineage; resellers 0.07, Alibaba list ~0.10       |
| LTX-2 (fal)                  | $0.0018 / MP of video      | very cheap, quality to be checked                              |
| Grok Imagine Video           | ~0.07                      | parity with Kling                                              |
| Same model, cheaper reseller | up to -68% claimed         | Atlas Cloud, WaveSpeed, Replicate: same output, no code change |

Biggest levers, in order: (1) route Premium to the cheapest model that passes a quality bar, behind `FAL_VIDEO_MODEL`/adapter registry; (2) hero-shot Premium (AI clip on scene 1 only); (3) cache and reuse clips/images for repeated themes; (4) cut failed-job spend (moderate and validate before paid calls); (5) annual plans and top-up pricing for cash up front; (6) self-host open models (Wan, LTX) only once volume beats serverless per-second prices.

Sources: fal.ai learn pages, techsy.io, ask.atlascloud.ai, evolink.ai Wan pricing guide, gate.ai, catalog.empiriolabs.ai.

## 5. Connectors and tools that would sharpen this routine

Needs the owner: authorise **Stripe** (claude.ai connector; currently unauthenticated for cloud sessions, test mode only, so no real MRR yet), reconnect **Supabase** (failed with a proxy error on 2026-10-19), keep **Vercel** (billing charges, runtime logs, usage). Worth adding: **PostHog** (visitor → paid funnel), **Sentry** (failed-job cost), a read-only **Anthropic Admin/usage** key, a **fal.ai usage** export (usage and billing pages, or a monthly CSV in the repo's `docs/finance/`), **ElevenLabs** usage, **Resend** usage, and a bank/accounting feed (Mercury, Wise, QuickBooks) for true cash.
Claude tools that help: Workflow/Agent for the sub-agent split, `/loop` for ad-hoc re-checks, `ArtifactData` or a Sheets/xlsx skill for a running finance ledger.

## 6. Open questions for the owner

1. Stripe live mode date, and can the routine read it (restricted read-only key or connector)?
2. Monthly fixed costs not visible in code (domain, Supabase plan, Vercel plan, ElevenLabs plan, tools).
3. Target gross margin and runway/cash goal (today's gate is 3x on worst case).
4. Is quality parity on Premium video negotiable if cost halves?

## 7. Changelog

- **2026-10-19** — Track created: this plan, the routine prompt, `scripts/finance-report.mts` + `features/metrics/unit-economics.ts` (+2 tests). No live data read: Stripe unauthenticated, Supabase connector failed. (Finance CFO, interactive)
