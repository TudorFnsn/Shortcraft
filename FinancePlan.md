# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (a DM-style master agent that splits the work across specialist sub-agents).
> Product, pricing and priority calls still live in `TheMasterPlan.md` (§7 Monetization);
> this file holds the finance charter, the data it reads, the agent split, the roadmap
> and the running numbers. Last updated: 2026-10-14.

---

## 1. Charter

**Goal:** maximise cash returned per euro spent. Every run asks, in this order:

1. **Is the MRR ratio healthy?** MRR, net new MRR, churn, and **MRR ÷ monthly burn**
   (burn = all provider API spend + Vercel + Supabase + domain + every other bill).
2. **Where does a euro of revenue leak?** API cost per finished video vs credits charged,
   by step (script / image / video / voice / render), by plan, by tier; failed-job cost;
   trial burn; Stripe + VAT.
3. **What is the cheapest change that moves the ratio?** Provider swap, caching, model
   downgrade where quality is equal, pricing/packaging, trial limits, annual plans,
   top-up nudges, dunning, churn saves.
4. **Ship it or propose it** (autonomy, §5).

**Decision rule:** prioritise cash return. Rank every idea by `expected € / month ÷ effort`,
and say how sure the number is (measured, list price, or guess). Measured beats researched.

**Guardrails (never traded for margin):** the margin gate in `features/billing/margin.ts`
stays fail-closed (≥3x on every plan); no moderation, safety or AI-label cut; quality
must be checked on real output before a cheaper model becomes the default.

---

## 2. Data the routine reads (all read-only)

| Source                     | How                                                             | Gives                                                                                |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Supabase (claude.ai conn.) | `execute_sql` select-only, project `iqvrovjwoavvmhaithwn`       | `render_jobs.api_cost_usd`, `actual_credits`, status, tier; `credit_transactions`    |
| Stripe (claude.ai conn.)   | `stripe_analytics` (MRR, churn, subs templates + Sigma SQL)     | MRR, churn, revenue, refunds, disputes, fees. **Sandbox only until live activation** |
| Vercel (claude.ai conn.)   | `list_billing_charges` (team `tudorfnsns-projects`)             | Hosting, bandwidth, function and storage charges, per day                            |
| Repo                       | `config/models.ts`, `config/plans.ts`, `scripts/margin-report.mts`, `scripts/metrics-report.mts` | Assumed unit costs, credit prices, the margin gate, north-star metrics |
| fal.ai / Anthropic / ElevenLabs | **No connector.** Owner pastes monthly usage CSV/totals into §7, or a read-only usage key is added | Real provider invoices (the only ground truth for cost) |

Rule from `TheMasterPlan.md` §9 holds: **reads are free, any write (migration, data change,
Stripe object, live mode, secret) needs the owner's explicit OK.**

**Known gap (F1):** `api_cost_usd` is one number per job, so cost can't be split by step or
model. Until F1 ships, step costs come from `config/models.ts` × scene counts, which is an
estimate, not a measurement.

---

## 3. Agent split (DM master + specialists)

The master agent never does the analysis itself. It reads this file, checks open PRs,
fans out the specialists below **in one parallel Agent batch**, merges their reports,
picks the single highest € item, and either implements it or writes the proposal.

| Agent              | Reads                                         | Returns                                                                                      |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Revenue**        | Stripe analytics                              | MRR, net new MRR, churn, ARPU, trial→paid, refunds/disputes, failed payments                 |
| **Unit economics** | Supabase + `models.ts` + margin report        | Cost per finished video by tier/length, credits burned vs credits sold, failed-job waste, margin multiple per plan, trial burn per signup |
| **Burn**           | Vercel billing + owner-pasted provider totals | Every recurring cost, monthly total, cost per active creator, MRR ÷ burn                     |
| **Vendor scout**   | Web (WebSearch/WebFetch)                      | Cheaper/better providers per pipeline slot with list price, quality notes, source, and how sure the number is. Re-checks the current vendor each run |
| **Pricing & growth** | Plans, funnel, metrics report               | Packaging/price tests, annual plan, top-up and upgrade nudges, dunning, churn saves, free-trial sizing |
| **Builder**        | The chosen item                               | Implements it on a `ceo-finance/*` branch with tests, per §5                                 |

Sub-agents get a self-contained brief (this file's §1 + their slice) and return a short
structured report with numbers and sources. They don't write to the repo; only the Builder does.

---

## 4. Baseline (2026-10-14, read-only)

Live Supabase, sandbox Stripe, so these are test-usage numbers, **not** business results:

- 16 jobs (13 done), 6 profiles, 2 subscriptions. Total recorded API cost **$6.21**; mean cost of a finished job **$0.48**.
- Mean $0.48/video is far above the $0.07 a 15s Standard video is meant to cost, which means premium (AI video) jobs dominate the sample or the cost recording is conservative. **F1 must split this.**
- The assumed model costs in `config/models.ts` are list-price research, never invoice-checked.

### Vendor scouting, first pass (list prices from reseller blogs, verify before acting)

Current: fal.ai Kling 2.5 Turbo Pro image-to-video, booked at **$0.12/scene-second** (list ~$0.07/s, fixed 5s clips).

| Candidate                       | Indicative price                         | Note                                                                                  |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Hailuo 2.3 (Runware)            | ~$0.28 per 6s clip (~$0.047/s)           | Cheapest total for one short clip; fixed durations                                    |
| Wan 3.0 (Alibaba Cloud)         | ~$0.041/s at 480p, ~$0.083/s at 720p     | Region-dependent; Singapore quoted $0.10/s at 720p                                    |
| Seedance 2.0 (Runware)          | ~$0.07/s at 480p, ~$0.16/s at 720p       | Higher at 720p                                                                        |
| Kling 3.0 (Runware)             | ~$0.084/s at 720p                        | Same family as today, direct from an aggregator                                       |
| Self-hosted Wan 2.2 TI2V-5B     | ~$0.05 per 5s clip on a rented 4090      | Only worth it at steady volume; needs a GPU host and ops. Not a near-term move       |

Sources: [invideo pricing roundup](https://invideo.io/blog/ai-video-model-pricing), [apiframe image-to-video APIs](https://apiframe.ai/blog/best-image-to-video-apis-2026), [atlascloud cheapest APIs](https://www.atlascloud.ai/es/blog/guides/cheapest-ai-video-generation-api-2026), [SSD Nodes self-hosted video](https://www.ssdnodes.com/learn/self-hosted-ai-video-generator).

**Read:** the biggest lever is not swapping vendor for the same clip. It is **using fewer AI
clips** (hero-shot-only Premium, already modelled in §7 of the master plan: ~$0.45 vs ~$1.10
per 15s). A vendor swap then saves 30–60% on the remaining clip. The adapter layer
(`FAL_VIDEO_MODEL`, `providerId`) already makes a swap a one-row change, so the cheap
experiment is an A/B run of the same 10 prompts on 2–3 vendors, scored on quality and cost.

---

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§1, §7, §8, §9), this file, `git log -20`, and open + recent PRs (an item with an open PR is in review, not available).
- **One item per run:** take the top unchecked item in §6 that isn't in an open `ceo-finance/*` PR. Prefer improving an open finance PR.
- **Autonomy: PR-gated, like the other routines.** Code goes on `ceo-finance/*` branches and opens a PR; it never merges, never touches live secrets, never writes to Supabase/Stripe/Vercel.
- **Files it may change:** `scripts/*-report.mts`, `src/features/metrics/**`, `src/features/billing/margin.ts` (reporting only), `src/config/models.ts` **cost numbers only with a measured source**, `docs/finance/**`, this file, and the finance lines of `TheMasterPlan.md`. **Price changes (`plans.ts` prices, credit scales) are proposals in the digest until Tudor OKs them.** It leaves `src/app/create|gallery`, `src/components` and design files alone while a `ceo-design/*` PR is open.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode; `npx tsx scripts/margin-report.mts` still passes.
- **Honesty about numbers:** label each figure measured / list price / guess. Never present sandbox Stripe data as revenue. If a connector fails (the Supabase MCP in `.mcp.json` has failed with `ERR_PROXY_TUNNEL` in cloud sessions; use the claude.ai Supabase connector instead), say so and use what is reachable.
- **Output:** a digest with MRR, burn, MRR ÷ burn, cost per video, the top leak, the item done or proposed (with € / month and confidence), and what needs Tudor. **Send a push notification only when something needs them** (MRR ÷ burn below target, margin gate failing, a cost spike, a decision, or the routine couldn't run); a healthy, unchanged run stays quiet.

---

## 6. Roadmap (top unchecked first)

- [ ] **F1 — Per-step cost ledger.** Record cost per step/model per job (new `job_costs` table or a jsonb breakdown, additive migration, owner applies). Without it, "which step eats the money" is a guess. Then `scripts/finance-report.mts`: cost per video by tier/step, failed-job waste, credits sold vs burned, trial burn, `--json` for the digest.
- [ ] **F2 — Provider invoices in.** Owner pastes last month's fal.ai, Anthropic and ElevenLabs totals into §7 (or adds read-only usage keys). Reconcile against `api_cost_usd`; correct `models.ts` costs only from this.
- [ ] **F3 — Video vendor A/B.** Same 10 prompts through fal Kling 2.5 vs Hailuo 2.3 vs Wan 3.0 (vs Seedance) via `FAL_VIDEO_MODEL`/an adapter; score quality and cost; write the table to `docs/finance/video-vendor-ab.md`. Needs the owner's OK to spend (~$10–20).
- [ ] **F4 — Hero-shot Premium tier.** AI clip on scene 1 only, stills elsewhere (~$0.45 vs ~$1.10 / 15s). Margin-gate shape + price proposal.
- [ ] **F5 — Cost guards.** Per-user daily Premium cap, retry cap per step, cache identical image/voice calls, cheaper script model for drafts (compare Haiku-class vs Sonnet on script quality). Cuts waste with no price change.
- [ ] **F6 — Revenue levers (proposals).** Annual plans (~2 months free) for cash up front and lower churn, top-up nudge at low balance, Stripe dunning/Smart Retries, cancel-flow save offer, smaller trial for unverified signups, regional pricing. Each with an € estimate.
- [ ] **F7 — MRR/burn dashboard.** Monthly snapshot table + a private artifact the owner can open (MRR, burn, ratio, cost per video, trend). Needs live Stripe for real data.
- [ ] **F8 — Live-mode finance readiness.** When Stripe goes live: Sigma/analytics on live, tax/VAT and Stripe-fee check (`REVENUE_ASSUMPTIONS`), payout schedule, dispute handling.

---

## 7. Owner inputs (the routine asks for these; paste them here)

- [ ] Monthly burn list: fal.ai, Anthropic, ElevenLabs (plan + slots), Vercel plan, Supabase plan, domain, Resend, Sentry, anything else, with last month's actual €.
- [ ] Target: desired MRR ÷ burn ratio and the monthly profit goal. (Default until set: ratio ≥ 3, gross margin ≥ 70% after Stripe + VAT.)
- [ ] OK to spend ~$10–20 on the vendor A/B (F3).
- [ ] Stripe live-mode date, so the routine can switch from sandbox to live analytics.

---

## 8. Suggested connectors, tools and add-ons

Already connected: **Supabase, Stripe, Vercel, GitHub.** Worth adding, in order of value:

1. **fal.ai / Anthropic / ElevenLabs usage**: no connector exists; a read-only usage/admin key in a secret store, or a monthly CSV paste, is the single biggest accuracy gain (F2).
2. **PostHog** (or Plausible): funnel visitor → signup → first video → paid, so Pricing & growth can size the free trial and price with data. Master plan notes none is connected.
3. **Sentry**: failed-render cost and error spikes (a failing step still burns API money).
4. **Google Sheets / Drive**: a living burn sheet the owner edits and the routine reads.
5. **Resend**: lifecycle email performance (reminder and win-back conversion).
6. **Stripe built-ins to switch on:** Smart Retries + dunning emails, Billing analytics, Radar, annual prices, `automatic_tax`; Sigma for custom SQL.
7. **Cheap-vendor access:** an aggregator account (Runware, Replicate, or direct Alibaba Cloud) for the A/B; one key, many models.
8. **Claude tooling:** the `claude-api` skill for prompt caching / cheaper-model routing on the script step; `dataviz` + Artifact for the MRR/burn dashboard; `/loop` or a second routine for a weekly cost-anomaly check.

---

## 9. Routine

- **Name:** Shortcraft Finance CEO · **Cadence:** daily, 07:30 UTC (after the main CEO at 06:00, before Design at 09:00), PR-gated. Weekly deep run (Mondays): full burn + vendor re-scout.
- **Routine id:** _set after creation at https://claude.ai/code/routines (see the prompt in `docs/finance/routine-prompt.md`)._
- Pause it if the ratio is healthy for four weeks and nothing in §6 is left.

---

## 10. Changelog (newest on top)

- **2026-10-14** — Finance track created: charter, DM master + five specialists, data map (Supabase, Stripe, Vercel connectors checked reachable read-only; the `.mcp.json` Supabase server failed with a proxy error), baseline ($6.21 recorded API cost over 16 test jobs, mean $0.48 per finished job), first vendor scouting pass, roadmap F1–F8, connector suggestions, routine prompt. No code changes. (Finance CEO, setup)
