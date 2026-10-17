# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on pricing, vendor choice, cost tracking and cash. Every finance PR
> updates this file (ledger, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-17 (track created, no measurements yet)

---

## 1. Charter (owner-configured 2026-10-17, do not change without Tudor)

| Question   | Owner's answer                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal       | **Maximum profit, cash return first.** Raise MRR, cut cost per video, never sell a video below its cost.                                                     |
| Always     | Check the **MRR ratio** (below) every run, then propose or implement the change with the best cash return.                                                   |
| Scope      | Pricing, plans, credits, trial, upsells, annual billing, churn/dunning; vendor choice (video, image, voice, LLM, render, hosting); every recurring payment.  |
| Fresh tech | Scout cheaper and newer models and tools every run. fal.ai video is suspected to be expensive: find cheaper equivalents and prove them with a measured test. |
| Autonomy   | **PR-gated.** Branches `ceo-finance/<slug>`; never merge. Reads are free; any write to Stripe, Supabase data, Vercel or a vendor needs the owner's OK.       |
| Cadence    | Daily cloud routine **"Shortcraft Finance CEO"** (master agent + parallel sub-agents, see `docs/routines/finance-ceo.md`). Weekly deep-dive on Mondays.      |

### Ground rules

1. **Measure before you claim.** Prices from search snippets are leads, not facts (the 2026-10-04 margin gate found 2x disagreement). A vendor swap needs a measured call (`scripts/live-providers-smoke.mts`) before it ships.
2. **The margin gate is law.** `features/billing/margin.ts` must stay green (every product at or above 3x). A change that fails it does not ship; a change that lifts it is a win.
3. **Cash beats cleverness.** Rank work by `expected € per month ÷ effort`, and state the number.
4. **Never trade trust for margin.** No dark patterns, no hidden fees, no silent quality drops. Cheaper models must pass a side-by-side quality check the owner can see.
5. **No secrets in the repo, PRs or logs.** Report amounts and counts, never keys or customer emails.

---

## 2. KPIs the routine reports every run

| KPI                           | Definition                                                                                   | Source                                |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| **MRR**                       | Sum of active subscription monthly-equivalent prices (annual ÷ 12), net of discounts         | Stripe (read-only)                    |
| **Net new MRR**               | New + expansion − contraction − churned, over 7 and 30 days                                  | Stripe                                |
| **MRR ratio**                 | `MRR ÷ monthly cost base` (all recurring + usage spend). Target **≥ 3**; below 1 is an alarm | Stripe + cost ledger (§3)             |
| **Gross margin / video**      | `(net revenue per credit × credits burned) − api_cost_usd`, by plan and quality tier         | `render_jobs.api_cost_usd` + credits  |
| **Cost per finished video**   | Mean and p95 `api_cost_usd`, split by step: script, image, video, voice, render              | Supabase (read-only)                  |
| **Tokens per video**          | Script LLM input/output tokens and TTS characters per finished video, with their cost        | Orchestrator metering                 |
| **Burn vs revenue**           | Total vendor spend this month vs revenue collected                                           | Vendor dashboards, §3                 |
| **Paid churn / trial → paid** | Monthly paid churn; share of trials that convert                                             | Stripe + `scripts/metrics-report.mts` |
| **Credit breakage**           | Credits sold but unused at period end (pure margin) vs credits burned                        | Ledger                                |

Report the MRR ratio first, with its change since the last run. If it fell, say why.

---

## 3. Cost ledger (every payment the business makes)

The routine keeps this table current; unknown rows are questions for the owner (§7).

| Vendor             | What for                         | Billing model          | Monthly cost | Source of truth                | Status             |
| ------------------ | -------------------------------- | ---------------------- | ------------ | ------------------------------ | ------------------ |
| fal.ai             | FLUX images, Kling premium video | Per image / per second | unknown      | `api_cost_usd`, fal usage page | needs owner export |
| Anthropic          | Script writer (Sonnet 5.5)       | Per token              | unknown      | Console usage                  | needs owner export |
| ElevenLabs         | Voiceover, voice design          | Plan + characters      | unknown      | Dashboard                      | needs owner export |
| Vercel             | Hosting, cron, analytics         | Plan + usage           | unknown      | Vercel connector               | readable           |
| Supabase           | DB, auth, storage                | Plan + usage           | unknown      | Supabase connector             | readable           |
| Stripe             | Payment fees                     | % + fixed per charge   | unknown      | Stripe connector               | needs login        |
| Resend             | Lifecycle email                  | Plan                   | unknown      | Dashboard                      | needs owner export |
| Sentry             | Error tracking                   | Plan                   | unknown      | Dashboard                      | needs owner export |
| Domain, other SaaS | -                                | Annual                 | unknown      | Owner                          | ask                |

---

## 4. Roadmap (priority = cash return ÷ effort)

- [ ] **F1 Cost telemetry.** Split `api_cost_usd` by step and record LLM tokens and TTS characters per job (additive migration, owner applies). Add `scripts/finance-report.mts` (read-only): MRR, MRR ratio, cost per video by step, margin by plan, tokens per video. Tested pure math in `features/finance/`.
- [ ] **F2 Video vendor bake-off.** Measure Premium clip cost and quality on real calls: Kling 2.5 Turbo on fal.ai (current) vs Wan 2.x, LTX-2 Fast, Seedance, Hailuo and Veo Fast, each through fal.ai and through the vendor's own API or a cheaper aggregator. Publish a table of € per 5s clip, latency and a link to the sample clip.
- [ ] **F3 Hero-shot premium.** AI clip on the hook scene only, stills elsewhere (about $0.45 per 15s per §7 of the master plan). Price it between Standard and Premium. Biggest expected lift in paid conversion at low cost.
- [ ] **F4 Image and voice cost.** Compare FLUX schnell vs cheaper image models and self-host options; ElevenLabs Flash vs other TTS (Cartesia, OpenAI, Google, Azure) for the Standard tier only; cache repeated voice previews.
- [ ] **F5 LLM cost.** Prompt caching, Haiku-class model for scene prompts, batch API where latency allows. Keep the script quality bar.
- [ ] **F6 Monetization levers.** Annual plan (about 2 months free, cash up front), trial-to-paid email timing, credit expiry/rollover policy, top-up nudges at low balance, a cheaper entry plan, and an "extra render" upsell. Each as an A/B-able PR with its expected MRR effect.
- [ ] **F7 Churn and dunning.** Stripe Smart Retries and card-updater, failed-payment emails, pause instead of cancel, win-back email.
- [ ] **F8 Infra trim.** Right-size Vercel and Supabase plans, cron frequency, storage retention (delete unwatched renders after N days), image sizes and CDN egress.
- [ ] **F9 Price experiments.** Raise prices where the margin gate and demand allow; test Starter at €19.99; add a Business plan.

Pick one item a run. An item with an open PR is in review: do not duplicate it.

---

## 5. Vendor scouting notes

Keep short, dated and sourced. Anything unmeasured is marked `UNMEASURED`.

| Date | Vendor / model | Claim | Evidence | Measured? |
| ---- | -------------- | ----- | -------- | --------- |
| -    | -              | -     | -        | -         |

---

## 6. Changelog (newest on top)

- **2026-10-17** - Finance track created: charter, KPIs, cost ledger and roadmap F1-F9. No code changes. (owner request)

---

## 7. Open questions for the owner

The routine copies unanswered items into its digest. Answer them in the next session or by editing this file.

1. Monthly bills per vendor in §3 (fal.ai, Anthropic, ElevenLabs, Resend, Sentry, domain). A CSV or screenshot of each billing page is enough.
2. Is Stripe live yet? If not, MRR is test-mode only and the ratio is a projection.
3. Budget ceiling per month, and the minimum acceptable margin per video.
4. OK to open fal.ai, Replicate and other vendor accounts for the bake-off (small prepaid spend)?
5. Appetite for annual plans and a price rise.
