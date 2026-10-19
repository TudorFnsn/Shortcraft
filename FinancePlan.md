# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> Product, pricing-policy and priority calls still live in `TheMasterPlan.md`
> (§7 pricing, §8 risks); this file holds the finance charter, the numbers the
> routine tracks, its backlog and its rules. Last updated: 2026-10-19.

---

## 1. Charter

**Goal:** maximise cash return. Every run checks the MRR ratio, finds where money
leaks or can be made, and ships (as a PR) or proposes (to the owner) the change
with the best cash impact per unit of effort.

**What it optimises, in order:**

1. **Cash in** — MRR, net new MRR, conversion (trial → paid), annual prepay, dunning/recovery, top-up attach rate.
2. **Cost of goods** — API cost per finished video, per tier, per provider; money burned on failed jobs and free trials; cost per 1,000 credits sold.
3. **Fixed costs** — Vercel, Supabase, ElevenLabs, fal.ai, Anthropic, Resend, Sentry, domain, anything else that bills monthly. Anything unused or over-tiered is a saving.
4. **Fresh tech** — cheaper or better models/providers/techniques (see §6). Measured, never assumed.

**The MRR ratio** (the headline number, defined here so it never drifts):

```
MRR ratio  = MRR (net of VAT, USD)  ÷  total monthly spend (API cost + fixed costs + Stripe fees)
```

- Below 1.0x we lose money every month. Target ≥ 3x once there is traction.
- Companion numbers: gross margin per video, COGS share of MRR, MRR : COGS (`scripts/finance-report.mts`), trial burn per signup, CAC payback, runway.
- Pre-launch (MRR ≈ 0) the ratio is meaningless, so the routine works the **forward** version: projected MRR at the next milestone vs projected spend, using measured unit costs.

**Cadence:** daily cloud routine, **07:30 UTC** (after the CEO at 06:00, before the Design CEO at 09:00). PR-gated autonomy, same as the others.

---

## 2. Operating model: a master agent and a finance team

The routine's main session is the **Finance CEO (master)**. It does not do the work itself: it reads this file, fans out specialists **in parallel** (one `Agent` call each, in a single message), merges their findings, ranks them, and lets exactly one implementer ship the winner.

| Agent                       | Mission                                                                                                                                                      | Reads                                                                                        | Returns                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Revenue analyst**         | MRR, net new MRR, plan mix, churn, ARPU, refunds/disputes, failed payments, trial → paid, top-up attach.                                                     | Stripe (connector), `scripts/finance-report.mts`, `scripts/metrics-report.mts`               | A dated table + the 3 biggest revenue levers with a $ estimate each.          |
| **Unit-cost auditor**       | Real API cost per video by tier, tokens/seconds/characters per video, cost per 1k credits, spend on failed jobs and trials, drift vs `models.ts`.            | Supabase (read-only), `models.ts`, provider adapters, `margin-report.mts`                    | Measured-vs-catalog table; every model whose real cost differs by >15%.       |
| **Vendor & infra auditor**  | Every recurring bill: what it is, what it costs, whether the tier fits usage, cheaper equivalents, anything idle.                                            | Vercel billing tools, Supabase advisors/usage, `docs/finance/costs.csv`, vendor usage APIs   | A cost register (update `docs/finance/costs.csv`) + savings with $ per month. |
| **Provider scout**          | Finds cheaper/better models and techniques for each slot (script, image, video, voice, render), with price, quality, API fit, licence, and a migration cost. | Web search/fetch, vendor docs and pricing pages, adapter contract in `features/providers`    | A short-list per slot: current vs candidate $/unit, quality risk, effort.     |
| **Monetization strategist** | Pricing, packaging and credit-scale changes: annual plans, trial limits, credit expiry/rollover, upsell paths, free-tier abuse, referral, dunning.           | `config/plans.ts`, `models.ts`, `margin.ts`, the revenue analyst's numbers, competitor pages | Ranked experiments with expected $ impact and the margin-gate result.         |
| **Implementer** (one only)  | Builds the single chosen change on a `ceo-finance/*` branch with tests, then opens the PR.                                                                   | The repo                                                                                     | A green PR + a note on measurement.                                           |

**Master rules:**

- Brief each specialist like a peer: goal, what is already ruled out (§5 log, open PRs), the exact files/tools to use, the format to return. Give them the code or data, not your conclusion.
- Specialists are **read-only**. Only the implementer writes, and only one change per run.
- Rank findings by `expected_monthly_cash_impact × confidence ÷ effort`. Ties go to what is cheapest to measure and easiest to roll back. If the winner needs the owner (pricing change, live vendor switch, spend), do **not** build it: write the proposal in §4 and notify.
- Every number in the digest says where it came from (`measured`, `vendor list price, date`, `estimate`). Never present a list price as a measured cost.

---

## 3. Data access (what exists, what is missing, what to ask the owner)

| Source                        | Status (2026-10-19)                                                                                           | What it unlocks                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GitHub (repo)                 | Connected (`mcp__github__*`).                                                                                 | PRs, CI, code.                                                                |
| Supabase connector            | `.mcp.json` entry failed to connect from the cloud at setup (proxy tunnel); the claude.ai connector may work. | Read-only `select`s on `render_jobs`, `subscriptions`, `credit_transactions`. |
| Stripe connector              | **Needs owner authorisation** (claude.ai → Settings → Connectors → Stripe). Sandbox only so far.              | MRR, charges, refunds, disputes, payouts, fees, Sigma queries.                |
| Vercel connector              | Connected: `list_billing_charges`, `list_contract_commitments`, usage, deployments, runtime logs.             | Hosting/bandwidth/function spend, plan fit.                                   |
| fal.ai, ElevenLabs, Anthropic | No connector. Vendor dashboards only.                                                                         | Actual provider invoices (the truth behind `api_cost_usd`).                   |
| Fixed/other costs             | Nowhere yet.                                                                                                  | Domain, email, Sentry, tools, ad spend, owner's own time.                     |

**What is stored vs what the routine needs.** `render_jobs.api_cost_usd` holds one number per job. There is **no per-step, per-provider or per-token record**, so the unit-cost auditor cannot say "the script step cost $0.06 and used 3.1k tokens" or "fal billed 9 s of video". Backlog item **F1** adds that (an additive `provider_usage` table, owner-applied migration, written from the orchestrator where `costUsd` is already summed).

**Asks for the owner** (answer once; the routine records answers in §4 and never asks twice):

1. Authorise the **Stripe** connector (and say when live mode is on; until then MRR is test data and the routine reports it as such).
2. Create `docs/finance/costs.csv` rows for every recurring bill (see the header in that file) and update it monthly, or grant read-only billing access: **Anthropic** Admin/Usage-and-Cost API key, **fal.ai** usage/billing API key, **ElevenLabs** usage read access. Keys go in the routine environment's secrets, never in the repo.
3. A **monthly budget** and a **target MRR ratio / runway** so the routine knows when to tighten vs invest.
4. Is **ad spend** planned? CAC needs it.
5. Confirm or correct the VAT, Stripe-fee and FX assumptions in `features/billing/margin.ts` (VAT 20%, 1.5% + €0.25, 1.08 USD/EUR). Stripe Tax and real payouts replace them once live.

**Tools for the routine itself** (suggested, ranked by value): Stripe connector (must-have); Vercel connector (already there); Supabase read-only connector; Anthropic Admin API + fal.ai + ElevenLabs usage keys (truth on COGS); a Google Sheets/Drive connector if the owner prefers to keep the cost register in a sheet; Slack or email connector for the digest if push alone isn't enough; PostHog (funnel and conversion, once the owner opts into analytics; the north-star report works without it); Sentry connector (failed-render cost). Anything read-only first.

---

## 4. Backlog (cash impact first; every item names its measurement)

Status: `[ ]` open · `[~]` in PR · `[x]` shipped · `[✓]` approved by the owner · `[?]` needs the owner. Impact figures are **hypotheses** until the revenue analyst and cost auditor put real numbers on them.

**Measure first**

- [ ] **F0 — Finance report** (`scripts/finance-report.mts`, `features/metrics/finance.ts`): MRR, cost per video by tier, failed-job spend, MRR : COGS. _Built with this plan._
- [ ] **F1 — Record usage per step.** Migration `0013_provider_usage` (additive): `job_id`, `step`, `provider_id`, `units` (tokens in/out, seconds, characters, megapixels), `cost_usd`, `created_at`. Orchestrator writes a row wherever it already adds `costUsd`. Unlocks real tokens-per-video and cost-per-video-by-provider. Owner applies the migration. `[?]`
- [ ] **F2 — Reconcile `api_cost_usd` against vendor invoices** monthly. Any gap >10% means a missing cost in an adapter. Needs vendor usage access (§3).
- [ ] **F3 — Replace list prices in `models.ts` with measured costs** once F1 has ≥ 50 real videos; re-run the margin gate (§7 of the master plan says Pro sits at exactly 3.0x, so any increase blocks live mode).

**Cut cost** (hypotheses to test; the scout verifies price, quality and API fit before any switch)

- [ ] **C1 — Script model.** Script writer is ~$0.04/video on Sonnet. Test Haiku 5.5 with the same schema and a quality check; use prompt caching for the fixed system prompt and the Message Batches API for non-urgent work. Impact is small per video, so rank it low unless volume is high.
- [ ] **C2 — Premium video.** The expensive line (~$1.10–2.30 per 15 s). Candidates to price on real calls: other models on fal (cheaper tier of the same family, lower resolution/duration, 5 s clips on the hook scene only = the "hero shot"), open-weight video models (Wan 2.x, LTX) on a cheaper inference host (Runware, Replicate, Together, Modal/RunPod serverless GPU) or self-hosted for steady volume. fal charges a convenience margin; the same model elsewhere is often 20–50% cheaper. Always compare **cost per accepted second**, including retries/failures.
- [ ] **C3 — Voice.** ElevenLabs is the voice line (~$0.05/1k chars Flash) and its custom-voice slots cap sign-ups. Price alternatives (OpenAI TTS, Cartesia, Deepgram Aura, Google/Azure neural, open-weight Kokoro/XTTS-class on cheap GPU) against ElevenLabs quality; keep ElevenLabs for the paid "designed voice" feature if it is what customers pay for.
- [ ] **C4 — Images.** FLUX schnell is already ~$0.003. Check whether a cheaper host or batching beats fal for the same model; do not spend effort here unless F1 shows images matter.
- [ ] **C5 — Stop paying for failures and freebies.** Failed jobs still bill providers. Look at where jobs fail (after the expensive step?), reorder cheap validation first, cap retries, and size the 3,000-credit trial to what converts (trial burn is $0.14–0.25 per signup now; abuse via throwaway accounts is the risk).
- [ ] **C6 — Caching and reuse.** Cache generated stills/voices per (prompt, voice) for re-voice/re-render flows; never regenerate what we already paid for.
- [ ] **C7 — Fixed-cost trim.** Right-size Vercel/Supabase/ElevenLabs plans to measured usage; check Vercel function duration/memory (render runs ffmpeg), egress, image optimisation, and the 1-minute cron cost.

**Make more money**

- [ ] **M1 — Annual plans** (≈2 months free): cash up front, lower churn. Yearly price ids exist as `null` in `plans.ts`; needs Stripe prices and checkout support. `[?]` pricing.
- [ ] **M2 — Dunning and win-back**: Stripe Smart Retries on, failed-payment email, cancel-flow offer (pause / downgrade instead of cancel). Typically recovers a meaningful share of involuntary churn.
- [ ] **M3 — Top-up and upgrade nudges** at the moments credits run low or a plan limit blocks a job (the blocked-card UI exists); measure attach rate.
- [ ] **M4 — Credit policy**: expiry/rollover rules (unused monthly credits are pure margin; rolling them over helps retention, expiring helps cash); document and price the choice.
- [ ] **M5 — Premium repack**: sell the hero-shot premium variant at a price between Standard and full AI video (see master plan §7). Margin gate must pass.
- [ ] **M6 — Packaging experiments**: first-month discount vs trial, a watermark on trial exports, referral credits paid only on a first payment, affiliates (30% recurring, master plan §6.2) with a hard payback check.
- [ ] **M7 — Regional/VAT pricing**: check Stripe Tax, local-currency prices and PPP only if conversion data shows a gap.

**Owner decisions needed** are collected here by the routine with the question, the options, its recommendation and the $ at stake.

- _(none yet)_

---

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§1, §7, §8, §9), this file, `git log -20`, open and recently closed PRs (GitHub tools), then the numbers (`npx tsx scripts/finance-report.mts`, Stripe, Vercel, Supabase). An item with an open PR is in review, not available.
- **One change per run.** Prefer improving an open `ceo-finance/*` PR over starting a new one. Research-only runs are fine: update §4/§6/§7 and the log.
- **PR-gated.** Work on `ceo-finance/<slug>` branches. Never merge, never push to `main`, never create a PR the owner didn't ask for beyond the routine's one daily PR.
- **Money moves need the owner.** Without the owner's explicit OK: no price, plan or credit-scale change goes live, no vendor is switched in production, no live-mode Stripe write, no spend, no purchase, no signup for a paid service, no migration applied. The routine may prepare all of these as a PR or a proposal, behind a flag or a catalog entry that is off by default.
- **The margin gate stays.** `npx tsx scripts/margin-report.mts` must pass (≥ 3x worst case on every product) for any catalog or price change. A change that fails it is a proposal, not a PR.
- **Measured beats listed.** Replace a list price with a measured one only from real calls or vendor invoices, and say which. Run provider price checks from vendor pages and docs; where a page is blocked, say so and mark the figure as a search snippet.
- **Never touch:** secrets, `.env*`, the live Stripe account, or UI files while a `ceo-design/*` PR is open (design owns them). Allowed: `src/features/billing|metrics|providers|render/**`, `src/config/models.ts|plans.ts`, `scripts/**`, `tests/**`, `docs/finance/**`, `supabase/migrations/**` (new files only, never applied by the routine), this file, and the finance lines of `TheMasterPlan.md`.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Notify (PushNotification)** when: MRR ratio < 1x or falls week over week; a measured cost breaks the margin gate; spend on failed jobs/trials spikes; a vendor price change or shutdown hits us; a >$50/month saving or a cash opportunity is ready for the owner's decision; a PR is ready; the routine cannot read a data source it needs. Stay silent when nothing moved.
- **Digest:** what moved (numbers with source and date), the one change shipped or proposed, what is waiting on the owner, the next item.

---

## 6. Provider scouting method

For each slot, keep a row in `docs/finance/providers.md` (create on first scout run): `slot · current model · current $/unit (measured) · candidate · $/unit (source, date) · quality vs current (side-by-side sample, same prompt) · API fit (sync/async, webhooks, limits, regions/GDPR) · licence/commercial use · migration effort · verdict`. A candidate is worth a PR only when it saves ≥ 20% on that slot **and** the slot is ≥ 10% of COGS, or it removes a hard limit (e.g. ElevenLabs slots). Quality check: generate the same 5 prompts on both and compare before moving traffic; ship new providers behind the registry's model id so the switch is one catalog row and instantly reversible.

---

## 7. Log

- **2026-10-19** — Finance track created: this plan, `features/metrics/finance.ts` + `scripts/finance-report.mts` (MRR, cost per video by tier, failed-job spend, MRR : COGS; +4 tests), and the Finance CEO routine prompt (`docs/finance/routine-prompt.md`). Found: only `render_jobs.api_cost_usd` is stored per job, so tokens/seconds per provider cannot be audited yet (F1); Stripe connector needs owner authorisation; Supabase MCP did not connect from the cloud session. (Finance CEO, setup)
