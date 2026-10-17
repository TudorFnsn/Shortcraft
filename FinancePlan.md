# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> `TheMasterPlan.md` wins on product and priority; this file wins on cost, price,
> vendors and cash. Every finance PR updates §3–§6 and the changelog here.
>
> Last updated: 2026-10-17 (routine created; baseline measured)

## 1. Charter

| Question   | Answer                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Goal       | **Maximum profit, cash first.** Grow MRR, cut cost per video, keep every product ≥ 3x margin (the existing gate), shorten payback. |
| Autonomy   | **PR-gated**, same as the other routines: branches `ceo-finance/<slug>`, never merge, never touch live secrets, Stripe or prices.  |
| Cadence    | Daily cloud routine "Shortcraft Finance CEO", 12:00 UTC (after CEO 06:00 and Design 09:00). Weekly deep dive on Mondays.           |
| Writes     | Owner approves any price, plan, vendor or Stripe change. The routine proposes with numbers; it only implements code behind flags.  |
| File scope | `FinancePlan.md`, `scripts/finance-*`, `src/config/models.ts` costs, `src/features/billing/*`, provider adapters. No UI files.     |
| Silence    | A run with no change worth the owner's attention sends **no** notification. See §7.                                                |

## 2. Operating model — the DM master agent

The routine's main session is the **DM (master) agent**. It does not do the legwork: it reads this file, runs the report, decides which of the work packages below have something new, and fans them out to sub-agents in parallel with a narrow brief each. It then merges their findings, decides what is worth a PR, and writes the digest.

| Sub-agent            | Question it answers                                                                                                          | Reads                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Unit-economics**   | Measured cost per video vs `models.ts` and credits charged; which job shape loses margin; token/second burn per step.        | `finance-report.mts`, `render_jobs`, `margin-report.mts`, Supabase |
| **Vendor-scout**     | Cheaper or better replacements per slot (video, image, voice, LLM, render, hosting, DB, email). Web research, dated sources. | WebSearch/WebFetch, vendor pricing pages                           |
| **Revenue / MRR**    | MRR, ARPU, churn, trial→paid, top-up share; pricing, annual plan, upsell and dunning ideas.                                  | Stripe (when connected), `metrics-report.mts`, Supabase            |
| **Fixed-cost audit** | Every recurring bill vs usage: Vercel, Supabase, ElevenLabs slots, Resend, Sentry, domain. Downgrade or tier-fit proposals.  | Vercel and Supabase connectors, owner-supplied invoices (§4)       |
| **Implementer**      | Builds the one approved-in-principle code win (e.g. a model swap behind an env flag, caching, cheaper default) with tests.   | repo; must pass format, lint, typecheck, test                      |

**DM loop each run**

1. `git fetch`; list open + recently closed PRs (an item with an open PR is in review, not available). Read `TheMasterPlan.md` §7–§9 and this file.
2. Run `npx tsx scripts/finance-report.mts --json` and `npx tsx scripts/margin-report.mts` (or the read-only Supabase queries in §6 if `.env.local` is absent).
3. Compare with the last numbers in §3. Anything moved? Spawn only the sub-agents with something new (Vendor-scout weekly, others daily).
4. Rank findings by **cash impact per effort**: profit/month gained ÷ owner time. Pick at most one for a PR.
5. Update §3 (numbers), §4 (vendors), §5 (ideas ledger) and the changelog; open a PR.
6. Notify only per §7.

**Rules every sub-agent gets:** cite sources with dates; mark each price as _list_ or _measured_; never invent invoices; read-only on Supabase/Stripe; ask the DM for anything missing; unverified figures are labelled as such.

## 3. Baseline (measured 2026-10-17, read-only Supabase query)

| Tier     | Finished | Total API cost | Avg per video | Credits charged |
| -------- | -------- | -------------- | ------------- | --------------- |
| Standard | 11       | $2.37          | **$0.216**    | 19,949          |
| Premium  | 3        | $5.76          | **$1.919**    | 127,860         |
| Failed   | 3        | $0.00          | —             | 0               |

- 6 profiles, 2 live subscription rows. **Stripe is in sandbox (test mode), so MRR is not cash yet: real MRR = €0.** Treat all revenue figures as projections until live mode.
- **Finding 1:** Standard measured at ~$0.22 average (mixed lengths) against the ~$0.07 the 15s margin table assumes. Likely the script LLM call ($0.04 flat) and image count dominate, not the render. Unit-economics must split cost by step before any price change; if the gap is real, Pro's 3.0x gate has no headroom.
- **Finding 2:** Premium measured $1.92 per video, in line with the $1.80 assumed, so Premium margin is as modelled. The cheap win is the **hero-shot** variant (~$0.45), already scoped in TheMasterPlan §7.
- **Gap:** per-step cost and token counts are not stored (only a total `api_cost_usd`). Without them, "tokens used vs money spent" can't be answered precisely. First engineering item below.

## 4. Vendors and fixed costs (owner fills the blanks)

| Vendor         | Used for                 | Today                          | Monthly bill | Cheaper options to test (Vendor-scout verifies)                                                                                       |
| -------------- | ------------------------ | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| fal.ai         | FLUX images, Kling video | FLUX schnell/dev, Kling 2.5    | _owner: ?_   | Direct provider APIs, other fal video models (LTX, Wan, Seedance), Replicate, Runware, self-hosted GPU on demand, batch/queue pricing |
| Anthropic      | Script writer            | Sonnet 5.5                     | _owner: ?_   | Haiku 5.5 for scripts, prompt caching, shorter prompts, batch API for non-urgent work                                                 |
| ElevenLabs     | Voiceover, voice design  | Flash v2.5, custom-voice slots | _owner: ?_   | Cheaper TTS (OpenAI, Google, Cartesia, Deepgram Aura), keep ElevenLabs for Premium/Designed voices only                               |
| Vercel         | Hosting, cron            | Hobby                          | _owner: ?_   | Stay on Hobby until usage forces Pro; watch function duration and ffmpeg render time                                                  |
| Supabase       | Auth, DB, storage        | Free/Pro?                      | _owner: ?_   | Storage lifecycle: delete old renders; egress through CDN                                                                             |
| Resend, Sentry | Email, errors            | free tiers?                    | _owner: ?_   | Stay on free tiers                                                                                                                    |
| Stripe         | Payments                 | Sandbox                        | % of revenue | Annual plans cut per-charge fees; Stripe Tax/Link settings                                                                            |

## 5. Ideas ledger (rank by cash impact ÷ effort; the routine moves rows, never deletes)

| #   | Idea                                                                                 | Expected effect                                | Status   |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | -------- |
| F1  | Store per-step cost + token/second usage on each job (`job_cost_lines`)              | Makes every later decision measurable          | proposed |
| F2  | Script on Haiku 5.5 + prompt caching, A/B on quality                                 | Script cost down several-fold                  | proposed |
| F3  | Hero-shot Premium (AI clip on scene 1 only)                                          | Premium $1.92 → ~$0.45, sells at a lower price | proposed |
| F4  | Cheaper video model bake-off (LTX-2, Wan 2.5, Seedance, Kling) via `FAL_VIDEO_MODEL` | Cost per Premium second down                   | proposed |
| F5  | Annual plans (2 months free) + Stripe annual prices                                  | Cash up front, lower churn, fewer fees         | proposed |
| F6  | Failed-job and retry cost guard (cap spend per job, abort early)                     | Removes silent margin leaks                    | proposed |
| F7  | Cache images/voice for repeated topics and idea-starter chips                        | Avoids paying twice for identical output       | proposed |
| F8  | Trial burn cap and watermark (trial costs us ~$0.14–0.25 per signup)                 | CAC down                                       | proposed |
| F9  | Dunning/win-back emails for failed payments and unused credits                       | Recovers revenue                               | proposed |
| F10 | Delete or tier old render files in Supabase Storage                                  | Storage and egress cost flat as library grows  | proposed |

## 6. Read-only queries the routine may run

- Cost by tier and status: `select model_tier, status, count(*), sum(api_cost_usd), avg(api_cost_usd), sum(actual_credits) from render_jobs group by 1,2;`
- Live subscriptions by plan: `select plan_id, status, count(*) from subscriptions group by 1,2;`
- Storage footprint: `select bucket_id, count(*), pg_size_pretty(sum((metadata->>'size')::bigint)) from storage.objects group by 1;`

Any write (migration, price, Stripe object, env var) needs the owner's explicit OK.

## 7. Notification rule

Send a push notification (one `<routine_summary>`, headline first) only when: the margin gate fails or a product drops below 3x; measured cost per video rises >20% week over week; a vendor bill spikes; the routine finds a change worth >€50/month and has a PR ready; the routine is blocked on access or a missing input (§8); or live-mode MRR changes by more than 10%. Otherwise stay silent.

## 8. What the routine needs from the owner (ask once, then keep here)

1. **Vendor invoices / dashboards:** last 3 months of fal.ai, ElevenLabs, Anthropic, Vercel, Supabase bills (CSV or screenshot values in §4). Better: a read-only usage key per vendor, stored as a cloud-environment secret, never in the repo.
2. **Stripe live mode** (or a read-only restricted key / the Stripe connector authorised in claude.ai settings): the Stripe connector currently needs authorisation, so real MRR, churn and fees are invisible.
3. **Ad and distribution spend** (if any) to compute CAC and payback.
4. Target numbers: minimum gross margin (default 3x gate, ~67%), runway or monthly profit goal.
5. Environment: confirm the routine's cloud environment has network access to vendor pricing pages (a prior routine was blocked from provider pages) and the Supabase connector.

### Suggested connectors and tools

| Tool                                  | Why                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| **Stripe connector** (authorise it)   | MRR, churn, fees, refunds, Sigma SQL for cohorts. The single biggest gap today.      |
| **Supabase connector** (connected)    | Read-only cost and usage queries; advisors for storage and egress.                   |
| **Vercel connector** (connected)      | `list_billing_charges`, usage, function duration: hosting cost per video.            |
| **GitHub** (connected)                | PRs and the open-PR check.                                                           |
| Vendor usage APIs / billing exports   | fal.ai, ElevenLabs and Anthropic usage endpoints give exact spend per day and model. |
| Anthropic Console usage export        | Token counts per workspace for the script writer.                                    |
| PostHog or Plausible (web analytics)  | Visitor→signup→paid funnel for CAC.                                                  |
| Google Sheets/Drive connector         | Optional: owner keeps invoices there and the routine reads them.                     |
| Claude Code skills: `dataviz`, `xlsx` | Charts and a monthly P&L spreadsheet for the owner.                                  |
| Agent Skills / MCP: Resend, Sentry    | Email cost and error-driven retry spend.                                             |

## 9. Routine prompt (paste into the cloud routine "Shortcraft Finance CEO")

```text
You are the Finance CEO / DM master agent for Shortcraft (repo TudorFnsn/Shortcraft). Read FinancePlan.md,
TheMasterPlan.md §7–§9 and AGENTS.md first. Goal: maximise profit and cash return. Check MRR, measured API
cost per video vs credits charged, every vendor bill, and look for cheaper or better tech (fal.ai is expensive:
evaluate alternatives). Follow FinancePlan.md §2 exactly: run scripts/finance-report.mts and margin-report.mts,
list open and recently closed PRs, spawn sub-agents (Unit-economics, Vendor-scout, Revenue, Fixed-cost audit,
Implementer) in parallel only for work with something new, rank by cash impact per effort, open at most one PR
on branch ceo-finance/<slug>, update FinancePlan.md and the TheMasterPlan changelog. Never merge, never change
live prices, Stripe, secrets or env vars; read-only on Supabase and Stripe. If data or access is missing, say
exactly what you need (FinancePlan.md §8) and notify. Notify only per §7; otherwise stay silent.
Cloud environment: model Opus 5.5, daily 12:00 UTC, connectors Supabase, Stripe, Vercel, GitHub.
```
