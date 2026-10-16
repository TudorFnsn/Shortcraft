# FinancePlan — Shortcraft unit economics

> **Source of truth for the money track.** Owned by the **FinOps CEO** routine
> (`docs/routines/finops-ceo.md`). It sits under `TheMasterPlan.md`: the master
> plan wins on product and priority; this file wins on cost, price and cash.
> Every FinOps PR updates this file (ledger, backlog, changelog) in the same
> change.
>
> Last updated: 2026-10-16 (created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-16, do not change without Tudor)

| Question        | Owner's answer                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Goal            | **Maximum profit and cash return.** Cash in the bank beats vanity growth.                                                       |
| Always check    | **MRR** (and its ratios: gross margin, ARPU, churn, trial→paid, payback), every run.                                            |
| Cost scope      | Every payment the app makes: fal.ai, Anthropic, ElevenLabs, Supabase, Vercel, Stripe fees, Sentry, Resend, domains, anything.   |
| Provider swaps  | Allowed and encouraged when cheaper at equal quality. fal.ai video is the suspected overspend (Premium AI video, Kling 2.5).     |
| Autonomy        | PR-gated, same as the other routines. Read-only on live systems. Anything that spends money or changes prices needs Tudor's OK. |
| Margin floor    | The 3x gate in `features/billing/margin.ts` stays. A change may raise margin; it may never make the gate fail.                  |

## 2. The metrics (definitions, so every run measures the same way)

| Metric                    | Definition                                                                                          | Source                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| MRR                       | Sum of active subscription monthly price (yearly / 12), net of discounts, in EUR and USD            | Stripe (subscriptions)                      |
| Net MRR movement          | New + expansion − contraction − churn                                                               | Stripe                                      |
| Gross margin              | (Net revenue − provider cost) / net revenue; net = after VAT + Stripe fees                           | Stripe + `render_jobs.api_cost_usd`         |
| Cost per video            | `api_cost_usd` per finished job, split by tier and length                                           | Supabase `render_jobs`                      |
| Credits burned vs sold    | `actual_credits` spent / credits granted (breakage is profit)                                       | Supabase credit ledger                      |
| Trial burn                | API cost of free trials / signups; cost of acquiring a paying user                                  | Supabase + Stripe                           |
| Fixed run cost            | Monthly Vercel + Supabase + Sentry + Resend + ElevenLabs plan + domains                             | Vercel billing, vendor dashboards (see §4)  |
| Break-even MRR            | Fixed run cost / gross margin %                                                                     | Derived                                     |
| Token spend               | Anthropic input/output tokens per script, per day, per video                                        | Anthropic usage API / workspace             |

## 3. Ledger (newest on top; the routine appends one row per run)

| Date       | MRR (EUR) | Paying | Gross margin | Fixed cost / mo | Top cost driver | Note |
| ---------- | --------- | ------ | ------------ | --------------- | --------------- | ---- |
| 2026-10-16 | n/a       | n/a    | n/a          | n/a             | n/a             | Plan created. Stripe is test mode only and the Stripe MCP needs auth, so no MRR yet. Costs in `config/models.ts` are list prices, not measured. |

## 4. Data access (what the routine needs; "missing" items are asks for Tudor)

| Need                         | Status                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Repo (read, branch, PR)      | OK (GitHub MCP, scoped to `tudorfnsn/shortcraft`).                                          |
| Supabase (jobs, ledger)      | Connector exists; failed to connect from a cloud session on 2026-10-16 (proxy tunnel error). Fallback: `scripts/metrics-report.mts` with a read-only DB URL. |
| Stripe (MRR)                 | Connector present but **needs OAuth** (claude.ai connector settings). Sandbox only until live. |
| Vercel (hosting cost)        | Vercel MCP present (`list_billing_charges`, `list_contract_commitments`, usage). Verify scope. |
| fal.ai spend                 | **Missing.** Needs an admin/usage API key as secret `FAL_ADMIN_KEY`, or a monthly invoice export. |
| Anthropic spend / tokens     | **Missing.** Needs an Admin API key (`ANTHROPIC_ADMIN_KEY`) for the usage + cost report API.   |
| ElevenLabs spend             | **Missing.** Needs `ELEVENLABS_API_KEY` with `user_read`/usage scope (subscription + character use). |
| Resend / Sentry / domains    | **Missing.** Read-only dashboard export or API keys; list the plan price in §5 until then.   |

Until a source exists, the routine says "no data" and does not guess. It
records estimates only in §5, labelled as estimates.

## 5. Fixed costs (fill from invoices; estimate = E, measured = M)

| Vendor        | Plan / basis | EUR / mo | E/M |
| ------------- | ------------ | -------- | --- |
| Vercel        | unknown      | ?        | E   |
| Supabase      | unknown      | ?        | E   |
| ElevenLabs    | unknown      | ?        | E   |
| Sentry        | unknown      | ?        | E   |
| Resend        | unknown      | ?        | E   |
| Domain        | unknown      | ?        | E   |

## 6. Backlog (priority = expected monthly profit gain ÷ effort; Tudor approves anything that spends or reprices)

Seeded hypotheses, all unverified. Each needs a measurement before a PR.

- [ ] **F1 Measure real cost per job.** Confirm `api_cost_usd` is written by the live adapters (fal, ElevenLabs, Anthropic) from provider responses, not list prices. Without it every other item is a guess. Output: a `scripts/cost-report.mts` (read-only) that groups cost by tier, length, provider and day.
- [ ] **F2 Cheaper image-to-video than fal Kling 2.5.** Benchmark on the same 20 stills: Kling 2.5 Turbo (current, ~$0.07/s), Wan 2.5 / 2.2, LTX-2 Fast (~$0.04/s), Seedance, Hailuo, Veo 3.1 Fast; direct-from-vendor APIs; GPU hosts (Replicate, RunPod, Modal) running open weights (Wan, LTX); Chinese-vendor direct APIs. Score cost per usable second, success rate and quality. Adapters are one row in `config/models.ts` plus an adapter, so a swap is cheap. Do not switch without Tudor's OK on quality.
- [ ] **F3 Hero-shot Premium.** Animate only scene 1, stills elsewhere (~$0.45 vs ~$1.10 per 15s). Already costed in TheMasterPlan §7; needs a measured cost and a price decision.
- [ ] **F4 Clip caching and reuse.** Re-voice and retry must never regenerate paid clips or images. Audit for double-billing paths and orphaned retries.
- [ ] **F5 Cheaper images.** FLUX schnell is $0.003; check alternatives only if images show up as a top-3 cost.
- [ ] **F6 Script tokens.** Prompt caching on the system prompt, smaller model for the plan step, and a token budget per script. Compare Haiku 5.5 vs Sonnet 5.5 on script quality.
- [ ] **F7 Voice.** ElevenLabs Flash vs cheaper TTS at equal quality; watch custom-voice slot costs (TheMasterPlan §8).
- [ ] **F8 Pricing and packaging.** Yearly plans (cash up front, lower churn), annual discount, top-up pack ladder, credit expiry/breakage policy, trial size vs trial→paid, price tests via Stripe. Pro sits at exactly 3.00x, so margin work must come before any price cut.
- [ ] **F9 Retention and dunning.** Failed-payment recovery (Stripe Smart Retries), cancel-flow offer (pause instead of cancel), win-back email through the existing lifecycle cron.
- [ ] **F10 Abuse and free-trial cost.** Trial farming, disposable emails, per-IP and per-card caps; the trial burn is acquisition cost that does not return.
- [ ] **F11 Infra.** Vercel function duration and memory for the ffmpeg render, Supabase storage egress and retention of old media, image sizes. Delete or tier-down media nobody opens.
- [ ] **F12 Stripe fees.** Fixed €0.25 per charge hurts cheap top-ups; check payment-method mix and Stripe Tax cost.

## 7. Rules for the FinOps CEO routine

1. Read this file, `TheMasterPlan.md` §7 and §8, and `src/features/billing/margin.ts` before anything else.
2. List open and recently closed PRs; an item with an open PR is in review, not available.
3. Work only on `ceo-finops/*` branches. Touch `config/models.ts`, `config/plans.ts`, `features/providers/**`, `features/billing/**`, `scripts/**`, `docs/**`, this file and the master plan's §7, §9 and changelog. Leave UI files alone (Design CEO owns them).
4. Never merge, never change live secrets, never switch `MOCK_PROVIDERS`, never create Stripe objects, never change a customer-facing price without Tudor's explicit OK. Propose it in the PR description with the numbers.
5. The margin gate must pass after every change (`npm run test`, `npx tsx scripts/margin-report.mts`). Quality must not drop without Tudor's OK; a cheaper model needs a side-by-side sample.
6. Numbers are labelled **measured** or **estimate**, with a source and a date. Never present a list price as a measured cost.
7. Write results as ledger rows and changelog lines, not prose.

## 8. Changelog (newest on top)

- **2026-10-16** — FinancePlan created with the FinOps CEO routine spec (`docs/routines/finops-ceo.md`). No code changes. (Interactive)

## 9. Decision log

- **2026-10-16** — Money track gets its own routine and plan file, mirroring the Design CEO. It is read-only on live systems and PR-gated, because it reads billing data and proposes price and provider changes.
