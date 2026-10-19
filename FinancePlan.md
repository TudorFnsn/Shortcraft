# FinancePlan — Shortcraft

> **Source of truth for the finance track**, owned by the **Finance CEO** routine
> (`docs/routines/finance-ceo.md`, agents in `.claude/agents/finance-*.md`).
> `TheMasterPlan.md` wins on product and priority. Every Finance PR updates this
> file (numbers, backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (created)

---

## 1. Charter

Maximise **cash return**: net MRR growth first, then gross margin, then cost.
Measure the **COGS ratio** (API spend / net MRR) every run; the margin gate
promises at most 33% at full burn, real usage should sit well below.
Autonomy: PR-gated, no merges, no live price/Stripe/secret changes (see routine
guardrails).

## 2. Baseline (fill from the first run that can read the DB)

| Metric                           | Value          | Source                                  |
| -------------------------------- | -------------- | --------------------------------------- |
| Paying subscribers / MRR (gross) | unknown        | `finance-report.mts` / Stripe           |
| Net MRR (after VAT + fees)       | unknown        | `finance-report.mts`                    |
| API spend, trailing 30d          | unknown        | `render_jobs.api_cost_usd`              |
| COGS ratio / gross margin        | unknown        | `finance-report.mts`                    |
| Fixed tools per month            | unknown        | Vercel / Supabase / Resend / ElevenLabs |
| Tokens per video                 | **not stored** | see §5                                  |

Known measured points (TheMasterPlan §5, 2026-10-08, internal list-price cost):
Standard 15s $0.037, Standard 30s $0.049, Premium 30s $1.92 (3m26s). Gate:
Starter 9.4x, Pro 3.00x (zero headroom), Ultra 3.23x, top-ups 4.0–5.9x, trial burn $0.14.

## 3. Where the money goes (hypotheses to confirm)

1. **Premium AI video** is ~97% of the cost of the most expensive shape and the
   reason Pro has no headroom. Biggest lever.
2. **Script LLM** ($0.04 assumed per video) is the largest Standard cost: check real
   tokens, prompt caching and a cheaper model for the grey-zone steps.
3. **Fixed costs** (Supabase Pro for leaked-password protection, ElevenLabs
   custom-voice slots, Resend, Vercel Pro if Hobby limits bite) are paid whether
   or not anyone subscribes: they set the break-even subscriber count.
4. **Failed jobs** cost real provider money and refund the user: waste.
5. **Trial burn** ($0.14/signup assumed) is acquisition cost: pair with trial to paid.

## 4. Backlog (ranked by cash x confidence / effort)

Mark `[ ]` open, `[~]` in review (PR), `[x]` done. Add the run date and PR.

- [ ] **Trial the cheapest fal-hosted video models via `FAL_VIDEO_MODEL`** (no code):
      candidates seen in a 2026-10-19 search, all unverified secondary-source
      prices: Grok Imagine Video ~$0.07/s with audio, Wan 2.7 ~$0.10/s,
      Seedance 2.0 Fast ~$0.09/s, Kling 2.6 Pro ~$0.14/s, Veo 3.1 Fast ~$0.15/s,
      against the current Kling 2.5 Turbo Pro ~$0.07/s. Note the catalog bills
      $0.12/s conservatively because clips are fixed 5s: measure real cost per scene.
      Include a direct-vendor and an aggregator route (e.g. Atlas Cloud claims large
      discounts on Seedance 2.0; treat as marketing until measured).
- [ ] **Hero-shot Premium** (AI clip on the hook scene, stills for the rest, ~1/3 cost):
      decided pending a measured clip; unlocks a cheaper Premium price and Pro headroom.
- [ ] **Store usage per job** (migration proposal, owner applies): `render_steps`
      or columns for input/output tokens, provider, model, billed units and cost per
      step, so tokens-vs-spend and per-provider invoices can be reconciled.
- [ ] **Prompt caching + token audit** on `anthropic-script.ts`; test a Haiku-class
      model for scripting at equal quality (cost/quality sample of 20).
- [ ] **Reconcile catalog vs invoices** (owner sends fal, ElevenLabs, Anthropic
      spend for a date range, or grants read-only usage keys), then lower or raise
      `costUsdPerUnit` and re-run the gate. Open since 2026-10-09.
- [ ] **Annual plans** (pay 10 months for 12): cash up front, lower churn; model
      against the margin gate and breakage.
- [ ] **Watermark-free / extra-voice-slot / re-voice add-ons** priced from API cost.
- [ ] **Affiliate economics**: confirm 30% recurring clears the gate before launch.
- [ ] **Storage/egress**: retention policy and R2 move (zero egress) once volume warrants.

## 5. Tokens vs spend

Today only a dollar figure per job is stored (`render_jobs.api_cost_usd`), computed
inside each adapter from usage × the catalog's list price (the Anthropic adapter
sees `usage.input_tokens/output_tokens` and discards them after pricing). So
"tokens per video" is **unmeasured**; the report says so instead of guessing.
Until the migration in §4 lands, the routine estimates from the adapters' prompts
and `costUsdFor`, labelled as an estimate.

## 6. Access the routine needs (owner actions)

| Need                                     | Unlocks                                   | How (read-only)                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub push on this repo                 | PRs on `ceo-finance/*`                    | already scoped to `tudorfnsn/shortcraft`                                                                                                              |
| Supabase read path from the cloud        | `finance-report.mts` with real numbers    | Supabase connector (SQL select) or a read-only Postgres role; the MCP server failed to connect in the first session (proxy tunnel error), retry/check |
| Stripe connector authorised (live later) | real MRR, churn, refunds, top-up revenue  | claude.ai connector settings → Stripe (currently needs authorisation)                                                                                 |
| Vercel connector                         | billing charges, usage, function duration | connected; the routine uses `list_billing_charges` read-only                                                                                          |
| fal.ai, ElevenLabs, Anthropic usage      | invoice reconciliation                    | send monthly totals into §2, or a usage/admin key limited to read                                                                                     |
| Resend / Sentry / Supabase usage         | fixed-cost audit                          | dashboards totals into §2                                                                                                                             |
| PostHog (when it lands)                  | funnel leak sizing                        | read-only project key                                                                                                                                 |
| Digest destination                       | owner sees results                        | PushNotification (done); optional Slack/email connector                                                                                               |

Suggested tools: the Stripe, Supabase and Vercel connectors; a sheet or doc
connector for a monthly P&L; the `dataviz` skill for the weekly margin chart;
a Workflow for the monthly deep vendor bake-off (fan-out one agent per vendor).

## 7. Open questions for Tudor

1. Real numbers: current paying subscribers, MRR, and last month's fal.ai / ElevenLabs / Anthropic / Vercel / Supabase bills.
2. Monthly budget cap for vendor trials (suggest $20 per trial).
3. Is Stripe still test-only? Go-live date matters for every revenue number.
4. Appetite for: annual plans, add-ons, affiliate program, price increase on Starter.
5. Quality bar: is a cheaper clip model acceptable if it is 10–20% worse?

## 8. Decision log

- **2026-10-19** — Finance track created as a third routine with a master agent and five specialists (cost audit, vendor scout, pricing, growth, tooling), PR-gated, read-only on money systems. Why: Premium video dominates cost, Pro sits at exactly 3.00x, and no one watches MRR or margin between releases.

## 9. Changelog

- **2026-10-19** — Added `FinancePlan.md`, `docs/routines/finance-ceo.md`, the `finance-*` agents, `src/features/finance/unit-economics.ts` and `scripts/finance-report.mts` (read-only MRR, COGS ratio, cost per video by tier, waste, trial burn, subscribers losing money). +6 tests. No migration, no runtime change. (Finance CEO setup, interactive)
