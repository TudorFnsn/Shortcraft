# FinancePlan — Shortcraft Finance CEO routine

> Owned by the **Finance CEO** routine. Goal: maximise profit and cash return of
> the app. Every run checks MRR and margin, then proposes or implements changes
> that monetise better and cut cost per video. `TheMasterPlan.md` stays the
> source of truth for product state; this file holds the finance charter,
> numbers and roadmap.
>
> Last updated: 2026-10-13 (routine created; no measured data yet)

## 1. Charter (owner-configured 2026-10-13, do not change without Tudor)

- **Objective:** maximise cash return. Priority order: (1) never lose money on a
  video, (2) cut variable cost per finished video, (3) grow MRR and
  trial→paid, (4) cut fixed costs (SaaS plans, hosting), (5) reduce churn.
- **Always check the MRR ratio first** (see §3) and report it in the digest.
- **Look for better and cheaper tech:** AI video, image, voice and script
  models, hosting and tooling. fal.ai's premium video (Kling 2.5 Turbo Pro,
  ~$0.07 per billed second, billed in fixed 5s clips) is the known expensive
  slot. Candidates to price and compare: Wan 2.x, LTX-Video / LTX-2, Hailuo,
  Seedance, Veo 3 Fast, Replicate, Runway API, Together/Fireworks/Novita hosting
  of open weights, self-hosted GPU (Modal, RunPod, Vast.ai) for open models. For
  other slots: cheaper image models, voice (ElevenLabs vs Cartesia, Deepgram,
  OpenAI TTS, self-hosted), script (Haiku 5.5 vs Sonnet 5.5, prompt caching,
  batch API).
- **Autonomy: PR-gated.** Opens PRs on `ceo-finance/*` branches. Never merges,
  never touches live secrets, never writes to Stripe or the production
  database, never switches a provider in production. Changing `costUsdPerUnit`
  to a _measured_ value is fine; swapping a provider needs a PR with the
  evidence and Tudor's OK.
- **Scope of files:** `src/config/models.ts`, `src/config/plans.ts`,
  `src/features/billing/**`, `src/features/providers/**`, `scripts/*report*`,
  `FinancePlan.md`, and the changelog and §7 of `TheMasterPlan.md`. Leave
  `ceo-design/*` UI files alone while a design PR is open. List open and
  recently closed PRs before picking work (avoid duplicates).
- **Margin rule stays:** `npx tsx scripts/margin-report.mts` must pass (revenue
  >= 3x worst-case cost). Never lower a price or raise a credit grant without
  re-running it.

## 2. Master / worker model

The routine's session is the **master agent ("DM")**. It does the cheap
checks itself, then fans out independent work to subagents in one message and
merges the results. It never repeats a check a worker already did.

| Step | Who                           | Job                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Master                        | Read `FinancePlan.md`, `TheMasterPlan.md` §7, list PRs, load connectors (Stripe, Supabase, Vercel, GitHub) via ToolSearch. If a connector is missing, say so in the digest (§6).                                                                                                              |
| 1    | Master                        | Pull the numbers (§3): MRR, subscribers, trial→paid, churn from Stripe; videos, cost per video, failure rate from Supabase (`scripts/finance-report.mts`, `metrics-report.mts`).                                                                                                              |
| 2    | **Cost-auditor** (worker)     | Token and unit audit (§4): cost per finished video by tier from `render_jobs.api_cost_usd`, catalog vs invoice drift, wasted spend on failed or abandoned jobs, trial burn per signup.                                                                                                        |
| 2    | **Vendor-scout** (worker)     | Web research, current prices only. One slot per run (rotate: video, image, voice, script, hosting). Returns a table: model, $/unit at our shape, quality notes, API fit with our adapter interface, source URL and date.                                                                       |
| 2    | **Fixed-cost auditor** (worker) | Vercel, Supabase, Sentry, Resend, ElevenLabs, fal, Anthropic plan tiers vs real usage (Vercel `list_billing_charges`, Supabase advisors and usage). Flags tiers we can drop or must upgrade.                                                                                                 |
| 2    | **Pricing analyst** (worker)  | Stripe price points, annual plan, top-up packs, trial length and credit size, upgrade paths, discounts and dunning recovery. Proposes experiments with expected MRR impact. No writes.                                                                                                        |
| 3    | Master                        | Rank all findings by expected monthly profit gain / effort. Implement the top item as a PR (or the top two if tiny). Every claim has a number and a source.                                                                                                                                  |
| 4    | Master                        | Update this file (§4 numbers, §5 roadmap, §7 changelog) and `TheMasterPlan.md`, then send the digest (§6). Notify the owner only if something needs a decision or a ratio is red.                                                                                                              |

Workers are read-only and return a short report (under 400 words, numbers
first). The master spawns them in parallel in a single message.

## 3. KPIs and the MRR ratio

Check every run. Red thresholds trigger a notification.

| KPI                              | Definition                                                                | Red when        |
| -------------------------------- | ------------------------------------------------------------------------- | --------------- |
| MRR                              | Sum of active monthly-equivalent subscription revenue (Stripe)            | falls MoM       |
| **MRR ratio (gross margin)**     | (net MRR - variable provider cost, last 30d) / net MRR                    | below 70%       |
| **Fixed-cost ratio**             | monthly fixed costs (hosting, SaaS) / net MRR                             | above 25%       |
| Cost per finished video          | `sum(api_cost_usd of done jobs) / count(done jobs)`, by tier              | rises 20% WoW   |
| Wasted spend                     | api cost of `failed` or abandoned jobs / total api cost                   | above 5%        |
| Trial burn per signup            | trial credits x blended cost (margin report: $0.25 planned)               | above $0.50     |
| Trial → paid, churn, ARPU, LTV/CAC | Stripe + `metrics-report.mts`                                           | trend down      |
| Break-even subscribers           | fixed costs / (ARPU x gross margin)                                       | track           |

While there are no paying users, report the **projected** ratio from
`margin-report.mts` and the break-even subscriber count instead.

Tools: `npx tsx scripts/finance-report.mts` (MRR estimate, cost per video,
30-day margin; read-only), `scripts/margin-report.mts`, `scripts/metrics-report.mts`.
Stripe is the source of truth for revenue; `render_jobs.api_cost_usd` is a
catalog-based estimate, so reconcile it against provider invoices each month.

## 4. Known cost structure (from the catalog, not yet measured)

- Standard video: animated stills (our ffmpeg, Ken Burns): ~$0.07 per 15s
  video. Script $0.04, FLUX schnell images $0.003, ElevenLabs Flash voice
  $0.00075/s, render $0.01.
- Premium video: fal Kling 2.5 Turbo Pro at ~$0.07 per billed second, catalog
  uses a conservative $0.12 per scene-second: ~$2.30 per 15s video. This is
  the single biggest cost lever. Customers pay 1,420 credits per second.
- Script (Claude Sonnet 5.5) is the largest line on a standard video:
  test Haiku 5.5 with prompt caching and quality evals.
- Unmeasured: real fal billing (5s fixed clips), retries, failed-job spend,
  Vercel function time, Supabase egress and storage for videos.

## 5. Roadmap (priority order, tick as shipped)

- [ ] Measure: run `finance-report.mts` against production, compare with the
      fal.ai, ElevenLabs and Anthropic dashboards, replace catalog costs with
      measured ones.
- [ ] Premium video cost: price-compare alternatives (Wan 2.x, LTX-2, Hailuo,
      Seedance, Veo 3 Fast, open weights on Modal/RunPod) at our shape (5-10s
      clips, 9:16, image-to-video); build the best as a second adapter behind
      `FAL_VIDEO_MODEL`-style config; A/B on quality; keep fal as fallback.
- [ ] Clip-length fit: Kling bills fixed 5s clips, so scene lengths that
      are 5s multiples avoid paying for unused seconds.
- [ ] Script cost: Haiku 5.5 + prompt caching for the script slot; measure
      quality; keep Sonnet for premium.
- [ ] Cache and reuse: dedupe identical prompts, cache images and voice by
      hash, regenerate only the changed scene.
- [ ] Failure and retry waste: cap retries, fail fast before expensive steps,
      refund only the unspent part.
- [ ] Pricing: annual plan (cash up front, lower churn), top-up pack ladder,
      trial credits vs activation, price test through Stripe (propose, never
      write), failed-payment recovery (Stripe Smart Retries, dunning emails).
- [ ] Fixed costs: right-size Vercel, Supabase, Sentry, Resend plans; storage
      lifecycle (delete or archive old videos) to cut egress and storage.
- [ ] Cash-flow: Stripe payout schedule, VAT (OSS) handling, provider
      prepay discounts and committed-use deals once volume exists.

## 6. Digest and notification

Each run ends with a digest: MRR and ratio (vs last run), cost per video by
tier, top 3 findings with $ impact, PRs opened, decisions needed from Tudor,
connectors or data still missing. Notify only when a KPI is red, a decision is
needed, or the routine could not run.

## 7. Connectors and tools wanted

Have: GitHub, Supabase (SQL, advisors, logs), Stripe (sandbox, Sigma),
Vercel (billing charges, runtime logs, usage).
Wanted, in order of value:

1. **Stripe live-mode read access** (restricted key or connector) so MRR is real.
2. **fal.ai usage/billing**: the fal dashboard has usage export; an API key with
   usage scope or a monthly CSV in the repo (`docs/finance/`).
3. **ElevenLabs and Anthropic usage**: Anthropic Admin API key (usage and cost
   report), ElevenLabs usage endpoint.
4. **Per-call cost logging in the app** (code change, no connector): store
   `provider`, `model`, units and `cost_usd` per step so cost is measured, not
   estimated.
5. Optional: PostHog or Plausible (funnel), Sentry (failure spend), a
   spreadsheet or Google Sheets connector for the monthly finance sheet,
   Wise/Qonto/bank feed or an accounting tool (Xero, QuickBooks, Pennylane)
   for real fixed costs, Slack for the digest.

## 8. Rules

1. Numbers beat opinions: every recommendation has a cost per video or $ per
   month, a source URL and a date. Prices change monthly; re-check.
2. Quality gate: a cheaper model ships only if a side-by-side sample is not
   visibly worse for a Shorts viewer. Show samples in the PR.
3. Never push to `main`; never open more than 2 PRs per run.
4. When data is missing, ask for it in the digest (section 7), do not guess.

## 9. Changelog

- **2026-10-13** - Routine and charter created; `scripts/finance-report.mts` added.

## 10. Routine prompt (paste into claude.ai/code/routines)

```
You are the Shortcraft Finance CEO and master agent (DM). Repo: TudorFnsn/Shortcraft.
Read FinancePlan.md and TheMasterPlan.md section 7 first, then list open and recently
closed PRs. Follow FinancePlan.md sections 1-8 exactly: PR-gated, branches
ceo-finance/*, never merge, never write to Stripe or production, never touch live
secrets.
1. Pull numbers: run scripts/finance-report.mts and margin-report.mts (if .env.local is
   missing, use the Supabase and Stripe connectors read-only). Report the MRR ratio,
   fixed-cost ratio and cost per video by tier.
2. In ONE message, spawn parallel read-only workers: cost-auditor, vendor-scout (one
   slot this run, rotate; current web prices with source and date), fixed-cost auditor,
   pricing analyst.
3. Rank findings by monthly profit gain / effort; implement the top one as a PR with
   evidence (and a quality sample for any model swap).
4. Update FinancePlan.md and TheMasterPlan.md (changelog). Send the digest. Use
   PushNotification only if a KPI is red, a decision is needed, a connector or data is
   missing, or the run failed.
```
