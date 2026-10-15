# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on cost, pricing experiments and cash. Every finance PR updates
> this file (numbers + changelog) in the same change.
>
> Last updated: 2026-10-15 (charter created; no live numbers yet)

---

## 1. Charter (proposed 2026-10-15, owner confirms by editing this table)

| Question      | Answer                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal          | **Maximum profit and cash return.** Raise MRR, lower cost per video, never let a plan lose money at full burn.                                                                                |
| Headline KPI  | **MRR ÷ monthly cost** (net MRR over API + fixed costs). Below 1.0x we lose money; target ≥ 3x. Reported every run, with the trend.                                                           |
| Other KPIs    | Gross margin, API cost per finished video (per tier), cost per 1k credits burned, free-user (trial) cost, failed-job cost, paid churn, trial → paid, payback on any spend.                    |
| Cadence       | Daily cloud routine **"Shortcraft Finance CEO"**, 07:30 UTC (after the main CEO at 06:00, before the Design CEO at 09:00). Weekly deep run on Mondays (full vendor re-scan).                  |
| Autonomy      | **PR-gated.** Branches `ceo-finance/<slug>`; never merges. Read-only on Stripe, Supabase, Vercel. Any write (migration, price change, live mode) needs Tudor's OK.                            |
| Notifications | Push only for: MRR/cost ratio below 1.0x or down > 20% week on week, a plan failing the margin gate, a cost spike (> 2x the 7-day average), a vendor swap ready to decide. Silence otherwise. |

---

## 2. Operating model: master agent + specialist agents

The routine's session is the **master agent** (the "DM"). It does not research or
code in depth itself. It reads this file, runs the report, decides which of the
specialists below are worth running **today**, launches them in parallel with
the `Agent` tool (one brief each, scoped and with the data they need), then merges
their answers into one decision, one PR and one digest.

| Specialist                 | Question it answers                                                                          | Reads / uses                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Ledger analyst**         | What came in and what went out? MRR, top-ups, refunds, churn, API cost per video and tier.   | `npx tsx scripts/finance-report.mts`, Stripe connector (read), Supabase connector (read) |
| **Unit-economics auditor** | Does every plan still clear the margin gate on _measured_ cost? Where is the worst case?     | `scripts/margin-report.mts`, `config/models.ts`, measured `api_cost_usd`                 |
| **Vendor scout**           | Is there a cheaper or better model/host for video, image, voice, script, render?             | Web search, vendor pricing pages, §5 backlog                                             |
| **Pricing strategist**     | Should plans, top-ups, credit scale, trial size or annual pricing change?                    | Ledger + audit output, competitor pricing pages                                          |
| **Infra cost auditor**     | What do Vercel, Supabase, ElevenLabs plan, Sentry, Resend and the domain cost? What is idle? | Vercel connector (`list_billing_charges`, usage), Supabase advisors/logs, invoices       |
| **Implementer**            | Turns the chosen idea into a small, tested PR (adapter, config, script, copy).               | The repo; follows `AGENTS.md` and the bar in §4                                          |

Rules for the master agent:

1. **Read first:** `TheMasterPlan.md` (§7 money, §8 risks), this file, `git log -20`, and open + recently closed PRs (an item with an open PR is in review, not available).
2. **Run the numbers before any idea.** If the report can't run (no DB path), say so in the digest and work from the catalog math in `margin.ts`; never invent figures.
3. **Spawn only what pays for itself.** Most days: ledger analyst + one of {vendor scout, pricing strategist, infra auditor}. The weekly run fans out to all.
4. **One PR per run**, the highest cash-impact item that is safe to build in mock mode. Prefer improving an open `ceo-finance/*` PR.
5. **Never trust a price from a blog.** Tag every figure `list` (vendor page), `reseller`, `snippet` or `measured`. A swap proposal needs a `measured` number (see §6, bake-off) before it changes `config/models.ts`.

---

## 3. What the repo already measures

- `render_jobs.api_cost_usd` per job (script cost is real tokens × list price in `anthropic-script.ts`; other providers report `costUsd` per call). `actual_credits` and `model_tier` sit beside it.
- Revenue side: `subscriptions` (plan + status), `credit_transactions` (`monthly_grant`, `topup`), Stripe events.
- `scripts/finance-report.mts` (new): MRR (net of VAT + Stripe fees), top-up revenue, API cost per month, cost per finished video and per 1k credits **per tier**, free-user cost, failed-job cost, gross margin, **MRR ÷ cost ratio** and monthly profit. Pure math is in `features/metrics/finance.ts` (tested).
- `scripts/margin-report.mts`: worst-case margin gate per plan and top-up on catalog costs.

**Gaps (each is a backlog item in §5):**

1. **No per-step cost or token log.** `api_cost_usd` is one number per job, so we can't see which step (script / images / clips / voice) is eating money, nor tokens per video. Needs a `job_costs` table (migration; owner applies). Until then the report shows cost per tier only.
2. **Fixed costs aren't in the database.** Pass `--fixed=<usd>`; the routine fills it from the Vercel connector and the owner's table in §7.
3. **MRR is list-price based.** The `subscriptions` table has no amount, so discounts, coupons, annual plans and FX are not reflected. The Stripe connector is the exact source.
4. **Stripe is test mode only** (account "Shortcraft sandbox"). Until live mode is on, real MRR is 0 and the report describes the sandbox.

---

## 4. Rules for the Finance CEO routine

- **Files it may change:** `FinancePlan.md`, `src/config/models.ts` and `src/config/plans.ts` **only with a measured number and a passing margin gate** (and flagged for Tudor in the digest), `src/features/providers/live/**` for a new adapter behind the existing registry, `src/features/metrics/**`, `scripts/*report*.mts`, `scripts/*bakeoff*.mts`, tests, and the finance lines of `TheMasterPlan.md`. It never touches UI files owned by a `ceo-design/*` PR, migrations (it drafts them and asks), webhooks, auth, or secrets.
- **Never:** change a live Stripe object, flip `MOCK_PROVIDERS`, spend on a paid provider call without Tudor's OK, merge, or delete data. Free-tier and docs-only calls are fine.
- **Price changes** (plans, credits, trial) are proposals with a table of before/after margin and a forecast, never silent edits.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode. The margin gate (`npx tsx scripts/margin-report.mts`) must still pass.
- **Output (digest):** (1) headline numbers and trend, (2) what moved and why, (3) the PR and the cash impact it expects, (4) decisions waiting on Tudor, (5) next item. Push a notification only per the table in §1.

---

## 5. Opportunity backlog (ranked by expected cash impact; the routine re-ranks it)

Prices below are from web search snippets on 2026-10-15 (`snippet`/`reseller` quality) and **must be re-checked** before acting. Sources: fal.ai learn pages, Atlas Cloud and devtk.ai comparisons, Akool and Evolink Wan guides, Replicate pricing, Fast.io/Techsy TTS roundups.

### A. Cost (the fal.ai question)

Where fal is used: FLUX.1 schnell/dev for scene images (cents), and Kling 2.5 Turbo Pro for **Premium** clips (the one costly line: 0.12 $/s conservative in the catalog, ~0.07 $/s list). Standard videos use our own Ken Burns renderer (≈ $0.07 total per 15s), so fal is not the Standard cost problem; it is the Premium cost and the image line.

| #   | Idea                                                                                                                                                                          | Why                                                                                                                                                        | Evidence quality     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| A1  | **Bake-off script** `scripts/video-bakeoff.mts`: same 5 scene images through 3–4 I2V models, record real $/clip, latency, failure rate, and a quality rubric                  | Prices disagree by up to 2–3x between sources (e.g. Seedance 2.0 Fast: ~$0.02–0.09/s on resellers vs $0.24/s on fal). Nothing else is decidable without it | needed first         |
| A2  | **Seedance 2.x Fast / Kling 3.0 via a reseller** (Atlas Cloud, WaveSpeed, Evolink) or the vendor API (BytePlus, Kuaishou/Kling) instead of fal                                | Resellers list Seedance 2.0 Fast ≈ $0.076/s and Kling 3.0 Std ≈ $0.07/s; fal lists Seedance 2.0 Fast at $0.24/s for 720p                                   | reseller; verify     |
| A3  | **Alibaba DashScope direct for Wan 2.5/2.6** (official ≈ $0.105/s; Evolink ≈ $0.07/s)                                                                                         | Open-weights family; also self-hostable later                                                                                                              | snippet; conflicting |
| A4  | **Self-host open video models (LTX-2, Wan) on pay-per-second GPUs** (RunPod, Modal, Vast.ai, Replicate Cog) once Premium volume passes the GPU break-even                     | LTX-2 on fal is ~$0.0018/MP; self-hosting beats per-call APIs only at steady volume, so model the break-even first                                         | analysis task        |
| A5  | **Hero-shot Premium** (AI clip on scene 1 only, stills elsewhere) as the default Premium; full-AI becomes "Ultra"                                                             | Already modelled in §7 of the master plan: ≈ $0.45 vs ≈ $1.10 per 15s                                                                                      | in repo              |
| A6  | **Cache and reuse**: hash (prompt, theme) for images/clips; reuse the hook scene and stock intros across a user's series                                                      | Zero-cost scenes are pure margin; cuts repeat spend on retries                                                                                             | build + measure      |
| A7  | **Cheaper voice** where quality allows: Deepgram Aura-2 (~$0.03/1k chars) or Cartesia Sonic (~$0.04–0.05/1k) vs ElevenLabs Flash ($0.05/1k); keep ElevenLabs for Voice Studio | Voice is ~$0.0007/s, tiny, so only do this if the ElevenLabs _plan fee_ (custom-voice slots) is the real cost                                              | snippet; low impact  |
| A8  | **Script model**: Haiku 5.5 for the script step with Sonnet 5.5 as fallback, plus prompt caching on the system prompt. Catalog says $0.04/script                              | Script is a flat 100 credits ($0.04). Measure real tokens first; savings are small per video but it runs on every free trial                               | measure first        |
| A9  | **Stop paying for doomed jobs**: fail fast before the image/clip steps (moderation already does), cap retries, track `failedJobCostUsd`                                       | The report now shows failed-job cost; drive it to ~0                                                                                                       | in report            |
| A10 | **Cut the free trial's cost**: 3,000 trial credits ≈ one video; make it a Standard 15s only, no Premium, watermark                                                            | Free-user cost is pure CAC                                                                                                                                 | in report            |

### B. Revenue (MRR)

| #   | Idea                                                                                                                                      | Why                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| B1  | **Annual plans** (2 months free): cash up front, lower churn. Needs Stripe yearly prices (columns `stripePriceIdYearly` exist)            | Biggest cash-return lever with no new cost                        |
| B2  | **Re-price from measured margin.** Standard carries ~9x; Starter at €14.99 may be under-priced vs creator value. Test with a price-ID A/B | Margin gate says Starter 9.4x, Pro only 3.0x: the mix is lopsided |
| B3  | **Overage / top-up nudges** at 80% and 100% of credits (email via Resend + in-app), one-click top-up                                      | Top-up buyers pay a higher per-credit price (4.0–5.9x margin)     |
| B4  | **Dunning + failed-payment recovery** (Stripe Smart Retries, emails); `past_due` counts as live in our entitlements today                 | Recovers 20–40% of involuntary churn typically                    |
| B5  | **Cancel-flow save offer** (pause 1 month, or downgrade) through the Stripe portal config                                                 | Churn is the MRR killer                                           |
| B6  | **Add-ons that are mostly margin**: extra saved voices, watermark removal, series/auto-post scheduling, priority queue                    | Near-zero API cost per unit                                       |
| B7  | **Affiliate economics**: 30% recurring is in the plan; verify it still leaves ≥ 3x after the payout                                       | Protects margin while buying growth                               |
| B8  | **Regional pricing (PPP)** and USD pricing for the US (EUR-only today)                                                                    | Price list is EUR; most creators are US                           |

### C. Fixed costs

C1 audit Vercel plan vs usage and preview deploys (every routine PR builds a Preview; `vercel.json` already skips docs-only changes) · C2 Supabase compute size, storage lifecycle (delete finished media after N days for free users), egress · C3 ElevenLabs plan vs custom-voice slots in use · C4 Sentry quota (errors only already) · C5 Resend volume.

---

## 6. Experiments the routine may propose (each needs Tudor's OK to spend)

1. **Video bake-off (A1):** budget cap $5–10, run once, store results in `docs/finance/bakeoff-YYYY-MM-DD.md`, update `costUsdPerUnit` with `measured` numbers.
2. **Price test:** two Stripe prices behind the same product; the report splits MRR by price id.
3. **Trial shrink test:** compare trial → paid with 3,000 vs 1,500 credits once there is enough traffic (needs ≥ 200 signups per arm).

---

## 7. What the routine needs from the owner (it will ask via the digest)

Fill in this table; the routine keeps it current from connectors where it can.

| Item                            | Monthly USD | Source                     | Status           |
| ------------------------------- | ----------- | -------------------------- | ---------------- |
| Vercel plan                     | ?           | Vercel connector (billing) | ask Tudor        |
| Supabase plan + compute         | ?           | Supabase dashboard         | ask Tudor        |
| ElevenLabs plan                 | ?           | ElevenLabs invoice         | ask Tudor        |
| fal.ai credits spend (last 30d) | ?           | fal.ai dashboard           | ask Tudor        |
| Anthropic spend (last 30d)      | ?           | Console usage page         | ask Tudor        |
| Domain, email (Resend), Sentry  | ?           | invoices                   | ask Tudor        |
| Stripe fees + refunds           | auto        | Stripe connector           | live mode needed |
| Ads / affiliate payouts         | ?           | owner                      | ask Tudor        |

---

## 8. Access and tooling

**Already connected in cloud sessions:** GitHub (this repo), Supabase (project `iqvrovjwoavvmhaithwn`; **read-only use**, it failed to connect in the first Finance run, retry), Stripe (sandbox), Vercel (billing charges, usage, runtime logs), WebSearch/WebFetch.

**Recommended additions (ask Tudor to connect; each makes a number exact instead of estimated):**

| Add                                                                    | What it unlocks                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Stripe live-mode, restricted read-only key**                         | Exact MRR, churn, refunds, fees, coupons. The single most valuable addition               |
| **Anthropic Console usage/cost export** (Admin API key, read-only)     | Real tokens and dollars per day and workspace for scripts                                 |
| **fal.ai usage** (dashboard export or API) and the same for ElevenLabs | Real provider spend to compare with `api_cost_usd`                                        |
| **PostHog or Plausible** (connector)                                   | Visitor → signup → paid funnel, to compute CAC and where ad spend pays back               |
| **Sentry** (connector)                                                 | Failure causes behind failed-job cost                                                     |
| **Google Sheets/Drive** (connector)                                    | A shared P&L the owner can edit (fixed costs, ad spend) that the routine reads            |
| **Resend** (connector or key in env)                                   | Email volume, dunning and top-up nudge performance                                        |
| **Skill:** `claude-api`                                                | Token counting, prompt caching and model-choice guidance for the script step (A8)         |
| **Skill:** `dataviz` + Artifact tool                                   | A private weekly finance dashboard artifact (MRR, margin, cost per video) the owner opens |

Env/config the routine itself needs: the repo (GitHub connector, push to `ceo-finance/*`), `.env.local` is **not** available in the cloud, so the DB path is the Supabase connector's `execute_sql` (read-only `select`s, same queries as `scripts/finance-report.mts`). If that connector can't connect, the digest says so and the routine falls back to catalog math.

---

## 9. Routine definition (paste into the routine's prompt)

```
You are the master agent ("DM") of the Shortcraft Finance CEO routine. Goal: maximise
profit and cash return. Charter, rules, backlog and access: FinancePlan.md in the repo
(github.com/TudorFnsn/Shortcraft). Read it, then TheMasterPlan.md §7-§9, git log -20,
and open + recent PRs before anything else.

1. NUMBERS. Get this run's figures: Supabase connector read-only selects mirroring
   scripts/finance-report.mts (if unreachable, say so and use margin.ts catalog math),
   Stripe connector read for MRR/churn/refunds, Vercel connector for billing charges.
   Compute MRR / (API + fixed cost), gross margin, cost per video per tier, free-user
   and failed-job cost, tokens per video if logged. Compare with the last digest in
   FinancePlan.md §10.
2. DELEGATE. Pick the specialists worth running today (FinancePlan.md §2) and launch
   them in parallel with the Agent tool, each with a self-contained brief, the data
   they need and a clear question. Ledger analyst always; add vendor scout, pricing
   strategist, infra cost auditor, implementer as needed. Weekly (Monday): all of them.
3. DECIDE. Merge their output. Rank by cash impact and safety. Mark every price
   as list / reseller / snippet / measured. No price swap without a measured number.
4. SHIP. One PR on ceo-finance/<slug> for the best safe item; bar: format:check, lint,
   typecheck, test, next build, margin gate all pass in mock mode. Update FinancePlan.md
   (numbers, backlog status, changelog §10) and the finance lines of TheMasterPlan.md.
   Never merge, never change live Stripe/Supabase data, never flip MOCK_PROVIDERS,
   never spend on paid provider calls without Tudor's OK.
5. REPORT. Digest: headline numbers + trend, what moved, PR + expected cash impact,
   decisions and data needed from Tudor, suggested connectors/tools, next item.
   Send PushNotification only if: MRR/cost < 1.0x or MRR down >20% w/w, a plan fails
   the margin gate, cost > 2x the 7-day average, a vendor swap is ready to decide, or
   the routine could not run (access denied, connector down). Otherwise stay silent.
```

Setup (owner, once): claude.ai/code/routines → New routine → name "Shortcraft Finance CEO", repo `TudorFnsn/Shortcraft`, model Opus 5.5, daily 07:30 UTC, connectors Supabase + Stripe + Vercel + GitHub, paste the block above. The trigger id goes in `TheMasterPlan.md` §9 once it exists.

---

## 10. Changelog and digests (newest on top)

- **2026-10-15** — Charter created by the first Finance run: this file, `features/metrics/finance.ts` + `scripts/finance-report.mts` (MRR, cost per video per tier, free-user and failed-job cost, MRR ÷ cost ratio, profit; +4 tests), seeded backlog from a first vendor scan (§5). No live numbers: the cloud run has no `.env.local` and the Supabase connector failed to connect (proxy tunnel error), Stripe is sandbox-only. **Waiting on Tudor:** create the routine (§9), confirm the charter (§1), fill the cost table (§7), connect the tools in §8. (Finance CEO, interactive setup)
