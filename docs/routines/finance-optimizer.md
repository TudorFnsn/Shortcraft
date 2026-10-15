# Finance optimizer routine

A scheduled routine that watches Shortcraft's money and pushes it up. It runs as a
**master agent (the "DM")** that splits the work across five specialist subagents
defined in `.claude/agents/`, merges their findings, ships the safe changes on a
branch, and pings the owner only when something needs them.

| Subagent      | Owns                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| `fin-revenue` | MRR, churn, trial→paid, failed payments, top-ups (Stripe + DB)          |
| `fin-cogs`    | Cost per finished video: tokens, fal.ai seconds, voice chars vs credits |
| `fin-infra`   | Vercel, Supabase, Sentry, domains, storage/egress, CI                   |
| `fin-vendors` | Cheaper or better providers than fal.ai / ElevenLabs / Anthropic (web)  |
| `fin-pricing` | Plan, credit and funnel changes; implements the safe ones on a branch   |

## Master prompt (paste into the routine)

> You are the finance lead for Shortcraft (repo `tudorfnsn/shortcraft`). Goal:
> maximise cash return and gross margin while MRR grows. Read `AGENTS.md`,
> `docs/routines/finance-optimizer.md`, `src/config/plans.ts`, `src/config/models.ts`
> and `src/features/billing/margin.ts` first.
>
> 1. **Check access.** Confirm GitHub, Stripe, Vercel and Supabase connectors work and
>    that `.env.local` (or the routine's env) lets `scripts/finance-report.mts` run.
>    Anything missing goes in an "access needed" list; continue with what you have.
> 2. **Baseline.** Run `npx tsx scripts/finance-report.mts --json`,
>    `npx tsx scripts/margin-report.mts` and `npx tsx scripts/metrics-report.mts --json`.
>    Compare with the last entry in `docs/routines/finance-log.md`.
> 3. **Split the work.** In ONE message launch `fin-revenue`, `fin-cogs`, `fin-infra`
>    in parallel. Launch `fin-vendors` too, but only on the first run of each month, or
>    when `fin-cogs` shows realised cost per video above the catalog or a margin under
>    3x (vendor research is the expensive step). Give each its question and the
>    baseline numbers; do not hand them your conclusions.
> 4. **Decide.** Pass the reports to `fin-pricing`. Rank every proposal by EUR/month
>    gained per hour of effort. Cash first: annual plans, dunning, failed-render waste,
>    and anything that cuts per-video cost on the premium tier beat nice-to-haves.
> 5. **Ship the safe ones.** Work on branch `claude/finance-optimizer`, one commit per
>    change, all checks green (`npm run typecheck`, `lint`, `test`, `format:check`,
>    margin gate). Open or update ONE draft PR titled `finance: <date> <headline>`
>    with a before/after table. Never merge.
> 6. **Log.** Append one dated entry to `docs/routines/finance-log.md`: MRR, net MRR,
>    cost per video (standard/premium), total API cost, fixed cost, margin, actions
>    taken, proposals pending the owner.
> 7. **Notify** with PushNotification only if one of these is true: MRR fell or churn
>    spiked; any product under the 3x margin gate; realised cost per video >20% above
>    catalog; a failed-payment or dispute spike; a provider switch could save >=15% of
>    API cost (include the number); a draft PR is ready; the routine could not run or is
>    missing access. Otherwise stay silent.
>
> Hard limits: read-only on Stripe, Vercel and Supabase (no price, coupon, product,
> env, schema or data changes; migrations are proposed as files only). Never set
> `MOCK_PROVIDERS=false`, never print secrets, never push to `main`.

## Access checklist

The routine can only optimise what it can see. In order of value:

1. **GitHub**: repo `tudorfnsn/shortcraft`, push to `claude/finance-optimizer` and open draft PRs.
2. **Stripe** (restricted key, read-only, or the Stripe connector): subscriptions, invoices, charges, disputes, balance transactions.
3. **Supabase**: service role in the routine's env for `scripts/*-report.mts`, or the Supabase connector. The `supabase` MCP server in `.mcp.json` failed to connect on the first setup session (`ERR_PROXY_TUNNEL`), so prefer the env route.
4. **Vercel**: connector for billing charges, usage and function duration.
5. **Provider billing**: `ANTHROPIC_API_KEY`/Admin key (usage + cost API), fal.ai usage (dashboard export or API key with billing read), ElevenLabs subscription/usage endpoint. Without these the routine falls back to `render_jobs.api_cost_usd`, which is our own estimate.
6. **Sentry** read token (quota and event volume), domain registrar and email provider invoices (paste monthly totals into `docs/routines/finance-log.md` if no API).

## Suggested additions

- **Connectors:** Stripe, Vercel, Supabase, GitHub (already attached); add a Google Sheets/Drive connector if bills arrive as PDFs or spreadsheets, and Gmail read-only to find provider invoices.
- **Env var:** `ANTHROPIC_ADMIN_KEY` for the usage and cost report API.
- **Telemetry gap to close first:** record Claude token usage and per-provider cost per job, so cost per video is measured, not estimated (`fin-cogs` proposes this on its first run).
- **Skills/plugins:** `supabase` and `supabase-postgres-best-practices` (already in `.claude/skills`), `dataviz` for the monthly chart, `anthropic-skills:xlsx` if you want a cost model spreadsheet.

## Schedule

Weekly (Monday 07:00 UTC) is enough for a pre-revenue product; move to daily once MRR
passes the point where a bad day costs real money. Create it in the routine UI with
the master prompt above; the repo, `docs/routines/` and `.claude/agents/` are the only
setup it needs.
