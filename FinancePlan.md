# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/finance-cfo.md`). Product, roadmap and priority calls stay
> in `TheMasterPlan.md`; this file owns money: revenue, unit cost, vendors, pricing.
>
> Last updated: 2026-10-17

## 1. Charter

Maximise cash return. Every run: check the **MRR ratio**, find the biggest leak or
lever, ship one change as a PR, tell the owner only when they must act.

**MRR ratio** = net MRR (live subscriptions after VAT + Stripe fees) ÷ monthly
spend (API cost of videos + fixed costs). Floor 3x on API cost per product (the
margin gate, `TheMasterPlan` §7); the target for the whole business is cash-positive
first, then ≥ 3x all-in.

Priorities, in order: (1) stop losing money (failed-job spend, free-trial burn,
under-3x products); (2) cut per-video cost without hurting quality; (3) cut fixed
costs; (4) raise revenue per user (pricing, annual plans, upsells); (5) new tech.

## 2. How the routine works

A master agent (DM) reads this file, pulls numbers, and fans out five sub-agents in
parallel (revenue analyst, unit-cost auditor, vendor scout, fixed-cost auditor,
pricing modeler), merges their reports, picks one item, ships it on a
`ceo-finance/*` branch as a PR, and notifies the owner only on decisions or alarms.
Never merges, never touches live secrets or live Stripe. Details: `docs/routines/finance-cfo.md`.

Tools it uses: `npx tsx scripts/finance-report.mts` (MRR, 30-day spend, cost/video
by tier, margin; `--fixed-usd N` for fixed costs), `scripts/margin-report.mts`,
`scripts/metrics-report.mts`.

## 3. KPI table (the routine fills a row each run)

| Date       | MRR (€) | Net MRR ($) | API 30d ($) | Failed $ | Cost/video std | Cost/video prem | Fixed $/mo | Profit $/mo | Gate |
| ---------- | ------- | ----------- | ----------- | -------- | -------------- | --------------- | ---------- | ----------- | ---- |
| 2026-10-17 | n/a     | n/a         | n/a         | n/a      | list ~$0.07    | list ~$1.10     | unknown    | n/a         | pass |

_Baseline row is from the model catalog, not measurements: no live read of Stripe
or Supabase was available when this plan was written (§7)._

## 4. Where money goes (known from the repo)

| Cost                 | Vendor / model today                | List cost (catalog)                          | Notes                                                                     |
| -------------------- | ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Script               | Anthropic Sonnet 5.5                | ~$0.04 per video                             | Token cost metered per job by `costUsdFor`; tokens not stored separately. |
| Images               | fal.ai FLUX schnell / dev           | $0.003 / $0.025 per image                    | Cheap already.                                                            |
| Standard motion      | In-house Ken Burns (ffmpeg)         | $0                                           | No video model; this is the margin engine.                                |
| **Premium AI video** | **fal.ai Kling 2.5 Turbo Pro**      | **~$0.07/s billed, 5s clips (≈$1.10 / 15s)** | **The single largest line.** Catalog uses a conservative $0.12/s.         |
| Voice                | ElevenLabs Flash                    | ~$0.05 / 1k chars (~$0.00075/s)              | Plus a plan fee and custom-voice slots (fixed).                           |
| Render               | In-house ffmpeg on Vercel           | ~$0.01                                       | Was $0.30 on a hosted API.                                                |
| Payments             | Stripe                              | 1.5% + €0.25 (EEA cards, assumed)            | €0.25 hurts at €14.99.                                                    |
| Fixed                | Vercel, Supabase, Resend, Sentry, … | **unknown: owner to supply**                 | Needed for true profit.                                                   |

**Data gap found (2026-10-17):** only one number per job is stored
(`render_jobs.api_cost_usd`). There is no per-step or per-vendor cost and no token
counts (the Anthropic usage is priced then discarded). So "tokens vs spend" and
"which vendor line moved" cannot be answered from the DB yet. First roadmap item
fixes this (§6, F2).

## 5. Vendor watchlist (to research, with sources and dates; nothing below is verified)

| Slot           | Today             | Candidates to price and A/B                                                                                                                                                           |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image-to-video | fal.ai Kling 2.5  | Other models on fal (LTX, Wan, Seedance), direct provider APIs, Replicate, Runware, Together, self-hosted open weights on a GPU marketplace (RunPod, Modal) once volume justifies it. |
| Hero-shot only | n/a               | AI clip on scene 1 only, stills elsewhere (~$0.45 vs ~$1.10 per 15s): no vendor change needed.                                                                                        |
| Images         | fal FLUX          | Runware, Together, Replicate; only if cheaper at equal quality.                                                                                                                       |
| Voice          | ElevenLabs        | Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural voices; keep ElevenLabs for Voice Studio if designed voices are the differentiator.                                          |
| Script LLM     | Sonnet 5.5        | Haiku 5.5 for scripts with a quality check; prompt caching for the shared system prompt; batch where latency allows.                                                                  |
| Hosting / DB   | Vercel + Supabase | Check plan tiers vs usage; Vercel spend caps; image/Blob egress.                                                                                                                      |
| Payments       | Stripe            | Merchant-of-record (Paddle, Lemon Squeezy) trades fee for VAT handling; compare all-in at current volume before moving.                                                               |

Rule: a swap needs a measured $/video on real calls, a side-by-side quality check
by the owner, and a flag, before it becomes default.

## 6. Roadmap

- [ ] **F1 Read-only access.** Stripe + Supabase + Vercel connectors reach the routine; first real KPI row (§3). Needs the owner (§7).
- [ ] **F2 Cost telemetry.** New `job_cost_lines` table (job, step, vendor, model, units, tokens in/out, usd) written by the orchestrator; migration owner-applied. Unlocks tokens-vs-spend and per-vendor trends.
- [ ] **F3 Measure live costs.** Run `live-providers-smoke.mts` for each tier; replace list prices in `config/models.ts` with measured ones; re-run the margin gate.
- [ ] **F4 Premium cost cut.** Price hero-shot variant, A/B two cheaper image-to-video models behind a flag.
- [ ] **F5 Fixed-cost audit.** Every bill vs usage; downgrade or cancel.
- [ ] **F6 Revenue levers.** Annual plans (discount ~2 months), trial-burn cap, top-up upsell on low balance, failed-payment recovery (Stripe dunning), referral economics.
- [ ] **F7 Alerts.** Cost-per-video and daily-spend thresholds that notify the owner.

## 7. What the routine needs from the owner

I can only read this repo from the cloud session; Supabase's connector failed to connect and Stripe needed authorization when this was written, so no live numbers exist yet.

**Connectors (claude.ai → Settings → Connectors), read-only where possible:**

1. **Stripe**: authorize it (account currently "Shortcraft sandbox", test mode; once live, add a **restricted read-only key**). Needed for MRR, churn, refunds, failed payments.
2. **Supabase**: reconnect (it failed with a proxy tunnel error). Needed for `render_jobs`, `subscriptions`, `credit_transactions`.
3. **Vercel**: connected in the session already; billing/usage tools give hosting cost.
4. **GitHub**: already in scope for `TudorFnsn/Shortcraft`.
5. Nice to have: **fal.ai** (usage/billing export or a read-only key), **ElevenLabs** (usage + plan), **Anthropic Console** (usage by workspace; `ANTHROPIC_WORKSPACE_ID` exists for this), **Sentry** (error cost of failed renders), **PostHog** or similar for funnel (visitor → signup → paid), and a Google Sheet or note with the **monthly fixed costs**.

**Facts to supply:** monthly bill for each vendor plan (Vercel, Supabase, ElevenLabs, Resend, Sentry, domain, tools); whether Stripe is live yet; current real MRR/subscribers; acquisition spend, if any; the cash floor you want to stay above.

**Settings:** create the routine from `docs/routines/finance-cfo.md`, then paste its id into `TheMasterPlan.md` §9.

## 8. Rules for the Finance CFO routine

- One item per run; improve an open `ceo-finance/*` PR before starting another.
- Numbers come from the connectors or scripts, labelled measured or list; never invented. Unreachable source = say so and ask.
- Price, plan-limit and credit-scale changes: show the margin-gate output, wait for the owner's OK.
- No writes to Stripe, Supabase or Vercel and no live-mode change without the owner's explicit OK. No merges.
- Notify only on decisions or alarms; silence otherwise.

## 9. Changelog (newest on top)

- **2026-10-17** — Track created: this plan, the routine prompt, `features/metrics/finance.ts` (MRR, net MRR, 30-day spend, cost/video by tier, margin) + `scripts/finance-report.mts`, +4 tests. Found: no per-step cost or token storage (F2). No live data reachable yet (F1). (Finance CFO, interactive setup)
