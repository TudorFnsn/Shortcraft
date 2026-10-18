# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on cost, pricing and cash. Every finance PR updates this file
> (metrics snapshot, backlog, changelog) in the same change.
>
> Last updated: 2026-10-18 (routine chartered, first report script)

---

## 1. Charter

| Question  | Answer                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximise cash return.** Every run moves one of: MRR up, provider cost per video down, waste (failed jobs, idle plans) down.                                                                |
| Always    | Check MRR, net MRR vs 30-day provider cost, gross margin, contribution after fixed costs, and cost per video by tier (`scripts/finance-report.mts`).                                         |
| Autonomy  | **PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`. Never merges, never touches live secrets, never changes live Stripe prices or the live DB. Proposals only.          |
| Files     | May edit `config/models.ts`, `features/providers/**`, `features/billing/**`, `features/metrics/**`, `scripts/**`, docs. Leaves UI files to the Design CEO while a `ceo-design/*` PR is open. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00).                                                                           |
| Guardrail | The margin gate (3x, `features/billing/margin.ts`) must still pass. A change that fails it does not ship. A provider swap needs **measured** cost on real calls, not list prices.            |
| Notify    | Push the owner only when something needs them: margin below 3x, contribution negative, a cost spike, a provider with a clearly better price, or missing access. Quiet otherwise.             |

## 2. The routine (master agent + sub-agents)

The routine's prompt is in §7. One **master (DM) agent** runs the loop and spawns
sub-agents in parallel so it stays cheap and fast. It does the synthesis and the
PR itself; sub-agents only gather and analyse.

| Sub-agent            | Job                                                                                                                                                                                             | Reads                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Revenue**          | MRR, net MRR, plans mix, churn, trial → paid, top-up share, failed payments, refunds. Pricing and packaging ideas (annual plans, price tests, upsell to Pro, credit expiry, overage).           | Stripe connector, `subscriptions`, `metrics-report.mts`      |
| **COGS**             | Provider cost per finished video by tier and length, tokens in/out of the script model, seconds of AI video, TTS characters, render time. Where each dollar goes, and the waste (failed jobs).  | `render_jobs.api_cost_usd`, provider dashboards, `models.ts` |
| **Infra & fixed**    | Vercel, Supabase, ElevenLabs plan, Sentry, Resend, domain, Claude routines. Over-provisioned plans, unused add-ons, free-tier headroom, cron and function-duration waste.                       | Vercel connector (usage/billing), Supabase advisors/logs     |
| **Vendor scout**     | Cheaper or better replacements per slot (§5), new releases, price changes, volume deals, self-hosting break-even. Writes a cost-per-video comparison; never swaps without a measured smoke run. | Web search, provider docs, `live-providers-smoke.mts`        |
| **Growth economics** | CAC, payback, LTV by channel once there is traffic; which acquisition spend clears "CAC < first-month net revenue".                                                                             | Stripe, analytics when connected                             |

Master flow each run: (1) read this file + `TheMasterPlan.md` §7/§8, list open and
recently closed PRs (an item with an open PR is in review, skip it); (2) run
`FIXED_MONTHLY_USD=<n> npx tsx scripts/finance-report.mts --json` and
`scripts/margin-report.mts`; (3) fan out the sub-agents above in one message;
(4) rank findings by **dollars per month** saved or earned ÷ effort; (5) ship the
single best change as a PR, or log a proposal for the owner; (6) update §4 and §8,
and notify if §1 "Notify" applies.

## 3. Cost model (what we know)

Variable cost per video (`render_jobs.api_cost_usd`, set by the orchestrator):

| Slot           | Provider today                        | List price used (2026-10)               |
| -------------- | ------------------------------------- | --------------------------------------- |
| Script         | Anthropic, Sonnet 5.5                 | $2 / $10 per MTok in/out, ≈ $0.04/video |
| Images         | fal.ai FLUX schnell (dev for premium) | $0.003 / $0.025 per megapixel           |
| Standard video | In-house Ken Burns (ffmpeg)           | $0                                      |
| Premium video  | fal.ai Kling 2.5 Turbo Pro            | ≈ $0.07 per billed second               |
| Voice          | ElevenLabs                            | ≈ $0.05 per 1k characters (Flash)       |
| Render         | In-house ffmpeg on Vercel             | ≈ $0.01                                 |

**Fixed monthly costs are not in the database.** The owner supplies them once
(§6, question 1) and they live in the `FIXED_MONTHLY_USD` env of the routine.

**Known blind spots (the first things to fix):**

1. `api_cost_usd` is one number per job. There is no per-provider split and no
   token counts, so "tokens used vs money spent" cannot be answered per slot yet.
   Backlog F1 adds a `provider_usage` table (one row per provider call: job,
   provider, units, tokens in/out, cost, latency, ok). It is a migration, so the
   owner applies it.
2. Costs are list prices, not measured (TheMasterPlan §7). Backlog F2 runs the live
   smoke script and replaces `costUsdPerUnit` with measured values.
3. No real revenue data until Stripe is in live mode (the connector is sandbox).

## 4. Metrics snapshot (the routine overwrites this each run)

| Date       | Subscribers | MRR (€ gross) | Net MRR ($) | Provider cost 30d ($) | Gross margin | Fixed ($/mo) | Contribution ($) |
| ---------- | ----------- | ------------- | ----------- | --------------------- | ------------ | ------------ | ---------------- |
| 2026-10-18 | _not read_  | _not read_    | _not read_  | _not read_            | _not read_   | _unknown_    | _unknown_        |

The first run had no database path (the Supabase connector failed from the
cloud session and no service-role key is available there). See §6.

## 5. Backlog (ranked by cash impact ÷ effort)

| ID  | Item                                                                                                                                                                                                                                                                                                                                                                                                                            | Status        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| F0  | Finance report: MRR vs provider cost, margin per tier, failed-job waste (`scripts/finance-report.mts`, `features/metrics/unit-economics.ts`, tested).                                                                                                                                                                                                                                                                           | done          |
| F1  | `provider_usage` table + logging in every live adapter (tokens, seconds, characters, cost, latency). Answers "tokens/units vs spend" per slot and per user. Owner applies the migration.                                                                                                                                                                                                                                        | open          |
| F2  | Measure real per-call costs with `live-providers-smoke.mts` and replace list prices in `models.ts`; re-run the margin gate.                                                                                                                                                                                                                                                                                                     | open          |
| F3  | **Premium video: cheaper than fal.ai Kling.** Candidates to price per 5s clip at 720×1280 and smoke-test: other models on fal (LTX-2 Fast, Wan 2.5, Seedance), the same models direct from their vendors or via aggregators (Replicate, Runware, WaveSpeed, Novita), and self-hosted open models on per-second GPU (Modal, RunPod, Fireworks) if volume ever justifies it. Pick on cost per usable clip, including reject rate. | open          |
| F4  | **Hero-shot premium** (AI clip on scene 1 only, stills after): ≈ $0.45 vs ≈ $1.10 per 15s. Price it near Standard. Biggest cost lever per TheMasterPlan §7.                                                                                                                                                                                                                                                                     | open          |
| F5  | Voice cost: compare ElevenLabs against cheaper TTS (OpenAI TTS, Cartesia, Deepgram Aura, Google/Azure neural) at equal quality; keep ElevenLabs for Voice Studio only if its slot cost is justified. Cache identical narration.                                                                                                                                                                                                 | open          |
| F6  | Script cost: prompt caching on the fixed system prompt, a Haiku-class model for the cheap steps, token budgets per length. Measure tokens first (F1).                                                                                                                                                                                                                                                                           | open          |
| F7  | Waste: failed-job cost (`failedCostUsd30d`), retries, abandoned drafts. Fail fast before the expensive steps; never spend on a job that will be refunded.                                                                                                                                                                                                                                                                       | open          |
| F8  | Revenue levers: annual plans (Stripe prices exist as `stripePriceIdYearly`), credit expiry on monthly grants, a hard price for top-ups vs plan upgrade nudges, abandoned-checkout email, trial → paid prompts at the paywall.                                                                                                                                                                                                   | open          |
| F9  | Free-tier abuse: trial burn per signup ($0.25 target), signup throttling, one trial per device/payment method.                                                                                                                                                                                                                                                                                                                  | open          |
| F10 | Fixed-cost audit once the owner shares the bills (§6): downgrade anything unused, annual-prepay discounts, free tiers.                                                                                                                                                                                                                                                                                                          | blocked on §6 |

## 6. What the routine needs from the owner (access and facts)

The routine can only act on what it can see. Please provide, in this order:

1. **Fixed monthly costs** in USD: Vercel plan, Supabase plan, ElevenLabs plan, Resend, Sentry, domain, anything else. A one-line list is enough. Set it as `FIXED_MONTHLY_USD` in the routine's environment.
2. **Read-only database path** for the cloud routine. Either fix the Supabase connector for cloud sessions (it fails with `ERR_PROXY_TUNNEL` there) or add `NEXT_PUBLIC_SUPABASE_URL` + a **read-only** key to the routine's environment. The report needs `select` on `subscriptions` and `render_jobs` only.
3. **Stripe**: authorise the Stripe connector for the routine (claude.ai connector settings). Sandbox is fine now; switch to a **restricted read-only live key** at go-live.
4. **Provider billing dashboards** (fal.ai, Anthropic Console, ElevenLabs): none has an MCP connector we can rely on. Cheapest path: the routine reads `provider_usage` (F1). Until then, paste the monthly invoice totals into §4.
5. **Vercel connector** (already available): allow the routine to read usage and billing (`list_billing_charges`, `get_project`). Read only.
6. **Decision**: may the routine open PRs that change `models.ts` credit prices, or only propose them? Default: **propose only**, since customer prices are the owner's call.

### Tools and add-ons that would help

- **Connectors:** Stripe (revenue, churn, Sigma SQL), Supabase, Vercel (billing charges, usage, runtime errors), GitHub. Worth adding: **PostHog** or Plausible (funnel, CAC by channel), **Sentry** (cost of error loops), **Resend** (email spend), a **spreadsheet/Drive** connector for the owner's invoices.
- **Provider-side:** Helicone or Langfuse in front of the Anthropic calls (token and cost per request, caching hit rate); fal.ai usage API or webhook export; set **spend caps** and alerts on fal.ai, Anthropic and ElevenLabs so a bug cannot burn cash.
- **Stripe:** Stripe Tax (VAT is assumed at 20%), Stripe Billing analytics, Radar rules for trial abuse, and Sigma for MRR/churn SQL.
- **Claude Code:** keep `/loop` and routines for the schedule, add a **cost guard hook** that fails CI if `models.ts` changes break the 3x gate (the registry already fails closed at runtime).

## 7. Routine prompt (paste into the claude.ai routine)

> You are the **Shortcraft Finance CEO**. Repo: TudorFnsn/Shortcraft. Goal: maximise cash return (MRR up, cost per video down, waste down) without breaking the 3x margin gate.
>
> You are the master agent. Do the following each run.
>
> 1. Read `FinancePlan.md`, then `TheMasterPlan.md` §1, §7, §8. List open and recently closed PRs; skip any item that has an open PR.
> 2. Run `FIXED_MONTHLY_USD=<value from env> npx tsx scripts/finance-report.mts --json` and `npx tsx scripts/margin-report.mts`. If the database is unreachable, say so, use the Stripe and Vercel connectors for what they can tell you, and notify the owner that access is missing.
> 3. In **one message**, spawn sub-agents in parallel: Revenue, COGS, Infra & fixed, Vendor scout, Growth economics (charters in FinancePlan §2). Give each only the files and questions it needs and ask for numbers with sources, not prose. Treat their output as claims to verify, not facts.
> 4. Rank findings by monthly dollars ÷ effort. A provider swap needs a measured cost on real calls (`live-providers-smoke.mts`); list prices are only a reason to test.
> 5. Ship at most **one** change per run as a PR on `ceo-finance/<slug>`: tests, `npm run format:check`, `lint`, `typecheck`, `test` must pass and the margin gate must still pass. Never merge. Never change live Stripe prices, secrets or the live database; migrations and customer price changes are proposals for the owner.
> 6. Overwrite the §4 snapshot, update the §5 backlog, append the changelog line here and in `TheMasterPlan.md` §10.
> 7. Notify the owner (PushNotification) **only** if margin < 3x, contribution is negative, provider cost jumped, a clearly cheaper provider was measured, or you lack access. Otherwise stay quiet.
> 8. Ask for any missing information in §6 rather than guessing.

Setup: create the routine at https://claude.ai/code/routines with this prompt, repo
`TudorFnsn/Shortcraft`, model Opus 5.5, schedule `0 7 * * *` UTC, connectors
Stripe + Supabase + Vercel + GitHub, and env `FIXED_MONTHLY_USD`. Record its id in
`TheMasterPlan.md` §9.

## 8. Changelog (newest on top)

- **2026-10-18** — Finance track chartered. Added `scripts/finance-report.mts` and `features/metrics/unit-economics.ts` (net MRR after VAT and Stripe fees, 30-day provider cost, gross margin, contribution, per-tier cost per 1k credits, failed-job waste; +5 tests). No migration, no dependency, no runtime change. First run could not read the database (Supabase connector failed in the cloud session, Stripe unauthorised). Access list in §6. (Finance CEO, routine)
