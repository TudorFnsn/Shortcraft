# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine (prompt: `docs/routines/finance-cfo.md`). Product and priority calls stay in `TheMasterPlan.md`; this file holds the numbers, the cost-cutting backlog and the experiments.
>
> Last updated: 2026-10-18

## 1. Charter

Maximise **cash return**: grow MRR, cut the cost of every video, and never let a plan fall under the 3x margin gate (`features/billing/margin.ts`). Rank every idea by **monthly € gained ÷ effort**, then by risk. Cash first, polish later.

Always start a run by checking **MRR and the ratio of API/hosting cost to net MRR**. If cost share of net MRR is above 33% (below 3x), fixing that is the day's item.

## 2. Operating model: the CFO master agent and its sub-agents

The routine's top-level session is the **master agent** (the "DM"). It reads this file, gathers facts, splits the work, merges results, and ships one PR. It does not do all the research itself.

| Sub-agent              | Owns                                                                                                                                                              | Reads                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Revenue analyst**    | MRR, net MRR, churn, trial → paid, ARPU, plan mix, top-up share; Stripe balance and fees                                                                          | `scripts/finance-report.mts`, `scripts/metrics-report.mts`, Stripe connector |
| **Cost auditor**       | Real spend per provider: fal, ElevenLabs, Anthropic tokens, Vercel, Supabase, Resend, Sentry, domain. Invoices vs `api_cost_usd` in the DB; the gap is leakage    | Provider dashboards/connectors, Vercel billing tools, `render_jobs`          |
| **Provider scout**     | Cheaper or better models and hosts for each slot (video, image, voice, script, render). Prices from provider pages, not snippets; quality notes; migration effort | Web search/fetch, `src/config/models.ts`, `features/providers/live/*`        |
| **Pricing strategist** | Plan prices, credit scale, top-ups, annual plan, trial size, upsell prompts, discounts; checks every change against the margin gate                               | `features/billing/margin.ts`, `config/plans.ts`                              |
| **Implementer**        | Turns the chosen item into code + tests on a `ceo-finance/*` branch; nothing else                                                                                 | Repo                                                                         |

Master agent loop: **read → list open/recent PRs → run sub-agents in parallel (revenue, cost, scout; strategist when pricing moves) → rank findings by €/month → pick ONE item → Implementer ships it → update this file → digest + notify.**

## 3. Autonomy and guardrails

- **PR-gated**, like the other routines. Branch `ceo-finance/<slug>`. Never merges. Check open + recent PRs first; an item with an open PR is in review.
- May change: `src/config/models.ts`, `src/features/providers/**`, `src/features/billing/margin.ts` (assumptions only), `src/features/metrics/**`, `scripts/**`, this file, finance lines of `TheMasterPlan.md`, `.env.example`. It does **not** touch UI files (Design CEO) or run migrations.
- **Needs Tudor's explicit OK:** changing customer-facing prices or credit grants, switching a live provider (propose the swap with measured numbers, ship the adapter dark behind an env var), any Stripe write, any spend, live-mode changes.
- A new provider adapter lands **off by default**, with a smoke script and a measured-cost step before the catalog `costUsdPerUnit` is lowered.
- Prices come from provider pages or real invoices. A figure from a search snippet is marked **unverified** and never changes the catalog.
- **Notify only when it matters:** margin gate fails, cost share of net MRR > 33%, MRR drops, a provider bill spikes, a PR needs Tudor's decision, or the routine could not read its data. Quiet run = no notification.

## 4. Data the routine needs (and what is missing)

| Need                                         | Status                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Subscriptions, jobs, `api_cost_usd`, credits | Supabase. The cloud env has no `.env.local`; the Supabase connector failed to connect on 2026-10-18 (proxy tunnel). **Owner: fix connector or add read-only DB credentials to the routine env.** |
| Stripe revenue, fees, MRR, churn             | Stripe connector shows "needs authorization" on 2026-10-18 and is **sandbox only**. **Owner: authorize it; connect live mode read-only when live.**                                              |
| Real fal / ElevenLabs / Anthropic invoices   | **Not reachable.** Needs billing exports or read-only usage API keys (fal usage API, ElevenLabs `/v1/user/subscription`, Anthropic Admin API usage/cost reports) as routine secrets.             |
| Vercel and Supabase bills                    | Vercel connector exposes `list_billing_charges` and `list_contract_commitments`; use it. Supabase: dashboard or Management API.                                                                  |
| Fixed costs (domain, Resend, Sentry, tools)  | Fill the table in §5.                                                                                                                                                                            |

### Suggested connectors / tools (ask Tudor to enable)

1. **Stripe** (authorize; live read-only restricted key later): MRR, fees, churn, Sigma queries.
2. **Supabase connector** (fix the proxy failure) or a read-only Postgres role, so `scripts/finance-report.mts` runs in the cloud.
3. **Vercel** (already connected): billing charges, usage.
4. **Usage/cost keys as routine secrets:** Anthropic Admin API (cost report), fal usage API, ElevenLabs.
5. **PostHog or Plausible** for visitor → signup → paid funnel (CAC and conversion are missing today).
6. **Sentry** read access to tie failed renders to wasted spend.
7. Optional: **Google Sheets / Drive** connector for a monthly P&L, **Slack/email** for the digest.

## 5. Financial baseline (fill from real data)

| Item                                                                          | Value                                                          | Source               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------- |
| MRR (gross, EUR)                                                              | _unknown, not read yet_                                        | `finance-report.mts` |
| Net MRR (USD, after VAT + fees)                                               | _unknown_                                                      | same                 |
| API cost / finished video                                                     | _unknown_ (catalog: Standard ≈ $0.07 per 15s, Premium ≈ $1.10) | same                 |
| API cost share of net MRR                                                     | _unknown_ (gate target ≤ 33%)                                  | same                 |
| Fixed monthly: Vercel / Supabase / ElevenLabs plan / Resend / Sentry / domain | _unknown_                                                      | invoices             |
| Break-even subscribers                                                        | _compute once fixed costs are known_                           |                      |

Token accounting to add (backlog F2): `render_jobs` stores one `api_cost_usd` per job. Per-call Anthropic token counts (input/output) and fal billed seconds are not stored, so "tokens vs spend" cannot be reconciled yet. Add a `provider_usage` table (job, provider, units, unit type, cost) in a migration the owner applies.

## 6. Backlog (rank by €/month; the master agent re-ranks every run)

- [ ] **F1 Measure first.** Run `finance-report.mts` against production; fill §5. _(shipped: report + tests; needs data access)_
- [ ] **F2 Usage ledger.** `provider_usage` table + write from each adapter (tokens in/out, billed seconds, megapixels, characters). Reconcile monthly against invoices.
- [ ] **F3 Premium video cost.** Kling 2.5 Turbo Pro ≈ $0.07/s list. Scout cheaper image-to-video, adapter dark, A/B on 10 real scenes: Wan 2.2/2.5/2.6 (fal $0.04–0.10/s; Atlas Cloud lists Wan 2.6 Flash $0.018/s and Wan 2.2 Turbo $0.02/s, unverified), Seedance 2.0 Fast (≈ $0.09/s direct; reseller claims lower, unverified), Kling 3.0 Std via aggregator (≈ $0.07/s, unverified). Beware per-minute billing minimums (BytePlus) and fixed 5 s clips (Kling).
- [ ] **F4 Hero-shot Premium.** Animate scene 1 only, stills for the rest: ≈ $0.45 vs ≈ $1.10 per 15s. Price it between Standard and full Premium; more buyers, same margin.
- [ ] **F5 Image cost.** FLUX schnell is already $0.003/MP. Check Runware / WaveSpeed / Together for the Premium slot; keep schnell as default.
- [ ] **F6 Script cost.** Prompt caching on the fixed system prompt, shorter outputs, and Haiku-class model for scripts if quality holds (A/B). Anthropic Batch API is not usable (latency).
- [ ] **F7 Voice cost.** ElevenLabs Flash ≈ $0.05/1k chars. Compare Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural for the default voice; keep ElevenLabs for Voice Studio/design. Watch custom-voice slot costs.
- [ ] **F8 Hosting.** Render runs on Vercel functions. Check function duration/GB-hours in billing; consider moving long ffmpeg renders to a cheaper worker only if it is a top-3 cost.
- [ ] **F9 Failure waste.** Failed jobs still spend. Compute wasted API $ per failed job; fail earlier, retry cheaper.
- [ ] **F10 Revenue levers (Tudor decides):** annual plan (cash up front, 15–20% discount), trial size (3,000 credits costs ≈ $0.25 per signup), top-up upsell at low balance, Premium paywall copy, price tests by cohort, expiry/rollover rules, referral credit instead of paid ads.
- [ ] **F11 Fees.** Stripe fee mix (cards vs local methods), Stripe Tax vs manual VAT, refunds/chargebacks rate.

## 7. Provider scouting notes

Search snippets of 2026-10-18 (all **unverified**; most are vendor blogs): Wan is cheapest per second; Seedance 2.0 is rated best on price/quality; Kling sits in the middle; Replicate is often not cheaper than fal; self-hosting video only wins at high volume. Verify on the provider page and with a 10-scene test before any catalog change.

## 8. Changelog (newest on top)

- **2026-10-18** — Finance track created: this plan, the CFO routine prompt (`docs/routines/finance-cfo.md`), `features/metrics/finance.ts` (MRR, cost per video, cost share, tests) and `scripts/finance-report.mts`. No data read yet: Supabase connector failed to connect and Stripe needs authorization in the creating session. (interactive)
