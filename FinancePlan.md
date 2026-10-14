# FinancePlan.md — CFO routine memory

Owned by the **CFO routine** (prompt: `docs/routines/finance-cfo.md`, sub-agents: `.claude/agents/finance-*.md`). Product and priority calls stay in `TheMasterPlan.md`; this file holds the money: ratios, cost lines, vendor options, proposals. The CFO appends to it every run.

## 1. Charter

Maximise cash return: grow MRR, keep gross margin >= the 3x margin gate, and cut cost per finished video without hurting quality. Order of priority: (1) never lose money on a video, (2) cut variable cost, (3) raise revenue per user, (4) raise conversion and retention, (5) trim fixed cost.

## 2. Ledger (newest first; the CFO adds a row per run)

| Date       | MRR | Net new MRR | Paying subs | Gross margin | Cost / 15s std video | Cost / 15s premium | Trial burn / signup | Notes                                                    |
| ---------- | --- | ----------- | ----------- | ------------ | -------------------- | ------------------ | ------------------- | -------------------------------------------------------- |
| 2026-10-14 | n/a | n/a         | n/a         | n/a          | ~$0.07 (catalog)     | ~$1.10 (catalog)   | ~$0.25 (catalog)    | Baseline. Stripe is sandbox/test only; costs unmeasured. |

## 3. Cost lines (variable per video, catalog values from `src/config/models.ts`)

| Slot             | Vendor today                               | Catalog cost            | Status              | Cheaper candidates to test (unverified, see §4)                                                |
| ---------------- | ------------------------------------------ | ----------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| Script           | Anthropic Sonnet 5.5                       | $0.04 / script          | researched          | Haiku 5.5 for drafts, prompt caching of the system prompt, Batch API for non-urgent            |
| Image            | fal.ai FLUX schnell (std) / dev (premium)  | $0.003 / $0.025 per MP  | researched          | Direct/other hosts of FLUX schnell, SDXL-Turbo class, batch several scenes per call            |
| Video (premium)  | fal.ai Kling 2.5 Turbo Pro image-to-video  | $0.12 / s (list ~$0.07) | researched          | Wan 2.2/2.6, LTX-2.3 Fast, Pruna P-Video, Seedance Fast, direct Kling API, self-hosted Wan/LTX |
| Video (standard) | in-house Ken Burns                         | $0                      | built               | none needed                                                                                    |
| Voice            | ElevenLabs Flash v2.5                      | $0.05 / 1k chars        | researched          | Cheaper TTS tiers, cache repeated lines, shorter narration, annual ElevenLabs plan             |
| Render           | in-house ffmpeg on Vercel                  | $0.01 / video           | conservative bound  | Measure Vercel function GB-s per render                                                        |

Fixed lines still to be filled by the owner (§8): Vercel plan, Supabase plan, ElevenLabs plan and custom-voice slots, Resend, Sentry, domain, fal.ai/Anthropic minimums, Stripe fees (EU cards ~1.5% + €0.25 as assumed in `margin.ts`).

## 4. Vendor findings (2026-10-14 first pass, from aggregator pages: verify on official rate cards before acting)

- Per-second image-to-video prices found: Wan 2.2 Turbo ~$0.02/s, Wan 2.6 ~$0.07/s, P-Video (Pruna) $0.02/s 720p, LTX-2.3 Fast $0.06–0.24/s, Seedance 2.0 Fast ~$0.076/s, Kling 3.0 Turbo ~$0.11/s, Kling v3 Pro $0.095–0.168/s. Sources disagree up to 2x (Seedance 2.0 shows $0.022 to $0.30/s across pages). Wan and LTX figures were the most consistent.
- Implication: today's catalog assumes $0.12/s for premium video. If Wan 2.x or P-Video holds at <= $0.04/s on real calls, a 15s premium video falls from ~$1.10 to well under $0.50, which either lifts Pro above 3x or lets us cut the premium credit price and sell more of it.
- First measurement to run (needs `FAL_KEY` and the owner's OK to spend ~$5): the same 5 scene images through 3 candidates, record real billed cost, latency and a quality score. Script: extend `scripts/live-providers-smoke.mts --premium`.
- Sources: https://invideo.io/blog/ai-video-model-pricing , https://fal.ai/learn/tools/best-image-to-video-apis-2026 , https://www.atlascloud.ai/blog/case-studies/Top-5-ai-video-apis-compared-speed-latency-and-cost-per-second-2026

## 5. Backlog (ranked by monthly $ x confidence / effort; CFO re-ranks each run)

1. **Measure real unit costs** (`api_cost_usd` per finished job, per-slot) and replace researched costs in `models.ts`; add `scripts/finance-report.mts` (read-only: MRR from Stripe, cost per video and gross margin from Supabase).
2. **Premium video provider bake-off** (§4). Biggest single cost line.
3. **Hero-shot premium** (AI clip on scene 1, stills after): ~$0.45 per 15s, priceable near Standard.
4. **Annual plans** (2 months free): cash up front, lower churn, lower Stripe fee share. Needs owner OK on price.
5. **Anthropic cost cuts**: prompt caching, Haiku for drafts, track tokens per script in the job row.
6. **Breakage and top-up nudges**: remind users of unused credits before the cycle ends; upsell at 80% credit use.
7. **Dunning and win-back** (failed-payment emails, cancel-flow offer), through the existing lifecycle email.
8. **Failed-job loss**: count cost of jobs that were refunded; retry cheaper step first.
9. **Fixed-cost audit**: downgrade or pause anything unused.

## 6. Pasted invoices and exports (owner)

_None yet._ Paste monthly totals here (fal.ai, Anthropic, ElevenLabs, Vercel, Supabase, Resend, Sentry), or connect the tools in §8 so the CFO reads them itself.

## 7. Proposals awaiting the owner

_None yet._ Format: change, expected $/month, risk, how to undo, what the owner must approve.

## 8. Access and tooling the CFO needs

Connected now (claude.ai): Stripe (sandbox), Supabase (`iqvrovjwoavvmhaithwn`), Vercel, GitHub. Findings on 2026-10-14: no accounting, ad-spend or provider-billing connector; the repo `.mcp.json` Supabase server failed to connect from the cloud session (proxy tunnel error), the claude.ai connector is the path that works.

Owner actions, most valuable first:

1. **Stripe live mode, read-only**: connect a restricted live key or the live account to the Stripe connector, otherwise MRR is always 0. Never give write access.
2. **Provider spend**: fal.ai, Anthropic and ElevenLabs have usage dashboards but no connector. Either paste the monthly totals in §6, or add read-only API/usage keys to the routine's environment (`FAL_ADMIN_KEY`, `ANTHROPIC_ADMIN_KEY`, `ELEVENLABS_API_KEY` usage scope) and say so here.
3. **Allow the routine's network** to reach provider rate-card pages (they were blocked for the CEO routine) so prices are checked at the source.
4. **Fixed costs**: list plans and prices for Vercel, Supabase, ElevenLabs, Resend, Sentry, domain (fill §3).
5. **Spend OK** for the ~$5 provider bake-off (§4).
6. Optional connectors worth adding: an accounting tool (FreshBooks or similar, to read P&L), PostHog or Google Analytics (funnel and conversion), Supermetrics or the ad platforms' connectors once paid ads start, Google Drive (shared sheet for invoices), Slack or email (digest).

## 9. Decision log

- **2026-10-14** — CFO routine created (prompt + 4 sub-agents + this file). PR-gated; prices, limits and live mode are proposals only.
