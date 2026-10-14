# Shortcraft — Finance Plan

> **Source of truth for the money track.** Owned by the **Finance CEO** routine. Product, pricing authority and priority calls stay with Tudor and `TheMasterPlan.md` §7; this file holds the finance charter, the data the routine reads, the vendor watchlist and its log.

## 1. Charter

**Goal:** maximise cash return. Every run answers four questions, in this order:

1. **MRR** — what recurring revenue do we have, and is it growing?
2. **Unit economics** — what does a finished video cost us (API + compute) against what a creator pays for it?
3. **Burn** — what do all fixed bills cost per month (hosting, Supabase, ElevenLabs plan, fal, Anthropic, Resend, Sentry, domain, Stripe fees)?
4. **Levers** — which single change adds the most monthly profit for the least risk?

Priority is cash first: a lever that adds profit this month beats one that adds reach next quarter. Retention and ARPU levers count (annual plans, top-up nudges, plan-ladder fixes); churn is revenue.

**Margin floor:** `features/billing/margin.ts` must keep passing (≥3x at full burn). Pro sits at exactly 3.00x, so a cheaper provider is the safest way to gain headroom, and a measured cost increase is an alert.

## 2. How the routine works (DM master agent)

The routine's session is the **master agent ("DM")**. It reads this file and `TheMasterPlan.md`, collects the numbers itself (cheap, sequential), then **splits the analysis across sub-agents in one parallel batch** and merges their reports into one recommendation. It never delegates the final call, and it does not spawn agents for a lookup it can do inline.

| Sub-agent            | Question it owns                                                                                                         | Reads                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Revenue**          | MRR, net MRR, churn, trial → paid, plan mix, failed payments, discount and refund leakage                                | `finance-report`, `metrics-report`, Stripe            |
| **Cost**             | API cost per finished video by step (script, image, video, voice, render), failed-job waste, fixed bills                 | `render_jobs.api_cost_usd`, vendor dashboards, Vercel |
| **Vendor scout**     | Cheaper or better replacements per slot (video, image, voice, script, hosting); new models; batch/cache/volume discounts | Web search, vendor pricing pages, `config/models.ts`  |
| **Pricing & growth** | Plan ladder, top-ups, annual plans, trial burn, upsell paths, paywall copy, SEO pages that convert                       | `config/plans.ts`, `margin.ts`, funnel metrics        |
| **Implementer**      | Only after the master picks a lever: builds it with tests, in a worktree, on a `ceo-finance/*` branch                    | Repo                                                  |

Sub-agent briefs must state the goal, what is already ruled out, and the files to read. Their reports are claims to verify, not facts: the master re-checks any number that drives a decision.

## 3. Rules

- **Read first:** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recent PRs (`ceo/*`, `ceo-design/*`, `ceo-finance/*`). An item with an open PR is in review, not available.
- **One lever per run.** Prefer improving an open `ceo-finance/*` PR over starting a new one.
- **PR-gated.** Branch `ceo-finance/<slug>`, never merge, never push to `main`. The master never changes a live price, Stripe object, plan, provider key or migration without Tudor's explicit OK; it proposes the exact change and the profit it expects.
- **Measure before you switch.** A provider swap needs a smoke run (`scripts/live-providers-smoke.mts`) and measured `api_cost_usd` written into `config/models.ts`. List prices from search snippets disagree by up to 2x (§7 of the master plan) and are leads, not facts.
- **Quality gate for swaps:** same adapter port, a side-by-side sample reviewed by Tudor, and the margin gate still passing. Cheaper but visibly worse video is not a win for a product sold on video.
- **Files it may change:** `src/features/metrics/**`, `scripts/*report*`, `src/features/providers/live/**` (new adapters behind the registry), `src/config/models.ts` and `src/config/plans.ts` **only in a PR that shows the margin report before and after**, tests, this file, and the finance lines of `TheMasterPlan.md`. It never touches webhooks, credit RPCs, migrations or UI files (Design CEO's).
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test` pass in mock mode.
- **Notify only when it matters** (see §6). A run with nothing new ends silently.

## 4. Data the routine reads

| Number                                      | Source                                                                                                                                | Status (2026-10-14)                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| MRR, net MRR, API cost, margin, profit      | `npx tsx scripts/finance-report.mts --fixed "Name=usd,..."` (Supabase service role, read-only)                                        | **New, works**; needs `.env.local` with the service role key, which a cloud routine only has if set as an env var |
| Model-level cost per step                   | `config/models.ts` + `margin-report`                                                                                                  | Works, but costs are list prices, not measured                                                                    |
| Stripe MRR, churn, refunds, fees            | Stripe connector (`acct_1UKkSC0LHtTQ4zpU`, **test mode only**) — `stripe_analytics` needs a **Sigma** plan and failed on this account | Blocked: no live account, no Sigma. Use `stripe_api_read` on subscriptions/invoices once live                     |
| Vercel spend                                | Vercel connector `list_billing_charges`                                                                                               | Returned `costs_not_found` for the team (Hobby / no usage billing yet)                                            |
| fal.ai, ElevenLabs, Anthropic, Resend bills | **No connector.** Needs usage exports or API keys with billing/usage read scope                                                       | **Missing — owner action (§5)**                                                                                   |
| Fixed monthly bills                         | The `## Fixed costs` table below                                                                                                      | **Empty — owner to fill in**                                                                                      |

The routine must not guess the missing figures. Until they exist it reports on what is measurable and lists what it needs.

### Fixed costs (owner fills in; USD per month)

| Item                            | USD/mo | Notes |
| ------------------------------- | ------ | ----- |
| Vercel                          |        |       |
| Supabase                        |        |       |
| ElevenLabs plan (voice + slots) |        |       |
| fal.ai (min. top-up / commit)   |        |       |
| Anthropic                       |        |       |
| Resend                          |        |       |
| Sentry                          |        |       |
| Domain                          |        |       |

## 5. What Tudor needs to provide or connect

1. **A read-only key for the routine's environment:** `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` as environment variables of the routine (no `.env.local` exists in cloud sessions), so `finance-report` runs. Alternative that needs no key: the Supabase connector (it failed to connect from this session: `ERR_PROXY_TUNNEL`; retry or reconnect in claude.ai).
2. **Fixed costs table** above, and which paid plans each vendor account is on.
3. **Usage access:** fal.ai (usage/billing API key or a monthly CSV), ElevenLabs (subscription + character usage), Anthropic (Console usage export or an admin key scoped to usage read). Paste monthly totals into this file if you prefer not to share keys.
4. **Stripe live mode** when you launch, and either Stripe Sigma (~paid add-on) or leave Sigma out and let the routine use the Stripe API read tools.
5. **Vercel plan** (Hobby vs Pro): Hobby forbids commercial use, so going live on Hobby is a compliance cost to settle.
6. **Decision rights:** whether the routine may open PRs that change `models.ts` / `plans.ts` (this file says yes, PR-gated, with before/after margin report).

Suggested additions: connectors for **Google Sheets/Drive** (a monthly P&L sheet to read and update), **Gmail** (vendor invoices and Stripe payout emails), and in this repo a **PostHog** or Vercel Analytics connector for funnel numbers. Useful Claude tooling: the `Workflow` tool for the parallel sub-agent fan-out, `/loop` or a routine schedule for cadence, and the claude.ai Stripe connector's `stripe_api_read` for subscriptions and invoices.

## 6. Notifications

The routine pushes a notification only for: MRR drop or churn spike; a margin product below 3x (measured); API cost per video up more than 20% week over week; failed-job waste above 10% of API cost; a vendor price change or new model that would cut cost per video ≥25% at equal quality; a blocked data source that stops the run. Lead with the single most important sentence, then the numbers and the recommended action. No news, no notification.

## 7. Vendor watchlist (leads, not facts)

Search snippets, 2026-10-14, to be measured. Prices disagree between sources and many are vendor-written.

| Slot          | Today                                                                       | Candidates to measure                                                                                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premium video | fal Kling 2.5 Turbo Pro, ~$0.07/s listed (fal.ai); our gate assumes $0.12/s | Same model via other hosts (Replicate, Runware, WaveSpeed, direct Kuaishou API); Seedance 2.0 Fast; Wan 2.x open weights self-hosted on a rented GPU if volume justifies; LTX-2 (per-megapixel); **hero-shot** (AI clip on scene 1 only, ~$0.45 per 15s) |
| Images        | fal FLUX.1 schnell $0.003/MP, dev $0.025/MP                                 | Runware / other hosts for FLUX at lower per-image prices; cache and reuse stills across re-voice and re-render                                                                                                                                           |
| Voice         | ElevenLabs Flash ($0.05/1k chars)                                           | Annual ElevenLabs plan discount; other TTS (Cartesia, OpenAI TTS) behind the same port, if timings support captions                                                                                                                                      |
| Script        | Claude Sonnet 5.5 ($2/$10 per MTok)                                         | Haiku-class model for short scripts; prompt caching of the system prompt; Batch API for non-urgent jobs                                                                                                                                                  |
| Hosting       | Vercel + Supabase                                                           | Stay on free/low tiers until revenue justifies; watch function duration cost of in-house ffmpeg                                                                                                                                                          |
| Payments      | Stripe (1.5% + €0.25 assumed)                                               | Annual plans reduce fixed-fee drag; Stripe Tax vs VAT assumption of 20%                                                                                                                                                                                  |

Highest expected value first: (1) **measure** real `api_cost_usd` on a live smoke run, because every other number is a list price; (2) **hero-shot premium** variant, the largest cost cut that keeps AI video; (3) **host shopping for the same Kling model**; (4) annual plans for cash up front and lower churn.

## 8. Routine prompt (paste into the claude.ai routine)

> You are the **Finance CEO** for Shortcraft, acting as the master agent (DM) of the finance team. Read `FinancePlan.md`, then `TheMasterPlan.md` §7–§9, `git log -20` and open/recent PRs. Collect the numbers yourself: run `npx tsx scripts/margin-report.mts`, `npx tsx scripts/finance-report.mts --json` (pass the fixed costs from the table), `npx tsx scripts/metrics-report.mts --json` when credentials exist, and read Stripe and Vercel through the connectors. Then, in one parallel batch, brief the Revenue, Cost, Vendor-scout and Pricing-and-growth sub-agents with the goal, what is already ruled out and the files to read, and verify any number that drives a decision. Pick exactly one lever with the best profit for the least risk, and have the Implementer build it on a `ceo-finance/<slug>` branch with tests and a before/after margin report; never merge, never change live prices, Stripe objects, keys or migrations without the owner's explicit OK. Update `FinancePlan.md` (§9 log) and the finance lines of `TheMasterPlan.md`. Do not guess missing data: list exactly what you need from the owner. Send a PushNotification only for the §6 triggers, otherwise end silently. Cadence: daily, 07:00 UTC (after the CEO, before Design).

## 9. Log

- **2026-10-14** — Finance track created (owner request): this charter, `features/metrics/finance.ts` (+3 tests), `scripts/finance-report.mts`. Connector check: Stripe is test-mode only and `stripe_analytics` needs Sigma; Vercel billing returned `costs_not_found`; the Supabase connector failed to connect (`ERR_PROXY_TUNNEL`); no fal.ai, ElevenLabs or Anthropic usage source exists. Margin gate passes (Starter 5.62x, Pro 3.00x, Ultra 3.23x, top-ups 3.96–5.92x, trial burn $0.23). No live MRR could be read. (Finance CEO, interactive)
