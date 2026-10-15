# TheFinancePlan — Shortcraft

> **Source of truth for money.** Owned by the **Finance CFO** routine (`docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`: the master plan wins on product and priority, this file wins on revenue, cost and pricing questions. Every finance PR updates this file (KPIs, backlog, open questions, changelog) in the same change.
>
> Last updated: 2026-10-15 (routine created; no live data read yet)

---

## 1. Charter

| Question   | Answer                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal       | **Cash.** Grow MRR and ARPU, shrink the API + hosting cost of every finished video, keep the margin gate passing (`margin-report.mts`).                                                                            |
| Autonomy   | Analysis, scripts, adapters, tests, catalog _cost_ corrections: PR-gated on `ceo-finance/*`. **Owner decides:** customer prices, plan/credit sizes, Stripe objects, live provider switches, migrations, any spend. |
| Principles | Measure before optimising; cheaper only if the owner approves the quality; never trade the margin gate for growth; biggest dollars first, then least effort.                                                       |
| Cadence    | Daily 07:00 UTC snapshot; Monday weekly review (provider scan + pricing ideas).                                                                                                                                    |

## 2. KPIs (the routine refreshes this table every run)

| KPI                                  | Definition                                     | Latest            | Δ vs last |
| ------------------------------------ | ---------------------------------------------- | ----------------- | --------- |
| MRR (gross, EUR)                     | live subscriptions × plan price                | not read yet      |           |
| Net MRR (USD)                        | after 20% VAT + Stripe fees                    | not read yet      |           |
| ARPU                                 | MRR / paying subscribers                       | not read yet      |           |
| Blended margin multiple              | net MRR / 30-day API cost of payers (floor 3x) | not read yet      |           |
| Cost per finished video (Std / Prem) | `api_cost_usd` ÷ finished jobs, 30 days        | not read yet      |           |
| Waste                                | API cost of jobs that did not end `done`       | not read yet      |           |
| Trial burn per signup                | catalog worst case today: **$0.23**            | $0.23 (catalog)   |           |
| Operating result                     | gross profit − fixed costs                     | needs fixed costs |           |

Run `npx tsx scripts/finance-report.mts` (needs `.env.local`; `--json` for the digest). The math is `src/features/finance/finance.ts` (tested).

## 3. Baseline from the catalog (2026-10-15, `margin-report.mts` PASS)

Net revenue per month after VAT and Stripe fees: **Starter $12.98 · Pro $26.24 · Ultra $70.43**.

| Video (catalog worst case) | Credits | API cost | Notes                                                                       |
| -------------------------- | ------- | -------- | --------------------------------------------------------------------------- |
| 15s Standard               | 2,024   | $0.072   | script $0.040 is more than half; images $0.003 each; render $0.01           |
| 30s Standard               | 3,240   | $0.088   |                                                                             |
| 60s Standard               | 6,280   | $0.125   |                                                                             |
| 15s Premium (AI clips)     | 26,504  | $2.298   | catalog assumes $0.12/s; Kling list price ≈ $0.07/s → ~$1.10 measured-to-be |
| 30s Premium                | 44,040  | $3.797   |                                                                             |

What this says:

1. **Standard is already very profitable** (a Starter subscriber burning all 30k credits on 15s videos costs us ~$1.07 against $12.98). Shaving Standard cost saves cents; **ARPU and conversion are the cash levers**, not Standard cost.
2. **Premium is the only expensive thing, and the catalog is conservative.** Pro sits at exactly 3.00x because of the $0.12/s Premium assumption. Measuring the real fal cost either frees headroom (more videos per plan, a stronger sell) or confirms the margin.
3. **Script is 55% of a Standard video's cost** ($0.04 of $0.072). A Haiku-class model for Standard scripts could save ~$0.03/video, but at 12x margin this is polish, not priority.
4. **Voice is ~1% of cost** ($0.00075/s). Do not switch TTS to save money (see §5).
5. Nothing here is measured on live traffic yet. The first real numbers come from `finance-report.mts` once the routine has the Supabase connection.

## 4. Backlog (ranked by cash per effort)

| #   | Item                                                                                                                            | Why / expected effect                                                                                                                                | Needs owner?                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| F1  | **Yearly plans** (fields `stripePriceIdYearly` already exist; 2 months free ≈ -16.7%)                                           | Cash up front, lower churn. At 12x Standard margin a yearly discount is affordable; Pro yearly ≈ €299.90 paid today instead of €29.99/mo over a year | Price OK                               |
| F2  | **Measure Premium cost** (`scripts/live-providers-smoke.mts --premium`, then lower `video-premium` `costUsdPerUnit` from $0.12) | Unlocks the gate headroom; decide to cut credits/s (more value) or keep margin                                                                       | Run smoke (fal unreachable from cloud) |
| F3  | **Hero-shot tier**: AI clip on scene 1 only, stills for the rest (~$0.45 per 15s vs $2.30)                                      | A mid price between Standard and Premium; new ARPU rung, sellable to Starter                                                                         | Price OK                               |
| F4  | **Dunning + win-back emails** (Stripe smart retries on; `email_log` + Resend exist)                                             | Recovers failed payments (typically 5–9% of MRR is at risk); no new infra                                                                            | Stripe setting                         |
| F5  | **Low-credit top-up nudge** in Create/Library when balance < one video                                                          | Top-ups carry 4–6x margin; converts heavy users without a plan change                                                                                | No                                     |
| F6  | **Per-step cost ledger** (`job_costs`: job, step, provider, model, units, tokens in/out, usd)                                   | Today only the job total is stored; this makes "tokens vs dollars per video" and per-step leaks measurable                                           | Migration                              |
| F7  | **Provider A/B on Premium clips** via `FAL_VIDEO_MODEL` (no code): Kling 2.5 Turbo, Wan, LTX-2.3, Seedance                      | 5 prompts, same input, owner picks blind; see §5                                                                                                     | Quality call                           |
| F8  | **Storage retention**: delete unwatched trial videos after N days                                                               | Supabase storage/egress grows with every render; free-trial videos nobody opens are pure cost                                                        | Policy OK                              |
| F9  | Haiku-class script for Standard (prompt caching on the system prompt)                                                           | ~$0.03/video                                                                                                                                         | Quality call                           |
| F10 | Credit expiry / rollover cap policy                                                                                             | Unused credits are a liability and a retention lever; breakage is revenue                                                                            | Policy                                 |

## 5. Provider scan (2026-10-15; prices from aggregator blogs, **verify on the vendor page before any switch**)

| Slot         | Today                               | Candidates                                                                                                                                                      | Verdict                                                                                                                           |
| ------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Premium clip | fal Kling 2.5 Turbo Pro ~$0.07/s    | Wan ≈ $0.083–0.10/s (720p); LTX-2.3 ≈ $0.06–0.08/s on fal; LTX-2 on WaveSpeed ≈ $0.016/s (5s = $0.08, unverified); Seedance 2.0 $0.10–0.36/s depending on route | **A/B test** LTX-2.3 and Wan on fal (same key, env switch). fal is usually cheapest for Kling and Wan; WaveSpeed for LTX/Seedance |
| Image        | FLUX schnell $0.003, dev $0.025     | already near the floor                                                                                                                                          | keep                                                                                                                              |
| Voice        | ElevenLabs Flash v2.5 ~$0.00075/s   | Deepgram Aura-2 ≈ $0.03/1k chars, Cartesia ≈ $0.05/1k; word timestamps unconfirmed for both                                                                     | **reject**: saves < $0.001/s and risks captions                                                                                   |
| Script       | Claude Sonnet 5.5 ($2/$10 per MTok) | Haiku-class for Standard                                                                                                                                        | F9, low priority                                                                                                                  |

Sources (search results, 2026-10): [teamday.ai video price ranking](https://www.teamday.ai/blog/best-ai-video-models-2026), [teamday.ai API pricing](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026), [GenRates per-second index](https://www.genrates.com/), [ofox fal.ai alternatives](https://ofox.ai/blog/fal-ai-alternatives-video-generation-api-2026/), [cellcog Seedance pricing](https://cellcog.ai/blog/seedance-2-5-pricing/), [gradium TTS comparison](https://gradium.ai/content/best-text-to-speech-apis-2026). The same Kling model appears at $0.112 and $0.224/s on fal in different articles, so treat every figure as ±2x until measured.

## 6. Open questions for Tudor (the routine adds to this list)

1. **Fixed costs:** fill `docs/finance/fixed-costs.json` (Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, other). Without them there is no profit or break-even number.
2. **Live Stripe access:** the connector is sandbox-only. Create a restricted read-only live key (Charges, Subscriptions, Invoices, Balance, Refunds, Disputes) and add it as an environment variable when you go live. Until then MRR is read from `subscriptions` only.
3. **Supabase from the cloud routine:** the connector failed with `ERR_PROXY_TUNNEL` on 2026-10-15. Re-authorise it or allow `mcp.supabase.com`; otherwise run `npx tsx scripts/finance-report.mts --json` weekly and paste it here.
4. **Provider usage keys:** Anthropic Admin (usage/cost), fal usage, ElevenLabs. Plus allow-list `api.fal.ai` / `queue.fal.run` for the routine's network (fal was unreachable from the sandbox).
5. **Marketing spend** per month and channel (for CAC and payback).
6. **Decisions awaiting you:** F1 yearly plan discount (recommend 2 months free), F3 hero-shot tier, F7 which quality bar a cheaper clip model must clear, F10 credit rollover.
7. Run `npx tsx scripts/live-providers-smoke.mts --premium` once so F2 has a measured number.

## 7. Changelog (newest on top)

- **2026-10-15** — Finance CFO routine created (owner request): `docs/routines/finance-cfo.md` (master prompt, setup, access matrix), four sub-agents in `.claude/agents/finance-*.md`, `src/features/finance/finance.ts` (MRR, net MRR, per-plan and per-tier realised economics, waste, trial burn, subscriber margin, break-even) with 6 tests, `scripts/finance-report.mts` (read-only), `docs/finance/fixed-costs.json` template, this plan with the baseline and ranked backlog. No runtime change, no migration, no dependency.
