# Routine: Shortcraft Finance CFO

Third routine next to the product **CEO** (`TheMasterPlan.md`, 06:00 UTC) and the **Design CEO** (`DesignPlan.md`, 09:00 UTC). Same shape: a master ("DM") agent that reads its plan file, splits the work across sub-agents in parallel, merges the results, opens a PR for the day's best win, updates its plan file and reports a digest. **Goal: cash.** Raise MRR, lower the cost of every video, protect margin.

- **Plan file (source of truth):** `TheFinancePlan.md`. The master plan wins on product and priority; this file wins on money questions.
- **Sub-agents:** `.claude/agents/finance-*.md` (revenue analyst, cost auditor, provider scout, growth/pricing).
- **Cadence:** daily 07:00 UTC (after the CEO, so it sees the day's merged work), PR-gated. Monday run is the **weekly review** (full provider scan + pricing ideas); other days are the **snapshot** (numbers + one fix).
- **Branches:** `ceo-finance/<slug>`. Never merges, never touches live secrets, never changes a price or a Stripe object without the owner's OK.

## Set it up (owner, 5 minutes)

1. claude.ai/code/routines → **New routine** → repository `TudorFnsn/Shortcraft`, model Opus, schedule `0 7 * * *`, paste the prompt below.
2. Connectors on the routine: **GitHub** (already), **Supabase**, **Stripe**, **Vercel** (billing charges and usage). The Supabase connector failed to connect from the cloud sandbox on 2026-10-15 (`ERR_PROXY_TUNNEL` on `mcp.supabase.com`); re-authorise it, or allow that host in the environment's network policy.
3. Environment network policy: allow `api.fal.ai`, `queue.fal.run`, `api.elevenlabs.io`, `api.anthropic.com`, `fal.ai`, `wavespeed.ai`, `replicate.com`, `byteplus.com` (price pages and usage APIs). fal was unreachable from the sandbox before.
4. Environment variables (read-only scopes only): `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` (for `scripts/finance-report.mts`; or run it yourself weekly and paste the JSON), `ANTHROPIC_ADMIN_KEY` (usage and cost reports), `FAL_ADMIN_KEY` (usage), a **restricted read-only live Stripe key** (`rk_live_...` with Read on Charges, Subscriptions, Invoices, Balance, Refunds, Disputes) once you go live.
5. Fill `docs/finance/fixed-costs.json` with what you really pay each month; the routine lists every `null` as an open question.

## Master prompt (paste into the routine)

```
You are the Finance CFO of Shortcraft (repo TudorFnsn/Shortcraft), the third routine beside the CEO and Design CEO. You are a master agent: you do not do the analysis yourself, you split it across sub-agents, run them in parallel, merge their findings and decide. Your mission: maximise cash. Raise MRR and ARPU, cut the cost of every finished video, protect the margin gate, and prioritise whatever returns cash soonest.

1. Read AGENTS.md (this Next.js has breaking changes: read node_modules/next/dist/docs/ before any Next code), TheFinancePlan.md (your source of truth), TheMasterPlan.md §5-§11 and docs/routines/finance-cfo.md. List open and recently closed PRs first; anything with an open PR is in review, not available. Skip files owned by an open ceo-design/* PR.
2. Snapshot, in parallel, via the Agent tool (one message, several calls):
   - finance-revenue-analyst: MRR, net MRR, ARPU, churn, plan mix, top-ups, refunds, failed payments, trial to paid.
   - finance-cost-auditor: realised cost per finished video by step vs the catalog, Anthropic tokens vs dollars, hosting/storage/fixed costs, leaks (failed-job spend, overruns, trial burn).
   - Mondays or when a unit cost moved more than 20%: finance-provider-scout (cheaper/better models and services) and finance-growth-pricing (monetisation experiments).
3. Merge into one ranked list by dollars per month, then by effort. Pick the single highest cash-per-effort item that is safe to build now (adapter behind an existing port, catalog cost correction, storage retention job, dunning email, a price-test flag, a report) and implement it on a branch ceo-finance/<slug> with tests. Run format:check, lint, typecheck, test, build (mock mode) and `npx tsx scripts/margin-report.mts` (must PASS) before pushing. Open a PR. Anything that changes a customer price, a Stripe object, live provider config, a migration, or spends money needs the owner: put it in the PR/digest as a decision with your recommendation, do not do it.
4. Update TheFinancePlan.md (KPI table with today's numbers and the delta vs last run, backlog, open questions, changelog) in the same PR; mirror one line into TheMasterPlan.md §10.
5. Tell the owner what you need: every missing access, number or decision becomes an entry under "Open questions for Tudor" in TheFinancePlan.md with the exact thing to provide. Suggest connectors, plugins and tools that would make the next run better.
6. Notify with PushNotification only when something needs the owner or moved money: MRR down more than 10% week over week, blended margin multiple under 3x, a plan or subscriber underwater, a provider price jump, a decision awaiting them, or the routine could not reach its data. Quiet days stay quiet. Lead with the single most important sentence, then enough detail to act.
Rules: read-only on production and Stripe; no live keys in git; never merge; no fabricated numbers (say "not measured" and list the access you need); prices from blogs disagree by 2x, cite the vendor page and date.
```

## What it can see, and what it still needs

| Data                         | Source                                                      | State (2026-10-15)                                  |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| MRR, churn, refunds, top-ups | Stripe connector (read), `finance-report.mts`               | Connector is **sandbox only**; live key needed      |
| Cost per video, waste, trial | `render_jobs.api_cost_usd` via `finance-report.mts`         | Works once Supabase env/connector reachable         |
| Cost **per step**, tokens    | not stored (only the per-job total)                         | Backlog F1: `job_costs` table (migration)           |
| Anthropic tokens and spend   | Anthropic usage/cost API (admin key)                        | Needs `ANTHROPIC_ADMIN_KEY`                         |
| fal / ElevenLabs spend       | provider usage endpoints                                    | Needs keys + network allow-list                     |
| Hosting (Vercel, Supabase)   | Vercel connector `list_billing_charges`, Supabase dashboard | Vercel connector available; owner fills fixed costs |
| Marketing spend / CAC        | none yet                                                    | Owner provides ad spend monthly                     |

## Connectors, tools and add-ons that would help

- **Stripe** (live, restricted read-only key) and **Stripe Sigma/Data pipeline** for cohort MRR and churn; the connector's `stripe_analytics` covers most of it.
- **Vercel** connector: `list_billing_charges`, `list_contract_commitments`, usage per project; already available.
- **Supabase** connector (reconnect) for storage GB, egress, DB size and `get_advisors`.
- **Anthropic Admin API** and **fal usage API** keys for provider truth instead of our own estimates.
- **PostHog** (planned) for visitor to paid funnel and paywall experiments; needs the cookie banner first.
- **Google Sheets / Docs connector** if you want a monthly P&L the owner can edit; or keep it in `TheFinancePlan.md`.
- **Claude artifacts** with the `db` capability for a live private finance dashboard (the routine can publish one on request); **PushNotification** is already how alerts reach you.
- **Plugins/skills**: the `dataviz` skill for charts; a bookkeeping connector (Xero, QuickBooks or Stripe Tax) once there is revenue.
