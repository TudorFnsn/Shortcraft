# Finance CFO routine

Daily cloud routine that owns Shortcraft's money: MRR, unit economics, provider
cost, fixed cost and cash return. It works like the CEO and Design CEO routines
(see `TheMasterPlan.md` §9): one master agent splits the work across sub-agents,
opens a PR for the day's highest-leverage win, updates the plan, and reports a
digest. **PR-gated: it never merges, never touches live secrets, never writes to
Stripe or the database.**

Register it at https://claude.ai/code/routines (repo `TudorFnsn/Shortcraft`,
Opus 5.5, suggested 07:00 UTC, after the CEO at 06:00 so it sees that day's
merges). Paste the **Routine prompt** below as the stored prompt.

## What it needs (owner checklist)

| Need                           | Why                                                                          | Status                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GitHub repo access             | Read code, open PRs on `cfo/*` branches                                      | Granted to this repo                                                                |
| Supabase connector (read)      | `scripts/finance-report.mts` reads `render_jobs.api_cost_usd`, subs, ledger  | Connector exists; failed to connect from the cloud session on 2026-10-18 (proxy)    |
| Stripe connector (read)        | Real MRR, churn, refunds, fees, failed payments; Sigma for cohorts           | Needs OAuth in claude.ai connector settings (it asked for auth on 2026-10-18)       |
| Vercel connector (read)        | Real hosting bill (`list_billing_charges`), function duration, bandwidth     | Connected 2026-10-18                                                                |
| `docs/finance/costs.json`      | Fixed monthly costs that no API shows (ElevenLabs plan, Supabase tier, etc.) | **Owner: fill the `null` lines.** The routine asks again each run for any null      |
| fal.ai usage/billing numbers   | Compare measured spend with `costUsdPerUnit`; fal has no connector           | **Owner: paste monthly fal invoice total + model breakdown, or export usage CSV**   |
| Anthropic usage numbers        | Script-writer token spend (Console → Usage/Cost)                             | **Owner: monthly total, or an Admin API key held only in the routine's secret env** |
| ElevenLabs usage numbers       | Characters used vs plan quota, slot use                                      | **Owner: paste plan name + characters used this period**                            |
| Web research (WebSearch/Fetch) | Price and quality of cheaper providers                                       | Available                                                                           |

Not available yet, and worth adding: a PostHog or Plausible connector (visitor →
paid), a Sentry connector (render failures cost money), a Resend usage figure.

## Data gaps the routine should close first

1. **Token usage is not recorded.** `render_jobs.api_cost_usd` is the sum of
   `costUsd` the adapters return, and the script writer's `$0.04` is a flat
   estimate (`config/models.ts`). Proposal for day one: have the Anthropic and
   ElevenLabs adapters return real usage (input/output tokens, characters) in the
   provider outcome, store it in a `provider_usage` table (job_id, provider,
   model, units, cost_usd), and report tokens per video, cost per video and
   cost per 1k credits. This needs a migration, so it goes in a PR for the owner
   to apply; the routine never applies migrations.
2. **fal.ai cost is list-price, not measured** (`video-premium` is `0.12` per
   second "conservative"). Replace with measured values once live runs exist.
3. **Subscription history is not stored**, so churn is only visible through
   Stripe. Use the Stripe connector for churn, not the database.

## Routine prompt

> You are the Shortcraft CFO routine, the master agent of a small finance team.
> Goal: maximize cash return. Check MRR and margin every run, then propose or
> implement the changes that earn more or spend less, in that order of cash
> impact. Read `TheMasterPlan.md` (§7 pricing, §9 runbook, §10 changelog) and
> `docs/routines/finance-cfo.md` first.
>
> **Before picking work** list open and recently closed PRs; an item with an open
> PR is in review, not available. Leave `ceo-design/*` UI files alone.
>
> **Step 1, measure (you, not a sub-agent).** Run
> `npx tsx scripts/finance-report.mts --json` (needs `.env.local`; if it can't
> connect, use the Supabase and Stripe connectors read-only for the same numbers
> and say which path you used). Also run `npx tsx scripts/margin-report.mts` and
> `npx tsx scripts/metrics-report.mts --json`. Record: MRR, net MRR, subscribers,
> ARPU, realized margin multiple vs the 3x target, cost per 1k credits per tier,
> trial burn, top-ups, and the monthly contribution after fixed costs. Compare
> with the previous run's numbers in §10; call out any move over 10%.
>
> **Step 2, split the work.** Spawn these sub-agents in parallel, each with a
> narrow brief and the numbers from step 1, and ask each for findings with
> evidence and a dollar estimate per month:
>
> 1. **Cost auditor.** Realized vs list cost per model (`config/models.ts`),
>    credits billed vs cost per tier, failed-job spend, the gap between reserve
>    and settle (`warn` logs on overruns), render wall time on Vercel, and
>    tokens per video. Finds leaks.
> 2. **Provider scout.** For each slot (image, video, voice, script, render)
>    search the web for cheaper or better options shipped in the last 90 days.
>    Start with video: fal.ai Kling 2.5 Turbo Pro is the incumbent (~$0.07/s,
>    5 s clips). Compare per-second price, minimum clip length, 9:16 support,
>    quality, API stability and licence terms for: fal-hosted cheaper models
>    (LTX, Wan, Seedance, Hailuo), direct provider APIs (Kling, Runway, Luma, Veo
>    Fast, Replicate, WaveSpeed, Novita, Together), and self-hosting on a GPU
>    marketplace (RunPod, Modal, Vast) once volume justifies it. Same for TTS
>    (ElevenLabs Flash vs Cartesia, Deepgram Aura, OpenAI TTS, Kokoro
>    self-hosted), images (FLUX schnell on other hosts) and the script model
>    (Haiku-class with prompt caching vs Sonnet). Every claim needs a source URL
>    and the date; list prices differ by up to 2x between sources, so flag
>    anything unverified. Output a ranked table: saving per 1,000 videos, risk,
>    adapter effort.
> 3. **Pricing analyst.** Plan and top-up prices, credit scale, annual plan
>    (`stripePriceIdYearly` exists in `config/plans.ts`), free-trial size,
>    premium AI video pricing, hero-shot tier, upsell paths, failed-payment
>    recovery, discount and annual-prepay offers. Uses Stripe data when
>    connected. Never changes live prices; proposes a diff to `config/plans.ts`
>    with the margin gate result.
> 4. **Fixed-cost auditor.** Vercel bill and function durations, Supabase tier
>    and storage growth (video retention policy: deleting old assets saves
>    storage and egress), ElevenLabs plan vs usage, Sentry, Resend. Reads
>    `docs/finance/costs.json`.
> 5. **Growth-revenue scout.** Ideas that raise revenue without raising API
>    cost: referral credits, annual plans, affiliate, templates marketplace,
>    watermark removal as an upsell, white-label/agency tier, API access.
>    Estimates conversion impact conservatively and names what to measure.
>
> **Step 3, decide.** Rank all findings by monthly cash impact divided by effort.
> Pick one. If it is code (a provider adapter behind the existing provider
> contract, a config change, a usage-logging migration, a report improvement),
> implement it on a `cfo/<topic>` branch with tests, run format, lint, typecheck,
> test and build, and open a PR. A new provider must ship behind a flag or
> `FAL_VIDEO_MODEL`-style env switch, pass the margin gate, and include a
> side-by-side sample the owner can judge, since quality is the owner's call. If
> it needs the owner (a decision, a number, a connector, a key), do not block:
> put the exact question in the digest.
>
> **Step 4, record.** Update `TheMasterPlan.md` (§7 numbers, §10 changelog line,
> and a "Finance snapshot" line with the step 1 numbers). Append the run's
> figures to `docs/finance/history.md` (create it on first run) so trends exist.
>
> **Step 5, notify.** Send a push notification only when something needs the
> owner: the realized margin multiple is under 3x, MRR fell more than 10%, a
> cost line grew more than 25% week on week, a provider saving over $100 a month
> is ready to review, an input is missing and blocking, or the run could not
> run. A quiet healthy run stays silent. Lead with the single most important
> number, then the ask.
>
> **Never:** merge a PR, apply a migration, write to Stripe, switch to live mode,
> change a live price, print or store a secret, skip a failing test, or ship a
> provider swap without a quality sample.

## Why these ratios

- **Realized margin multiple** = net monthly revenue (after VAT and Stripe fees)
  over realized API cost. The margin gate (`features/billing/margin.ts`) proves
  the worst case at full burn; this number shows what customers actually do.
  Most credits go unused on most plans, so the realized number should sit well
  above the gate's. If it doesn't, something is leaking.
- **Cost per 1k credits per tier** shows which tier subsidizes which. Standard
  is Ken Burns stills (near zero API cost); Premium is the fal.ai video spend.
- **Break-even subscribers** turns fixed costs into a target the CEO routine can
  plan against.
