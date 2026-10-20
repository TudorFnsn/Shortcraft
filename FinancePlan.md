# FinancePlan — Shortcraft money track

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md` (the master plan wins on product and priority;
> this file wins on cost, pricing experiments and cash). Prompt for the routine:
> `docs/routines/finance-ceo.md`.
>
> Last updated: 2026-10-20 (bootstrap, no measured data yet)

## 1. Charter

Maximise **cash return**: net MRR minus everything we pay (providers, hosting, Stripe, tools). Every run answers, with numbers: _what is MRR, what did it cost to earn, what is the cheapest safe change that widens the gap?_

Hard rules (inherited from the master plan, not negotiable by this track):

- **Margin gate stays green.** `npx tsx scripts/margin-report.mts` must exit 0 on any change. Pro sits at exactly 3.00x today, so any cost increase fails it.
- **Money moves need Tudor.** Never change live Stripe prices or products, never flip live providers, never run migrations or write data without his explicit OK. Read-only checks are free.
- **Measure before you migrate.** A provider swap needs a real benchmark call (cost, latency, quality vs the incumbent) before the adapter becomes the default. List prices disagree by up to 2x (master plan §7).
- Quality is a cost too: a cheaper model that raises render failures or refunds is not cheaper.

## 2. Scorecard (the routine refreshes this every run)

| Metric                             | Source                                | Latest                            | Target              |
| ---------------------------------- | ------------------------------------- | --------------------------------- | ------------------- |
| Net MRR (USD)                      | `scripts/finance-report.mts` / Stripe | n/a                               | growing             |
| Paying subscribers by plan         | same                                  | n/a                               |                     |
| API cost / MRR (30d)               | same                                  | n/a                               | < 33% (3x gate)     |
| Cost per finished video, by tier   | same (`render_jobs.api_cost_usd`)     | n/a                               | standard < $0.10    |
| Waste on failed jobs (30d)         | same                                  | n/a                               | < 3% of spend       |
| Free / trial burn (30d)            | same                                  | n/a                               | < 10% of spend      |
| Trial -> paid, visitor -> paid     | `scripts/metrics-report.mts`          | n/a                               | up                  |
| Hosting, DB, tools, domain         | Vercel / Supabase connectors, owner   | n/a                               | every line itemised |
| Gate multiples (Starter/Pro/Ultra) | `scripts/margin-report.mts`           | 9.4x / 3.00x / 3.23x (2026-10-05) | >= 3x               |

## 3. Cost map (every payment we make or could make)

| Line               | Today                                      | Where it is measured        | Lever                                                             |
| ------------------ | ------------------------------------------ | --------------------------- | ----------------------------------------------------------------- |
| Script LLM         | Claude Sonnet 5.5 (~$0.04/script)          | `render_jobs.api_cost_usd`  | smaller model, prompt caching, tighter prompts, batch where async |
| Images             | FLUX schnell/dev on fal.ai                 | same                        | cheaper hosts, fewer/smaller images, reuse across scenes          |
| Premium video      | Kling v2.5 turbo on fal.ai (~$0.07/s)      | same                        | cheaper host/model, hero-shot only, open weights on rented GPU    |
| Voice              | ElevenLabs Flash (~$0.05/1k chars) + slots | same + ElevenLabs dashboard | cheaper TTS for standard tier, cache repeated lines               |
| Render             | in-house ffmpeg, ~$0.01                    | Vercel function usage       | already cheap; watch duration/memory                              |
| Hosting            | Vercel                                     | Vercel connector (billing)  | function duration, image/bandwidth, cron frequency                |
| Database + storage | Supabase                                   | Supabase connector          | storage retention (expire old media), egress, plan tier           |
| Payments           | Stripe fees + VAT                          | Stripe                      | annual plans (fewer fixed fees), fee tier, Stripe Tax             |
| Email, monitoring  | lifecycle email, Sentry                    | owner                       | free tiers, sampling rates                                        |

## 4. Revenue levers (ranked by expected cash per effort)

Each item carries a status: `[ ]` idea, `[~]` PR open, `[x]` shipped, `[✓]` Tudor approved the money change.

- [ ] **Measure first.** Run `finance-report` on the live DB; fill §2 and §3 with real numbers. Nothing below is prioritised properly until this is done.
- [ ] **Annual plans** (2 months free): cash up front, fewer Stripe fixed fees, lower churn. `stripePriceIdYearly` already exists on `Plan`.
- [ ] **Hero-shot premium** (AI clip on scene 1 only, ~$0.45 per 15s): a mid-priced tier between Standard and full Premium.
- [ ] **Cheaper video backend** for Premium (see §5), behind the existing adapter, benchmarked.
- [ ] **Failed-job waste**: cap retries, fail fast before the expensive step, refund only what was not spent.
- [ ] **Trial burn**: today $0.25/signup. Tighten with abuse limits (one trial per device/email domain pattern) if free burn exceeds target.
- [ ] **Top-up nudges** at low balance, **upgrade nudges** when a user hits a plan limit (duration, tier).
- [ ] **Pricing tests**: price points and credit grants per plan, only through the margin gate and with Tudor's `[✓]`.
- [ ] **Storage retention**: expire unposted media after N days (Supabase storage and egress).

## 5. Provider watchlist (leads to verify, not facts)

Never put these in code or pricing without a measured benchmark (§1). The routine searches the web each run and updates this table with dated, sourced prices.

| Slot       | Incumbent           | Candidates to benchmark                                                                                                                                         |
| ---------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video      | fal.ai Kling v2.5   | Wan 2.x / LTX-2 / Seedance on other hosts (Replicate, Novita, WaveSpeed, Together), Runway/Luma/Veo Fast, open weights on rented GPU (Modal, RunPod) for volume |
| Images     | fal.ai FLUX schnell | Runware, Together, Replicate FLUX; self-host only at volume                                                                                                     |
| Voice      | ElevenLabs Flash    | Cartesia, Deepgram Aura, OpenAI TTS, open models (Kokoro) for the Standard tier; keep ElevenLabs for designed voices                                            |
| Script LLM | Claude Sonnet 5.5   | Claude Haiku 5.5 for easy topics, prompt caching, Batch API for non-urgent jobs                                                                                 |
| Hosting    | Vercel + Supabase   | audit plan tiers and usage first; migrate only if the saving beats the migration cost and risk                                                                  |

Benchmark log (append newest on top): _none yet_.

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 pricing, §8 risks, §9 runbook), this file, `git log -20`, open and recent PRs. An item with an open `ceo-finance/*` PR is in review, not available.
- **One lever per run:** the top unchecked item in §4 not already in an open PR. Prefer improving an open finance PR over starting a new one.
- **Branches:** `ceo-finance/<slug>`. Never merge. Never push to `main`.
- **Files it may change:** this file, `docs/routines/finance-ceo.md`, `scripts/finance-report.mts`, `scripts/*bench*`, `src/features/metrics/finance.ts` and its tests, `src/config/models.ts` cost figures **only with measured data**, a new provider adapter under `src/features/providers/live/` (opt-in, not the default until benchmarked and approved), and the finance lines of `TheMasterPlan.md`. It never touches Stripe live objects, migrations, webhooks, credit ledger code or auth.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test` pass, plus `npx tsx scripts/margin-report.mts` exits 0.
- **Output:** a digest (see the prompt) and, only when something needs Tudor, a push notification.

## 7. Changelog (newest on top)

- 2026-10-20: track created. Added `FinancePlan.md`, `docs/routines/finance-ceo.md`, `src/features/metrics/finance.ts` (+ tests) and `scripts/finance-report.mts`.
