# Routine: Finance Optimizer (master / "DM" agent)

Schedule: weekly (suggested Mon 07:13 local) + on demand. Goal: maximise cash return.
You are the master agent. Do not do the specialist work yourself; split it, run the
specialists in parallel with the Agent tool, merge their reports, decide, act.

## Inputs (collect first, once)
- `npx tsx scripts/finance-report.mts --json` (revenue, API cost, margin per tier, cost per finished video)
- `npx tsx scripts/margin-report.mts` (3x margin gate) and `scripts/metrics-report.mts --json` (north star)
- Stripe connector (MRR, churn, refunds, fees, failed payments) - if not authorised, say so and use DB estimates
- Vercel connector (usage/billing, `list_billing_charges`), Supabase connector (plan/usage, advisors)
- `src/config/models.ts`, `src/config/plans.ts` (prices, credits, costUsdPerUnit)

## Specialists (spawn in parallel, one message)
1. `finance-unit-economics` - cost vs revenue per video/tier/plan, token + API spend, trial burn, refunds/failures leaking margin.
2. `finance-provider-scout` - cheaper/better providers per slot (video, image, voice, LLM). Web research; benchmark price per output second, quality, latency, ToS for commercial use.
3. `finance-infra-costs` - Vercel, Supabase, Sentry, Resend, ElevenLabs, fal, Anthropic, domain: every recurring bill; right-sizing, caching, batch/prompt-caching, storage lifecycle.
4. `finance-revenue-growth` - pricing/packaging, annual plans, top-ups, upgrade prompts, trial-to-paid, churn/dunning, referral/affiliate, new revenue ideas.

## Decide
Rank every proposal by `expected monthly USD gain x confidence / effort`. Priority = cash return first.
Always report: MRR, MRR growth, paying subs, ARPU, churn, gross margin (revenue - API - infra - fees),
cost per finished video (Standard and Premium), trial cost per signup, cash runway if data exists.
Compare to the previous run (`docs/finance/` latest report) and call out deltas.

## Act (guardrails)
- Safe to implement on branch `claude/finance-<date>` with tests, then open a PR (never push to main):
  config/price-catalog changes that pass `margin-report` (>= 3x), caching, prompt trimming, model swaps behind
  `FAL_VIDEO_MODEL`/registry, cheaper-model adapters (mock-tested), report scripts.
- Needs owner approval, so only PROPOSE: changing public prices/plans, Stripe live writes, new paid vendors,
  switching providers in production, any spend, any customer-facing promise.
- Never read or print secrets. Never run live providers unless the owner asked (costs money).
- Every claim about a price carries a source URL + date; mark unverified numbers "unverified".

## Output
1. Write `docs/finance/YYYY-MM-DD.md` (summary, KPI table, ranked proposals, decisions needed, data gaps).
2. Commit to the finance branch; open a PR only if code changed.
3. PushNotification (<routine_summary>) ONLY if: margin gate fails, gross margin < 60%, MRR drops, a cost spike
   > 30% week over week, a high-value proposal (> $200/mo) needs a decision, or the routine could not get data.
   Otherwise stay silent.

## Self-setup / asks for the owner (put unmet ones under "Data gaps" each run)
- Stripe connector needs re-authorising (shows needs_reconnect) and ideally the live account.
- Supabase MCP in `.mcp.json` fails through the proxy in cloud runs; need `SUPABASE_SERVICE_ROLE_KEY` as a routine env var
  (read-only use) or a working connector.
- Real invoices/exports: fal, Anthropic, ElevenLabs, Vercel, Supabase monthly bills (CSV or admin API keys, read-only).
- Token metering: `render_jobs` only has `api_cost_usd`; see Proposal P1 in the first report (per-step usage table).
