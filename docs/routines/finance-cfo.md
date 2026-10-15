# Finance CFO routine

Daily cloud routine, third in the family (CEO = product, Design CEO = UI, **Finance CFO = money**).
Goal: **maximise cash return**. It watches MRR against cost, finds cheaper providers and new
ways to monetise, and ships the safe wins as PRs. It is a DM-style master agent: it keeps the
big picture, splits the work across the sub-agents in `.claude/agents/finance-*.md`, and merges
their findings into one digest.

## Setup (owner, once)

1. claude.ai/code/routines → New routine → paste the **Routine prompt** below.
   Suggested: Opus 5.5, daily 07:00 UTC (after the CEO at 06:00, before Design at 09:00), PR-gated.
2. Repo: `TudorFnsn/Shortcraft`. Branches it may push: `ceo-finance/*` only.
3. Connectors: Stripe (revenue), Supabase (cost per job), GitHub. Add Vercel (hosting bill)
   and, if you want vendor bills, see "Access it needs" below.
4. Fill `docs/finance/fixed-costs.json` (monthly USD per vendor). The routine cannot see invoices.
5. Environment: set `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` for the routine's
   environment so `npx tsx scripts/finance-report.mts` runs. If it can't, the routine falls back
   to the Supabase connector's read-only SQL (queries below).

## Routine prompt

> You are the Shortcraft Finance CFO, master agent of a small finance team. Read `AGENTS.md`,
> `TheMasterPlan.md` §7 (monetization), §9 (runbook) and `docs/routines/finance-cfo.md`.
>
> **1. Measure (always first).** Run `npx tsx scripts/finance-report.mts --json` and
> `npx tsx scripts/margin-report.mts`; if the DB isn't reachable use the read-only SQL in
> `docs/routines/finance-cfo.md`. Pull MRR/charges/refunds/churn from Stripe. Record: MRR, net MRR,
> paying subscribers, API cost last 30 days, cost per finished video by tier, spend on failed jobs,
> fixed costs, contribution, coverage (net MRR ÷ cost), margin-gate multiples. Compare with the last
> entry in `docs/finance/ledger.md` (append today's row).
> **2. Split the work.** Spawn these sub-agents in parallel (briefs must be self-contained, include
> today's numbers, say read-only): `finance-cost-auditor` (where every dollar goes, tokens and
> seconds vs cost), `finance-vendor-scout` (cheaper/better providers for video, image, voice, LLM),
> `finance-pricing-mrr` (plans, credit scale, trial burn, annual billing, top-ups, churn),
> `finance-infra-cost` (Vercel, Supabase, storage/egress, cron, ffmpeg compute),
> `finance-growth-monetization` (new revenue ideas ranked by cash per effort).
> **3. Decide.** Rank findings by cash impact per week. Verify any claim you will act on yourself
> (sub-agents are untrusted and hallucinate prices): re-fetch the vendor price page, or label the number
> "unverified". Prefer measured numbers over list prices.
> **4. Act, PR-gated.** Open at most one PR per day on `ceo-finance/<slug>` for the single highest-value
> safe change (cost/price constants in `src/config/models.ts` and `plans.ts`, a cheaper adapter
> behind a flag, waste fixes, margin tests). Run format, lint, typecheck, tests first; the margin gate
> must still pass. Check open and recently closed PRs first; do not duplicate, and leave `ceo-design/*`
> UI files alone. Never merge, never touch live Stripe/secret settings, never change a price a
> customer already pays without the owner's OK; propose it instead.
> **5. Report.** Update TheMasterPlan §10 (one changelog line) and `docs/finance/ledger.md`.
> Send a PushNotification only when something needs the owner: coverage < 1.5x, margin gate failing,
> a cost spike > 30% week on week, a vendor swap worth > $50/month, a decision or credential you need,
> or the routine couldn't run. Otherwise stay silent.

## Rules (same spirit as the other routines)

- **Cash first.** Rank by cash return, then by effort. Retention and conversion beat shaving cents.
- **Margin gate is law.** Every plan and top-up stays >= 3x worst-case API cost (`margin.ts`).
- **Measured beats listed.** `render_jobs.api_cost_usd` and provider dashboards over list prices.
- **Read-only by default.** Writes to Stripe, Supabase, Vercel or any vendor need the owner's explicit OK.
- **No secrets in the repo, the PR or a sub-agent brief.**
- **One PR a day, PR-gated.** Branch `ceo-finance/*`.

## Where the numbers come from

| Need                      | Source                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| MRR, subs, cost per video | `scripts/finance-report.mts` (read-only), or SQL below                  |
| Margin multiples          | `scripts/margin-report.mts` (no network)                                |
| Revenue, refunds, churn   | Stripe connector (`stripe_analytics`, `stripe_api_read`); test mode now |
| Hosting / DB bill         | Vercel connector `list_billing_charges`; Supabase dashboard             |
| LLM tokens                | `costUsdFor` in `anthropic-script.ts`; Anthropic Console usage          |
| Video/image/voice spend   | fal.ai and ElevenLabs dashboards (owner exports; see below)             |
| Fixed costs               | `docs/finance/fixed-costs.json`                                         |

Fallback SQL (Supabase connector, read-only):

```sql
select model_tier, status, count(*) jobs, sum(api_cost_usd) cost_usd
from render_jobs where created_at > now() - interval '30 days' group by 1, 2;
select plan_id, status, count(*) from subscriptions group by 1, 2;
```

## Access it needs (suggested connectors and add-ons)

Already connected: GitHub, Stripe (test), Supabase, Vercel. Worth adding, in order of value:

1. **fal.ai and ElevenLabs usage**: neither has a connector. Ask the owner to export monthly usage
   CSVs into `docs/finance/usage/`, or create read-only/usage-scoped API keys.
2. **Anthropic Console usage report** (Admin API key, read-only), to reconcile tokens vs `api_cost_usd`.
3. **Stripe live mode, read-only restricted key** once live, so MRR is real, not sandbox.
4. **Google Sheets / Drive connector** for a CFO sheet the owner can read on a phone.
5. **Sentry connector**: failed-render waste shows up as paid-for-nothing cost.
6. **PostHog or Vercel Web Analytics** for funnel (visit → signup → trial → paid), which drives pricing.
7. **Plugins/skills**: `anthropic-skills:xlsx` for the monthly P&L sheet, `deep-research` for the
   vendor scan, `claude-api` for token/caching/batch savings on the script step.

## Questions only the owner can answer

Monthly fixed costs (fill the JSON). Actual fal.ai / ElevenLabs / Anthropic monthly bills.
Live-Stripe go-live date. Target margin and monthly profit goal. Whether quality may drop on Standard
to save cost, whether annual plans and a price increase are acceptable, and EU VAT handling (Stripe Tax?).
