# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (prompt and agent roster: `docs/routines/finance-cfo.md`). It sits under
> `TheMasterPlan.md`, which wins on product and priority; this file wins on
> costs, pricing experiments, vendor choices and cash. Every finance PR updates
> this file (numbers, backlog, changelog) in the same change.
>
> Last updated: 2026-10-15 (track created, no live numbers yet)

---

## 1. Charter (owner request 2026-10-15, do not change without Tudor)

- **Goal:** maximise profit and cash return. Check the MRR ratio every run and propose or implement changes that monetise the app better.
- **Prioritise cash:** rank every idea by expected net € per month divided by effort and risk; ship the highest first.
- **Hunt cheaper vendors:** fal.ai video looks expensive. Find cheaper or better models, hosts and tools, and fresh techniques, and prove them with a measured cost before recommending a switch.
- **Know where every cent goes:** tokens and API units per video vs what it cost to make and host, plus every other payment (Vercel, Supabase, ElevenLabs, Resend, Sentry, domain, Stripe fees, VAT, tools).
- **Autonomy:** PR-gated, like the other routines. Branches `ceo-finance/<slug>`; never merge. Never change live prices, Stripe objects, vendor plans or secrets; those are proposals the owner approves. Read-only connector use is fine.
- **Boundaries:** owns `FinancePlan.md`, `src/config/models.ts` + `plans.ts` + `fixed-costs.ts` (only through a PR that passes the margin gate), `features/providers/live/*` for vendor swaps, `features/metrics/finance.ts`, `scripts/finance-report.mts`. Leaves `ceo-design/*` UI files alone.

## 2. Measurement (what the routine reads each run)

| Signal                                            | Source                                                                | Status                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| MRR, ARPU, plan mix, API cost/video, gross margin | `npx tsx scripts/finance-report.mts [--json]` (read-only Supabase)    | built 2026-10-15, needs `.env.local` service role                           |
| Margin gate (revenue ÷ worst-case cost per plan)  | `npx tsx scripts/margin-report.mts`                                   | built; gate passes at Pro 3.00x on **list-price** costs                     |
| Real MRR, churn, fees, refunds, failed payments   | Stripe connector (`stripe_analytics`, read tools). Test mode only now | sandbox only until Stripe goes live                                         |
| Fixed monthly costs                               | `src/config/fixed-costs.ts`                                           | **all unconfirmed (0).** Owner must fill from invoices                      |
| Hosting/function/bandwidth spend                  | Vercel connector (`list_billing_charges`, usage)                      | connector present in cloud sessions; Vercel project not yet confirmed       |
| DB/storage/egress                                 | Supabase connector (advisors, logs, `execute_sql`)                    | `.mcp.json` server failed to connect from the cloud (proxy tunnel), retry   |
| fal.ai, ElevenLabs, Anthropic invoices            | **none**                                                              | gap: `render_jobs.api_cost_usd` is our own estimate, not the vendor invoice |

**Known measurement gaps (fix order):**

1. **Cost per step is not stored.** `api_cost_usd` is one number per job. Add per-step cost rows (provider, model, units, usd) so we can see which step eats the money. Needs a migration: owner applies.
2. **Anthropic tokens are not stored.** `anthropic-script.ts` computes cost from `usage` and drops the token counts. Store input/output tokens with the step.
3. **Estimated vs billed.** Compare `api_cost_usd` with the vendor dashboards monthly; any drift over 10% fails the margin gate's assumption.
4. **Fixed costs unknown.** Profit and break-even are meaningless until `fixed-costs.ts` is confirmed.

## 3. Cost map (from code, list prices, not yet measured)

| Step            | Vendor / model                              | Unit cost in catalog    | Share of a video                           |
| --------------- | ------------------------------------------- | ----------------------- | ------------------------------------------ |
| Script          | Anthropic Sonnet 5.5                        | $0.04 flat              | small                                      |
| Image           | fal FLUX schnell ($0.003) / dev ($0.025)    | per image               | small                                      |
| Clip (Standard) | in-house Ken Burns                          | $0                      | none                                       |
| Clip (Premium)  | fal Kling 2.5 Turbo Pro, ~$0.07/s billed 5s | $0.12/scene-sec (cons.) | **dominant: ~$1.10-1.80 of a 15s premium** |
| Voice           | ElevenLabs Flash                            | $0.00075/s              | small, but plan slots are a fixed cost     |
| Render          | in-house ffmpeg                             | $0.01                   | none                                       |

Standard video ≈ $0.07 per 15s (margin ~9x). Premium is where cash is won or lost.

## 4. Backlog (ranked by expected € per month ÷ effort)

Status: `idea` → `researching` → `measured` → `PR` → `shipped`. Every vendor idea needs a **measured** per-video cost from a real call before it is recommended; list-price research is a hypothesis.

| #   | Idea                                                                                                                                                                                                        | Why it pays                                                          | Status            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| F1  | Finance report + fixed-cost config                                                                                                                                                                          | can't optimise what isn't measured                                   | shipped (this PR) |
| F2  | Per-step cost + token rows (migration, owner applies)                                                                                                                                                       | finds the step to attack                                             | idea              |
| F3  | Premium video vendor bake-off on one fixed 15s prompt set: Kling via fal vs direct Kling API, Wan, Seedance, LTX, Hailuo/MiniMax, Veo Fast, plus self-hosting on serverless GPUs (Modal, RunPod, Replicate) | video is the dominant cost; a 2x cheaper clip doubles premium margin | idea              |
| F4  | Hero-shot Premium (AI clip on scene 1 only, stills elsewhere), priced near Standard                                                                                                                         | ~$0.45 vs $1.10 per 15s; new mid tier sells to Starter users         | idea              |
| F5  | Cache + reuse: stock/loopable clips per theme, reuse images across retries, never regenerate on a re-voice                                                                                                  | cuts repeat spend to ~0                                              | idea              |
| F6  | Prompt caching and a cheaper script model (Haiku class) for short videos; batch API where latency allows                                                                                                    | script cost                                                          | idea              |
| F7  | Annual plans (2 months free) and a Stripe-hosted upgrade nudge at 80% credit use                                                                                                                            | cash up front, lower churn                                           | idea              |
| F8  | Pricing test: Starter at €14.99 sells ~14 Standard videos; test €19.99 / Pro €34.99 via Stripe price experiments                                                                                            | ARPU; elasticity unknown at zero traffic, so test after launch       | idea              |
| F9  | Failed-job waste: refunds are given, spend is not. Track `apiCostFailedUsd30d`, fail earlier (moderation, preflight), retry the cheap step only                                                             | stops paying for videos nobody gets                                  | idea              |
| F10 | Trial burn cap: trial = 3,000 credits ≈ $0.14. Keep Standard-only for trial, watermark on                                                                                                                   | CAC floor                                                            | shipped (verify)  |
| F11 | Egress/storage: lifecycle-delete scene images and clips after N days, keep only the final MP4; signed-URL caching                                                                                           | Supabase storage + egress cost scales with users                     | idea              |
| F12 | Affiliate + referral as pay-on-result acquisition instead of ads (30% recurring is already in the master plan)                                                                                              | CAC only when cash arrives                                           | idea              |
| F13 | Credit expiry / rollover rules (no rollover on monthly grants, 12-month top-up expiry) reviewed against EU consumer law                                                                                     | breakage revenue, owner + legal decision                             | idea              |

## 5. Owner inputs the routine needs (ask, then record the answer here)

1. **Real invoices / plan names** for Vercel, Supabase, ElevenLabs, Resend, Sentry, domain, to fill `fixed-costs.ts`.
2. **fal.ai, ElevenLabs and Anthropic billing exports** (monthly CSV or a read-only key) to check `api_cost_usd` against reality.
3. **Stripe live-mode read access** once live (a restricted read-only key or the live connector), and when live mode is planned.
4. **Vendor accounts** the routine may use for measured bake-offs (test keys with a hard spend cap, for example $20 per vendor), or approval to run bake-offs on the existing `FAL_KEY`.
5. **Target:** break-even date and target margin (gate says ≥3x worst case; is that still the bar?), and the monthly spend ceiling for experiments.

## 6. Open decisions

- None yet. Decisions move to `TheMasterPlan.md` §11 once the owner answers.

## 7. Changelog (newest on top)

- **2026-10-15** — Finance track created: charter, measurement map, cost map, ranked backlog; `scripts/finance-report.mts` (MRR net/gross, API cost per tier, failed-job spend, gross margin, fixed costs, break-even) over `features/metrics/finance.ts` (+4 tests) and `config/fixed-costs.ts` (all unconfirmed). Routine prompt in `docs/routines/finance-cfo.md`. (Finance CFO, interactive)
