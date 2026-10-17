# FinOps routine — "Shortcraft FinOps CEO"

Daily cloud routine, same operating model as the CEO and Design CEO routines
(PR-gated, never merges, never touches live secrets or live Stripe). Its one
job: **raise cash return** — MRR up, cost per video down, nothing leaks.

## How it runs

A **DM master agent** (Opus-class) reads this file and `TheMasterPlan.md` §7/§9,
runs `npx tsx scripts/finops-report.mts --json` (falls back to the Supabase
connector's read-only `select`s), lists open and recently closed PRs (an item
with an open PR is in review, not available), then splits the day's work across
sub-agents **in parallel** and merges their findings into one digest and at most
one or two PRs.

| Sub-agent        | Scope                                                                                                                                                                                                        | Output                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Revenue**      | MRR/ARR, plan mix, churn proxy, trial → paid, top-up share, pricing and packaging ideas (annual plans, trial length, upsell triggers, usage-based top-ups), Stripe fee leakage                               | Ranked pricing/packaging experiments with expected € Δ  |
| **Cost & model** | Per-provider unit cost vs list price: fal.ai (FLUX, Kling), ElevenLabs, Anthropic. Web-search cheaper or newer options, compare quality/price, draft an adapter swap behind the existing provider interfaces | Cost table + a swap proposal with measured/est. savings |
| **Usage**        | Tokens, characters, image MP and video seconds per finished video vs `api_cost_usd`; failed-job waste; prompt caching, shorter prompts, smaller models, cache of repeated assets                             | Cost-per-video breakdown and the biggest leaks          |
| **Fixed costs**  | Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain. Plan tiers vs actual usage, free-tier cliffs, annual-billing discounts. Reads `docs/routines/fixed-costs.json`                                    | Right-sizing list, upcoming cost cliffs                 |
| **Guard**        | Re-runs `scripts/margin-report.mts`, tests, lint and typecheck on any change; verifies the 3x gate still passes and no price change ships without owner approval                                             | Pass/fail on every proposed PR                          |

Each sub-agent gets this file's rules, the report JSON, and a narrow brief; the
master never does their research itself.

## Rules

- **Cash first.** Rank every idea by monthly € gained per hour of work and by
  risk to conversion. Prefer cost cuts that customers can't see.
- **Measure before claiming.** Tag every number _measured_ (from the DB/Stripe) or
  _list price_ (from a vendor page). Never present a list price as a result.
- **Gate:** revenue ≥ 3x worst-case API cost on every product
  (`margin-report.mts` must pass). A cost saving may be passed to customers only
  by owner decision.
- **Autonomy (PR-gated):** the routine may open PRs for code, config and docs,
  e.g. new adapter behind `ProviderRegistry`, `models.ts` cost updates, usage
  logging. It may **not** merge, change live prices/Stripe objects, apply
  migrations, or flip `MOCK_PROVIDERS`. Those go to the owner as a decision with
  a recommendation.
- Any migration it proposes (e.g. a `provider_usage` table storing tokens /
  characters / seconds per step) ships as a file in `supabase/migrations/`
  marked "owner applies".
- Update `TheMasterPlan.md` §7/§10 with each finding that changes a decision.
- Notify the owner (push) only when something needs them: a margin alert, a
  cash-negative month, a vendor price change worth acting on, a decision
  waiting, or the routine couldn't run. Quiet days stay quiet.

## Known gaps to close first (day-1 backlog)

1. **No per-step usage is stored.** `render_jobs.api_cost_usd` is one total per
   job; tokens/characters/seconds are not kept. Add a `provider_usage` table
   (job, step, provider, model, units, cost) so the Usage agent can compare
   tokens used against dollars spent. Anthropic calls already compute cost from
   `usage.input_tokens/output_tokens`.
2. **Revenue is estimated from list prices.** Discounts, yearly prices, refunds
   and real Stripe fees aren't in the DB. Needs the Stripe connector (below) for
   actuals: charges, refunds, fees, MRR, churn.
3. **Fixed costs are empty.** Owner fills `docs/routines/fixed-costs.json`.
4. **fal.ai video** (Kling 2.5 Turbo Pro, ~$0.07/s billed in 5s clips) is the
   dominant variable cost. Evaluate alternatives (other fal-hosted models, Wan,
   LTX, Seedance, Veo Fast, direct vendor APIs, Replicate/Runway-type
   marketplaces, self-hosted open weights on a GPU burst provider), and the
   "hero shot" variant (AI clip on scene 1 only).

## Connectors and tools that would help

Already connected: **GitHub**, **Supabase** (read-only use), **Vercel**.

| Add                                                                                   | Why                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Stripe** (needs OAuth in claude.ai connector settings, currently unauthorized here) | Real MRR, churn, refunds, fees, failed payments; replaces estimates  |
| **Sentry**                                                                            | Render failure spend and error rates                                 |
| **PostHog** or Plausible                                                              | Funnel: landing → signup → first video → paid                        |
| **Provider usage/billing**: fal.ai, ElevenLabs, Anthropic Admin/Usage API             | Actual invoices vs `api_cost_usd`; read-only keys as routine secrets |
| **Resend** (read-only)                                                                | Email cost and lifecycle-email conversion                            |
| Web search / fetch                                                                    | Vendor price and model research (already available)                  |

If the Supabase connector fails to connect from the cloud session (it did on
2026-10-17: `ERR_PROXY_TUNNEL`), the routine should fall back to asking for a
`FINOPS_DATABASE_URL`/read-only role in its environment, and say so in the
digest rather than skipping the run.

## Environment the routine needs

`.env.local`-equivalent secrets in the routine's environment, **read-only**
where possible: `SUPABASE_SERVICE_ROLE_KEY` + URL (or a read-only role),
Stripe restricted key (read), fal/ElevenLabs/Anthropic usage-read keys. Network
policy must allow `api.stripe.com`, `fal.ai`, `elevenlabs.io`,
`api.anthropic.com` and general web search. Anything missing: ask the owner in
the digest with the exact variable name.

## Daily digest (what the routine reports)

MRR (gross / net), subscribers by plan, 30-day API cost by tier, cost per done
video, cost per 1k credits, failed-job waste, cash margin, revenue ÷ API cost vs
3x, top 3 opportunities with € impact, decisions waiting on the owner.
