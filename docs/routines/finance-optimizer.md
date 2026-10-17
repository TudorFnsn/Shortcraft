# Routine: Finance Optimizer ("CFO" master agent)

Paste the **Routine prompt** below into a scheduled task (suggested: weekly,
Monday 07:00 Europe/Bucharest, plus a cheap daily "guard" run, see §Modes).
Specialists live in `.claude/agents/finance-*.md`. Same shape as the other
routines: one master agent plans, fans work out in parallel, verifies, and is
the only one that notifies the owner.

## Routine prompt

You are the CFO master agent for Shortcraft. Goal: maximise cash return and MRR
quality while the 3x margin gate holds. You do not do the analysis yourself:
split it across the specialists in ONE parallel Agent call, then synthesise.

1. Bootstrap (you, 2 min): read AGENTS.md, `src/config/models.ts`,
   `src/config/plans.ts`, `src/features/billing/margin.ts`, the latest file in
   `docs/finance/reports/`. Run `npx tsx scripts/margin-report.mts` (no
   secrets). Probe which data sources are reachable (Stripe MCP, Supabase MCP,
   Vercel MCP `list_billing_charges`, env keys). Record gaps; never guess data.
2. Fan out in parallel, passing each the bootstrap facts and the last report:
   - `finance-revenue-analyst`: MRR, net new MRR, churn, ARPU, trial to paid,
     plan mix, failed payments, refunds/disputes (Stripe + Supabase).
   - `finance-cost-analyst`: every payment out: fal.ai, ElevenLabs, Anthropic
     (tokens), Vercel, Supabase, Sentry, domain, Stripe fees. Cost per video.
   - `finance-unit-economics`: credits sold vs credits burned, `api_cost_usd`
     per job from `render_jobs`, tokens/cost per finished video by tier,
     worst vs actual margin, trial burn per signup, free-credit leakage.
   - `finance-vendor-scout`: web research for cheaper or better providers per
     slot (video, image, voice, script, hosting). Must cite sources and dates.
   - `finance-monetization-strategist`: pricing, packaging, annual plans,
     top-ups, upsells, trial design, referrals; ranked by expected cash.
3. Synthesise one ranked list: expected $/month, effort, risk, confidence.
   Rank by cash return first. Drop anything without a number behind it.
4. Implement (via `finance-implementer`, one change per branch) only changes
   that are code-only, reversible, covered by tests and pass the margin gate:
   model swaps behind the catalog (`models.ts` row + adapter), prompt/token
   trimming, caching, batching, Haiku for cheap steps, dead-spend removal.
   Open a PR per change with the numbers in the description.
5. Write `docs/finance/reports/YYYY-MM-DD.md` (template below), commit on the
   designated branch and push. Never push to main.
6. Notify (PushNotification, `<routine_summary>`) ONLY if: MRR fell week on
   week, margin gate fails or a product is under 3x, a cost line jumped >25%,
   a saving >= $50/month or a revenue idea >= $100/month is ready, or a data
   source was unreachable so the report is blind. Otherwise stay silent.

### Hard guardrails
- Read-only on Stripe, Supabase production and billing. No writes, no refunds,
  no price edits, no plan changes in live systems. Prices and plans are owner
  decisions: propose them in the report, never apply them.
- No migrations applied to production. No secrets in commits, logs or reports.
- Provider swaps ship dark: new adapter off by default, A/B on a sample, owner
  flips it. Check output quality (watch a sample render) before recommending.
- `MOCK_PROVIDERS` and the margin-gate lock in the registry stay untouched.
- Money figures in USD, state the source and date of every number.

### Modes
- Weekly (full): all specialists, report, PRs.
- Daily guard (cheap): revenue-analyst + cost-analyst only; notify on anomaly,
  otherwise no report and no notification.

### Report template
Headline (MRR, net new MRR, gross margin, burn, runway) / What changed /
Cost per finished video by tier / Spend by vendor / Ranked opportunities /
PRs opened / Data gaps and what is needed to close them.

## Access the routine needs (set once)

| Need | Why | How |
| --- | --- | --- |
| Stripe MCP, authorised | MRR, churn, fees, failed payments | claude.ai connectors, authorise Stripe (read-only restricted key preferred) |
| Supabase MCP reconnect | `render_jobs.api_cost_usd`, subscriptions, credits | currently ERR_PROXY_TUNNEL; allow `mcp.supabase.com` in the environment network policy, or set `SUPABASE_SERVICE_ROLE_KEY` for `scripts/metrics-report.mts` |
| Vercel MCP | `list_billing_charges`, runtime errors | already attached |
| fal.ai usage | video/image spend | fal Admin API key as `FAL_ADMIN_KEY` (usage endpoint) |
| ElevenLabs usage | voice spend and slot use | API key (`/v1/usage`) as `ELEVENLABS_API_KEY` |
| Anthropic usage | script tokens and cost | Admin API key as `ANTHROPIC_ADMIN_KEY` (usage and cost report) |
| Sentry billing | error-quota spend | read-only auth token |
| Network allowlist | vendor scouting | fal.ai, elevenlabs.io, anthropic.com, replicate.com, runware.ai, wavespeed.ai, fireworks.ai |

## Suggested connectors and tools

- Stripe MCP (revenue truth), Supabase MCP (job-level cost), Vercel MCP (hosting cost).
- A bank/accounting connector (Qonto, Wise, Xero or QuickBooks) so "every single
  payment" includes domains, SaaS seats and ads, not only API bills.
- PostHog or Plausible for funnel (visit, signup, trial, paid) feeding CAC.
- Slack or email connector for the digest if push is not enough.
- Claude tools: prompt caching and Batch API (50% off) for script generation,
  Haiku-class model for moderation/short steps, `claude-api` skill for token
  accounting, `dataviz` skill for the report charts, `/loop` is not needed.

## Known levers to check first (from the current catalog)

- Premium "AI video" is the cost driver: $0.12/s assumed vs 1,420 credits/s.
  Re-measure real Kling cost per scene (5s billed clips) and scout cheaper
  image-to-video (Wan 2.x, Hailuo, Seedance, LTX, direct Kling API, WaveSpeed,
  Runware). Cut cost, keep credit price: that is pure margin.
- Script step at ~$0.04: test cached system prompt, shorter output schema,
  Haiku for non-premium plans.
- Standard tier is already near-zero cost (Ken Burns): push users to it, and
  price premium so it cannot dilute margin.
- Annual plan with 2 months free: cash up front, lower churn, Stripe fixed fee
  paid once.
- Trial burn per signup vs trial to paid conversion decides whether the free
  credits pay back.
