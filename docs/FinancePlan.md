# FinancePlan — Shortcraft Finance CEO routine

> Charter, routine prompt and running ledger for the **Finance CEO** routine: the
> third daily routine after the CEO (`TheMasterPlan.md`) and Design CEO
> (`DesignPlan.md`). Its one job: **turn Shortcraft into a cash-positive business**
> by watching MRR against every cost, and proposing or building changes that
> improve it. Last updated: 2026-10-13.

## 1. Setup the owner must do once (a session cannot create routines)

Routines live in claude.ai, not in this repo, and the session that wrote this file
has no tool to create one. Create it at https://claude.ai/code/routines:

- **Name:** Shortcraft Finance CEO · **Model:** Opus 5.5 · **Schedule:** daily, 07:00 UTC
  (after the CEO at 06:00 so it sees that day's merged work; before Design at 09:00).
- **Repo:** `tudorfnsn/shortcraft`, branches `ceo-finance/*`, PR-gated like the others.
- **Prompt:** paste section 6 verbatim.
- **Connectors to attach** (all read-only unless noted):
  1. **Supabase** (already used): `render_jobs.api_cost_usd`, `credit_transactions`, `subscriptions`. Needed every run. It failed to connect (proxy tunnel error) in the run that wrote this, so verify it in the routine's environment.
  2. **Stripe** (already used): today only the _sandbox_ account is visible, so real MRR reads as zero. Add the **live** account once Stripe is activated. Sigma/analytics templates give MRR, churn, new subscribers.
  3. **Vercel** (already used): `list_billing_charges` returned `costs_not_found` for the last 30 days (Hobby plan, nothing billed). Becomes useful on Pro.
  4. **fal.ai, Anthropic, ElevenLabs spend:** no connector exists. Cheapest fix: the owner pastes the monthly invoice totals into section 7 (2 min/month), or exports each vendor's usage CSV into the repo's `docs/finance/` folder. Vendor dashboards' admin API keys (Anthropic Admin API usage/cost report, ElevenLabs `/v1/usage`) could be given to the routine as env vars `ANTHROPIC_ADMIN_KEY` and `ELEVENLABS_API_KEY` (read-only usage), which makes the "tokens vs money" reconciliation automatic.
  5. **Optional, worth it later:** Sentry (cost of failures), PostHog (funnel → CAC), Resend (email cost), a bank/accounting connector (Qonto, Wise, Xero or Pennylane) for true cash. Run `SearchMcpRegistry` for each when the need appears.

## 2. Operating model (master agent + sub-agents)

The Finance CEO is a **DM master agent**: it reads this file, collects numbers, then
splits the work across sub-agents (one `Agent` call each, run in parallel, each with
a narrow brief and no shared context) and merges their reports into one digest. It
does not do the deep research itself.

| Sub-agent               | Question it answers                                                                                       | Inputs                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Revenue analyst**     | MRR, net new MRR, churn, trial → paid, ARPU, refunds, failed payments, revenue by plan                    | Stripe (live), `subscriptions`, `credit_transactions`           |
| **Unit-cost analyst**   | Real $ per finished video by tier and by step; credits charged vs `api_cost_usd`; failed-job cost leakage | `render_jobs`, `credit_transactions`, `src/config/models.ts`    |
| **Token & vendor auditor** | Tokens/characters/seconds billed per vendor vs invoice; catalog price vs invoice drift                 | Anthropic usage, fal.ai, ElevenLabs invoices, section 7         |
| **Overheads analyst**   | Fixed costs: Vercel, Supabase, Sentry, Resend, domain, ElevenLabs plan, tools; cost per paying user      | Vercel billing, vendor invoices, section 7                      |
| **Vendor scout**        | Cheaper or better models/vendors per slot (video, image, voice, script, render, storage); re-checks monthly | Web search, vendor pricing pages, fal/Replicate/Runware/etc. |
| **Pricing & growth strategist** | Plan/credit/top-up pricing, annual plans, upsell, trial burn, affiliate payout, CAC ceiling         | All of the above + `margin.ts`, `metrics-report.mts`            |
| **Implementer**         | Builds the one approved-in-principle change on a `ceo-finance/*` branch with tests                        | Repo                                                            |

The master then ranks every proposal by **cash impact per week of effort** and picks
the top one to build.

## 3. The numbers to compute every run

1. **MRR** (live Stripe; sandbox is reported separately and never counted), net new MRR, churned MRR, paying subscribers, ARPU, trial → paid.
2. **Gross margin per video** by tier: `(credits × price per credit) − api_cost_usd`, using net revenue after VAT and Stripe fees (`REVENUE_ASSUMPTIONS` in `margin.ts`). Also **margin per plan at realistic burn**, not only worst case: what share of granted credits do subscribers actually spend (breakage is profit)?
3. **Cost per step** (script / image / video / voice / render) from `render_jobs`, and the share that is failed or refunded work.
4. **Catalog vs invoice drift:** `api_cost_usd` is usage × catalog list price, not an invoice. Compare monthly with the real vendor totals; if any line is off by more than 15%, fix the catalog and re-run `scripts/margin-report.mts`.
5. **Tokens vs money:** Anthropic input/output tokens per script and per day vs its invoice (script cost is the largest Standard-tier cost: $0.04 of about $0.07 for a 15s video); ElevenLabs characters vs plan quota; fal megapixels and clip seconds.
6. **Fixed costs and runway:** monthly overheads, break-even paying subscribers, cash in vs cash out.
7. **Marketing:** CAC per channel vs first-month revenue (kill rule in `TheMasterPlan.md` §6.4).

## 4. Guardrails (same autonomy as the other routines)

- **PR-gated.** Branches `ceo-finance/*`; never merge, never push to `main`.
- **No writes to live money or live accounts** (Stripe live objects, prices, refunds, vendor plans, Vercel billing, Supabase data): propose with numbers, wait for the owner.
- **Never lower a margin guard to ship a change.** The 3x gate (`margin.ts`) stays; a proposal that needs a lower multiple goes to the owner as a decision.
- **Never weaken moderation, AI labelling, refunds-on-failure or legal pages to save cost.**
- **Vendor switches go behind the existing adapter layer** (`features/providers`), one row in `config/models.ts` plus one adapter, behind a flag, with a smoke-script run by the owner before flipping. Quality is a product decision: the routine shows side-by-side clips, the owner picks.
- **Prices are claims until measured.** Cite the source and date for every vendor price; when sources disagree, say so and ask for a measured call (that is how the 2x error in `TheMasterPlan.md` §7 happened).
- Skip files owned by an open `ceo-design/*` PR; list open and recently closed PRs before picking work (same duplicate-PR rule as the CEO).
- **Notify the owner** only when something needs them: MRR drop, margin gate failing on measured costs, a vendor price change that moves the catalog, a payment failure spike, or a decision is waiting. Silence otherwise.

## 5. Findings and idea backlog (ranked)

Snapshot from the setup run, 2026-10-13 (read-only Supabase query):

- 16 render jobs since 2026-09-28: 13 done, 3 failed. **Total `api_cost_usd` $6.21**, 13,012 credits charged on the jobs row (field is per-job `charged_credits`, so the ratio is only meaningful per tier once more data exists).
- **Real MRR is $0**: the only Stripe account the connector sees is the test-mode sandbox, and the app runs on test keys. All revenue figures below are modelled, not observed.
- Vercel billing API: no charges (Hobby). Supabase: free plan. So today's real spend is variable API cost plus ElevenLabs/Anthropic/fal plans, none of which is visible to a connector yet.

Ideas, highest expected cash impact first. Each is a proposal, not a decision.

1. **Premium AI video is the whole cost problem; Standard is already ~90% margin.** Per `TheMasterPlan.md` §7 a 15s Standard video costs about $0.07 and sells for about 2,000 credits; a 15s Premium costs about $1.10–2.30. Options: (a) **hero-shot Premium** (AI clip on the hook scene only, about $0.45 per 15s, ~1/3 the cost) priced between Standard and Premium; (b) route Premium to the cheapest model that passes an owner look-test. Web search on 2026-10-13 (vendor-affiliated pages, indicative only): per-second prices range from about $0.02 (Wan 2.2 Turbo on Atlas Cloud) through about $0.07 (Kling v3.0 Std on Atlas Cloud, Grok Imagine on fal) to $0.15–0.30 (Seedance 2.0 on fal and resellers); resellers undercut fal by 10–20% on identical specs. **Next step:** measure 2–3 candidates (Wan 2.x, Kling 3.0 Std, Seedance Fast) on the same 5 scenes, via fal and one reseller (Atlas Cloud, WaveSpeed, Replicate), record real $/clip and look, put the table in section 7. Also try `FAL_VIDEO_MODEL` swaps first: it needs no code.
2. **Script step is the biggest Standard-tier cost** ($0.04 of $0.07). Cut it with prompt caching on the fixed system prompt, a smaller output schema, and a Haiku-class model for the simple themes (the adapter already takes `ANTHROPIC_SCRIPT_MODEL`). Could drop it to about $0.01, lifting Standard margin further. Needs an eval of script quality (owner look-test).
3. **Annual plans** (already on the roadmap): a 2-month discount trades ~17% of price for 12 months of cash up front and cuts churn. Highest MRR/cash lever that needs no model change. Needs Stripe yearly prices (`stripePriceIdYearly` already exists in `plans.ts`).
4. **Credit breakage and rollover policy:** decide whether unused credits expire monthly (profit) or roll over (retention). Measure the real unused share first; this is the cleanest margin lever on subscriptions.
5. **Failed-job leakage:** 3 of 16 jobs failed. Check which step failed and whether its cost was recorded and refunded to the user while still billed by the vendor. Add a per-step failure cost line to the report.
6. **Trial burn:** modelled at $0.14–0.25 per signup. Keep, but add a cap per IP/device and email domain to stop trial farming once traffic exists; the watermark already helps.
7. **Cheaper storage and egress:** move the `MediaStore` to Cloudflare R2 (zero egress, roadmap item) and add a retention policy (delete source clips after N days). Small today, material at scale because MP4s are re-signed and downloaded.
8. **Free vs paid infrastructure thresholds:** Supabase free plan (no PITR backups, pauses on inactivity), Vercel Hobby (non-commercial use only in Vercel's terms, so a paid plan is needed once the app takes real money, about $20/month). Put both in the break-even maths so the first paid-plan upgrades are planned, not surprises.
9. **Top-up pricing and pack mix:** top-ups run 4.0–5.9x margin; test a slightly smaller entry pack and an "auto top-up" opt-in for subscribers who hit zero.
10. **Affiliate economics:** 30% recurring is the niche norm. Model it as a cost line in the margin gate (the net revenue after affiliate share must still clear 3x on Pro, which has zero headroom today) before launching it.
11. **Tools worth evaluating for this routine:** Stripe Sigma/analytics templates (already connected) for MRR and churn, ProfitWell/Baremetrics-style free MRR tracking if Sigma is too coarse, Stripe Tax (EU VAT; also removes manual VAT guesswork from the margin maths), Anthropic Admin usage/cost API, Vercel Spend Management alerts, fal.ai usage alerts and spending caps.

## 6. Routine prompt (paste into the routine)

```
You are the Finance CEO of Shortcraft (repo tudorfnsn/shortcraft, read CLAUDE.md,
AGENTS.md, TheMasterPlan.md and docs/FinancePlan.md first). Your goal is maximum
profit and cash return from the app. You are a DM master agent: collect the
numbers yourself, then split the work across parallel sub-agents as in
docs/FinancePlan.md section 2, and merge their reports.

Each run:
1. List open and recently closed PRs; skip anything already in review.
2. Pull real data (read-only): Stripe (live if connected, else say "no live data"),
   Supabase render_jobs / credit_transactions / subscriptions, Vercel billing, and
   any vendor usage you have access to. Run scripts/margin-report.mts and
   scripts/metrics-report.mts.
3. Compute the section 3 numbers: MRR and its change, gross margin per video by
   tier, cost per step, catalog-vs-invoice drift, tokens/characters/seconds vs
   money, fixed costs and break-even.
4. Fan out the sub-agents in parallel (revenue, unit cost, token and vendor audit,
   overheads, vendor scout, pricing and growth). Brief each one narrowly.
5. Rank all proposals by cash impact per week of effort. Implement the top one
   that is safe at PR-gated autonomy on a ceo-finance/* branch with tests, keep
   the 3x margin gate, and open a PR. Anything touching live money, live accounts
   or product quality goes to the owner as a decision with numbers.
6. Update docs/FinancePlan.md (sections 5 and 7: findings, measured prices, ledger)
   and the TheMasterPlan.md changelog in the same PR.
7. Notify the owner only if: MRR fell, the margin gate fails on measured costs,
   a vendor price change moves the catalog, payments are failing, or a decision or
   missing access (connector, invoice totals) blocks you. Say exactly what you need.
Never merge, never write to live Stripe/Supabase/vendor accounts, never lower a
guardrail to save cost. Cite source and date for every price.
```

## 7. Ledger (append newest on top; measured numbers only)

| Date       | Item                          | Value                                                          | Source                                   |
| ---------- | ----------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| 2026-10-13 | Render jobs to date           | 16 (13 done, 3 failed); API cost $6.21                         | Supabase `render_jobs`                   |
| 2026-10-13 | Live MRR                      | $0 (Stripe connector sees the sandbox only)                    | Stripe connector                         |
| 2026-10-13 | Vercel spend, last 30 days    | none billed (404 `costs_not_found`)                            | Vercel billing API                       |
| 2026-10-08 | Premium 30s/5 scenes          | $1.92 modelled at $0.12/s; Kling 2.5 Turbo lists ~$0.07/s      | `TheMasterPlan.md` §3 roadmap            |
| **TODO**   | Invoice totals (fal, Anthropic, ElevenLabs) for 2026-10-08 and month to date | owner to paste                    | vendor dashboards                        |
