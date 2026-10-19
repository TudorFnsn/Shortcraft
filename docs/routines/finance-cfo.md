# Shortcraft Finance CFO routine

Daily cloud routine that owns **cash return**: MRR vs everything we spend, and the
changes that raise it. Same shape as the CEO and Design CEO routines (see
`TheMasterPlan.md` §9): one **master (DM) agent** reads the numbers, splits the
work across sub-agents, merges their findings into one PR-gated plan, and sends a
digest. It never merges, never touches live secrets, never writes to Stripe or
the database without the owner's explicit OK.

> Creating the routine itself needs the owner: routines live in claude.ai
> (https://claude.ai/code/routines), not in the repo. Paste the **Routine prompt**
> below, pick Opus 5.5, schedule it daily (suggested 07:00 UTC, after the CEO at
> 06:00), repo `TudorFnsn/Shortcraft`, branch prefix `ceo-finance/*`.

## 1. Baseline (2026-10-19, read through the Supabase connector)

| Metric                    | Value                                                          |
| ------------------------- | -------------------------------------------------------------- |
| Profiles / paying subs    | 6 / 2 (sandbox test data, not real revenue)                    |
| Render jobs               | 17 (14 done, 3 failed)                                         |
| API cost metered          | $8.13 total, **$0.58 per finished video** (tests used Premium) |
| API cost of failed jobs   | $0.00 (refunds hold, nothing wasted so far)                    |
| Vercel billing charges    | none returned (404 `costs_not_found`: no billable usage yet)   |
| Real MRR / real customers | none yet. Stripe is still the sandbox account                  |

So the ratio to watch (net MRR / total monthly cost) cannot be judged until live
Stripe and the first real customers exist. Until then the job is to keep unit
cost low and have the report ready.

## 2. How to read the numbers

- `npx tsx scripts/finance-report.mts --days 30 --fixed "Vercel=20,Supabase=25,ElevenLabs=22"`
  (read-only; `--json` for the digest). Reports net MRR, API cost, wasted cost on
  failed jobs, profit, **MRR-to-cost**, gross margin, cost per video, and per
  tier cost, cost per second and realised credits-per-dollar. Math is pure and
  tested in `features/finance/unit-economics.ts`.
- `npx tsx scripts/margin-report.mts`: worst-case margin gate (3x rule).
- Metered cost is `render_jobs.api_cost_usd`. **Fixed bills are not in the
  database**; the routine needs them from the owner (section 5).
- Token and unit usage: Claude script tokens per video are not stored today; only
  the dollar cost is. First task for the routine: add `usage` (input/output
  tokens, ElevenLabs characters, fal billed seconds/megapixels) to the metering
  so cost per video can be broken down by provider.

## 3. Agent split (master / DM agent)

The master runs steps 1 and 5 itself and spawns the others in parallel, each with
a narrow brief and read-only access unless stated.

1. **Master:** list open and recently closed PRs first (skip any item already in
   review), run the finance report, read `TheMasterPlan.md` §7 and §10, decide
   today's single highest-cash-return item, merge findings, open one PR, send the
   digest (push notification only if a threshold below is crossed).
2. **Unit-economics agent:** run both scripts, compare metered cost per video with
   the catalog `costUsdPerUnit`, flag any model whose measured cost exceeds the
   catalog (the margin gate fails closed), find failed or runaway jobs, propose
   catalog or credit changes.
3. **Provider-price agent:** web-search current prices for video, image, voice and
   LLM providers; keep the watchlist in section 4 current; propose swaps only with
   a measured cost on a real call (use `scripts/live-providers-smoke.mts`) and a
   quality check against the current model.
4. **Revenue agent:** read Stripe (when authorised) and the subscriptions table:
   MRR, churn, trial to paid, top-up share, failed payments and refunds; propose
   pricing, annual plans, top-up packs, dunning and upgrade prompts. Pricing
   changes go to the owner, never straight to a PR.
5. **Infra-cost agent:** Vercel usage (function duration of the ffmpeg render,
   bandwidth, cron frequency), Supabase (storage growth of the `media` bucket,
   egress, compute add-ons), Sentry and email volume. Propose retention rules
   (delete intermediate images and clips after N days), caching, and plan
   downgrades.
6. **Tooling agent:** keeps the suggestions in section 6 current.

## 4. Cost levers and the watchlist

Order of leverage, biggest first:

1. **Premium AI video** is the only expensive path (~$0.12 per scene-second in the
   catalog, 15s ≈ $1.80 assumed). Levers: hero-shot variant (AI clip on scene 1
   only, ~$0.45 per 15s), cheaper model, cap Premium by plan, prepay via top-ups.
2. **Failed and abandoned jobs:** every provider call before a failure is cost
   with no revenue. Measure `wastedApiCostUsd`; fail early (moderation, input
   checks) before paid steps.
3. **Voice (ElevenLabs):** character cost plus custom-voice slots; cache previews
   and repeat narrations.
4. **Script (Claude):** prompt caching and a smaller model for retries.
5. **Storage and egress:** delete intermediates, short signed-URL TTLs.

Image-to-video watchlist (**unverified, from vendor blog snippets, 2026-10-19;
the routine must re-measure on real calls**):

| Model / route                      | List price per second | Note                                      |
| ---------------------------------- | --------------------- | ----------------------------------------- |
| Kling 2.5 Turbo Pro on fal (today) | ~$0.07                | Fixed 5s clips, so short scenes cost more |
| Wan 2.2 Turbo (Atlas Cloud)        | ~$0.02                | Cheapest listed; check quality            |
| P-Video (Pruna)                    | ~$0.02 (720p)         | Check quality and API stability           |
| Wan 2.5 (DashScope / resellers)    | ~$0.05 to $0.10       | Sources disagree up to 2x                 |
| Seedance 2.0 i2v                   | ~$0.10 to $0.30       | Varies by reseller and resolution         |
| LTX-2.3 Fast                       | ~$0.06 to $0.24       | Audio included                            |

Sources: [invideo pricing roundup](https://invideo.io/blog/ai-video-model-pricing),
[fal best image-to-video APIs](https://fal.ai/learn/tools/best-image-to-video-apis-2026),
[Atlas Cloud comparison](https://www.atlascloud.ai/blog/case-studies/Top-5-ai-video-apis-compared-speed-latency-and-cost-per-second-2026),
[Wan 2.5 cost guide](https://akool.com/blog-posts/wan-2-5-cost-guide).

Swapping is one catalog row plus one adapter (`src/config/models.ts`,
`features/providers/live`), and the margin gate must still pass.

## 5. What the routine needs from the owner

- **Stripe connector authorised** (claude.ai connector settings). It shows as
  needing auth. Also a **live-mode, read-only restricted key** later, so MRR is
  real, not sandbox.
- **Supabase connector** reconnected for the routine's environment (it failed to
  connect from the cloud proxy in this session; the `Supabase` claude.ai
  connector worked).
- **Monthly bills**, as `name=USD`: Vercel, Supabase, ElevenLabs plan, fal.ai
  top-ups, Anthropic spend, Resend, Sentry, domain. Put them in the routine
  prompt's `--fixed` argument or in a `docs/routines/fixed-costs.json` file.
- **Provider billing access:** a fal.ai usage/billing export (or admin key),
  Anthropic console usage (workspace key), ElevenLabs usage. Without these only
  the app's own metered cost is visible.
- **Thresholds to notify on** (defaults, change as wanted): MRR-to-cost below 1.5,
  gross margin below 60%, any model measured over 1.2x its catalog cost, failed
  job spend above 5% of API cost, a payment failure spike.

## 6. Connectors and tools that would help

- **Stripe** (already linked, needs auth): MRR, churn, refunds, Sigma queries.
- **Supabase** (linked): usage, storage size, advisors, SQL.
- **Vercel** (linked): billing charges and runtime logs. Returned no charges so far.
- **Sentry connector**, to tie errors to wasted spend.
- **PostHog or Plausible**, for visitor to signup to paid funnel (CAC needs it).
- **Google Sheets / Drive connector**, for a live cost ledger the owner can edit.
- **Provider billing APIs:** fal.ai usage, Anthropic Usage and Cost Admin API,
  ElevenLabs subscription endpoint, held as read-only keys in the routine's
  environment.
- Claude tools: `Workflow` for the parallel sub-agents, scheduled routines for the
  daily run, `PushNotification` for threshold alerts, the `xlsx` skill for a
  monthly P&L export.

## 7. Autonomy and guardrails

PR-gated like the CEO routine: branches `ceo-finance/*`, one focused PR per day,
tests and `npm run format:check`, `lint`, `typecheck` pass before pushing. Free
to change: scripts, reports, docs, metering, retention jobs behind flags. Needs
the owner's explicit OK: prices, credit scales, plan limits, any provider swap
going live, any migration, any Stripe or database write, and anything touching
`MOCK_PROVIDERS` or live secrets. It leaves UI files alone while a `ceo-design/*`
PR is open. Update `TheMasterPlan.md` §10 and the changelog in the same PR.

## 8. Routine prompt (paste into claude.ai)

```
You are the Shortcraft Finance CFO master agent. Goal: maximise cash return
(net MRR / total cost, gross margin, cost per finished video) for
TudorFnsn/Shortcraft. Read docs/routines/finance-cfo.md and TheMasterPlan.md
(sections 7, 9, 10) first.

1. List open and recently closed PRs; skip items already in review.
2. Run `npx tsx scripts/finance-report.mts --days 30 --json` (add the fixed
   costs from the doc) and `npx tsx scripts/margin-report.mts`. If a connector
   is missing, say which one in the digest and continue with what you have.
3. Split the work across parallel sub-agents as in section 3 of the doc
   (unit economics, provider prices, revenue, infra costs, tooling). Give each a
   narrow brief and read-only access.
4. Pick the single highest-cash-return item, implement it on a ceo-finance/*
   branch, run format:check, lint, typecheck and tests, open one PR, update
   TheMasterPlan.md.
5. Never merge, never write to Stripe or the database, never change prices or
   go live without the owner. Put price or provider proposals in the PR
   description with measured numbers.
6. Send a push notification only when a threshold in section 5 is crossed or
   something needs the owner (missing access, a decision). Quiet otherwise.
```
