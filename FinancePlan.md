# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on money (pricing, provider cost, MRR, cash). Every finance PR
> updates this file (KPIs, backlog, changelog) in the same change.
>
> Last updated: 2026-10-18 (created, interactive; routine not yet created)

---

## 1. Charter

**Purpose:** maximise profit and cash return. Every run answers four questions, in order:

1. **What is MRR doing?** (new, expansion, contraction, churned, net new; trial → paid; ARPU.)
2. **What does one video cost vs what it earns?** (tokens/units and dollars per step, credits charged, net revenue per credit.)
3. **What else do we pay for?** (every fixed and variable bill, see §4.)
4. **What is the single change that returns the most cash soonest?** (price, model swap, plan limit, packaging, cheaper host, cut a bill.)

**Autonomy: PR-gated, same as the CEO routines.**

- Allowed unattended: read-only analysis (Supabase `select`, Vercel billing/usage reads, Stripe reads once reconnected), web research, pure-code changes on `ceo-finance/<slug>` branches with tests (catalog rows, adapters behind flags, reports, copy), doc updates, PRs.
- Needs the owner's explicit OK first: any DB write or migration, any Stripe object/price/live-mode change, any change that raises a customer price or lowers a plan allowance, switching a production provider, buying or cancelling a service, touching secrets.
- Never: merge, enable live providers while the margin gate fails, push to `main`.
- Hard rule inherited from the master plan: **`npx tsx scripts/margin-report.mts` must stay ≥ 3x on every product** (Pro currently sits at exactly 3.0x). Any change to `models.ts` / `plans.ts` runs it.
- Does not edit UI files while a `ceo-design/*` PR is open (see `DesignPlan.md` §5); proposes copy/layout needs there instead.

**Cadence:** one daily cloud routine, 07:00 UTC (after the 06:00 CEO, before the 09:00 Design CEO). Weekly on Mondays it also produces the full MRR + cost digest.

---

## 2. KPI definitions (use exactly these, so runs are comparable)

| KPI                      | Definition                                                                                                    | Source                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **MRR**                  | Sum of monthly-normalised price of active subscriptions (yearly ÷ 12), net of discounts, excl. VAT, in EUR    | Stripe (subscriptions); fallback `subscriptions` + `PLANS`  |
| MRR movement             | New + expansion − contraction − churned = net new, per week                                                   | Stripe events / `subscriptions`                             |
| ARPU, paid conversion    | MRR ÷ paying subs; trial → paid (reuse `scripts/metrics-report.mts`)                                          | metrics-report                                              |
| **Gross margin / video** | (credits charged ÷ credits-per-EUR of the plan − VAT − Stripe fee) − `api_cost_usd`                           | `render_jobs`, `credit_transactions`                        |
| **Cost per finished video** | Mean `api_cost_usd` for `done` jobs by tier and length, **plus** a failed-job cost (spent, then refunded)  | `render_jobs`                                               |
| Units per video          | Claude input/output tokens, images (MP), voice characters, AI-video seconds, render seconds                   | per-step usage (see §3 gap) + `render_jobs`                 |
| Breakage                 | Credits granted − credits spent at period end (unused credits are free margin; do not "fix" this)            | `credit_transactions`                                       |
| **Burn & runway**        | Fixed bills (§4) + variable provider spend − collected revenue; months of runway at current cash             | §4 + Stripe balance                                         |
| Blended margin           | (Net revenue − all provider spend − fixed bills) ÷ net revenue                                                | all of the above                                            |

Reporting rule: if a number is estimated (list price × usage) say so. `api_cost_usd` is **list price × measured usage, not an invoice** (master plan §5). Prefer invoiced totals from the provider dashboards once the owner supplies them.

---

## 3. Data gaps to close (ask the owner / build)

1. **Per-step usage isn't stored.** `render_jobs` keeps one `api_cost_usd` per job. To answer "tokens vs spend per video" the orchestrator should persist per-step usage (Claude input/output tokens, image MP, voice chars, clip seconds, render seconds, step cost). Proposal: additive migration `0013_job_usage` (`render_job_usage` table: job_id, step, provider, units jsonb, cost_usd). **Needs owner approval to apply.** Until then the routine reconstructs units from scene counts × catalog.
2. **Invoiced provider spend.** Owner to send, monthly (or connect a source): fal.ai, ElevenLabs, Anthropic, Supabase, Vercel, Resend, domain, Sentry totals. The 2026-10-08 request in the master plan (three totals) is still open.
3. **Stripe is `needs_reconnect`** in claude.ai connectors (2026-10-18) and only sees the sandbox. Reconnect, and add the live account when going live; MRR is unmeasurable until then (no paying users yet, so MRR = €0 today).
4. **Provider cost reality.** `costUsdPerUnit` values are list prices. Measure on real calls (smoke script) before repricing.

---

## 4. Cost ledger (every payment; the routine keeps this current)

Status as of 2026-10-18. Amounts marked `?` are unknown: the owner fills them in.

| Item                    | Type     | Cost today                                              | Notes / lever                                                                                        |
| ----------------------- | -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| fal.ai (FLUX images)    | variable | $0.003 / standard image, $0.025 / premium (per MP)      | Cheap already. Check Runware/Replicate for FLUX schnell at parity                                    |
| fal.ai (AI video)       | variable | Kling 2.5 Turbo Pro ~$0.07/s billed, catalog $0.12/s    | **Biggest line.** See §5                                                                             |
| Anthropic (script)      | variable | ~$0.04 / video (Sonnet 5.5 $2/$10 per MTok)             | Try Haiku-class + prompt caching; likely <$0.01                                                      |
| ElevenLabs              | variable + plan | Flash v2.5 ~$0.05/1k chars + subscription (`?`)  | Custom-voice slots force a paid plan. Cheaper TTS exists, see §5                                     |
| Render (ffmpeg)         | variable | ~$0.01 / video on Vercel compute                        | In-house. Watch function duration on Vercel billing                                                  |
| Vercel                  | fixed    | Hobby €0 (`?` once commercial use needs Pro)            | Hobby bars commercial use: Pro is $20/seat/mo, **budget for it at first revenue**                    |
| Supabase                | fixed    | Free (`?`)                                              | Free pauses idle projects and has no backups; Pro $25/mo at launch                                   |
| Stripe                  | variable | ~1.5% + €0.25 (EU cards) to ~3.25% + €0.25 (non-EU)     | Margin gate already deducts it. Tax: Stripe Tax adds 0.5% per transaction                            |
| Resend                  | fixed    | Free (100/day)                                          | Free until volume                                                                                    |
| Sentry                  | fixed    | Free tier (`?`)                                         | Check event quota                                                                                    |
| Domain                  | fixed    | `?`                                                     | None bought yet (`shortcraft-rho.vercel.app`)                                                        |
| Claude Code routines    | fixed    | included in owner's plan (`?`)                          | Three routines run daily; count them in burn                                                         |

Trial burn (acquisition cost per signup): **$0.14** (margin report 2026-10-05).

---

## 5. Opportunity backlog (ranked by cash return per effort; routine re-ranks every run)

Prices below are from vendor/reseller comparison pages (2026-10-18) and disagree with each other; **every one needs verifying on the provider's own pricing page and one measured call before a switch.**

### A. AI video cost (Premium tier) — the one line that can hurt margin

Today: Kling 2.5 Turbo Pro on fal at ~$0.07/s billed in fixed 5s clips; catalog assumes $0.12/s; charge 1,420 cr/s.

| Option                                           | Indicative cost            | Note                                                                                  |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------- |
| Hailuo 2.3 on Runware                            | ~$0.28 / 6s (~$0.047/s)    | Cheapest listed; bills fixed 6s runs, so use a 6s slot                                |
| Seedance 2.0 Mini / Fast via BytePlus or resellers | ~$0.022–0.09/s           | Wide spread; reseller risk (uptime, ToS). Test quality first                          |
| Wan (Alibaba Cloud / open weights)               | ~$0.08/s at 720p           | Open weights allow self-hosting on rented GPUs at volume                              |
| Kling 3.0 direct                                 | ~$0.084/s, no audio        | Same family as today, maybe no fal markup                                             |
| LTX-2 Fast (fal)                                 | ~$0.04/s                   | Lower quality; fine for non-hero scenes                                               |
| **Hero-shot tier** (AI clip on scene 1 only)     | ~$0.45 / 15s video         | ~1/3 of the cost; already modelled in master plan §7. **Biggest lever, no vendor swap** |

Cheapest sequence: (1) measure true Kling $/s from the fal invoice → lower the catalog's $0.12 to the measured figure (Pro gets headroom), (2) ship the hero-shot tier as the default Premium, (3) add a second video provider behind the existing `fal:video` adapter contract (a `runware:video` / `byteplus:video` adapter plus `FAL_VIDEO_MODEL`-style env), route by cost, fall back to fal on failure.

### B. Other unit costs

- **Voice:** ElevenLabs list is ~$100–300 per 1M chars. Alternatives: OpenAI gpt-4o-mini-tts ~$15/1M, Cartesia/Inworld ~$35/1M, Fish Audio ~$5–15/1M, Hume ~$7.6/1M, Kokoro self-hosted ~$0. Voice is only ~$0.01/video today, so it saves little per video; the real prize is **dropping the ElevenLabs paid plan** if saved/designed voices move to another vendor. Low priority until voice spend is invoiced.
- **Script:** try a Haiku-class model + prompt caching for the system prompt. ~$0.04 → <$0.01 per video. Small, safe, one adapter change.
- **Images:** keep schnell for Standard. Test Runware/Replicate for parity pricing only if image spend shows up on the invoice.
- **Failed-job waste:** refunded jobs still cost provider money. Measure the rate; add cheap pre-checks (moderation already runs before spend) and cap retries.

### C. Revenue side (the MRR levers)

- **Annual plans** (prepay, ~2 months free): pulls cash forward and cuts churn. `stripePriceIdYearly` already exists in `PLANS`. Needs new Stripe prices (owner OK).
- **Pricing test:** Standard carries a ~9x margin (Starter 9.4x). Room to either raise the Starter allowance's perceived value or test a higher price on Pro/Ultra. Never lower below 3x.
- **Free-trial funnel:** 3,000 credits cost $0.14. Measure trial → paid; if it's low, raise the trial slightly (cheap) before touching price.
- **Upsell hooks:** hero-shot Premium as add-on credits; top-up nudge when a balance is below one video (lifecycle email already exists).
- **Breakage is margin:** do not shrink plans to "use credits better"; the worst case (all credits burned) is what the gate protects.
- **Churn:** dunning (Stripe Smart Retries on), cancel-flow survey, pause instead of cancel.
- **Affiliates:** 30% recurring (master plan §6) is a cost: model it into net revenue before launching.
- **Currency:** pricing is EUR, provider costs are USD. Track the EUR/USD rate in the margin assumptions.

### D. Fixed-cost discipline

- Delay Vercel Pro and Supabase Pro until the first paying customer, then buy both together (commercial-use terms, backups).
- Cloudflare R2 for media (no egress fees) is already on the roadmap; only worth it once storage/egress shows on the Supabase or Vercel bill.
- Retention policy for old renders (storage cost grows linearly with videos).

---

## 6. Tools, connectors and add-ons that would sharpen this routine

Installed now (checked 2026-10-18): **Supabase** (connected), **Vercel** (connected; has `list_billing_charges`, `list_contract_commitments`, usage and runtime logs), **Firecrawl** (connected, not enabled in chat; useful for reading provider pricing pages that block the sandbox's plain fetches), **Stripe** (`needs_reconnect`, sandbox only).

Recommended, in order of value:

1. **Reconnect Stripe, then add the live account** (read-only restricted key if possible). Unlocks real MRR, churn, refunds, fees, payouts, Sigma queries.
2. **Enable Firecrawl in the routine's connector list.** Provider pricing pages block the cloud network (master plan §7); Firecrawl avoids relying on search snippets.
3. **A read-only Postgres role** for the routine (select on `render_jobs`, `credit_transactions`, `subscriptions`, `profiles`) as `FINANCE_DATABASE_URL`, instead of the service-role key. Keeps `metrics-report.mts` working without a god key.
4. **Provider usage/billing access, read-only:** fal.ai usage API key, ElevenLabs API key with `user_read` + usage, Anthropic Admin API key (usage & cost report). Store as routine secrets, never in the repo.
5. **Sentry connector** (event volume vs quota) and a **PostHog** (or similar) project for funnel conversion; both are free tiers.
6. **Accounting source:** Google Drive/Sheets connector (or Wise/bank CSV drop) for the bills that have no API (domain, subscriptions).
7. Claude tooling: scheduled-routine **memory file** (this document is it), the `anthropic-skills:xlsx` skill for the monthly P&L spreadsheet, `anthropic-skills:deep-research` for pricing sweeps, and the `claude-api` skill when touching the script adapter (caching, model ids).

---

## 7. Routine definition — "Shortcraft Finance CEO"

Create at https://claude.ai/code/routines (same settings as the CEO routines): repo `TudorFnsn/Shortcraft`, daily 07:00 UTC, PR-gated, Opus 5.5 for the DM, connectors Supabase + Vercel + Stripe + Firecrawl + GitHub, outbound network to provider domains allowed, environment variable `FINANCE_DATABASE_URL` if available.

### DM (master agent) prompt — paste as the routine prompt

```
You are the Finance CEO of Shortcraft, running unattended as the DM (master
agent). Goal: maximise profit and cash return. Read FinancePlan.md,
TheMasterPlan.md (§7 money, §8 risks, §9 ops, §10 changelog) and AGENTS.md first.
Next.js in this repo has breaking changes: read node_modules/next/dist/docs/
before writing code.

Autonomy is PR-gated. Never merge, never push to main, never touch live secrets,
never write to the DB or Stripe, never enable live providers while
`npx tsx scripts/margin-report.mts` fails. Anything that raises a customer price,
lowers an allowance, switches a production provider or needs a migration is a
PROPOSAL for the owner, not an action. Before picking work, list open and
recently closed PRs (GitHub tools); an item with an open PR is in review. Branches
are `ceo-finance/<slug>`. Leave UI files alone while a `ceo-design/*` PR is open.

Step 1, gather (parallel, read-only). Split into sub-agents with the Agent tool,
each returning a compact JSON summary, never raw dumps:
  A. Revenue: Stripe MRR and movement (new/expansion/contraction/churn), refunds,
     fees, payouts; fall back to `subscriptions` + PLANS. Run
     `npx tsx scripts/metrics-report.mts --json`.
  B. Unit economics: read `render_jobs` (tier, length, scenes, credits,
     api_cost_usd, status, failure) and compute cost and margin per finished video
     and the cost of failed/refunded jobs; run `scripts/margin-report.mts`;
     compare catalog costUsdPerUnit with measured/invoiced figures.
  C. Bills: Vercel billing/usage (`list_billing_charges`), Supabase plan/usage and
     advisors, provider dashboards the owner has exposed; update the §4 ledger.
  D. Market scan (rotate focus daily: video models, TTS, images, LLM, hosting,
     pricing/packaging of competitors such as TrendStory/Captions/InVideo): find
     cheaper or better options, new models, new techniques (caching, batching,
     hero-shot, resolution/length tuning, self-hosted open weights). Use Firecrawl
     on official pricing pages; label every price with its source and date;
     snippets and reseller pages are indicative only.
Step 2, decide. Rank the §5 backlog by (expected monthly cash gain x confidence)
/ effort, using the numbers from step 1. Check MRR first: if MRR is 0 or flat,
bias toward conversion and cash-in-advance (annual plans, trial funnel, pricing
tests) over cost shaving; if MRR grows, bias toward margin.
Step 3, act. Pick ONE highest-leverage item that needs no owner approval and open a
PR (pure code + tests; run format:check, lint, typecheck, test, and the margin
report before pushing). Examples: catalog cost corrections from measured data, a
new provider adapter behind a flag, per-step usage logging code (migration only
proposed), a finance report script, cheaper script model with caching.
Step 4, report. Update FinancePlan.md (KPIs table with dated values, §4 ledger,
§5 re-ranked, changelog) and add one line to TheMasterPlan §10. Then call
PushNotification ONLY if: MRR dropped or a payment failed/disputed, the margin gate
fails or any product falls under 3x, a provider price change or invoice breaks
the plan, a bill spikes >25% week over week, or there is a decision/data request
the owner must act on (put the ask first). Silence on a quiet day.
Always list what you need from the owner under "Asks" (invoice totals, connector
reconnects, approvals).
```

### Sub-agent roles (spawned by the DM with the Agent tool)

| Agent            | Reads                                   | Returns                                                         |
| ---------------- | --------------------------------------- | --------------------------------------------------------------- |
| `revenue`        | Stripe, `subscriptions`, metrics-report | MRR, movement, churn, ARPU, trial → paid, refunds, fees         |
| `unit-economics` | `render_jobs`, margin report, `models.ts` | €/$ per video by tier, failed-job cost, gate multiples        |
| `bills`          | Vercel, Supabase, provider usage        | Updated §4 ledger, week-over-week deltas, runway                |
| `market-scan`    | Web (Firecrawl, search)                 | Ranked cheaper/better options with sourced prices and risks     |
| `implementer`    | repo                                    | The one PR (code + tests), spawned only after the DM has chosen |

The DM never does the sub-agents' reading itself; it only decides, reviews and reports.

---

## 8. KPI log (the routine appends a dated row per run)

| Date       | MRR (EUR) | Paying subs | Net new MRR | Cost / 15s Standard | Cost / 15s Premium | Worst gate multiple | Monthly burn | Notes                         |
| ---------- | --------- | ----------- | ----------- | ------------------- | ------------------ | ------------------- | ------------ | ----------------------------- |
| 2026-10-18 | 0         | 0           | 0           | ~$0.04 (measured)   | ~$1.1–1.9 (est.)   | 3.00x (Pro)         | `?`          | No paying users; Stripe sandbox only |

---

## 9. Changelog (newest on top)

- **2026-10-18** — Created the finance track: charter, KPI definitions, data gaps, cost ledger, ranked backlog seeded from a first market scan, connector recommendations, and the DM + sub-agent routine prompt. No code or migration. (interactive)
