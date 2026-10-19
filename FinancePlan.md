# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on unit economics, vendor choice and monetization experiments. Every
> finance PR updates this file (ledger, backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (routine defined, no measurements yet)

---

## 1. Charter (owner request 2026-10-19)

| Question    | Answer                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal        | **Maximum profit, cash first.** Raise MRR and gross margin, cut cost per video, prioritise cash return over growth for its own sake.                                         |
| Always      | Check the **MRR ratio** first on every run (see §3), then propose or implement the change that moves it most.                                                                |
| Cost scope  | Every euro out: AI APIs (fal.ai, Anthropic, ElevenLabs), Supabase, Vercel, Resend, Sentry, Stripe fees, VAT, domain, tools. Not only per-video API cost.                      |
| Token view  | Tokens/units used per video **vs** dollars spent per video **vs** credits charged. Per model, per step, per plan.                                                            |
| Tech scouting | Look for newer or cheaper models and services (video, image, voice, script, render, hosting). The current video model, fal.ai Kling, is seen as expensive: find better.    |
| Autonomy    | **PR-gated, like the other routines.** Branches `ceo-finance/<slug>`; never merge; never change live secrets, live Stripe prices, or apply migrations. Owner decides money moves. |
| Cadence     | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design CEO at 09:00).                                                               |
| Data access | Asks the owner for anything it lacks (§6). If a connector is down, it says so in the digest and works from what it has.                                                       |

---

## 2. The routine: DM master agent + specialist workers

The routine session is the **master ("DM") agent**. It never does deep work itself.
It reads this file, `TheMasterPlan.md`, `git log -20` and open + recently closed PRs
(an item with an open PR is in review, not available), then splits the day into
independent jobs and fans them out with the Agent tool **in one message, in parallel**.
Each worker gets a narrow brief, the files it needs and what is already ruled out; it
returns a short report with numbers and sources. The master verifies, merges the
findings, picks **one** change for the day's PR and writes the digest.

| Worker             | Job                                                                                                                                                                                             | Reads                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Revenue**        | MRR, new / expansion / churned / contraction MRR, ARPU, trial→paid, top-up share, refunds, failed payments. Stripe (Sigma or API, read-only) and `scripts/metrics-report.mts`.                    | Stripe connector, Supabase connector, `src/features/metrics`                                           |
| **Cost ledger**    | Every recurring and variable cost: provider invoices/usage, Supabase and Vercel plan + overage, Resend, Sentry, Stripe fees, domain. Fills §4 with actuals; flags any line with no source.      | Vercel connector (`list_billing_charges`, usage), Supabase connector, `.env.example`, provider dashboards the owner pastes |
| **Unit economics** | Per video: units/tokens per step, `api_cost_usd` from `render_jobs`, credits charged, gross margin per plan and tier. Runs `scripts/margin-report.mts`; compares list price vs measured cost.   | `render_jobs`, `credit_transactions`, `src/config/models.ts`, `src/features/billing/margin.ts`         |
| **Vendor scout**   | Web research (WebSearch, extended mode for prices) on cheaper or better models and services per pipeline step. Output: candidate, price per unit, quality notes, integration effort, source URL + date. Must verify against the vendor's own page, not only aggregators. | WebSearch, WebFetch                                                                                    |
| **Monetization**   | Pricing and packaging experiments: annual plan, plan prices, top-up sizing, trial size, credit expiry/rollover, upsell triggers, usage-based add-ons, affiliate cost, churn saves, dunning.     | Revenue + unit-economics reports, `src/config/plans.ts`, `docs/`                                       |
| **Builder**        | Only when the master has chosen a change: implements it on `ceo-finance/<slug>` with tests; runs `format:check`, `lint`, `typecheck`, `test`, `next build` in mock mode; opens the PR.          | Repo                                                                                                   |

Scale the fan-out to the day: skip workers whose inputs have not changed since the
last run (the ledger in §5 says when each last ran).

---

## 3. The MRR ratio (checked every run)

Report these, with the formula and the date range, then compare with the last row of §5:

1. **MRR** = sum of normalised monthly net revenue of active subscriptions (annual ÷ 12), excluding VAT and top-ups. Also **top-up revenue** as a separate line.
2. **Cost-to-MRR ratio** = total monthly costs (§4) ÷ MRR. **Target: below 0.40** once MRR > 0; while MRR is 0 report **runway** instead (cash ÷ monthly burn).
3. **Gross margin** = (net revenue − API cost − Stripe fees) ÷ net revenue, per plan and for top-ups. The margin gate in `features/billing/margin.ts` (≥ 3x on the worst case) is the floor, not the goal.
4. **Net MRR movement** = new + expansion − contraction − churned. **Quick ratio** = (new + expansion) ÷ (contraction + churned).
5. **Payback**: CAC ÷ (ARPU × gross margin) once there is any paid acquisition.
6. **Trial burn per signup** (`report.trialCostUsd`) against trial→paid.

If a number cannot be computed because data is missing, write "unknown" and add the ask to §6. Never invent a figure.

---

## 4. Cost ledger (monthly, USD unless noted)

Filled by the Cost-ledger worker. `Source` must be an invoice, a dashboard figure the owner pasted, or a connector read. "List" means a price page, not a bill.

| Line                          | Type     | Actual / month | Source                | Notes                                                            |
| ----------------------------- | -------- | -------------- | --------------------- | ---------------------------------------------------------------- |
| fal.ai (FLUX images, Kling)   | variable | unknown        | needs fal usage page  | ~$0.003 to $0.025 / image; Kling ~$0.07 / s of clip (list)       |
| Anthropic (script)            | variable | unknown        | needs Console usage   | Sonnet 5.5 $2 / $10 per MTok in/out (list); ~$0.04 / video        |
| ElevenLabs (voice, voices)    | mixed    | unknown        | needs plan + usage    | Flash $0.05 / 1k chars (list); custom-voice slots set the plan   |
| Supabase                      | fixed    | unknown        | Supabase connector    | plan tier and any overage                                        |
| Vercel                        | fixed    | unknown        | Vercel connector      | Hobby cannot be used commercially: check the plan the app is on  |
| Resend                        | fixed    | unknown        | needs dashboard       | lifecycle email                                                  |
| Sentry                        | fixed    | unknown        | needs dashboard       |                                                                  |
| Stripe fees                   | variable | unknown        | Stripe connector      | % + fixed per charge; billing and tax add-ons if enabled        |
| Domain, other tools           | fixed    | unknown        | owner                 |                                                                  |
| **Total**                     |          | **unknown**    |                       |                                                                  |

---

## 5. Ledger of runs (newest on top)

| Date       | MRR | Cost / MRR | Gross margin | Cash / runway | Decision or PR | Next |
| ---------- | --- | ---------- | ------------ | ------------- | -------------- | ---- |
| 2026-10-19 | n/a | n/a        | n/a          | n/a           | Track created; no data yet. | First run: build `scripts/finance-report.mts` (read-only: MRR, costs per video from `render_jobs.api_cost_usd`, tokens/units per step), fill §4. |

---

## 6. Idea backlog (the Monetization and Vendor scout workers own this list)

Each item: expected impact on cash, effort, what it needs from the owner. Re-rank every run by (monthly cash impact ÷ effort). Mark `[PR #n]`, `[✓ owner]`, `[✗ rejected: why]`.

**Cost down**

- [ ] Replace Kling (fal) for Premium clips. Scout: Wan 2.x, LTX-2 Fast, Seedance, Hailuo, Veo Fast, and self-hosted/serverless GPU (Replicate, RunPod, Modal) for open models. Benchmark cost per 5s 720p clip and quality on the same 5 prompts.
- [ ] Hero-shot Premium (AI clip on scene 1 only, stills elsewhere): about $0.45 vs $1.10 per 15s video. Needs live cost measurement.
- [ ] Cheaper images: compare FLUX schnell on fal against Replicate, Together, Runware, and a cached or reused-asset path for repeated themes.
- [ ] Cheaper script model: measure whether Haiku 5.5 gives the same scripts at a fraction of Sonnet's cost; prompt caching for the fixed system prompt.
- [ ] Voice: compare ElevenLabs Flash with cheaper TTS (OpenAI, Cartesia, Deepgram Aura, self-hosted open models) on quality and cost per minute.
- [ ] Caching and dedupe: reuse scene images for repeated prompts; never pay twice for a retried step (check idempotency keys on provider calls).
- [ ] Platform costs: confirm Supabase and Vercel tiers fit real traffic; delete unused storage (old renders past retention); cron frequency vs invocation cost.

**Revenue up**

- [ ] Annual plans with a discount (cash up front, lower churn).
- [ ] Pricing test: Starter and Pro price points against measured margin, since Standard carries about 9x.
- [ ] Credit expiry or capped rollover so unused credits are not a liability.
- [ ] Top-up nudges at 80% balance; "videos left" framing in the app.
- [ ] Dunning: Stripe smart retries, card-expiry emails, pause instead of cancel.
- [ ] Affiliate programme at 30% recurring (master plan §6) only after the margin per customer is measured.
- [ ] Usage add-ons: priced extras (extra voices, longer videos, batch mode).

---

## 7. Rules for the Finance CEO routine

- **Read first:** this file, `TheMasterPlan.md` (§7 pricing, §8 risks, §9 ops), `git log -20`, open and recent PRs, then the last row of §5.
- **Check the MRR ratio first** (§3), before picking work. Put the numbers in the digest even when nothing changes.
- **One change per run:** the highest cash impact per effort that is not already in an open PR. Prefer finishing an open `ceo-finance/*` PR.
- **Evidence over claims:** a vendor price is "researched" until a smoke call measures it. Cite URL and date. Say when an aggregator and the vendor page disagree. A switch of vendor ships behind the adapter layer and the margin gate, with a measured cost.
- **Files it may change:** this file, `scripts/finance-report.mts` and other read-only scripts, `src/features/metrics/**` (finance helpers), `src/config/models.ts` (costs only, with a source comment), new adapters in `src/features/providers/live/**` (registered but not made the default), tests, and the finance lines of `TheMasterPlan.md`. **Changing credits per unit, plan prices or the default provider is an owner decision:** propose it in the PR with the numbers, do not make it the default.
- **Never:** merge; touch live secrets; create or change live Stripe prices; apply migrations; run paid provider calls above $5 a day without owner OK; spend on ads. Reads on Stripe and Supabase are fine; writes need the owner's explicit OK.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode.
- **Notify:** send a push notification when MRR or margin crosses a threshold, a cost line jumps more than 25% week on week, the margin gate would fail, a clearly better vendor is found (saving above 20% of per-video cost), the runway falls below 3 months, or the routine could not reach its data. Otherwise stay quiet.
- **Output:** a digest with the MRR-ratio block, what moved, the PR link, the ranked top 3 ideas, what is waiting on Tudor, and the next item. Append a row to §5 and a line to the changelog.

---

## 8. What the routine needs from Tudor (it will keep asking until filled)

1. **Authorize the Stripe connector** in claude.ai connector settings (needs reauth; Sigma and subscription reads give MRR). Test mode has no real MRR: tell the routine when live mode is on and whether it may read live data (read-only restricted key is best).
2. **Fix the Supabase connector** (it failed to connect with `ERR_PROXY_TUNNEL` on 2026-10-19), so the routine can read `render_jobs.api_cost_usd` and `credit_transactions`. Without it, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the routine environment for `scripts/*-report.mts`, or a read-only Postgres role.
3. **Provider billing**: fal.ai, Anthropic and ElevenLabs show usage in dashboards the routine cannot reach. Either paste the monthly usage export into a `docs/finance/` file (CSV), or create **read-only/usage-only keys** if the vendor offers them and add them as routine environment variables. Which plans are you on (ElevenLabs tier, Supabase tier, Vercel Hobby or Pro, Resend tier)?
4. **Cash and bank view**: current cash on hand and fixed monthly costs outside the app (domain, tools, your own salary target) so runway and break-even MRR can be computed.
5. **Guardrails**: the daily cap for paid benchmark calls (default $5) and which categories of change the routine may implement without asking (default: scripts, tests, adapters off by default, docs).

### Suggested connectors, tools and add-ons

- **Stripe** (already registered, needs authorization): MRR, churn, refunds, fees, Sigma SQL.
- **Supabase** and **Vercel** (registered): usage, billing charges, runtime logs.
- **PostHog** (planned in the master plan): funnel visitor → signup → paid, to price CAC.
- **A spreadsheet or Drive connector** (Google Sheets/Drive): the owner drops invoices and usage exports there; the routine reads them.
- **fal.ai, ElevenLabs, Anthropic usage**: no connector today; usage-only API keys or exports (item 3).
- **Optional later:** Stripe Billing + Tax, Baremetrics/ChartMogul (only worth it past a few hundred subscribers), a read-only bank feed (Plaid/GoCardless via a connector) for real cash.
- **Claude tools:** WebSearch (extended mode for prices) and WebFetch for vendor pages, the Agent tool for the worker fan-out, the `claude-api` skill for model and caching choices, `dataviz` for the weekly chart in the digest.

---

## 9. Changelog

- **2026-10-19** — Finance track created: charter, DM-master + worker design, MRR-ratio definitions, cost ledger, run ledger, idea backlog, routine rules and the list of access the routine needs. No measurements and no code yet; the first run builds `scripts/finance-report.mts`. (interactive request, Tudor)

---

## 10. Routine prompt (paste into claude.ai/code/routines, 12:00 UTC daily, Opus 5.5, repo `TudorFnsn/Shortcraft`, connectors Stripe + Supabase + Vercel + GitHub)

```
You are the master ("DM") agent of the Shortcraft Finance CEO routine. Read FinancePlan.md in full, then TheMasterPlan.md (§7, §8, §9), git log -20, and list open + recently closed PRs; an item with an open PR is in review.

1. Compute the MRR-ratio block (FinancePlan §3) from Stripe and Supabase. Anything you cannot compute is "unknown" plus an ask; never invent numbers.
2. Split the day into independent jobs and launch the workers in FinancePlan §2 in parallel in one message (Revenue, Cost ledger, Unit economics, Vendor scout, Monetization). Give each a narrow brief, the files to read and what is ruled out. Skip workers whose inputs did not change since the last row in §5.
3. Verify their findings yourself, rank ideas by monthly cash impact / effort, pick ONE change, and have the Builder worker implement it on branch ceo-finance/<slug> with tests, or, if it is an owner decision (prices, credits per unit, default provider), put the numbers in a PR that does not make it the default.
4. Run the bar: format:check, lint, typecheck, test, next build in mock mode. Open a PR (no merge). Update FinancePlan.md (§4, §5, §6, §9) and the finance lines in TheMasterPlan.md.
5. Follow FinancePlan §7 for limits, and send a PushNotification (inside <routine_summary> tags) only when a §7 notify condition is met or you could not reach your data. Otherwise stay quiet.
6. End with the digest from FinancePlan §7 Output.
```
