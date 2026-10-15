# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on cost, pricing experiments and cash. Every finance PR updates
> this file (ledger, backlog, changelog) in the same change.
>
> Last updated: 2026-10-15 (track created; no live data read yet)

---

## 1. Charter (owner request 2026-10-15, do not change without Tudor)

| Question  | Answer                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal      | **Maximum profit, cash first.** Raise MRR and gross margin; cut every avoidable cost; prefer the change that returns cash soonest.                                       |
| Every run | Check MRR, ARPU, gross margin and cost per video **before** anything else; report the delta vs the last run.                                                             |
| Costs     | Account for every payment: fal.ai, ElevenLabs, Anthropic (tokens), Supabase, Vercel, Resend, Sentry, Stripe fees, domains, any other subscription the owner lists in §3. |
| Providers | Keep looking for cheaper and better tech (video, image, voice, script, hosting). fal.ai video is the known expensive line. Always price-check against measured cost.     |
| Autonomy  | **Analyse freely, change via PR.** Branches `ceo-finance/<slug>`; never merge. Anything that changes what a customer pays, or spends money, needs Tudor's OK (§5).       |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the main CEO at 06:00 and the Design CEO at 09:00). Weekly deep dive on Mondays.                      |
| Shape     | Same as the other routines: one **master agent** that reads state, splits the work to specialist subagents in parallel, merges their findings and ships one item.        |

### Priorities (in order)

1. **Don't lose money:** the margin gate (`npx tsx scripts/margin-report.mts`) must pass on _measured_ costs, not list prices. Fail-closed stays on.
2. **Cut cost per video** without lowering quality the customer sees (provider swaps, caching, retries, failed-job waste, prompt/token size).
3. **Raise revenue per user:** pricing, packaging, annual plans, top-up nudges, upgrade prompts, trial economics, churn/dunning.
4. **Raise conversion:** only where it moves paid MRR (hand off UI work to the Design CEO; never edit its files).
5. **Cash timing:** annual prepay, Stripe payout and fee settings, avoiding idle paid seats/plans.

---

## 2. Metrics the routine reports every run

| Metric                       | Source                                                                                    | Target / alarm                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| MRR, net MRR, ARPU, by plan  | `npx tsx scripts/finance-report.mts` (+ Stripe connector for the live-mode truth)         | up week over week                                 |
| Measured API cost per video  | same script: `render_jobs.api_cost_usd` for `done` jobs, by tier                          | Standard ≤ $0.10, Premium falling                 |
| Cost per credit vs the gate  | same script vs `config/models.ts` assumptions                                             | alarm if measured > assumed (gate is 3.0x on Pro) |
| Burned cost on failed jobs   | same script                                                                               | < 2% of API cost                                  |
| Gross margin (proxy → real)  | proxy from the script; real once §3 fixed costs are filled                                | ≥ 70% at scale                                    |
| Tokens per video (Anthropic) | Anthropic usage/cost data (connector or Admin key); `costUsdFor` in `anthropic-script.ts` | script cost ≤ $0.04, falling                      |
| Fixed monthly costs          | §3 table                                                                                  | each line justified or cancelled                  |
| Runway / break-even MRR      | fixed costs ÷ gross margin %                                                              | known and shrinking                               |
| Trial burn per signup        | `assessMargins().trialCostUsd`                                                            | ≤ $0.25                                           |

Today's repo-only picture (assumed, not measured): Standard 15s ≈ $0.07, Premium 15s ≈ $1.10–2.30, Pro at exactly 3.0x, trial burn $0.14–0.25. **Nothing here is measured on live traffic yet.** The first job of the routine is to replace these with measured numbers.

---

## 3. Cost ledger (owner fills in; the routine keeps it current)

| Line               | Provider / plan                           | Monthly cost  | Billing source / how to read it                 | Last checked | Notes                             |
| ------------------ | ----------------------------------------- | ------------- | ----------------------------------------------- | ------------ | --------------------------------- |
| Video + image gen  | fal.ai (Kling 2.5 Turbo Pro, FLUX)        | usage         | fal.ai dashboard / usage API (needs key)        | —            | The expensive line; see §4        |
| Voiceover          | ElevenLabs (plan + custom-voice slots)    | ? €           | ElevenLabs dashboard / usage API (needs key)    | —            | Slots are a fixed plan cost       |
| Script LLM         | Anthropic (Sonnet 5.5)                    | usage         | Anthropic Console usage / Admin API (needs key) | —            | Tokens in `anthropic-script.ts`   |
| Database + storage | Supabase (project `iqvrovjwoavvmhaithwn`) | ? €           | Supabase connector + dashboard billing          | —            | Media bucket growth is the risk   |
| Hosting            | Vercel                                    | ? €           | Vercel connector (`list_billing_charges`)       | —            | Function time for in-house ffmpeg |
| Email              | Resend                                    | ? €           | Resend dashboard                                | —            |                                   |
| Error tracking     | Sentry                                    | ? €           | Sentry dashboard                                | —            |                                   |
| Payments           | Stripe fees                               | ~1.5% + €0.25 | Stripe connector (live mode needed)             | —            | Fee assumptions in `margin.ts`    |
| Domain / other     | ?                                         | ?             | owner                                           | —            |                                   |

Rule: a line with `?` is an open question to Tudor (see the run digest), not something to guess.

---

## 4. Backlog (ordered by cash impact; the routine reorders it)

Each item needs: expected € per month, effort, risk, how it is measured, and whether it needs owner approval.

- [ ] **F0 — Measure.** Run `finance-report.mts` against the live project; record measured cost per video, per credit, per tier; refresh the margin gate with them (`config/models.ts` `costUsdPerUnit`). _Needs the service-role key in the routine's environment._
- [ ] **F1 — Fill §3** with real invoices so gross margin is real, not a proxy.
- [ ] **F2 — Premium video cost.** Price-check Kling (direct API vs fal.ai), Wan 2.x, Seedance, Hailuo, LTX-2, Veo Fast and any newer model against measured Kling cost; test open-weight models on per-second GPU hosts (Replicate, RunPod, Modal, Together) for the hero-shot variant. Output: a table with $/s at 720p vertical, quality notes, adapter effort. Candidates are hypotheses until priced on a live call.
- [ ] **F3 — Failed-job waste.** Where do failed jobs spend money (images made, clip made, render failed)? Add resume/refund-less retries and early moderation so failures cost ~$0.
- [ ] **F4 — Token diet.** Measure input/output tokens per script; use prompt caching, a smaller output schema, Haiku-class model for drafts if quality holds (A/B on fixtures, not on customers).
- [ ] **F5 — Asset cost.** Storage and egress of media per video; expiry/transcoding policy for old free-tier assets; check the Supabase bucket growth rate.
- [ ] **F6 — Pricing & packaging.** Annual plans with discount (cash up front, lower churn), top-up nudge when credits run low, Premium priced from measured cost, trial size vs measured burn. _Customer-facing: owner approval._
- [ ] **F7 — Churn & dunning.** Stripe smart retries, card-expiry emails, cancel-flow offer (pause or downgrade instead of cancel). _Owner approval for copy/offers._
- [ ] **F8 — Fixed-cost audit.** Every §3 line: needed? downgrade? annual discount available?
- [ ] **F9 — Affiliate / referral economics** (master plan §6): max commission the margin allows.

---

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recent PRs (list them with the GitHub tools; an item with an open PR is in review, not available), the last digest in §7.
- **Measure before proposing.** Run `npx tsx scripts/finance-report.mts` and `npx tsx scripts/margin-report.mts`, and read Stripe (read-only), Supabase (read-only SQL), Vercel billing when the connectors are up. If a source is unreachable, say so in the digest and carry on with what is reachable. Never invent a number: mark it `assumed` or `unknown`.
- **Master agent, parallel specialists.** The master reads state, then launches these subagents in ONE message, each with a narrow brief and the exact files/data it needs, and merges their reports (verify any claim that would change code or price):
  1. **Cost auditor:** measured cost per video/credit/tier, failed-job waste, tokens per script, fixed-cost ledger.
  2. **Revenue analyst:** MRR, ARPU, plan mix, churn, trial→paid, failed payments, refunds, top-up share (Stripe + Supabase).
  3. **Provider scout:** web research on cheaper/better video, image, voice, LLM and hosting options; fresh models and price changes; returns a priced shortlist with sources and dates.
  4. **Pricing strategist:** plan/top-up/annual/trial changes simulated through `assessMargins()`; returns expected MRR and margin effect.
  5. **Implementer** (only when one item is chosen): writes the code and tests for that single item.
- **One item per run:** top unchecked item in §4 that is not in an open `ceo-finance/*` PR. Prefer finishing an open PR to starting a new one.
- **Owner approval required (ask in the digest, change nothing until `[✓]`):** any change to plan prices, credit grants, credit rates charged to customers, trial size, discounts; enabling a new paid provider or live adapter; any Stripe object write; any spend; any migration; cancelling or downgrading a vendor plan. Cost-only refactors that keep customer prices unchanged may go to PR directly.
- **Files it may change:** `FinancePlan.md`, `scripts/finance-report.mts`, `src/features/metrics/finance.ts`, `tests/metrics/**`, `src/config/models.ts` (measured `costUsdPerUnit` and provider ids only), `src/features/providers/**` (new or cheaper adapters behind the existing port, mock-first), `src/features/billing/margin.ts` (assumptions only), `docs/**`, and the finance lines of `TheMasterPlan.md`. It never touches UI files owned by the Design CEO (`src/app/**` views, `src/components/**`), webhooks, credit RPCs or live secrets. Send UI needs to the Design CEO as a note in the digest.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` all pass in mock mode; the margin gate still passes (or the PR explains exactly why it must change and waits for Tudor).
- **Safety:** never print or commit a secret; use read-only credentials for every connector; never switch `MOCK_PROVIDERS` off; never merge.
- **Output (the digest):** (1) the numbers: MRR, ARPU, gross margin, cost per video, delta vs last run; (2) what moved (PR link); (3) top three cash opportunities with € per month and confidence; (4) what is waiting on Tudor; (5) data/connectors still missing; (6) next item.
- **Notify only when it matters:** a measured cost above the gate's assumption, MRR drop, a burn spike, a failed payment cluster, a vendor price change, or a decision/missing access that blocks the track. A quiet "all fine" run sends nothing.

---

## 6. Connectors, tools and add-ons that would sharpen this routine

Already connected (claude.ai, per TheMasterPlan §9): **Supabase** (read-only SQL, logs, advisors) and **Stripe** (sandbox only so far).

| Priority | Add                                                                                                                                                                             | Why                                                                                     | Access it needs                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1        | **Stripe, live mode, restricted read-only key**                                                                                                                                 | Real MRR, churn, refunds, failed payments, fees. The sandbox has no real revenue.       | Restricted key: read on subscriptions, invoices, charges, balance, payouts |
| 2        | **Vercel connector** (available in this session)                                                                                                                                | Hosting bill (`list_billing_charges`), function duration/errors for in-house ffmpeg.    | Read-only team access                                                      |
| 3        | **fal.ai usage/billing access**                                                                                                                                                 | The biggest variable cost; per-model spend and per-request cost to replace list prices. | A fal.ai API key with usage read, or a monthly usage export                |
| 4        | **Anthropic Console / Admin API key**                                                                                                                                           | Real tokens and USD per day and per model; cache hit rate.                              | Admin key (read usage/cost), or a CSV export                               |
| 5        | **ElevenLabs usage**                                                                                                                                                            | Characters used, slot count vs plan.                                                    | API key with usage read                                                    |
| 6        | **Resend, Sentry dashboards or exports**                                                                                                                                        | Small fixed lines; Sentry also shows failed-job error cost.                             | Read-only or monthly invoices                                              |
| 7        | **PostHog or Plausible** (none today)                                                                                                                                           | Visitor→signup→paid funnel and CAC by channel; needed before paid ads (master plan §6). | Project API key (read)                                                     |
| 8        | **Google Sheets / Drive connector**                                                                                                                                             | A live P&L sheet the owner can read; or the owner drops invoices in a folder.           | A sheet or folder shared with the connector                                |
| 9        | **Claude add-ons:** web search/research subagents for the provider scout; `dataviz` skill for a monthly P&L chart artifact; a published Artifact dashboard of the daily numbers | Faster provider research; a page Tudor can open instead of reading digests              | none beyond the above                                                      |

---

## 7. Ledger of runs and changelog (newest on top)

- **2026-10-15** — Track created (interactive): charter, metrics, cost ledger, backlog F0–F9, routine rules, and the measuring tools `scripts/finance-report.mts` + `src/features/metrics/finance.ts` (MRR, ARPU, measured cost per video/credit by tier, burned failed-job cost, gross-margin proxy; +4 tests, 524 total). No live data read yet; the routine's first run does F0.
