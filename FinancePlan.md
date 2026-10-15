# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (`docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`: the master
> plan wins on product and priority; this file wins on cost, pricing and cash.
> Every finance PR updates this file (scoreboard, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-15 (track created)

---

## 1. Charter (owner request 2026-10-15; do not change without Tudor)

| Question | Answer                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal     | **Maximum profit, cash first.** Every run asks: what raises MRR, or lowers what a finished video costs us, without hurting the north star (weekly paying-retained creators)? |
| Watch    | The **MRR ratios** (§2) every run, before anything else.                                                                                                                     |
| Scope    | API spend per video (tokens, images, video, voice, render), hosting and every subscription we pay, pricing, plans, top-ups, trial burn, churn and failed payments.           |
| Hunt     | Cheaper or better models and fresh tech per pipeline step (the fal.ai video model is the first target), plus new ways to charge.                                             |
| Autonomy | **PR-gated**, like the CEO routine: branches `cfo/<slug>`, never merge, never touch live secrets, never write to Stripe/Supabase/Vercel without the owner's OK.              |
| Cadence  | Daily cloud routine **"Shortcraft Finance CFO"** (suggest 07:00 UTC, an hour after the CEO). Notifies the owner only when something needs them.                              |
| Shape    | A **master agent** (the CFO) that splits the work across specialist sub-agents (§5), merges their findings, and ships one change.                                            |

---

## 2. The scoreboard (read first, every run)

Run `npx tsx scripts/finance-report.mts` (read-only; needs `.env.local` with the Supabase service role) or `--json`. Definitions: `src/features/finance/unit-economics.ts`. Paste the numbers into §3.

| Ratio                  | Meaning                                                                        | Target                         |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| **API cost ÷ revenue** | Provider spend over net revenue (after VAT + Stripe), last 30 days             | **< 33%** (the 3x margin gate) |
| Revenue multiple       | The inverse; the measured version of what `scripts/margin-report.mts` models   | **>= 3x**, aim 5x+             |
| Fixed cost ÷ revenue   | Hosting + plans we pay, over net revenue. Unknown lines are listed, not zeroed | falling                        |
| Avg API cost / video   | Per finished video, split by tier. Compare `usdPerCredit` with the catalog     | below `models.ts` estimates    |
| Failed-job spend       | Provider cost of jobs that failed (refunded to creators, paid to providers)    | < 2% of API cost               |
| Free-user spend        | API cost of users with no live subscription (trial burn = acquisition cost)    | < first-month revenue per CAC  |
| Past-due subscribers   | Revenue at risk from failed payments                                           | 0, recover with dunning        |
| Break-even subscribers | Subscribers needed to cover known fixed costs at today's ARPU                  | reached                        |

Also check the modelled gate: `npx tsx scripts/margin-report.mts` (exits 1 when a plan is under 3x).

---

## 3. Current numbers

_No measured data yet._ The report needs the production Supabase `service_role` key in the routine's environment (§6). Until then the routine works from the catalog (`src/config/models.ts`, `src/config/plans.ts`) and flags every figure as modelled, not measured.

Known from the plan (modelled, not measured): Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0-5.9x; trial burn about $0.14-0.25; 15s Standard about $0.07 API cost; 15s Premium about $1.10-1.80. Pro sits exactly on the 3x floor, so any real cost increase fails the gate.

---

## 4. Roadmap (priority order; the CFO picks the top item with no open PR)

Each item states what to measure first. Prices below are **hypotheses from general knowledge, not verified**: the routine must confirm current list prices on the provider's own page (or via its API) before acting, and record the source and date.

### F0: Measure (blocks most of the rest)

- [ ] Give the routine read access to production data (§6) and run the scoreboard.
- [ ] **Cost per step is not stored, only the per-job total** (`render_jobs.api_cost_usd`), and neither are tokens. Propose migration `0013_job_cost_events` (job id, step, provider, model, units, usd, tokens in/out, created_at; RLS on, no policies, written only by the service role) so cost per step and tokens per video are queryable. Owner applies it.
- [ ] Fill `src/config/fixed-costs.ts` from real invoices (owner or Vercel/Supabase connectors).
- [ ] Reconcile app-metered cost against the provider invoices (fal.ai, ElevenLabs, Anthropic usage pages) monthly. A gap means the adapters under- or over-count.

### F1: Cut the biggest cost line

Premium AI video is about 90% of the cost of any video that uses it. Order of attack:

- [ ] **Hero-shot Premium** (AI clip on scene 1 only, stills elsewhere): about $0.45 vs $1.10 per 15s video, already modelled in §7 of the master plan.
- [ ] **Video model bake-off** behind the existing `FAL_VIDEO_MODEL` switch: Kling 2.5 Turbo (current), Wan 2.x, LTX-2, Seedance, Hailuo, Veo 3.1 Fast. Compare price per billed second, minimum clip length (Kling bills fixed 5s clips, which punishes short scenes), quality on our eight themes, and failure rate. Same prompts, 3 runs each, via `scripts/live-providers-smoke.mts`.
- [ ] **Other hosts for the same model**: fal.ai vs Replicate, Runware, Together, WaveSpeed, or the model owner's direct API. Multi-provider fallback also protects against outages and price hikes.
- [ ] **Self-host an open model** (Wan/LTX on Modal, RunPod or similar serverless GPU) only if volume justifies it: break-even is usually well above early-stage volume; compute it, don't assume.
- [ ] **Failed-job waste**: fail fast before paid steps (validate prompts, retry only the failed scene, never re-run a paid step that already succeeded), cap retries.

### F2: Cut the small lines (cheap wins)

- [ ] **Images**: FLUX [schnell] is about $0.003; compare Runware and other hosts. Cache or reuse images for repeat topics.
- [ ] **Voice**: ElevenLabs Flash is the largest per-minute text line. Compare Cartesia, Deepgram Aura, OpenAI TTS, Google, and self-hosted open TTS; keep ElevenLabs for the designed-voice feature. Check the plan fee against custom-voice slots used.
- [ ] **Script (tokens)**: log input/output tokens per call; try Haiku 5.5 for scripting, prompt caching for the fixed system prompt and theme guides, and Batch for non-urgent jobs. Measure quality before switching.
- [ ] **Render and storage**: ffmpeg on Vercel compute time; Supabase Storage and egress (delete or archive old media, signed-URL expiry, CDN cache).

### F3: Raise revenue

- [ ] **Annual plans** (`stripePriceIdYearly` already exists): 2 months free for 12 paid; pulls cash forward and cuts churn.
- [ ] **Failed-payment recovery**: Stripe Smart Retries and dunning emails for `past_due` (the lifecycle email system exists).
- [ ] **Top-up nudges** when a balance is under one video; show the plan upgrade that is cheaper per credit than top-ups.
- [ ] **Trial economics**: trial burn vs conversion; consider a watermark-only or shorter free tier if trial burn per paid conversion exceeds first-month net revenue.
- [ ] **Price test**: A/B price points on `/pricing` once there is traffic (needs the owner's go-ahead, since it changes what customers pay).
- [ ] **Stripe costs**: Stripe Tax and Adaptive Pricing review, fee tier, payment methods with lower fees (SEPA debit for EU), invoice vs card.
- [ ] **New revenue lines**: affiliate payouts as a cost to model (30% recurring, master plan §6), team/agency seat plan, API access, done-for-you series, white-label.

### F4: Operate

- [ ] Weekly scoreboard in §3, monthly full review (invoices vs metered cost), quarterly provider re-bid.

---

## 5. How the routine works (master agent + specialists)

The prompt is `docs/routines/finance-cfo.md`. The master agent never does specialist research itself; it dispatches in parallel and merges:

| Specialist             | Job                                                                                                               | Reads                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Metrics analyst**    | Runs the scoreboard, Stripe revenue (MRR, churn, failed payments, fees), margin gate; says what moved and why     | Supabase, Stripe, `scripts/*-report.mts`                                  |
| **Cost auditor**       | Compares metered cost with provider and platform invoices; lists every payment we make and each one's owner       | fal.ai, ElevenLabs, Anthropic, Vercel billing, Supabase, `fixed-costs.ts` |
| **Provider scout**     | Finds cheaper or better models and hosts per pipeline step; verifies price on the provider's page; scores quality | Web, provider docs, pricing pages                                         |
| **Pricing strategist** | Proposes plan, top-up, annual, trial and dunning changes with the margin math and churn risk                      | Stripe, `config/plans.ts`, `margin.ts`                                    |
| **Implementer**        | Builds the single chosen change on a `cfo/<slug>` branch with tests, runs format, lint, typecheck, test           | The repo                                                                  |

The CFO then picks one change by **cash impact per week of work**, with a tie-break toward lower risk to the north star.

### Rules

1. List open and recently closed PRs first. An item with an open PR is in review, not available.
2. One PR per run, branch `cfo/<slug>`, never merge. Keep it small and reversible; swaps go behind an env flag or the provider registry, defaulting to the current provider.
3. **Never raise prices, change what a customer is charged, or cut a plan's limits without the owner's explicit OK.** Propose with the margin and churn math instead.
4. A provider swap needs measured evidence (same prompts, side by side, cost and failure rate), not just a list price. State what was measured and what was only read from a page.
5. Every number carries its source and date; modelled and measured are labelled apart.
6. No secrets in files, logs or PRs. Read-only on Stripe, Supabase and Vercel unless the owner approved the write. Migrations are written, never applied.
7. Stay out of UI files while a `ceo-design/*` PR is open (`DesignPlan.md` §5).
8. Update this file and add a line to `TheMasterPlan.md` §10 in the same PR.
9. **Notify only when it matters** (PushNotification): MRR or cost ratio crossing a threshold, a gate failure, a new PR needing review, a decision or access only the owner can give, or the run being unable to read data. A quiet healthy run sends nothing.

---

## 6. Access the routine needs (checklist for the owner)

| Need                                     | Why                                                                  | Status                                                                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo (`TudorFnsn/Shortcraft`)     | Read code, open `cfo/*` PRs                                          | In scope for the session                                                                                                                                                                                                                                |
| Supabase connector                       | Read `render_jobs`, `subscriptions`, `credit_transactions`           | Configured in `.mcp.json`; **failed to connect from the cloud on 2026-10-15 (ERR_PROXY_TUNNEL)**, re-authorize at claude.ai connectors                                                                                                                  |
| Stripe connector                         | MRR, churn, failed payments, fees, Sigma analytics                   | Connected, **test mode only**; add the live account in read-only (restricted key, read scopes) once live                                                                                                                                                |
| Vercel connector                         | Billing charges, usage, runtime cost                                 | Connected (has `list_billing_charges`)                                                                                                                                                                                                                  |
| Provider usage / billing                 | Reconcile metered cost with invoices (fal.ai, ElevenLabs, Anthropic) | **Not connected**: needs read-only keys or exported monthly CSVs placed in the environment                                                                                                                                                              |
| Fixed-cost figures                       | Fill `src/config/fixed-costs.ts`                                     | **Owner to provide** (invoices or plan names)                                                                                                                                                                                                           |
| Network egress to provider pricing pages | Verify list prices                                                   | Earlier routine runs found direct provider pages blocked; allow the pricing domains in the environment's network policy (fal.ai, replicate.com, elevenlabs.io, anthropic.com, runware.ai, together.ai, cartesia.ai, deepgram.com, modal.com, runpod.io) |
| Optional: PostHog, Sentry connectors     | Funnel and error-driven waste                                        | Not connected                                                                                                                                                                                                                                           |

Suggested additions, in order of value: Supabase (fix), a read-only Stripe live key, a billing-export for fal.ai/ElevenLabs/Anthropic, then Sentry and PostHog.

---

## 7. Changelog (newest on top)

- **2026-10-15**: Finance track created. `FinancePlan.md`, `docs/routines/finance-cfo.md` (routine prompt), `scripts/finance-report.mts` + `features/finance/unit-economics.ts` (MRR, measured cost per video, failed and free-user spend, MRR ratios; +5 tests), `config/fixed-costs.ts` (owner to fill). No migration, no dependency, no runtime change.

## 8. Decision log

- **Measured numbers come from our own DB first** (2026-10-15): every input (subscriptions, job cost, top-ups) is already in Postgres, so the scoreboard needs no vendor, mirroring the north-star report. Stripe is the cross-check, not the source.
- **Unknown fixed costs stay `null`, never `0`** (2026-10-15): a zero would flatter profit and break-even. The report lists unknown lines.
