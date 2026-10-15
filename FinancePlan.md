# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **CFO** routine
> ("Shortcraft CFO"). It sits under `TheMasterPlan.md`, which wins on product and
> priority; this file wins on cost, pricing and cash. Every CFO run updates §3
> (numbers), §5 (backlog) and §8 (log) in the same change.
>
> Last updated: 2026-10-15 (created, no run yet)

## 1. Charter

**Goal:** maximise cash return. Order of priority: (1) never sell a video below
the 3x margin gate, (2) raise MRR and net revenue per paying user, (3) cut
variable cost per finished video, (4) cut fixed cost, (5) stop leaks (failed jobs
that were paid for, trial abuse, unused paid plans).

**Autonomy:** PR-gated, like the other routines. Branches `cfo/<slug>`, never
merge, never touch live secrets, never change live Stripe prices or products,
never spend money (no new paid plans or API sign-ups). Anything that costs money
or changes what a customer pays is a **proposal** in the PR description for Tudor.
Read-only checks on Supabase, Stripe and Vercel are allowed; any write needs the
owner's explicit OK (TheMasterPlan §9).

**Collision rules:** list open + recently closed PRs first; an item with an open PR
is in review. Leave UI files alone while a `ceo-design/*` PR is open (propose UI
changes as text). The CFO may edit `src/config/models.ts`, `src/config/plans.ts`,
`src/features/billing/*`, `src/features/providers/*`, `scripts/*` and this file;
a change to a price or credit scale must keep `npx tsx scripts/margin-report.mts`
passing and update TheMasterPlan §7 and the changelog.

## 2. Routine design (orchestrator + workers)

The routine prompt is in `docs/routines/cfo-routine.md`. The **CFO (master)** agent
reads this file, fans out the workers below in parallel (one `Agent` call each,
read-only unless told otherwise), merges their reports, picks the single
highest-cash-impact change that is safe to build, builds it behind tests, and sends
one digest. Workers return numbers and sources, not opinions.

| Worker             | Job                                                                                                                                                                                      | Reads                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Revenue**        | MRR (gross, net of VAT + Stripe fees), new / expansion / churned MRR, ARPU, trial → paid, failed payments, refunds, top-up share, plan mix. Compare to last run.                         | Stripe connector, `scripts/finance-report.mts`, `scripts/metrics-report.mts`                 |
| **Unit economics** | Token + provider spend per finished video by tier and length; credits burned vs `api_cost_usd`; cost of failed and refunded jobs; realised vs modelled cost (`src/config/models.ts`).    | Supabase (read-only), `finance-report.mts`, `margin-report.mts`, Anthropic usage             |
| **Infra spend**    | Every recurring bill (§4): Vercel, Supabase, fal.ai, ElevenLabs, Anthropic, Resend, Sentry, domain. Flag idle or over-provisioned plans, function duration, bandwidth, storage growth.   | Vercel connector (`list_billing_charges`, usage), Supabase advisors, owner-supplied invoices |
| **Model scout**    | Cheaper or better providers per slot (video, image, voice, script, render): list price, quality, licence for commercial use, API stability, latency. Compare on cost per finished video. | Web search, provider docs, fal.ai / Replicate / Together model pages                         |
| **Pricing**        | Price points, annual plan, top-up packs, credit scale, trial size and watermark, paywall placement, upgrade nudges; model against the margin gate and competitor prices.                 | `margin.ts`, competitor pages, Stripe data                                                   |
| **Builder**        | Implements the one approved change (adapter, config, script, test) on `cfo/<slug>`; runs format, lint, typecheck, test.                                                                  | repo                                                                                         |

## 3. Numbers (CFO updates every run)

Not measured yet: the app has no live revenue and `FAL_KEY` was pending at the time
of writing. First run: run `scripts/finance-report.mts` and fill this table.

| Metric                                     | Value                               | As of      |
| ------------------------------------------ | ----------------------------------- | ---------- |
| MRR gross (EUR) / net of VAT+fees (USD)    | n/a                                 |            |
| Paying subscribers / ARPU                  | n/a                                 |            |
| Variable cost per finished video: standard | model $0.07 / 15s (unmeasured)      | 2026-10-05 |
| Variable cost per finished video: premium  | model $1.10-2.30 / 15s (unmeasured) | 2026-10-08 |
| API spend on failed jobs (30d)             | n/a                                 |            |
| Fixed monthly cost (§4)                    | n/a                                 |            |
| Break-even MRR (fixed cost ÷ gross margin) | n/a                                 |            |
| Margin gate (Starter / Pro / Ultra)        | 9.4x / 3.00x / 3.23x                | 2026-10-05 |

## 4. Cost register (CFO fills from connectors + owner; one row per bill)

| Vendor         | What for                      | Plan / billing basis   | Monthly EUR  | Source           |
| -------------- | ----------------------------- | ---------------------- | ------------ | ---------------- |
| Vercel         | hosting, cron, functions      | Hobby? (confirm)       | ?            | Vercel connector |
| Supabase       | db, auth, storage             | Free? (confirm)        | ?            | owner / advisors |
| fal.ai         | images (FLUX) + premium video | pay per use            | usage        | owner invoice    |
| ElevenLabs     | voiceover + designed voices   | plan with voice slots  | ?            | owner invoice    |
| Anthropic      | script writer (Sonnet 5.5)    | pay per token          | usage        | Console usage    |
| Resend         | lifecycle email               | free tier?             | ?            | owner            |
| Sentry         | errors                        | free tier?             | ?            | owner            |
| Stripe         | payments                      | 1.5% + €0.25 (assumed) | % of revenue | Stripe connector |
| Domain / other |                               |                        | ?            | owner            |

## 5. Backlog (ideas to test; the Model scout validates before anything is built)

Seeded from what the repo already knows. Prices are **unverified**; the first
run must confirm each on the provider's own page and measure on real calls.

1. **Replace fal.ai Kling for Premium video** (≈$0.07/s list; $0.12/s in the
   catalog). Candidates to price per 5s clip, 9:16, commercial licence: Wan 2.5/2.6
   and LTX-2 Fast (open weights, the cheapest on fal itself), Seedance, Hailuo,
   Veo 3.1 Fast. Also self-host open models on a pay-per-second GPU (Modal,
   RunPod, Replicate, Together) once volume passes ~1k clips/month; below that
   hosted per-clip is cheaper than idle GPUs.
2. **Hero-shot Premium** (AI clip on scene 1 only, stills elsewhere): ≈$0.45 per
   15s. Highest cash lever because it makes Premium sellable at Starter prices.
3. **Cache and reuse**: reuse images and clips for re-voice (already free), for
   retries of failed jobs (do not regenerate finished scenes), and for repeat
   topics; check that a failed job at step N does not re-pay steps < N.
4. **Prompt caching + smaller script model**: Anthropic prompt caching on the fixed
   system prompt; test Haiku 5.5 for the script step against Sonnet 5.5 on quality.
   Script is $0.04 of ~$0.07 for a Standard video, i.e. over half its cost.
5. **Pricing**: annual plan (≈2 months free) for cash up front; trial burn is
   $0.25 per signup, so cap abuse (one trial per card or phone, watermark kept);
   usage-based top-ups with a higher margin than plans; Ultra price test.
6. **Option C** credit scale (cost-proportional) once costs are measured.
7. **Infra**: stay on free tiers until a bill proves otherwise; move big media to
   cheap object storage with a retention rule (delete clips after N days; keep
   the finished MP4); cap function duration; stop the every-minute cron when idle.
8. **Revenue**: affiliates at 30% recurring cost nothing until they convert;
   referral credits; win-back email for lapsed subscribers (Resend already wired).

## 6. Information and access the CFO needs (owner: please provide or connect)

Already connected: GitHub (repo), Stripe (sandbox only), Supabase (flaky from
cloud sessions), Vercel. Missing, in order of value:

1. **Stripe live-mode read access** (restricted read-only key or the connector on
   the live account): without it there is no real MRR.
2. **Supabase read-only database role** (not the service role) reachable from the
   cloud session, so `finance-report.mts` can run. The Supabase connector failed to
   connect on 2026-10-15 (`ERR_PROXY_TUNNEL`); reconnect it or allow the host.
3. **Invoices or usage exports** for fal.ai, ElevenLabs, Anthropic, Resend, Sentry,
   domain (a CSV or the monthly figure is enough), to fill §4. Better: read-only
   keys or billing-admin connectors where the vendor offers them.
4. **Network allow-list** for provider pricing pages (fal.ai, replicate.com,
   together.ai, modal.com, runpod.io, elevenlabs.io, anthropic.com): earlier
   routines were blocked from them (TheMasterPlan §7 point 3).
5. **Decisions**: target gross margin (default 3x gate, 70% blended), minimum
   viable MRR, whether the CFO may open PRs that change prices (default: proposal
   only), the budget for a model bake-off (e.g. $20 of real calls).

Suggested tools: a PostHog or Plausible connector (conversion by page), a Sentry
connector (failed jobs cost money), a Resend connector (email revenue),
a Google Sheets connector for a cash-flow sheet, and a Slack or email connector for
the digest. A Stripe Sigma or Baremetrics-style dashboard replaces hand-rolled MRR
once there is live revenue.

## 7. Decision rules

- A change ships only if it raises net profit per paying user or cuts cost without
  lowering the margin gate, and the numbers are measured, not list prices.
- Never trade quality for cost on the hook scene or the voice; they decide retention.
- A provider swap needs a side-by-side of 5 real videos and a rollback (the old
  adapter stays registered).
- Any price change, new plan, refund policy or paid vendor is the owner's call.

## 8. Log (newest on top)

- **2026-10-15** — Track created: charter, worker design, cost register, backlog,
  `scripts/finance-report.mts` (read-only MRR + spend report). No run yet. (interactive)
