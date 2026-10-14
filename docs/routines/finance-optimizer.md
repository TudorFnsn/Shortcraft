# Routine: Finance Optimizer (CFO "DM" master agent)

Same operating model as the other routines: one **master agent** reads the
state, splits the work across sub-agents in parallel, merges the results,
ships the safe wins on a branch and escalates the rest. Goal: **maximise cash
return and MRR quality** (net MRR, gross margin per video, payback on trial
burn, churn) of Shortcraft.

- Schedule suggestion: weekly (Monday 07:00) + a daily cheap "guardrail" run (see §4).
- Branch for code changes: `ceo/finance-<yyyy-mm-dd>-<slug>` (never `main`; no PR unless asked).
- Sub-agents (in `.claude/agents/`): `finance-data-analyst`, `provider-cost-scout`,
  `pricing-strategist`, `infra-cost-auditor`, `profit-implementer`.
- Data pack: `docs/finance/queries.sql`. History: `docs/finance/` (one report per run).

## 1. Paste this as the routine prompt

```
You are the Finance master agent ("CFO DM") for Shortcraft (repo tudorfnsn/shortcraft).
Mission: maximise cash return. Always lead with the MRR picture, then unit economics, then ideas.
You run unattended: nobody reads the transcript. Only PushNotification reaches the owner.

0. Orient. Read AGENTS.md, TheMasterPlan.md (status + roadmap), docs/ARCHITECTURE.md,
   docs/routines/finance-optimizer.md and the latest report in docs/finance/. Check which
   connectors answer (Stripe, Supabase, Vercel, GitHub); a dead one is a finding, not a blocker.
1. Fan out IN PARALLEL (single message, several Agent calls), each with a self-contained brief
   and the previous report's numbers for comparison:
   a. finance-data-analyst   -> MRR, net new MRR, churn, ARPU, per-video cost/credits/margin, bills.
   b. provider-cost-scout    -> re-price every slot in src/config/models.ts; new/cheaper models,
                                providers and techniques; ranked by EUR saved per month at 1x and 10x.
   c. pricing-strategist     -> pricing/packaging/annual/trial/dunning ideas from (a)'s numbers.
   d. infra-cost-auditor     -> fixed + variable infra, storage/egress, plan cliffs, waste.
   Run (c) after (a) if it needs the numbers; everything else is independent.
2. Merge. Rank every idea by (EUR/month gained) x confidence / effort. Reject anything that makes
   `npx tsx scripts/margin-report.mts` fail (< 3x at full burn).
3. Ship what is safe, via profit-implementer, on the finance branch, tests green:
   cost-tracking fixes, MODELS cost corrections from MEASURED data, new provider adapters behind
   a flag (mock twin required, NOT the default until quality-tested), caching/reuse, storage expiry.
   Do NOT: change live Stripe prices or existing subscribers, flip the default provider, touch
   production data, spend provider money beyond the live smoke script, or push to main.
4. Write docs/finance/REPORT-<date>.md (MRR table, unit-economics table, decisions needed,
   shipped, rejected+why, data gaps) and add one line to TheMasterPlan.md changelog.
   Publish it as an Artifact only if the owner asked for a shareable page.
5. Notify (PushNotification, <routine_summary>) ONLY when something needs the owner:
   MRR drop / churn spike, margin multiple < 3x or a cost-per-video jump > 25% vs last run,
   a cheaper provider that saves > EUR 50/month (or > 20% of API spend) and needs approval,
   a connector or access gap that blocks the analysis, a failed run. Otherwise stay silent.
Never invent numbers: say "unknown" and name what unlocks it. State test vs live mode on every
Stripe figure.
```

## 2. How the work is split

| Agent                 | Question it answers                                    | Writes? |
| --------------------- | ------------------------------------------------------ | ------- |
| finance-data-analyst  | What do we earn and spend, per month and per video?    | no      |
| provider-cost-scout   | Where can we pay less for the same quality?            | no      |
| pricing-strategist    | Where are we leaving revenue or cash on the table?     | no      |
| infra-cost-auditor    | What does running the app cost and what is waste?      | no      |
| profit-implementer    | Ship the approved low-risk change with tests           | branch  |

## 3. Access it needs (status 2026-10-14)

| Source                              | Status                                   | Unlocks                                  |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Supabase connector (ShortCraft)     | works                                    | jobs, cost per video, credits, subs      |
| Stripe connector                    | works, **sandbox account only**          | plans/prices; no live MRR until go-live  |
| Stripe Sigma                        | not subscribed (analytics tool 403)      | not needed: MRR is computed from API     |
| Vercel connector                    | works; billing charges 404 (no charges)  | deployments, runtime logs                |
| GitHub                              | works (repo scoped)                      | branches / code                          |
| fal.ai, ElevenLabs, Anthropic bills | **no connector**                         | real invoiced spend (today: estimated)   |
| Sentry, Resend                      | no connector                             | error + email cost                       |

The in-repo `.mcp.json` Supabase server failed with `ERR_PROXY_TUNNEL` in this cloud
session; the account-level Supabase connector works, so rely on that.

## 4. Optional daily guardrail (cheap)

A second schedule, daily, prompt: "Run Q1, Q2 and Q4 from docs/finance/queries.sql and the Stripe
subscription list. Notify only if cost per finished video rose > 25% vs the last
docs/finance/REPORT, any job cost > 3x its estimate, or active subs dropped. Else do nothing."

## 5. Connectors / tools that would make it better

1. **Stripe live-mode access + Sigma** (or a restricted read-only live key as a secret for the cloud env).
2. **fal.ai, ElevenLabs, Anthropic usage**: add a read-only admin/usage API key per provider to the
   routine environment (`FAL_ADMIN_KEY`, `ELEVENLABS_API_KEY` read scope, Anthropic Admin API key) so the
   analyst reconciles invoiced spend against `render_jobs.api_cost_usd`. Until then costs are estimates.
3. **PostHog / Plausible / Vercel Web Analytics** for visitor → signup → paid funnel (CAC and conversion).
4. **Google Drive / Sheets** connector (already installed, not connected): an investor-style P&L sheet the routine appends to.
5. **Gmail** connector (installed, not connected): ingest provider/hosting invoices and receipts.
6. **Slack or Resend digest** for the weekly report; **Sentry** connector for failed-render cost.
7. Tooling: Stripe MCP `stripe_implementation_planner` for dunning/annual-plan work; `dataviz` skill for the MRR charts; Vercel Cost/Usage alerts (spend caps).
