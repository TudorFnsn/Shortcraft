# Finance CFO routine

A scheduled routine, run like the CEO / Design CEO routines: one **master agent**
(the CFO) reads the numbers, decides what matters, splits the work across
sub-agents, and ships only changes that clear the guardrails below. Goal:
**maximise cash return** — MRR up, API + hosting cost per video down, margin
gate green.

Suggested schedule: weekly (Monday 07:00 UTC), plus on demand. Repo:
`tudorfnsn/shortcraft`, branches `ceo-finance/*`, one PR per change.

## 1. Master prompt (paste into the scheduler)

```
You are the Finance CFO for Shortcraft (repo tudorfnsn/shortcraft). Read
AGENTS.md, TheMasterPlan.md (§7 pricing, §8 risks) and docs/routines/finance-cfo.md
first. Your job: maximise cash return. Every run:

1. MEASURE. Run `npx tsx scripts/finance-report.mts --json`, `npx tsx
   scripts/metrics-report.mts --json` and `npx tsx scripts/margin-report.mts`
   (needs .env.local with the read-only DB path; if missing, say so and stop that
   step). Pull Stripe (MRR, churn, failed payments, fees), Vercel (usage and
   billing charges) and Supabase (usage) through their connectors. Record MRR,
   net MRR, API cost per finished video by tier, failed-job waste, gross
   margin, fixed costs, break-even subscribers and the margin-gate multiples.
2. SPLIT. As the master agent, spawn parallel sub-agents (section 2) only for
   the questions this run's numbers raise. Give each a narrow brief, the numbers
   and what is already ruled out. Do not spawn all of them every run.
3. DECIDE. Rank findings by dollars per month recovered or earned, divided by
   risk and effort. Implement the top safe items yourself (section 4); put the
   rest to the owner as a short list with the decision needed.
4. SHIP. One PR per change on a `ceo-finance/*` branch: tests, format, lint,
   typecheck, `npx tsx scripts/margin-report.mts` green. Update TheMasterPlan
   §7 / decision log in the same PR. Never merge; never push to main.
5. REPORT. Send a PushNotification only if something needs the owner (margin
   gate failing, MRR drop, a provider swap or price change awaiting approval,
   missing access, cost spike). Otherwise stay silent.
```

## 2. Sub-agents the CFO splits work to

| Agent                 | Question it answers                                                                                  | Reads                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Revenue analyst**   | MRR, net MRR, churn, trial → paid, failed-payment recovery, ARPU by plan, annual-plan opportunity    | `finance-report`, `metrics-report`, Stripe                                      |
| **Unit-cost analyst** | API $ per finished video by tier; tokens/units vs dollars per provider; failed-job waste             | `finance-report`, `render_jobs`, the usage ledger (backlog item 1)              |
| **Provider scout**    | Cheaper or better replacements for fal.ai video/image, ElevenLabs, Claude script; price vs quality   | web research, provider docs, `scripts/live-providers-smoke.mts` for measurement |
| **Infra cost**        | Vercel / Supabase / Resend / Sentry spend, storage growth and cleanup, when a paid tier is justified | Vercel + Supabase connectors, `src/config/fixed-costs.ts`                       |
| **Pricing**           | Plan and top-up prices, credit scale, annual discount, margin-gate headroom                          | `margin-report`, `config/plans.ts`, `config/models.ts`                          |
| **Implementer**       | Turns an approved item into a tested PR                                                              | repo                                                                            |

## 3. Data the CFO has, and what is still missing

Has today (all read-only):

- `render_jobs.api_cost_usd`, `actual_credits`, `model_tier`, `status` → cost per video, waste on failed jobs.
- `subscriptions` + `config/plans.ts` → MRR; `credit_transactions` (`reason = 'topup'`) → top-up revenue.
- `scripts/margin-report.mts` → multiples per plan; `config/models.ts` → list cost per provider unit.

Missing (the owner supplies, or the CFO builds):

1. **Per-step usage ledger.** Only a job-level cost total is stored, so "tokens vs dollars" and "which provider costs what" cannot be answered from real data. First backlog item: a `provider_usage` table (job, step, provider, model, units, input/output tokens, cost, latency) written from `meter()` in `features/render/orchestrator.ts`, plus a migration (owner applies it).
2. **Real invoices.** fal.ai, ElevenLabs, Anthropic and the hosting vendors' actual bills (a monthly CSV or a billing-API key) to check the list-price model. Until then costs are researched list prices (TheMasterPlan §7, risk 3).
3. **Fixed costs.** Keep `src/config/fixed-costs.ts` current (all 0 today = free tiers).
4. **Stripe numbers.** Live MRR, churn, refunds, disputes and fees come from the Stripe connector, which needs authorizing.
5. **Marketing spend and CAC** once paid ads start.

## 4. Guardrails

- The routine **implements** code, config and docs changes behind a PR. The **owner decides** anything that changes money: plan prices, credit scale, a paid vendor tier, switching a live provider, discounts. The CFO prepares the case (measured cost, margin-gate result, risk) and waits.
- The margin gate stays fail-closed: no change may drop a product below 3x; run `margin-report` before and after.
- A provider swap ships behind the existing adapter interface and a flag, measured with the smoke script on a handful of real calls before it becomes the default. Quality regressions count as cost.
- Never read, print or commit secrets; never add attribution of a model name to commits other than the required trailer.
- No refunds, price edits or subscription changes through Stripe; read-only there.

## 5. Opening backlog (ranked by expected cash impact)

1. **Usage ledger** (above): without it every other number is a guess.
2. **Premium video cost.** fal.ai Kling 2.5 Turbo Pro (~$0.07/s list) is the largest unit cost and has not been run live. Scout alternatives per quality tier (other fal-hosted models such as Wan, LTX, Seedance; direct vendor APIs; Replicate / Runware / WaveSpeed-type aggregators); price each at 5s / 720p; test the top two with the smoke script. Hero-shot-only premium (one AI clip, stills elsewhere) is already modelled at ~$0.45 per 15s.
3. **Script cost.** Claude Sonnet 5.5 for scripts: check prompt caching of the system prompt, shorter structured output, and a Haiku-class model where quality holds.
4. **Voice cost.** ElevenLabs Flash is ~$0.00075/s; confirm it stays small once re-voice and voice design volume is known.
5. **Failed-job waste.** Quantify `failedJobCostUsd30d`; fail earlier (cheap checks before expensive steps), and retry only the failed step.
6. **Revenue levers.** Yearly plans (listed in Phase 4, cash up front), dunning / failed-payment recovery through Stripe settings, upgrade prompts at the credit wall, annual-plan discount, a top-up offer when balance runs low, trial burn ($0.14) vs trial → paid.
7. **Storage and bandwidth.** Expiry policy for intermediate assets (images, clips) in the media store; keep finals.
8. **Stripe fees.** Check payment-method mix and Stripe Tax cost before the EU launch.

## 6. Connectors and tools that would sharpen the CFO

- **Stripe** (MCP, read-only restricted key): MRR, churn, fees, disputes. Needs OAuth on the claude.ai connector. Also a Stripe webhook-health view.
- **Supabase** (MCP is configured but failed to connect from the cloud sandbox with `ERR_PROXY_TUNNEL`): a read-only Postgres role or the service key in a routine secret, so `finance-report` can run. Without it the CFO is blind on cost and MRR.
- **Vercel** (MCP, connected): `list_billing_charges`, usage, runtime logs for render duration and function cost.
- **GitHub** (connected): branches and PRs.
- **Provider billing access:** fal.ai, ElevenLabs, Anthropic usage / cost APIs or a monthly export (the Anthropic Admin API has a usage and cost report).
- **Sentry / Resend** read tokens (optional): error rate to cost, email volume vs the free tier.
- **Routine secrets:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (prefer a read-only role), `STRIPE_SECRET_KEY` as a restricted read-only key, none of the provider keys unless smoke-testing a candidate (use a capped test key).
- Claude tools: web search / fetch for provider pricing pages (blocked from some sandboxes; the owner can paste pricing screenshots), the `dataviz` skill for a monthly cash chart artifact.

## 7. Output each run

A short digest (MRR, net MRR, margin, cost per video by tier, waste, the margin-gate multiples, top 3 findings with $/month, decisions needed) appended to TheMasterPlan §10 next to the north-star numbers, and PRs for anything shipped.
