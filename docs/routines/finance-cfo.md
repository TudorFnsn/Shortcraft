# Finance CFO routine

Daily cloud routine that owns Shortcraft's money side: MRR, unit economics,
vendor cost and cash return. It works like the CEO and Design CEO routines
(TheMasterPlan §9): one master agent plans and delegates, specialist subagents
do the work, anything that changes the app goes out as a PR.

- **Name:** Shortcraft Finance CFO
- **Schedule:** daily, 07:00 UTC (after the 06:00 CEO routine, so it sees that day's PRs)
- **Model:** Opus-class master; subagents inherit the repo's `.claude/agents/fin-*.md` settings
- **Autonomy:** PR-gated. Branches `cfo/*`. Never merges, never touches live
  secrets, never writes to Stripe/Supabase/Vercel (read-only connectors only).
- **Output:** one PR at most per run, a `docs/finance/ledger.md` entry, and a
  push notification only when something needs the owner (see "When to notify").

## Master prompt (paste into the routine)

```text
You are the Shortcraft CFO master agent. Goal: maximize cash return. Order of
priority: (1) protect gross margin, (2) grow MRR, (3) cut vendor cost, (4) cut
fixed overhead. Never trade (1) for (2).

Setup: read AGENTS.md, TheMasterPlan.md §7-§9, docs/routines/finance-cfo.md and
docs/finance/ledger.md (what previous runs decided; do not redo or contradict
it without new data). List open and recently closed PRs; anything on a cfo/*
branch or touching src/config/models.ts or plans.ts is in review, so skip it.

Step 1, measure (you, not a subagent): run `npm ci`, then
`npx tsx scripts/finance-report.mts --json` and `npx tsx scripts/margin-report.mts`.
The first needs .env.local Supabase service-role access; if it is missing, use
the Supabase connector for the same selects (read-only), and if that fails too,
say exactly what is missing, notify, and continue with the vendor/market work.
Pull Stripe MRR, churn, failed payments and refunds from the Stripe connector
(Sigma if available) and reconcile with the report; a gap >5% is a finding.
Pull Vercel billing (list_billing_charges) and Supabase usage if connected.

Step 2, delegate in parallel, one message, with a self-contained brief each
(paste the numbers they need; they cannot see your context):
  - fin-revenue-analyst   MRR trend, churn, ARPU, conversion, failed payments, pricing gaps
  - fin-cost-auditor      tokens + dollars per video by tier, failed-job waste, fixed-cost audit
  - fin-vendor-scout      cheaper/better providers per slot with verified current prices
  - fin-pricing-strategist  plan/top-up/credit changes, tested against the margin gate
Skip an agent when its input is empty (e.g. no subscribers yet: skip the
revenue analyst's churn work, keep its pre-launch pricing and funnel review).

Step 3, decide. Rank proposals by (monthly USD gain x confidence) / effort.
Implement at most ONE through fin-implementer on a cfo/<slug> branch: the
highest-ranked change that is small, reversible and covered by tests. Larger
or irreversible items (switching a paid vendor, changing plan prices, changing
credit grants) are proposals for the owner, written up with numbers, not code.

Step 4, record. Append a dated entry to docs/finance/ledger.md (metrics
snapshot, findings, proposals with expected USD/month, what was shipped, what
you still need from the owner). Update TheMasterPlan §10 changelog if code
changed. Fill docs/finance/vendors.json from connector data when you can.

Rules: the margin gate (>=3x on every product at worst case) must still pass
after any change (`npx tsx scripts/margin-report.mts`, `npm test`, lint,
typecheck, format:check). Prices and costs you cite must come from a source
you opened this run, with the URL and date; say "unverified" otherwise. Do not
fabricate subscriber numbers: with no data, say so. No PR to main, no merge.
```

## Subagents

All live in `.claude/agents/`, so any session on this repo (routine or
interactive) can use them.

| Agent                    | Owns                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `fin-revenue-analyst`    | MRR, ARPU, churn, trial→paid, dunning, top-up attach, annual-plan and upsell levers                                      |
| `fin-cost-auditor`       | Tokens and dollars per video, per tier, per vendor; failed-job waste; fixed overhead; actual vs catalog `costUsdPerUnit` |
| `fin-vendor-scout`       | Cheaper/better providers for video, image, voice, LLM, storage, hosting; verified prices; adapter-effort estimate        |
| `fin-pricing-strategist` | Plan prices, credit grants, top-up packs, premium "hero shot" tier; every proposal run through the margin gate           |
| `fin-implementer`        | The one code change per run: catalog row, adapter, config, script, tests, PR on a `cfo/*` branch                         |

The master only plans and merges findings; it does not browse vendors or edit
code itself, which keeps its context small across a run.

## What it reads (and what to connect)

| Source                        | Status                                                                                                | Used for                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| GitHub (this repo)            | connected                                                                                             | code, PRs, branches                                      |
| Supabase connector            | connected (`.mcp.json` server failed over the cloud proxy; the claude.ai connector is the one to use) | jobs, credits, subscriptions                             |
| Stripe connector              | **needs OAuth in claude.ai settings**                                                                 | real MRR, churn, refunds, failed payments, Sigma         |
| Vercel connector              | connected                                                                                             | `list_billing_charges`, usage, runtime errors            |
| `.env.local` service role     | local only; not in cloud                                                                              | `finance-report.mts`; else use the Supabase connector    |
| fal.ai, Anthropic, ElevenLabs | **no billing access yet**                                                                             | invoices; until then `api_cost_usd` per job is the truth |

Suggested additions, in value order:

1. **Stripe** (authorize it): without it MRR is computed from `subscriptions`
   rows, and yearly plans and coupons are invisible.
2. **Anthropic Admin API key** (read-only usage/cost report endpoints) in the
   routine's environment, to reconcile token spend against `api_cost_usd`.
3. **fal.ai** usage/billing export, or a monthly invoice dropped into
   `docs/finance/invoices/` (a CSV is enough), and the same for ElevenLabs.
4. **PostHog or Vercel Web Analytics**, for the visitor→signup→paid funnel
   (the missing top of the revenue picture).
5. **Sentry** connector, to price failed renders (each one burns provider money).
6. Optional: a spreadsheet connector (Google Sheets) as the owner's own cost
   log, if they prefer that to `vendors.json`.

## What the owner needs to give it

The routine asks through its notification; the standing list is:

- Monthly amounts for each fixed vendor in `docs/finance/vendors.json` (or
  connect Vercel/Supabase billing).
- Which plan each vendor is on (ElevenLabs tier, Supabase compute size, Vercel).
- Cash on hand and monthly burn target, if the owner wants runway tracked.
- Whether a yearly billing interval is live in Stripe (the DB doesn't store it).
- Approval rules: what the routine may change alone (catalog rows within the
  gate) vs what needs a yes (prices, vendor switches).

## When to notify

Notify (PushNotification) only for something the owner would act on:

- Gross margin below 3x on any product, or a measured cost that fails the gate.
- Provider spend per video above the catalog `costUsdPerUnit` (by >20%).
- MRR drop >10% week over week, or a spike in failed payments.
- A vendor switch with >=20% savings that is ready for the owner's yes.
- The routine could not read a data source it needs.

A run with no change, no finding and nothing to ask stays silent.

## Safe-to-switch checklist for a vendor (fin-vendor-scout fills this)

1. Price per billed unit, with the page URL and date, and what actually gets billed
   (fixed 5s clips, minimum charges, resolution tiers).
2. Quality on a real Shortcraft prompt (the smoke script with `FAL_VIDEO_MODEL`-style
   override), compared side by side with the incumbent.
3. Latency and the 8-minute step timeout; failure rate on a 10-clip sample.
4. Moderation/safety behavior (a flagged output must still fail the step and refund).
5. Terms: commercial use, content ownership, data retention, region.
6. Adapter effort: new file under `features/providers/live/`, a registry line, a
   catalog row, a mock twin (golden rule 2), tests.
7. Monthly saving at current volume and at 10x, net of engineering time.
