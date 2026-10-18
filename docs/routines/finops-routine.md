# FinOps routine ("CFO agent")

Purpose: keep Shortcraft profitable. Each run checks MRR and margins, finds cheaper vendors and better monetisation, implements safe wins, and notifies the owner only when something needs them.

Setup: create a scheduled routine (suggested: weekly, Monday 07:00) on repo `tudorfnsn/shortcraft` with the prompt below. Workers live in `.claude/agents/finops-*.md`.

## Master prompt (paste into the routine)

```
You are the FinOps master (the DM) for Shortcraft. Goal: maximise cash return and MRR. Read AGENTS.md first. You coordinate; you do not do the analysis yourself.

1. PREFLIGHT. Check which of these are reachable: GitHub, Stripe MCP, Supabase MCP, Vercel MCP, WebSearch. Note anything missing. Read the latest file in docs/routines/finops-reports/ for the previous baseline.
2. FAN OUT in parallel (one message): finops-revenue-analyst, finops-cost-auditor, finops-vendor-scout. Give each the baseline and the period.
3. FAN IN to finops-pricing-strategist with the three reports.
4. DECIDE. Rank every proposal by (monthly USD gain x confidence) / effort. Hard constraints: `npx tsx scripts/margin-report.mts` must pass (3x worst case), MOCK_PROVIDERS stays untouched, no secrets in git, no price or plan change visible to customers without owner approval.
5. IMPLEMENT only low-risk, internal wins (catalog costUsdPerUnit corrected to measured values, a cheaper provider adapter behind a flag, cost instrumentation, prompt caching, model downgrade for scripts) via finops-implementer, one change per call, on branch claude/finops-<date>. Customer-facing price, plan, or trial changes are proposals only.
6. REPORT. Write docs/routines/finops-reports/<YYYY-MM-DD>.md: MRR and delta, margin per plan, cost per video by stage, tokens vs spend, every cost line, top proposals with expected gain, what was implemented, what is missing. Commit and push the branch. Do not open a PR unless asked.
7. NOTIFY with PushNotification (<routine_summary>) only if: MRR fell more than 5% week over week, any plan fails the margin gate, a cost line grew faster than revenue, a provider switch saves more than $100/month, a payment problem or dispute spike appears, or a connector needed for the job is down. Otherwise stay silent.
```

## Connectors and tools that would help

| Need | Tool | Status |
| --- | --- | --- |
| Real MRR, churn, refunds, disputes | Stripe MCP | Installed, **needs OAuth in claude.ai connector settings** |
| Measured cost per video, credits, retention | Supabase MCP | Configured, failed to connect from the cloud sandbox (proxy tunnel error); retry. Fallback: `SUPABASE_SERVICE_ROLE_KEY` as a routine secret and `scripts/metrics-report.mts` |
| Hosting cost, function duration, bandwidth | Vercel MCP | Connected |
| Live provider prices | WebSearch (extended mode) | Available |
| fal.ai, ElevenLabs, Anthropic spend | No MCP. Provide read-only usage/billing API keys (`FAL_KEY` usage scope, ElevenLabs `xi-api-key`, Anthropic Admin API key) as routine secrets, or export monthly CSVs into `docs/routines/finops-reports/inputs/` | **Needed from owner** |
| Product analytics (funnel, trial to paid) | PostHog or Plausible MCP | Suggested |
| Error cost (retries burn money) | Sentry MCP | Suggested |
| Bank/expense view | Any accounting connector (Xero, QuickBooks, Wise) | Optional |
| Notebooks/charts for reports | `dataviz` skill | Available |

## Questions for the owner

1. Current monthly volume: paying users, videos per month, and the premium-video share.
2. Fixed costs not visible to the agent (domain, email provider, Sentry, accounting).
3. Is the owner OK with the routine switching the premium video provider behind a flag without asking if the saving is over 30% and tests pass?
4. Target gross margin and a monthly cash-burn ceiling.

## Note on the existing stack

`src/config/models.ts` already moved standard video off fal.ai to in-house Ken Burns (cost 0). The remaining fal.ai exposure is premium video (Kling 2.5 Turbo, conservative 0.12 USD/s) and FLUX images. The first run should measure those against `render_jobs.api_cost_usd`, then scout replacements.
