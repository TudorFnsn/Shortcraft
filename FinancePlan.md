# FinancePlan — Shortcraft FinOps

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md` (the master plan wins on product and priority).
> This file wins on unit economics, vendor choice and pricing experiments.
> Every Finance PR updates this file (ledger + changelog) in the same change.
>
> Last updated: 2026-10-15 (created; routine prompt in §7, not yet scheduled)

## 1. Charter

| Question  | Answer                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Maximise **cash return**: grow MRR, cut cost per finished video, keep gross margin ≥ 3x on every product (the margin gate), shorten payback on anything we spend.         |
| Priority  | 1) stop money leaks, 2) cheaper vendors at equal quality, 3) pricing/packaging that lifts ARPU, 4) new revenue (annual plans, top-ups, add-ons), 5) new tech to trial.    |
| Autonomy  | **PR-gated.** Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe, Supabase, Vercel. Any write (migration, Stripe price, vendor signup, live key) = owner OK. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design at 09:00). Weekly deep run on Mondays (vendor + price research).           |
| Collision | Touches only `src/config/{models,plans}.ts`, `src/features/{billing,metrics}/`, `scripts/*report*`, `FinancePlan.md`, `TheMasterPlan.md` §7/§9/§10. Never UI files.       |

## 2. The DM master agent and its team

The routine's main session is the **DM (dispatcher/master)**. It does no deep
analysis itself: it gathers the shared facts once (§3), then fans out to the
specialists below **in parallel** (one `Agent` call each, in a single message),
hands each only the facts it needs, and merges the results into one ranked list.

| Agent                  | Question it answers                                                                                | Inputs / tools                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Revenue analyst**    | MRR, ARPU, churn, trial → paid, plan mix, top-up share, failed payments, refunds. What lifts MRR?  | `finops-report`, Stripe connector (read), Supabase (read)    |
| **Unit-cost auditor**  | Real $ per finished video by tier vs credits charged; tokens/characters/seconds used per provider. | `render_jobs.api_cost_usd`, provider dashboards, `models.ts` |
| **Vendor scout**       | Cheaper or better replacements for fal.ai (Kling/FLUX), ElevenLabs, Claude script model, hosting.  | WebSearch/WebFetch of pricing pages; quality notes           |
| **Pricing strategist** | Plan prices, credit scale, annual discount, premium "hero-shot" packaging, free-trial burn.        | `margin-report`, competitor pages, `FinancePlan.md` ledger   |
| **Infra cost agent**   | Vercel, Supabase, Sentry, Resend, ElevenLabs plan: what we pay, what's idle, what to downgrade.    | Vercel billing tools, Supabase advisors/usage                |
| **Implementer**        | Turns the single top accepted item into a PR (code + tests), re-running the margin gate.           | repo, `npm test`, `margin-report`                            |

Rule: the DM spawns the Implementer **only after** the owner-visible ranking is
written, and only for items that need no secrets and no owner decision.

## 3. Daily loop (the DM runs this)

1. **Context:** read `FinancePlan.md`, `TheMasterPlan.md` §7–§10, list open + recently closed PRs (an item with an open PR is in review, not available).
2. **Facts, once:** `npx tsx scripts/finops-report.mts --json`, `scripts/margin-report.mts`, `scripts/metrics-report.mts --json`, then Stripe (balance, MRR via Sigma analytics, failed payments, refunds, disputes), Vercel billing charges, Supabase usage/advisors. If a source is unreachable, record it under §6 "Access gaps" and continue with the rest.
3. **Fan out** to the specialists in parallel with only their slice of the facts.
4. **Merge + rank** by `expected € per month ÷ effort`, discard anything that breaks the 3x gate.
5. **Act:** at most one PR per run (the top no-secret item), `ceo-finance/<slug>`, tests + `margin-report` green. Everything else goes into §5 as a proposal with numbers.
6. **Record:** update §4 (KPIs), §5 (ledger), §8 (changelog) and the one-line pointer in `TheMasterPlan.md` §10.
7. **Notify** (PushNotification) only when something needs the owner: margin gate failing, MRR drop > 10% week on week, a failed-payment or dispute spike, a cost line up > 25%, a vendor saving > €50/mo found, or an access gap blocking the run. Silence otherwise.

## 4. KPIs (the routine fills these in; baseline unmeasured until live)

| KPI                                    | Source                       | Target                    | Latest |
| -------------------------------------- | ---------------------------- | ------------------------- | ------ |
| MRR (EUR) / ARPU                       | `finops-report`, Stripe      | growing, ARPU ≥ €25       | n/a    |
| Revenue ÷ API cost                     | `finops-report`              | ≥ 3x (gate), aim 5x       | n/a    |
| API cost per finished video (std/prem) | `finops-report` by tier      | std ≤ $0.10, prem ≤ $1.10 | n/a    |
| Monthly cash (net rev − API − fixed)   | `finops-report --fixed-usd=` | > 0, then maximise        | n/a    |
| Trial burn per signup                  | `margin-report`              | ≤ $0.25                   | n/a    |
| Trial → paid                           | `metrics-report`             | ≥ 5%                      | n/a    |
| Failed-job cost (burn then refund)     | `render_jobs` failed × cost  | < 3% of API spend         | n/a    |

## 5. Ledger and backlog

### 5.1 Fixed monthly costs (owner fills in; the routine can't see invoices)

| Line                       | € / mo | Notes                                            |
| -------------------------- | ------ | ------------------------------------------------ |
| Vercel (Hobby/Pro)         | ?      | Check `list_billing_charges` once connected      |
| Supabase (free/Pro)        | ?      |                                                  |
| ElevenLabs plan            | ?      | Custom-voice slots are capped per plan (§8 risk) |
| Resend, Sentry, domain     | ?      |                                                  |
| Claude Code routines / API | ?      | Routines run on the owner's subscription         |

### 5.2 Backlog (proposals; each needs measured numbers before a PR)

1. **Measure real costs first.** Costs in `models.ts` are researched list prices. Run `live-providers-smoke.mts` once with `FAL_KEY`, store measured cost per step, and lower/raise `costUsdPerUnit`. Everything below depends on this.
2. **fal.ai video is the biggest variable cost (Premium).** Candidates to price-check against Kling 2.5 Turbo Pro (~$0.07/s): Wan 2.x, Seedance, LTX-2 Fast (~$0.04/s), Hailuo; direct vendor APIs or other hosts (Replicate, Together, Runware, WaveSpeed, Novita) that resell the same open models cheaper; self-hosting an open model on a rented GPU only above steady volume. **Hero-shot** (AI clip on scene 1 only) already cuts a 15s Premium video to ~$0.45; sell it as a mid tier.
3. **Images:** FLUX schnell is $0.003 per image already; compare Runware/other hosts and a pre-generated asset library for recurring themes (zero marginal cost).
4. **Voice:** ElevenLabs Flash is ~$0.00075/s; compare Cartesia, Deepgram Aura, OpenAI TTS and Azure/Google neural voices for Standard, keep ElevenLabs for Premium and designed voices.
5. **Script model:** Sonnet-class is $0.04 per script; test a Haiku-class model for Standard with an eval on script quality, and prompt caching for the fixed system prompt.
6. **Caching/reuse:** cache scene images and voice for identical (topic, theme, voice) requests; re-voice and re-render without regenerating images.
7. **Revenue levers:** annual plans (2 months free) for cash up front and lower churn; top-up upsell when balance < 1 video; Premium hero-shot add-on; "series" and "agent" plan features already gated for Pro/Ultra; win-back email for cancelled subs via the existing lifecycle cron; affiliate 30% recurring only after the first 20 paying users.
8. **Leak checks:** trial abuse (multiple accounts), failed-job burn before refund, refund/dispute rate, chargebacks, Stripe fee tiers (Stripe Tax / VAT handling), unused vendor seats.

## 6. Access and connectors

Already connected (claude.ai): **Supabase**, **Stripe (test mode)**, **Vercel**, **GitHub**.

| Gap / suggestion                                  | Why                                                                                                                                                                     | Who   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Stripe **live** mode, read-only restricted key    | Real MRR/churn instead of sandbox zeros. Read-only scope: charges, subscriptions, invoices, balance                                                                     | Owner |
| Supabase connector failed from the cloud (proxy)  | Needed for `finops-report` and trial/churn queries. Re-authenticate it; or add `SUPABASE_SERVICE_ROLE_KEY` to the routine environment (secret, read by the report only) | Owner |
| fal.ai usage/billing                              | No connector. Export monthly usage CSV, or give a read-only key; the routine reads `fal` cost per job from `render_jobs` meanwhile                                      | Owner |
| ElevenLabs / Anthropic usage                      | Same: usage CSV or admin read key (Anthropic Admin API usage + cost reports)                                                                                            | Owner |
| Optional: PostHog or Plausible connector          | Funnel → paid conversion, to judge pricing-page experiments                                                                                                             | Owner |
| Optional: a spreadsheet (Google Sheets) connector | A running cost ledger (§5.1) the owner can edit without touching git                                                                                                    | Owner |

Routine environment must allow outbound HTTPS to vendor pricing pages (direct
provider pages were blocked once, see `TheMasterPlan.md` §7); if blocked, the
Vendor scout reports it as an access gap rather than guessing prices.

## 7. Routine setup (owner, once)

Claude cannot create cloud routines from a session. At
<https://claude.ai/code/routines> → New routine: name **Shortcraft Finance CEO**,
repo `TudorFnsn/Shortcraft`, model Opus 5.5, schedule daily 12:00 UTC, connectors
Supabase + Stripe + Vercel + GitHub, then paste:

```
You are the DM (master agent) of Shortcraft's Finance CEO routine. Goal: maximise
cash return — grow MRR, cut cost per finished video, keep every product >= 3x
margin. Follow FinancePlan.md §1-§3 exactly. Read FinancePlan.md, TheMasterPlan.md
§7-§10 and AGENTS.md first (this Next.js has breaking changes: read
node_modules/next/dist/docs/ before writing code). List open and recently closed
PRs before choosing work. Gather facts once (finops-report, margin-report,
metrics-report, Stripe/Vercel/Supabase read-only), then spawn the six specialists
in FinancePlan §2 in parallel, merge their findings into one ranked list, and open
at most one PR on ceo-finance/<slug> for the top item that needs no secrets or
owner decision. Never merge; never write to Stripe/Supabase/Vercel; never touch UI
files. Update FinancePlan.md and one line in TheMasterPlan.md §10. If a data source
is unreachable, log it under §6 and continue. Send a PushNotification only for the
conditions in FinancePlan §3.7; otherwise stay silent.
```

## 8. Changelog (newest on top)

- **2026-10-15** — Plan and tooling created: `features/metrics/finops.ts` (MRR, ARPU, realised API cost per tier, monthly cash), `scripts/finops-report.mts` (read-only), +3 tests. Routine not yet scheduled (owner step, §7). (interactive)
