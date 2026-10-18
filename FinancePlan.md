# FinancePlan — Shortcraft money

> **Source of truth for the finance track.** Owned by the **Finance CEO**
> routine (`docs/routines/finance-ceo.md`). `TheMasterPlan.md` wins on product
> and priority; this file wins on cost, price and cash. Every finance PR updates
> it (metrics row, decision log, backlog) in the same change.
>
> Last updated: 2026-10-18 (routine created; no live data read yet)

## 1. Charter

| Question        | Answer                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Objective       | Maximise profit: cash return first, then MRR growth.                                                        |
| Hard constraint | Every plan and top-up keeps ≥ 3x revenue ÷ worst-case API cost (`scripts/margin-report.mts`).               |
| Autonomy        | PR-gated (`ceo-finance/<slug>`), never merges. Read-only on Stripe, Supabase, Vercel, vendors.              |
| Measures        | `scripts/finance-report.mts` (MRR, cost per video, margin, fixed costs, profit), plus `metrics-report.mts`. |

## 2. Where the money goes (from the code, 2026-10-18)

| Slot              | Provider today                 | List cost (unmeasured)        | Note                                                                |
| ----------------- | ------------------------------ | ----------------------------- | ------------------------------------------------------------------- |
| Script            | Anthropic `claude-sonnet-5-5`  | ~$0.04 / video                | ~2k in / 1.5k out; try prompt caching, cheaper model for moderation |
| Image             | fal.ai FLUX schnell / dev      | $0.003 / $0.025 per MP        | cheap; check per-image rather than per-MP billing                   |
| Standard video    | local Ken Burns (ffmpeg)       | $0                            | already free                                                        |
| **Premium video** | **fal.ai Kling 2.5 Turbo Pro** | **~$0.07/s, catalog $0.12/s** | **the dominant cost; Pro sits at exactly 3.0x**                     |
| Voice             | ElevenLabs Flash               | ~$0.00075 / s                 | plus custom-voice slots on the plan                                 |
| Render            | in-house ffmpeg on Vercel      | ~$0.01                        | function time                                                       |
| Fixed             | `src/config/costs.ts`          | ~$69 / month (assumed)        | replace with invoices                                               |

Unit economics at list prices: 15s Standard ≈ $0.07 for 2,024 credits; 15s
Premium ≈ $1.10 for 26,504 credits. Standard carries ~9x; Premium is the
margin risk and the largest lever.

## 3. Backlog (ranked by expected cash impact; all unverified until measured)

1. **Measure real costs.** First live run of `finance-report.mts` once `FAL_KEY` and real jobs exist: replace `costUsdPerUnit` list prices with measured ones, then re-run the margin gate. Unlocks every item below.
2. **Premium video cost.** Benchmark alternatives to Kling 2.5 Turbo Pro on the same 10 scenes (Wan, LTX, Seedance, Hailuo, Veo Fast, direct vendor APIs, self-hosted GPU): $ per second, quality, failure rate. Ship the winner behind `FAL_VIDEO_MODEL` or a new adapter.
3. **Hero-shot premium.** AI clip on scene 1 only, stills for the rest (~$0.45 vs ~$1.10 per 15s); price it between Standard and Premium.
4. **Failed-job waste.** Measure `failedJobCostUsd`; fail fast before the paid steps, retry only the failed step.
5. **Annual plans** (≈ 2 months free) for cash up front and lower churn; needs Stripe prices (owner).
6. **Top-up and upgrade nudges** at low balance; dunning and win-back emails through the existing lifecycle cron.
7. **Claude token spend.** Prompt caching, shorter scene prompts, cheaper model for the moderation pass.
8. **Fixed costs.** Confirm each line in `config/costs.ts`; downgrade unused tiers.
9. **Affiliate payout math** (30% recurring from `TheMasterPlan` §6) against measured margin.

## 4. Metrics log (newest first)

| Date       | MRR (€) | Subscribers | API cost 30d | Gross margin | Profit 30d | Notes                                                                                   |
| ---------- | ------- | ----------- | ------------ | ------------ | ---------- | --------------------------------------------------------------------------------------- |
| 2026-10-18 | n/a     | n/a         | n/a          | n/a          | n/a        | No data access from the setup session (Supabase connector failed, Stripe unauthorised). |

## 5. Decision log (newest first)

- **2026-10-18** — Finance track created: routine spec, `finance-report.mts` (pure math in `features/metrics/finance.ts`, 4 tests), fixed-cost table in `config/costs.ts`.
