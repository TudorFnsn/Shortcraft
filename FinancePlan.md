# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/cfo-routine.md`). It sits under `TheMasterPlan.md`,
> which wins on product and priority; this file wins on unit economics, vendor
> choice and pricing proposals. Every CFO PR updates §4 (ledger) and §7
> (changelog) in the same change.
>
> Last updated: 2026-10-19 (created; first baseline, see §4)

---

## 1. Charter (proposed 2026-10-19, owner to confirm)

| Question       | Answer                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal           | Maximise **cash return**: grow MRR and gross margin, cut every avoidable euro of cost, without hurting the north star (paying creators who ship).      |
| Autonomy       | **PR-gated**, same as the other routines: branches `ceo-finance/<slug>`, never merge, never touch live secrets, never write to Stripe/Supabase/Vercel. |
| May change     | `src/config/models.ts`, `plans.ts`, adapters in `src/features/providers/**`, `scripts/**`, `FinancePlan.md`, finance notes in `TheMasterPlan.md`.      |
| Must not touch | UI files owned by the Design CEO while a `ceo-design/*` PR is open. Price changes shown to customers are **proposals** until the owner approves.       |
| Hard gate      | `npx tsx scripts/margin-report.mts` must PASS (>= 3x on every plan/top-up). A swap that lowers a measured cost may lower credit prices only via PR.    |
| Cadence        | Daily, 07:00 UTC (after the CEO at 06:00, before Design at 09:00). Weekly deep-dive on Mondays (vendor scan + price research).                         |

## 2. Metrics the routine reports every run

1. **MRR** = sum over live subscriptions (`active`/`trialing`/`past_due`) of plan price, annual plans / 12. Plus net new, churned, expansion, contraction MRR.
2. **Gross margin** = (net revenue - API cost - infra) / net revenue, per plan and blended. Net revenue = price - VAT - Stripe fees (assumptions in `features/billing/margin.ts`).
3. **Cost per finished video** by step (script, image, video, voice, render), standard vs premium, **measured** (`render_jobs.api_cost_usd`), vs. the catalog `costUsdPerUnit` (drift %).
4. **Tokens**: script-step input/output tokens per video and USD per 1k tokens; fal megapixels / video-seconds; ElevenLabs characters. Goal: cost per generated second of finished video.
5. **Burn**: trial cost per signup, failed-job cost (should be ~0 after refunds), top-up revenue share.
6. **Fixed costs** (monthly): Vercel, Supabase, ElevenLabs plan, fal prepaid, Anthropic, Resend, Sentry, domain. Runway = cash / (fixed + variable).
7. **Funnel money**: trial -> paid, ARPU, payback if ads run (CAC vs first-month margin).

## 3. Work split (master agent)

The master agent never does the specialist work itself: it reads this file, lists open + recently closed PRs, spawns the sub-agents below **in parallel**, merges their findings, picks the single highest cash-return item, opens one PR, and sends a digest (push notification only when something needs the owner).

| Sub-agent            | Job                                                                                                                              | Reads                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `revenue-analyst`    | MRR, churn, ARPU, trial->paid, top-up mix, failed payments                                                                       | Stripe (read), Supabase `subscriptions`, `credit_transactions`  |
| `cost-analyst`       | Measured cost per step/video, token + unit usage, catalog drift, failed-job cost, fixed-cost ledger                              | Supabase `render_jobs`, Vercel/fal/ElevenLabs/Anthropic billing |
| `vendor-scout`       | Cheaper/better models + vendors for video, image, TTS, script (web search, price pages); builds a comparison with sources + date | web                                                             |
| `pricing-strategist` | Plan/credit price and packaging proposals (annual discount, hero-shot premium, overage, top-up ladder), margin-gate simulation   | repo + analysts' output                                         |
| `implementer`        | Implements the one chosen change as a small PR with tests; runs margin report, lint, typecheck, tests                            | repo                                                            |

## 4. Baseline and cost ledger

### 4.1 Measured baseline (2026-10-19, read-only Supabase)

| Fact                              | Value                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users / subscription rows         | 6 / 2 (pre-launch, sandbox Stripe: **real MRR = EUR 0**)                                                                                                |
| Render jobs                       | 14 done, 3 failed (failed jobs cost $0.00: refunds and zero-metering work)                                                                              |
| Measured API cost                 | **$8.13 over 14 finished videos = $0.58 average** (catalog says ~$0.07 for 15s standard, so the sample is dominated by premium/AI-video runs and tests) |
| Ledger                            | 7 trial grants (68k credits), 3 monthly grants (200k), 5 top-ups (87k), 1 refund                                                                        |
| Margin gate (`margin-report.mts`) | PASS: Starter 5.62x, Pro 3.00x, Ultra 3.23x, top-ups 3.96-5.92x. Trial burn $0.23                                                                       |
| Vercel billing API                | `costs_not_found` for the last 30 days (likely Hobby plan: $0 usage billing)                                                                            |

**Pro is at exactly 3.00x.** Any measured cost increase (or Kling price change) trips the gate. Cost reductions below create headroom to cut credit prices (more videos per plan = more conversions) or to keep as profit.

### 4.2 Unit costs the catalog assumes (to be re-measured)

| Step   | Provider today                                              | Catalog cost                                       | Notes                                             |
| ------ | ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Script | Claude Sonnet 5.5 ($2 / $10 per MTok)                       | $0.04 per script                                   | ~2k in / 1.5k out; try Haiku 5.5 + prompt caching |
| Image  | fal FLUX schnell / dev                                      | $0.003 / $0.025 per MP                             | 1 MP per 720x1280 image                           |
| Video  | std: local Ken Burns ($0). Premium: fal Kling 2.5 Turbo Pro | $0.12 per scene-second (list $0.07/s, 5s min clip) | Premium is the only big variable cost             |
| Voice  | ElevenLabs Flash                                            | $0.05 per 1k chars                                 | ~15 chars/s                                       |
| Render | in-house ffmpeg                                             | $0.01 per video                                    |                                                   |

## 5. Ideas backlog (ranked by expected cash return; verify before building)

Prices below are **unverified snapshots from vendor-authored roundups (2026-10-19)** and disagree between sources. The `vendor-scout` must confirm on the vendor's own price page and on a measured call before any catalog change.

| #   | Idea                                                                                                                                                                                                                                                           | Why it pays                                                                                                                                 | Status                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | **Premium video: swap Kling for a cheaper model** behind `FAL_VIDEO_MODEL`/a new adapter: Seedance 2.0 Fast/Mini (~$0.02-0.09/s), Hailuo 2.3 (~$0.28 per 6s), Wan 3.x (~$0.08/s), LTX-2 ($0.0018/MP). Run the same 5 prompts through each, blind-rate quality. | Premium is the only line with real variable cost and Pro's 3.00x is bound by it. A 2-3x cheaper clip = Pro margin >= 5x or cheaper credits. | open                       |
| 2   | **Direct vendor routes** instead of fal (ByteDance/BytePlus, MiniMax, Alibaba, Runware, Atlas Cloud): sources say fal is at or above direct/reseller rates for some models; fal's value is one key.                                                            | Same model, lower $/s. Adapter already isolates the swap.                                                                                   | open                       |
| 3   | **Hero-shot premium** (AI clip on scene 1 only, stills elsewhere): ~$0.45 vs ~$1.10 per 15s (TheMasterPlan §7).                                                                                                                                                | Sells a "premium look" at near-standard cost; widens premium to Starter.                                                                    | open (needs measured cost) |
| 4   | **Script: Haiku 5.5 + prompt caching** (system prompt, themes, JSON schema cached); cap `max_tokens` (now 16000) to the real need.                                                                                                                             | Script is 40% of a standard 15s video's cost ($0.04 of ~$0.07).                                                                             | open                       |
| 5   | **TTS cost**: keep ElevenLabs for designed/saved voices (needs slots); add a cheaper engine for stock voices (Deepgram Aura-2 ~$0.03/1k, Inworld Mini ~$0.025/1k, Cartesia). Cache previews and repeated lines.                                                | Voice is the largest per-video line after script on Standard; also removes slot pressure.                                                   | open                       |
| 6   | **Annual plans** (2 months free) + Stripe `price` for yearly (fields exist as `stripePriceIdYearly`).                                                                                                                                                          | Cash up front, lower churn, lowers Stripe fixed-fee share.                                                                                  | open                       |
| 7   | **Stripe fees**: EU cards cost 1.5% + EUR 0.25; yearly + larger top-ups dilute the fixed fee; consider min top-up size; enable Link/SEPA only where cheaper.                                                                                                   | Fixed EUR 0.25 is 1.7% of a EUR 14.99 plan.                                                                                                 | open                       |
| 8   | **Credit expiry / rollover rules**: unused monthly credits expire (breakage), top-ups don't.                                                                                                                                                                   | Pure margin; check legal wording first (`config/legal.ts`).                                                                                 | open (needs owner + legal) |
| 9   | **Free-trial abuse guard**: 3,000 trial credits cost $0.23/signup; add email-verification + disposable-domain block before ads.                                                                                                                                | Caps acquisition cost leakage.                                                                                                              | open                       |
| 10  | **Dedupe/caching of generated assets** (same theme + prompt images/voice previews) and cap regenerations per job.                                                                                                                                              | Direct API savings.                                                                                                                         | open                       |
| 11  | **Infra**: confirm Vercel Hobby limits vs Pro need (commercial use requires Pro: **check ToS before charging real money**), Supabase free vs Pro, Sentry quota, Resend tier.                                                                                   | Avoid surprise fixed costs and ToS risk; fixed costs set break-even MRR.                                                                    | open                       |
| 12  | **Referral / affiliate 30% recurring** (TheMasterPlan §6.2) modelled against margin: affordable only if blended margin >= 60%.                                                                                                                                 | Cheapest customer acquisition when margins are known.                                                                                       | open                       |

## 6. Access the routine needs (owner checklist)

| Need                                        | State 2026-10-19                                                                                               | Action for owner                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft`          | Works (this session)                                                                                           | Add the repo to the new routine                                                                                                          |
| Supabase connector (read SQL)               | Works via claude.ai connector; the repo `.mcp.json` HTTP server failed from the cloud proxy (ERR_PROXY_TUNNEL) | Attach the claude.ai Supabase connector to the routine                                                                                   |
| Stripe connector (MRR, charges, fees)       | **Needs OAuth** ("requires authentication")                                                                    | Authorise Stripe in claude.ai connector settings. Sandbox now; connect the live account at go-live, read-only restricted key if possible |
| Vercel connector                            | Connected; billing endpoint returned no data (Hobby?)                                                          | Tell me the Vercel plan                                                                                                                  |
| fal.ai spend                                | No connector. Dashboard only                                                                                   | Paste monthly usage CSV into an issue, or add `FAL_ADMIN_KEY` (usage API) as a routine secret                                            |
| ElevenLabs spend / slots                    | No connector                                                                                                   | Same: monthly usage, plan name, slot count                                                                                               |
| Anthropic spend                             | No connector                                                                                                   | Add an Anthropic Admin API key (usage + cost report) as a routine secret, or paste monthly totals                                        |
| Fixed costs (domain, Resend, Sentry, tools) | Unknown                                                                                                        | Fill §4.3 below once                                                                                                                     |

### 4.3 Fixed costs (owner to fill, EUR/month)

| Item       | Plan    | EUR/mo |
| ---------- | ------- | ------ |
| Vercel     | ?       | ?      |
| Supabase   | ?       | ?      |
| ElevenLabs | ?       | ?      |
| fal.ai     | prepaid | ?      |
| Anthropic  | usage   | ?      |
| Resend     | ?       | ?      |
| Sentry     | ?       | ?      |
| Domain     | ?       | ?      |

## 7. Changelog (newest on top)

- **2026-10-19** — Finance track created: charter, metrics, work split, baseline from read-only Supabase (14 finished videos, $0.58 average measured cost, MRR EUR 0 pre-launch), seeded ideas backlog, access checklist. No code changes. (CFO, interactive setup)
