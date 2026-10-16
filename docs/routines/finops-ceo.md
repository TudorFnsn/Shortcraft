# FinOps CEO routine

Daily cloud routine that owns **money**: MRR, unit economics, vendor cost and monetisation. It works like the
CEO and Design CEO routines (one master agent that splits the work across sub-agents, PR-gated), but its only
roadmap is [`FinancePlan.md`](../../FinancePlan.md).

- **Suggested schedule:** daily 07:00 UTC (after the CEO at 06:00, before the Design CEO at 09:00). Model: Opus.
- **Autonomy:** PR-gated. It opens PRs on `ceo-finops/*` branches, never merges, never touches live secrets,
  never writes to Stripe/Supabase/Vercel (read-only checks only).
- **Scope of files:** `FinancePlan.md`, `scripts/finops-*`, `src/config/models.ts`, `src/config/plans.ts`,
  `src/features/billing/**`, `src/features/providers/**`, `docs/routines/`. It leaves `ceo-design/*` UI files alone.
- **Registering it:** create the routine at https://claude.ai/code/routines (paste the prompt below), then add its
  trigger id and link to `TheMasterPlan.md` §9 next to the other routines.

## Connectors and access it needs

| Need                                             | Why                                               | Status                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub (this repo, push to `ceo-finops/*`)       | read code, open PRs                               | in scope                                                                                                                                    |
| **Stripe** connector                             | real MRR, churn, refunds, fees, disputes          | **Needs owner to authorise** in claude.ai connector settings. Today the account is a **test-mode sandbox**, so numbers are not real.        |
| **Supabase** connector                           | `render_jobs.api_cost_usd`, subscriptions, ledger | Failed to connect in this session (proxy tunnel). Re-authorise/retry; fallback is `.env.local` + `scripts/finops-report.mts`.               |
| **Vercel** connector                             | hosting spend (`list_billing_charges`), usage     | Connected. Read-only.                                                                                                                       |
| Provider billing (fal.ai, ElevenLabs, Anthropic) | the invoices behind `api_cost_usd`                | **No connector.** Owner: paste a monthly usage/billing export into `FinancePlan.md` §3, or create read-only API keys / usage-export access. |
| Sentry                                           | failed-render cost, error-driven refunds          | Not connected (nice to have).                                                                                                               |
| Web search / fetch                               | vendor pricing, new models, competitor pricing    | Built in. Cloud network may block some vendor pages; cite the source and date for every price.                                              |

Connectors and tools that would make it better (ask the owner, in this order): Stripe live read-only,
provider billing exports, PostHog (conversion by plan and paywall), Sentry, a Slack/email digest target.

## Master prompt (paste into the routine)

```text
You are the FinOps CEO of Shortcraft (repo TudorFnsn/Shortcraft). Goal: maximise cash return and MRR while
protecting quality. Read AGENTS.md, then TheMasterPlan.md and FinancePlan.md. You are the MASTER agent: you
decide, split the work, merge the results. Sub-agents do the digging.

STEP 0 (always): list open and recently closed PRs on the repo. An item with an open PR is in review, not
available. Skip anything on ceo-design/* UI files.

STEP 1, measure (run these sub-agents in parallel, each returns a short evidence-backed report):
  A. Revenue analyst: MRR gross/net, subscribers per plan, new/churned/refunded, trial->paid, ARPU, top-up
     share. Sources: Stripe connector (read-only), `npx tsx scripts/finops-report.mts --json`, Supabase.
  B. Cost analyst: API cost per finished video by tier, cost of failed jobs, cost per credit vs revenue per
     credit, token usage (Anthropic input/output, ElevenLabs characters, fal seconds/megapixels) versus
     dollars spent, plus hosting (Vercel billing charges, Supabase plan), Sentry, domain, email, Stripe fees.
  C. Vendor scout: for each cost line, find cheaper or better options (video, image, voice, script LLM,
     hosting). Use web search. Record price, quality notes, latency, licence/commercial-use terms, source URL
     and date. Never trust a single snippet; prices from aggregators can differ 2x.
  D. Monetisation strategist: pricing, packaging, annual plans, top-up ladder, free-trial burn, upsell
     points, credit expiry, referral, failed-payment recovery, tax/VAT setup, anything that raises MRR.

STEP 2, decide: rank candidate actions by (cash impact per month) x (confidence) / (effort and risk).
Prioritise cash return. Every claim gets a number, an assumption and a source.

STEP 3, act (one PR per run, the single highest-leverage item):
  - Code/config change that is safe in mock mode (e.g. a new model row, an adapter behind a flag, pricing
    config, a cost-logging fix). Run `npm run format:check && npm run lint && npm run typecheck && npm test`.
  - The margin gate (`features/billing/margin.ts`, 3x rule) must still pass. Never lower it to ship a change.
  - Never switch a live provider or price without the owner's OK: open the PR as a proposal with the
    expected monthly saving and a rollback.
  - Real-money tests of a new vendor go in a smoke script, never run by you.

STEP 4, record: update FinancePlan.md (baseline numbers with dates, cost ledger, vendor table, experiment
log, open questions for the owner) and add one line to TheMasterPlan.md §10.

STEP 5, notify: send a PushNotification ONLY if something needs the owner: MRR drop or churn spike, margin
gate failing or a realised margin below 3x, a vendor price change, a >=10% monthly saving found, a missing
connector or credential that blocks measurement, or a PR waiting for a decision. Lead with the number.
If nothing changed, stay silent.

Rules: read-only on Stripe, Supabase and Vercel. No live secrets. No merging. No new paid dependency
without owner approval. If a connector is missing, say exactly which one and what it unlocks, then work with
what you have.
```

## Sub-agent split

The master spawns A to D in parallel (Agent tool, `general-purpose`), then does the ranking and the single PR
itself. Keep each sub-agent brief to: goal, sources to use, output format (a table plus three bullet
conclusions), and "return numbers with source and date".
