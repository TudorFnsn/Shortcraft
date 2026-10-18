# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md` (which wins on product and priority) and next
> to `DesignPlan.md` (which owns UI). This file wins on pricing, unit costs,
> provider choice and cash. Every finance PR updates the dashboard (§3), the
> changelog (§7) and, when a number changes, `TheMasterPlan.md` §7.
>
> Last updated: 2026-10-18 (routine created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question | Owner's answer                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal     | **Maximum profit, cash first.** Raise MRR and gross margin; cut every avoidable cost. When two moves compete, pick the one with the faster cash return.         |
| Always   | Check the **MRR ratio** (§3) first, every run. Everything else is judged by how it moves MRR, margin or cash.                                                   |
| Scope    | Revenue (plans, top-ups, trial, upsell, annual, churn), COGS (every provider call), overhead (hosting, DB, email, monitoring, Stripe fees), pricing and models. |
| Look for | Cheaper providers, newer models, caching, batching, cheaper tiers per step, better pricing. The current premium video model (fal.ai Kling) is the first target. |
| Autonomy | **PR-gated.** Implements changes on `ceo-finance/<slug>` branches and opens PRs; never merges; never changes live prices, Stripe objects or secrets.            |
| Cadence  | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO, before Design).                                                                |
| Data     | Everything the CFO needs, it asks for (§6) or configures itself (§5). It never invents a number: a missing one is reported as a gap.                            |

---

## 2. How the routine works (master agent + specialists)

The **CFO master agent** does no deep work itself. Each run it:

1. Reads this file, `TheMasterPlan.md` §7–§8 and lists open + recently closed PRs (an item with an open PR is in review, not available). Skips files `ceo-design/*` PRs own.
2. Runs `npx tsx scripts/finance-report.mts --json` and `scripts/margin-report.mts` (needs `.env.local`; if absent, falls back to the Supabase connector, read-only SQL) and computes the **MRR ratio** (§3).
3. Splits the work and launches specialists **in parallel** with the Agent tool, giving each a narrow brief and the numbers it needs:

| Specialist                                     | Job                                                                                                                                                                | Reads                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Metrics analyst**                            | MRR, ARPU, churn proxy, trial → paid, payer vs non-payer spend, credit utilisation; flags anomalies against the last dashboard row.                                | finance-report, Supabase, Stripe                                     |
| **Cost auditor**                               | Cost per finished video by tier and step; **tokens in/out per script** vs dollars; failed-job waste; retries; where `api_cost_usd` is wrong or too coarse.         | `render_jobs`, `orchestrator.ts`, provider adapters, Anthropic usage |
| **Provider scout**                             | Web research (Firecrawl / WebSearch) on cheaper or better video, image, voice, LLM and render options; builds a comparison with source URLs and dates; shortlists. | `config/models.ts`, provider pages                                   |
| **Infra & fees auditor**                       | Vercel, Supabase, Resend, Sentry, domain and Stripe fee bills vs usage; downgrade, caching, cron and bundle-size savings; Stripe Tax/Billing fee drag.             | Vercel + Stripe + Supabase connectors                                |
| **Monetisation strategist**                    | Pricing, packaging, annual plans, top-up nudges, trial size, upsell moments, churn saves, affiliate economics; models each idea against the margin gate.           | plans, dashboard, `margin.ts`                                        |
| **Implementer** (only when a change is picked) | Builds the change in code with tests, runs `format:check`, `lint`, `typecheck`, `test`, margin gate; opens a PR.                                                   | repo                                                                 |

4. **Decides** (ranked by cash return ÷ effort, §4 scoring), implements the single best in-scope win via the Implementer, or — when it needs a decision or data — writes the question into §6 and notifies the owner.
5. Updates §3 (dashboard row), §7 (changelog), pushes a PR, and **sends a push notification only when something needs the owner** (margin gate below target, MRR drop, spend spike, a pending owner decision, or the routine could not run). A healthy, unchanged run is silent.

Hard rules: no merges; no live Stripe/price/secret changes; no Supabase writes; no migrations applied (write the file, owner applies); never disable the margin gate; never remove the AI-video quality floor without owner approval (§8); every price claim carries a source URL and date, and prices from blogs are "unverified" until measured on a real call.

---

## 3. Dashboard (the CFO updates this table every run)

**MRR ratio** (the number checked first): `MRR ÷ (API spend + fixed costs)` over the last 30 days, net of VAT and Stripe fees, plus its parts. Gate target: **≥ 3x** on API spend alone (`TARGET_MARGIN_MULTIPLE`); stretch **≥ 5x** all-in.

| Date       | MRR (net) | Paying subs | ARPU | API spend 30d | Fixed 30d | MRR ratio | Gross margin | Non-payer spend share | Credit utilisation | Note                                                                                                                   |
| ---------- | --------- | ----------- | ---- | ------------- | --------- | --------- | ------------ | --------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | n/a       | n/a         | n/a  | n/a           | n/a       | n/a       | n/a          | n/a                   | n/a                | Routine created; first run measures. App is live with Stripe in **test mode**, so real MRR is likely $0 until go-live. |

Margin gate (modelled, `margin-report.mts`, per TheMasterPlan §7): Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x. Pro sits exactly on the line.

---

## 4. Prioritisation

Score each candidate **cash return = (monthly $ saved or earned) ÷ (days of work + risk)**. Order:

1. **Stops a loss** (gate failing, runaway spend, failed-job waste, trial abuse).
2. **Cuts COGS on the largest line** — today that is premium AI video (≈ $0.12/s assumed, 1,420 credits/s charged).
3. **Raises revenue per payer** (annual plan, top-up prompts at low balance, tier nudges).
4. **Raises conversion** (trial size and watermark, first-video experience; coordinate with the CEO routine, which owns the funnel).
5. **Trims overhead** (only if over a free-tier or plan boundary).

---

## 5. Backlog (seeded 2026-10-18 from the repo and one round of web search; all prices unverified)

| #   | Idea                                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                    | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1  | **Measure real costs.** Record per-step cost (script tokens in/out, image, clip seconds billed, voice chars, render) per job instead of one `api_cost_usd` total. Needs a migration (`render_jobs.cost_breakdown jsonb`) written for the owner to apply.                                                        | The gate runs on list prices; tokens-vs-dollars cannot be answered without this. Everything below depends on it.                                                                       | open   |
| F2  | **Premium video provider bake-off.** Compare Kling 2.5 Turbo on fal.ai with Kling 3.0 / Seedance 2.0 (480p $0.07/s, 720p $0.16/s on Runware) / Wan 3.0 (≈ $0.04–0.08/s on Alibaba Cloud) / Hailuo 2.3 (≈ $0.047/s, fixed 6 s) / LTX-2.3 Fast / P-Video. Account for fixed-length billing (we use 3–6 s scenes). | Search snippets (2026-09/10) put several options at $0.04–0.08/s, against $0.12/s assumed. Run a fixed 10-prompt test, score quality, then change `FAL_VIDEO_MODEL` or add an adapter. | open   |
| F3  | **Hero-shot premium.** AI clip on scene 1 only, stills for the rest (already estimated at ≈ $0.45 per 15 s in TheMasterPlan §7).                                                                                                                                                                                | Cuts the biggest cost line by ~60–70% and lets premium be priced near Standard to lift conversion.                                                                                     | open   |
| F4  | **Cache and reuse.** Cache identical or near-identical image/clip generations per theme + prompt hash; reuse the same still across re-voices and retries.                                                                                                                                                       | Re-voice and retry paths may re-pay for assets.                                                                                                                                        | open   |
| F5  | **Script model right-sizing.** Test Haiku 5.5 against Sonnet 5.5 for scripts (structured output), keep prompt caching on the static system prompt, cap output tokens.                                                                                                                                           | The script is small ($0.04) but is per job; check with token counts from F1 before spending effort.                                                                                    | open   |
| F6  | **Annual plans** (2 months free). `stripePriceIdYearly` already exists in the plan type.                                                                                                                                                                                                                        | Pulls cash forward, cuts churn; needs the owner to create Stripe prices.                                                                                                               | open   |
| F7  | **Low-balance top-up prompt** and an unused-credit reminder email.                                                                                                                                                                                                                                              | Top-ups carry 4–6x margin and arrive instantly.                                                                                                                                        | open   |
| F8  | **Trial burn guard.** Cap trial cost per signup; watermark + one video; block repeat signups (same device/email pattern).                                                                                                                                                                                       | Trial burn is $0.14–0.25 per signup; abuse would multiply it.                                                                                                                          | open   |
| F9  | **Failed-job waste.** Cost of `failed` jobs is spent but refunded; fail earlier (cheap checks first), retry only the failed step.                                                                                                                                                                               | Pure loss; measured by the report's `wasted` column.                                                                                                                                   | open   |
| F10 | **Stripe fee drag.** Check whether Stripe Tax / Billing add per-transaction fees (sources disagree: Tax ≈ 0.5%, Billing 0.5–0.8%) and whether the margin model's 1.5% + €0.25 matches the real balance transactions.                                                                                            | Revenue assumptions feed the gate.                                                                                                                                                     | open   |

---

## 6. Open questions for the owner (the CFO appends here, owner answers inline)

1. **Stripe connector needs reconnecting** (claude.ai → Connectors → Stripe; shows `needs_reconnect`). Without it MRR comes only from the DB. Also: is Stripe still in **test mode**? If yes, MRR is $0 and the first job is go-live, not optimisation.
2. **Supabase connector** failed to connect from the cloud sandbox (`ERR_PROXY_TUNNEL`) on 2026-10-18. Either allow `mcp.supabase.com` and the project's REST host in the environment's network policy, or add `.env.local`-equivalent env vars to the routine environment (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) so `finance-report.mts` can read directly. A read-only Postgres role is safer than the service role: create one and give the routine that URL instead (preferred).
3. **Fixed monthly bills**: Vercel plan, Supabase plan, Resend, Sentry, domain, Claude/Anthropic and fal.ai/ElevenLabs plan fees. Tell me the numbers (or enable the Vercel connector's billing tools, which the CFO will use) and set `FIXED_MONTHLY_COSTS_USD` in the routine environment.
4. **Provider billing exports**: fal.ai usage/billing (CSV or API key with read scope), ElevenLabs usage, Anthropic Console usage (an Admin API key limited to usage reports). These let the CFO reconcile modelled cost vs invoices — the "tokens vs money" question.
5. **Quality floor for AI video**: which models are acceptable to switch to without asking each time (approve a shortlist after the bake-off)?
6. **Price-change authority**: may the CFO propose plan/credit price changes in PRs (default yes, owner merges), and what is the minimum acceptable gross margin and the target payback period for paid acquisition?
7. **A `FAL_KEY` with a spending cap** (or a separate test key) so the bake-off can run real calls in the cloud routine. Spend cap per run suggested: $5.

---

## 7. Changelog

- **2026-10-18** — Finance track created. Added `FinancePlan.md`, `docs/routines/finance-cfo.md` (the routine prompt), `src/features/finance/unit-economics.ts` (MRR, cost per finished video by tier, wasted cost, non-payer spend share, credit utilisation; pure, tested) and `scripts/finance-report.mts` (read-only). +4 tests. No migration, no dependency, no runtime change. (Interactive, from the owner's request)

---

## 8. Decision log

- **Cash first** (2026-10-18, owner) → prefer changes that pay back this month over larger, slower ones.
- **Quality floor** (2026-10-18) → a cheaper provider is only adopted after a side-by-side on the same prompts, judged by the owner or by a rubric the owner approved; price alone never decides.
- **No new vendor without a free path out** → the adapter layer (`config/models.ts` + one adapter) keeps every provider swappable.
