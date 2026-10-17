# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on cost, pricing evidence and cash. Every finance PR updates §6 (ledger)
> and §7 (changelog) in the same change.
>
> Last updated: 2026-10-17 (created; no live numbers yet, see §3)

---

## 1. Charter

**Job:** maximise profit and cash return. Keep MRR growing, keep every product at
≥ 3x revenue ÷ API cost (the margin gate), and cut every cost that does not buy
revenue. Prefer changes that return cash soonest.

| Question   | Answer                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy   | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge. No live secrets, no spending, no Stripe/Supabase/Vercel writes without the owner's explicit OK (master plan §9 rule).                          |
| Cadence    | Daily cloud routine **"Shortcraft Finance CEO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Light run daily (numbers + alerts); deep run on Mondays (provider scouting, pricing experiments).              |
| Owns files | `FinancePlan.md`, `src/features/finance/*`, `scripts/finance-*.mts`, `tests/finance/*`, and the **cost fields** of `src/config/models.ts`, plus `src/config/plans.ts` prices **only with a pricing proposal the owner approved**. |
| Hands off  | UI files while a `ceo-design/*` PR is open; anything outside the list above goes to the main CEO as a roadmap item, not a finance PR.                                                                                             |
| Silence    | A run that finds nothing new sends **no** notification. It notifies only on the triggers in §8.                                                                                                                                   |

## 2. KPIs the routine reads every run

1. **MRR** (EUR), net MRR (USD, after VAT + Stripe fees), paying subscribers, ARPU, by plan.
2. **Churn** and **trial → paid** (north-star report has trial → paid; subscription history is not stored, so churn needs Stripe).
3. **API cost per finished video by tier** and **credits charged per API dollar**. Margin-gate multiples per product (`scripts/margin-report.mts`).
4. **Failed-job spend** (cost of renders that refunded) and cost per signup (trial burn).
5. **Fixed costs** (hosting, DB, ElevenLabs plan, domain, email) from the register in §4.
6. **Profit per month** and **revenue ÷ cost**: `npx tsx scripts/finance-report.mts --days 30 --fixed <usd> [--json]` (read-only; math in `features/finance/finance.ts`, tested).

## 3. Data access: what exists, what is missing

| Source                                | State (2026-10-17)                                                                                                          | Action                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (DB)                         | `.mcp.json` server **failed to connect** in this session (proxy tunnel); claude.ai Supabase connector was still connecting. | Owner: confirm the claude.ai Supabase connector is on for routines. Fallback: owner runs `finance-report.mts` and pastes JSON into §6.                           |
| Stripe                                | claude.ai connector **needs authorization** (sandbox only).                                                                 | Owner: authorize it, later add the live account. Gives real MRR, churn, fees, refunds, disputes via Sigma.                                                       |
| Vercel                                | Connector available (`list_billing_charges`, usage, runtime errors).                                                        | Use it read-only each run for the hosting line.                                                                                                                  |
| fal.ai / ElevenLabs / Anthropic spend | **No connector.** `api_cost_usd` is usage × catalog list price, not an invoice.                                             | Owner: send the monthly invoice totals into §4 (2 min), or create read-only usage keys (Anthropic Admin API, ElevenLabs usage, fal usage) for the routine's env. |
| Token / unit usage                    | **Not stored.** Only `render_jobs.api_cost_usd` per job; no tokens, characters or clip seconds.                             | Proposed migration (§5, F1): `provider_usage` table written by the orchestrator. Owner applies it.                                                               |
| Ad spend / traffic                    | None.                                                                                                                       | Later: PostHog + Search Console connectors.                                                                                                                      |

Rule: when a number is an estimate, say so next to it. Never present list-price cost as the invoice.

## 4. Fixed-cost register (owner fills; the routine reads it)

| Item                  | USD / month | Source / plan                                 |
| --------------------- | ----------- | --------------------------------------------- |
| Vercel                | 0 (Hobby)   | Upgrade needed for commercial use? Check ToS. |
| Supabase              | 0 (free)    | Free plan; Pro is $25                         |
| ElevenLabs plan       | _owner_     | Custom-voice slot count drives the tier       |
| Resend                | 0 (free)    | 100 emails/day                                |
| Domain                | _owner_     |                                               |
| Anthropic / fal usage | variable    | from invoices                                 |

Note: Vercel Hobby is non-commercial. Charging real customers likely requires Pro ($20/seat). The routine verifies this against Vercel's terms and puts it in the next run's report; it is a fixed cost the plan must absorb before Stripe goes live.

## 5. Roadmap (priority = cash return per effort)

- [ ] **F0 Baseline.** First `finance-report` numbers in §6 once data access exists. _(report script shipped 2026-10-17)_
- [ ] **F1 Usage metering.** Migration `provider_usage(job_id, step, provider, model, unit, quantity, cost_usd, created_at)` + one insert per provider call. Answers "tokens/characters/clip-seconds per video vs dollars". Additive, owner-applied.
- [ ] **F2 Real costs.** Replace list-price `costUsdPerUnit` with measured numbers from invoices (master plan §7: Pro has zero headroom at 3.0x).
- [ ] **F3 Premium cost cut.** Premium AI video is the only expensive path (~$1.9 per 30s). Options to price and test, cheapest first: hero-shot variant (AI on scene 1 only, ~$0.45/15s); a cheaper video model; cap premium length; separate premium credits.
- [ ] **F4 Provider scouting** (see §9 watchlist). A candidate becomes a PR only after a measured smoke run by the owner (`live-providers-smoke.mts`), never on list price alone.
- [ ] **F5 Cash levers.** Annual plan (prepay, ~2 months free) · low-credit top-up prompt · card-required trial or smaller trial · watermark on trial/Starter · credit rollover/expiry policy · Stripe Smart Retries + dunning emails (recovers 20–40% of failed renewals) · referral credits. Each is a proposal with expected € effect; owner approves pricing.
- [ ] **F6 Cost guards.** Per-user daily spend cap and abuse counter (trial farming), failed-job cost alarm, provider outage fallback to the cheaper adapter.
- [ ] **F7 Dashboard.** Weekly finance Artifact (MRR, margin per tier, cost per video, profit) for the owner.

## 6. Findings ledger (newest first; every claim: number, source, date, estimate or measured)

- _2026-10-17_ — Track created. Known facts: 3 real renders on 2026-10-08 cost $0.037 / $0.049 (Standard 15s / 30s) and $1.92 (Premium 30s), all list-price estimates; Standard has ~9x margin, Premium Pro 3.0x. No MRR data yet (Stripe unauthorized, DB path down).

## 7. Changelog

- **2026-10-17** — Created the track: `FinancePlan.md`, `features/finance/finance.ts` (MRR, net revenue, cost per video by tier, profit; +5 tests), `scripts/finance-report.mts`. (interactive)

## 8. Notification triggers (PushNotification, otherwise silent)

MRR down > 10% week over week · any product below the 3x margin gate on measured cost · a day's API spend > 2x the 14-day average · failed-job spend > 10% of API spend · a provider price change or cheaper model that saves ≥ 20% on a tier (with the PR link) · the routine could not read its data sources · an owner action is blocking cash (e.g. Stripe live activation).

## 9. Provider watchlist (UNVERIFIED leads; the scout confirms price, quality, licence, API limits)

| Slot   | Today                            | Candidates to test                                                                                                                                                  |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video  | fal Kling 2.5 Turbo Pro ~$0.07/s | LTX-2 Fast (~$0.04/s per master plan sources), Wan 2.x, Seedance, Hailuo; Kling direct API; self-hosted open models on Modal/RunPod/Replicate when volume justifies |
| Image  | fal FLUX schnell $0.003/MP       | Runware, Replicate, self-hosted FLUX; cache/reuse stock scene images per theme                                                                                      |
| Voice  | ElevenLabs Flash $0.05/1k chars  | Cartesia, Deepgram Aura, OpenAI TTS, open-source (Kokoro) for the Standard tier; keep ElevenLabs for designed voices                                                |
| Script | Claude Sonnet 5.5 ~$0.04/video   | Haiku-class model + prompt caching + Batch API (−50%) for non-interactive steps; measure quality first                                                              |
| Render | in-house ffmpeg ~$0.01           | Already minimal. Watch Vercel function GB-seconds.                                                                                                                  |
| Media  | Supabase Storage                 | Cloudflare R2 (no egress fee) and a retention policy; delete unfinished-job assets                                                                                  |

## 10. Routine prompt (paste into claude.ai/code/routines; model Opus 5.5, repo TudorFnsn/Shortcraft)

```
You are the Finance CEO (master agent) for Shortcraft. Read AGENTS.md, TheMasterPlan.md §7–§9 and FinancePlan.md first. List open + recently closed PRs before choosing work: an item with an open PR is in review.

Act as a delegating master: do not do all the work yourself. Split it across subagents in parallel, brief each with the goal, the files to read and what is already ruled out:
1. Revenue analyst: MRR, net MRR, ARPU, churn, trial→paid (Stripe connector if authorized, else `npx tsx scripts/finance-report.mts --json`, else say what is missing).
2. Cost auditor: API cost per video by tier, failed-job spend, fixed costs (Vercel billing connector, FinancePlan §4), margin gate (`scripts/margin-report.mts`).
3. Provider scout (Mondays or when a price change is suspected): WebSearch (extended) for cheaper/better video, image, voice, script and storage options; verify prices on the provider's own page; output a table with measured-vs-list flags.
4. Monetization strategist: pricing, plans, top-ups, annual, trial, dunning, referral; every idea with an expected € effect and the evidence behind it.
5. Implementer: turns the one best approved-scope item into a PR on `ceo-finance/<slug>` with tests (`npm run format:check && npm run lint && npm run typecheck && npm test`).
6. Skeptic: reads the implementer's diff and the analysts' numbers adversarially; kills estimates presented as facts.

Rules: PR-gated, never merge. No live secrets, no paid API calls, no writes to Stripe/Supabase/Vercel without the owner's OK. Pricing changes are proposals, not PRs, until the owner approves. Update FinancePlan §6/§7 and the TheMasterPlan changelog. Every number is labelled measured, invoice, list-price or estimate.

Notify with PushNotification (inside <routine_summary>) only for the §8 triggers or when a data source is unreachable or an owner action blocks cash. Otherwise stay silent. Also each run: report which connectors/tools/data would let you do the job better (SuggestConnectors) and ask the owner for any missing information in FinancePlan §3.
```

## 11. Recommended connectors, tools and add-ons

1. **Stripe** (authorize; then live account): real MRR, churn, refunds, fees, disputes, failed payments.
2. **Supabase** (claude.ai connector, enabled for routines): read-only cost and usage queries.
3. **Vercel** (already connected): billing charges, function usage.
4. **Provider usage APIs** as read-only keys in the routine env: Anthropic Admin (usage + cost), ElevenLabs usage, fal usage. Invoices beat list prices.
5. **PostHog** (funnel, visitor → paid) and **Google Search Console** (SEO payback) for CAC and distribution ROI.
6. **Resend** usage (email volume vs free tier).
7. A bookkeeping source (bank export, Wise/Revolut, or Xero/QuickBooks) for true cash in/out.
8. Claude tools: scheduled routines, parallel subagents/Workflow for the six roles, `WebSearch` extended for scouting, Artifact dashboards for the weekly view.
