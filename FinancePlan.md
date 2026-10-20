# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO**
> routine. It sits under `TheMasterPlan.md`: the master plan wins on product and
> priority, this file wins on cost, pricing, providers and cash. Every finance
> PR updates this file (baseline, ideas table, changelog) in the same change.
>
> Last updated: 2026-10-20 (track created)

---

## 1. Charter (owner request 2026-10-20, do not change without Tudor)

| Question | Owner's answer                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal     | **Maximum profit, cash first.** Cheapest provider that keeps quality; revenue ideas that bring cash in sooner (annual plans, top-ups, fewer refunds).    |
| Always   | Check the **MRR ratio** (total cost ÷ net MRR) and the cost of a video vs the credits charged for it, before proposing anything.                         |
| Scope    | Every euro in and out: model APIs (fal.ai, ElevenLabs, Anthropic), hosting (Vercel, Supabase), Stripe fees + tax, email, error tracking, domains, tools. |
| Autonomy | **Analysis + PR-gated code.** Branches `ceo-finance/<slug>`. Never merge. No live provider, price or Stripe change without Tudor's OK in the PR.         |
| Cadence  | Daily cloud routine **"Shortcraft Finance CEO"**; suggested 07:00 UTC (after the main CEO at 06:00, before Design at 09:00).                             |
| Style    | A **master agent** reads this file and splits the day's work across specialist sub-agents (§3), then merges their findings into one PR + one digest.     |

### Money principles

1. **Measure before you move.** The catalog's `costUsdPerUnit` are researched list prices, not measured ones (MasterPlan §7). The first job is to compare them to `render_jobs.api_cost_usd`.
2. **The 3x gate is law.** `npx tsx scripts/margin-report.mts` must pass after any price or provider change. A cheaper provider only counts when the gate still passes on it.
3. **Quality floor.** A cheaper model is only a win if a blind side-by-side on our 9:16 themes is not worse. Never swap on price alone.
4. **Cash beats margin points.** Prefer money in the bank sooner (annual prepay, top-ups) and fewer chargebacks/refunds over a slightly better ratio.
5. **No fabricated numbers.** Every price in a proposal carries a source and a date. If a page is unreachable, say so and mark the figure unverified.

---

## 2. Measurement (what the routine runs every day)

| Command                                                    | Reads                           | Gives                                                                               |
| ---------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `npx tsx scripts/finance-report.mts --fixed-usd <N>`       | Supabase (service role, select) | MRR/ARR, net MRR, 30-day API cost per tier, cost per video, failed-job waste, ratio |
| `npx tsx scripts/margin-report.mts`                        | catalog only                    | Worst-case revenue ÷ cost per plan and top-up (the 3x gate), trial burn             |
| `npx tsx scripts/metrics-report.mts --json`                | Supabase                        | North star, activation, trial → paid, failure rate                                  |
| Stripe connector (read): balance, charges, refunds, fees   | Stripe                          | Real top-up revenue, fees paid, refunds/disputes, MRR cross-check                   |
| Vercel connector (read): `list_billing_charges`, usage     | Vercel                          | Hosting bill vs the Hobby/Pro limits                                                |
| Anthropic / fal.ai / ElevenLabs usage pages or billing API | Provider dashboards             | **Actual invoice** per provider, to compare with our metered `api_cost_usd`         |

`finance-report` definitions live in `src/features/metrics/finance.ts` (pure, tested).
**Metering gap:** `api_cost_usd` is our estimate at call time. The routine
reconciles it against the provider invoices weekly; a drift above 15% is
itself a finding (the catalog price is wrong).

**Token view.** Per finished video the routine reports: scripting tokens in/out
(Anthropic usage), images, video seconds, TTS characters, render seconds, and
the USD each cost, so the biggest line is obvious. Until usage is logged per
step, derive it from the catalog quantities in `jobBill` and flag "unmetered".
A first PR may add per-step usage to the job row (needs a migration; owner applies it).

---

## 3. The team (master agent + specialists)

The Finance CEO is the **master agent**. It does not do the deep work itself;
it reads this file, runs §2, picks the day's top 1–3 questions, and spawns the
specialists below **in parallel** (one `Agent` call each, independent scopes, no
shared writes). It then verifies their claims, writes the PR and the digest.

| Specialist                 | Question it answers                                                                                            | Reads / tools                                                | Writes                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| **Cost Auditor**           | Where does each video's money go? Measured vs catalog cost, failed-job waste, per-step share, drift vs invoice | DB reports, provider billing, `models.ts`, `margin.ts`       | §4 baseline, a drift table                            |
| **Provider Scout**         | Is there a cheaper video / image / voice / script option at equal quality? New releases this month?            | WebSearch/WebFetch of provider pages, fal.ai model catalog   | §5 ideas table (price, source, date, quality verdict) |
| **Pricing & Revenue**      | Are plan prices, grants, trial, top-ups and annual plans leaving money on the table? Churn/refund leaks?       | Stripe (read), metrics, `plans.ts`, competitor pricing pages | §5 ideas table, a pricing sheet                       |
| **Infra & SaaS Spend**     | Are hosting, DB, email, monitoring bills right-sized? Free-tier ceilings, plan limits, renewals?               | Vercel, Supabase, Resend, Sentry connectors/dashboards       | §4 fixed-cost table                                   |
| **Implementer**            | Builds the one approved/safe change (adapter, config, script, migration file) with tests                       | Repo, `npm test`, `typecheck`, `lint`                        | Code on `ceo-finance/*`                               |
| **Reviewer** (fresh agent) | Tries to break the Implementer's change and the Scout's numbers; does not see their conclusions                | The diff only                                                | Findings to the master                                |

Rules for the master:

- **Split by independence.** Give each specialist the question, the file paths, what is already ruled out (read §5 first) and the output format. Never hand over a conclusion to be confirmed.
- **Verify before relaying.** A specialist's price is a claim: re-open the source, or label it unverified.
- **One PR a day at most**, and not while a `ceo-finance/*` PR is open on the same item. List open and recently closed PRs first (the main CEO's duplicate-PR lesson, MasterPlan §9).
- **Stay out of UI files** while a `ceo-design/*` PR is open (DesignPlan §5) and don't touch roadmap items the main CEO has an open PR for.

---

## 4. Baseline (fill in from the first measured run; update every run)

Known from the repo on 2026-10-20 (no live data was readable from the cloud
session when this track was created):

- **Plans:** Starter €14.99 / 30k cr, Pro €29.99 / 100k, Ultra €79.99 / 250k. Top-ups 20k €12, 60k €29, 150k €59. Trial 3,000 credits (≈ $0.14–0.25 burn).
- **Net revenue per sale** (margin gate assumptions: 20% VAT, 1.5% + €0.25 Stripe, 1.08 USD/EUR): Starter ≈ $12.98, Pro ≈ $26.24, Ultra ≈ $70.43 (recompute with `netRevenueUsd`).
- **Variable cost drivers (catalog, unmeasured):** Standard video ≈ $0.07 for 15s (FLUX schnell images + ElevenLabs voice + in-house ffmpeg). **Premium AI video ≈ $1.10 per 15s** (Kling 2.5 Turbo Pro on fal.ai, ~$0.07/s) and is the one expensive line. Script ≈ $0.04 (Claude Sonnet 5.5).
- **Fixed costs to confirm with the owner:** Vercel (**Hobby is non-commercial per Vercel's terms, so Pro, about $20/mo per seat, is likely needed before real revenue**: verify on the pricing page), Supabase (free vs Pro $25), ElevenLabs plan (custom-voice slots, §8 risk), Resend, Sentry, domain, Stripe Tax.

| Line (monthly)                    | Plan / tier     | USD | Source              | Verified |
| --------------------------------- | --------------- | --- | ------------------- | -------- |
| Vercel                            | _owner to fill_ |     |                     | no       |
| Supabase                          | _owner to fill_ |     |                     | no       |
| ElevenLabs (subscription + usage) | _owner to fill_ |     |                     | no       |
| fal.ai (usage)                    | _from invoice_  |     |                     | no       |
| Anthropic (usage)                 | _from invoice_  |     |                     | no       |
| Resend / Sentry / domain / other  | _owner to fill_ |     |                     | no       |
| **Total fixed**                   |                 |     | feeds `--fixed-usd` |          |

**Latest ratio:** _not measured yet._ MRR €?, net MRR $?, API cost $?, cost ÷ net MRR ?%. First run replaces this line.

---

## 5. Ideas backlog (the Scout and Pricing specialists keep this ranked by expected cash per effort)

Status: `todo` · `researching` · `pr` · `shipped` · `rejected (why)`. Every row needs a source and a date before it can leave `todo`.

| #   | Idea                                                                                                                                                                                                  | Expected effect                                  | Needs                                  | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- | ------ |
| 1   | **Measure first:** reconcile `api_cost_usd` with fal/ElevenLabs/Anthropic invoices; set `FAL_KEY` smoke run for real unit costs                                                                       | Replaces every guess below                       | Billing access (§6)                    | todo   |
| 2   | **Premium video alternatives** to Kling 2.5 on fal.ai: Wan 2.x, LTX-2 Fast, Seedance, Hailuo, Veo Fast; also Replicate, Runway, Luma, WaveSpeed, Novita, and self-hosting open models on RunPod/Modal | Premium is ~95% of cost per premium video        | Scout + blind quality test             | todo   |
| 3   | **Hero-shot premium** (AI clip on scene 1, stills for the rest): ≈ $0.45 vs $1.10 per 15s, already modelled in MasterPlan §7                                                                          | -60% premium cost, near-Standard price point     | Live video adapter measured            | todo   |
| 4   | **Cache + reuse:** don't regenerate identical scene images/clips (same prompt+seed), re-voice reuses scenes (already built)                                                                           | Cuts failed-retry and rerun spend                | Per-step usage logging                 | todo   |
| 5   | **Script model right-sizing:** Haiku-class for scripting, prompt caching for the fixed system prompt, Batch API for non-urgent jobs                                                                   | Script is small now, grows with agent/series     | Quality check on scripts               | todo   |
| 6   | **Voice alternatives:** compare ElevenLabs Flash v2.5 with OpenAI TTS, Cartesia, Deepgram Aura (word timings needed for captions)                                                                     | Voice is cheap per second but scales with volume | Timestamps support, voice quality test | todo   |
| 7   | **Annual plans** (e.g. 2 months free): cash up front, lower churn; `stripePriceIdYearly` already exists in `plans.ts`                                                                                 | Cash now, +retention                             | Owner OK on price, Stripe price        | todo   |
| 8   | **Usage ceilings:** soft cap on premium per plan, per-user daily cost alarm, abuse/velocity checks on the free trial                                                                                  | Protects margin from heavy users and trial abuse | Migration (owner applies)              | todo   |
| 9   | **Top-up nudges** at <20% balance and at the end of a rendered video; "buy the next pack" on an insufficient-credits screen                                                                           | More one-off cash per active user                | Design CEO for UI                      | todo   |
| 10  | **Dunning + win-back:** Stripe Smart Retries, failed-payment emails, cancel-flow offer (pause / downgrade)                                                                                            | Recovers 20–40% of failed renewals (verify)      | Stripe settings, Resend                | todo   |
| 11  | **Stripe cost:** check fee tier, Link/SEPA for EU lower fees, Stripe Tax cost vs VAT-inclusive pricing, currency conversion                                                                           | Fee saving per €                                 | Stripe read access                     | todo   |
| 12  | **Affiliate/referral economics:** cap payouts so CAC stays < first-month net revenue                                                                                                                  | Safe growth                                      | Owner OK                               | todo   |
| 13  | **Right-size infra:** pause unused Supabase branches, prune Storage (final videos older than N days for free users), CDN egress                                                                       | Fixed-cost trim                                  | Supabase/Vercel read                   | todo   |
| 14  | **Price tests:** raise Starter or cut its grant; remove the lowest-margin shape from Starter; add a €9.99 mini plan with stills only                                                                  | ARPU                                             | Measured costs, owner OK               | todo   |

---

## 6. Access the routine needs (checklist for Tudor)

The cloud routine can only see what its environment gives it. Status on
2026-10-20, from the session that created this file:

| Need                                                         | Why                                          | Status                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft`                           | Read code, open `ceo-finance/*` PRs          | Connected                                                                                                                                                                                                                                                                                          |
| Stripe connector                                             | Real revenue, fees, refunds, MRR cross-check | **Needs authorization** (claude.ai → Settings → Connectors → Stripe)                                                                                                                                                                                                                               |
| Supabase connector                                           | Read-only SQL for the reports                | **Failed to connect from the cloud** (proxy tunnel error): re-authorize/retry                                                                                                                                                                                                                      |
| Vercel connector                                             | Hosting bill, usage, runtime errors          | Connected                                                                                                                                                                                                                                                                                          |
| Read-only DB role for the routine                            | Run `finance-report` without the service key | Recommended: create a `select`-only Postgres role, store as a secret                                                                                                                                                                                                                               |
| Provider billing read access (fal.ai, ElevenLabs, Anthropic) | Reconcile metered cost vs invoices           | Not set up: paste monthly invoice totals into §4, or add read-only keys                                                                                                                                                                                                                            |
| Network egress to provider pricing pages                     | Verified prices                              | Direct pages were blocked in earlier routines (MasterPlan §7): ask for these domains on the environment allowlist: `fal.ai`, `elevenlabs.io`, `replicate.com`, `runwayml.com`, `lumalabs.ai`, `together.ai`, `runpod.io`, `modal.com`, `vercel.com`, `supabase.com`, `stripe.com`, `anthropic.com` |
| Fixed-cost figures (§4 table)                                | The cost half of the MRR ratio               | **Owner to fill**                                                                                                                                                                                                                                                                                  |

### Connectors, tools and add-ons that would help

- **Stripe** (have, authorize): revenue truth; Sigma for MRR/churn cohorts if enabled. **Stripe Billing analytics** for MRR movement.
- **Supabase** (have): read-only SQL; later a view `finance_daily` (cost per job per day) so reports don't page the whole table.
- **Vercel** (have): billing charges and usage per project.
- **PostHog** (planned in MasterPlan): visitor → trial → paid funnel and CAC by channel. Needed before any paid-ads decision.
- **A spreadsheet/doc connector (Google Sheets):** keep a human-readable monthly P&L the owner can edit (fixed costs, invoices) and the routine can read.
- **fal.ai MCP / docs search, Context7 (docs lookup):** current model catalog and API shapes without scraping.
- **An accounting feed** (Wise/Revolut/Qonto business, or Pennylane/Xero) read-only: actual cash in/out, the final word on "cash return".
- **Claude tools:** `WebSearch` (extended mode for provider scouting), `Agent` (specialists), `Workflow` for a weekly deep audit, a `/loop` check on margin drift, and the `claude-api` skill for Anthropic pricing/caching/batch details.

---

## 7. Guardrails

- Read-only on connectors by default. **Any write** (migration, price, Stripe object, provider key, live mode) needs Tudor's explicit OK; migrations land as files in a PR and the owner applies them.
- Never print or commit a secret. Never put a key in a PR body or the digest.
- A provider swap ships behind the registry, off by default, with the margin gate passing on measured costs and a quality note. The old adapter stays until a week of data says the new one is not worse.
- No claim without a source and date. No "flake" or "probably" prices in the plan: mark `unverified`.
- Do not weaken the 3x gate, the moderation screens or the refund-on-failure rule to improve a ratio.

---

## 8. Daily run (what the routine does)

1. Read `TheMasterPlan.md` §5, §7–§9 and this file. List open + recently closed PRs.
2. Preflight (§6): which connectors answer? If something needed is missing, say what and **notify** (that is a finding).
3. Run §2 measurements. Update §4 "Latest ratio".
4. Pick the top 1–3 questions by expected cash per effort (§5). Spawn the specialists in parallel (§3).
5. Verify their numbers; reject anything unsourced.
6. If one safe change is ready: implement on `ceo-finance/<slug>`, add tests, run `format:check`, `lint`, `typecheck`, `test`, `margin-report`, open a PR (never merge), update §4/§5/§9 changelog here and a one-line entry in `TheMasterPlan.md` §10.
7. **Notify only when it matters:** cost-to-MRR over 100%, margin gate fails on measured costs, a provider invoice drifts >15% from metered cost, a >25% week-on-week cost jump, a cheaper provider that passes the quality check, or the routine could not run. Quiet days stay quiet.

---

## 9. Changelog (newest on top)

- **2026-10-20** — Finance track created. Added `features/metrics/finance.ts` + `scripts/finance-report.mts` (read-only MRR, net MRR, 30-day API cost per tier, cost-per-video, failed-job waste, cost-to-MRR ratio) with 3 tests, this plan, and the routine prompt (`docs/routines/finance-ceo.md`). No migration, no dependency, no runtime change. (Finance CEO, setup)
