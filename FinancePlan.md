# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on cost, pricing and cash. Every finance PR updates this file
> (§6 state, §7 log) in the same change.
>
> Last updated: 2026-10-17 (created; no run yet)

---

## 1. Charter (owner request 2026-10-17)

Maximise **profit and cash return**. Every run: check the MRR ratio, find the
biggest cost or revenue lever, and either implement it (PR-gated) or put a
costed proposal in front of the owner.

| Question    | Answer                                                                                                                                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal        | Highest gross margin per video and highest MRR ÷ monthly burn, without hurting the north star (weekly paying-retained creators).                                                                                                                                 |
| Priority    | Cash first: cut the largest recurring cost, then raise revenue per user, then optimise the small stuff.                                                                                                                                                          |
| Autonomy    | **PR-gated.** Branches `ceo-finance/<slug>`, never merge, never touch live secrets, never change live Stripe, never switch a live provider alone.                                                                                                                |
| Known issue | `fal.ai` (images + Premium video) looks expensive: evaluate cheaper providers with measured numbers, not list prices.                                                                                                                                            |
| Cadence     | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00).                                                                                                                                               |
| Collisions  | Finance owns `config/models.ts`, `config/plans.ts`, `features/billing/margin.ts`, `features/providers/live/*`, `features/metrics/finance.ts`. It does not touch UI files while a `ceo-design/*` PR is open (price copy on `/pricing` goes through the main CEO). |

---

## 2. The metrics (run `npx tsx scripts/finance-report.mts` first, every time)

| Metric                         | Source                                | Healthy                                                |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| **MRR** (EUR, list, gross)     | `subscriptions` × `PLANS` price       | Growing week on week                                   |
| **MRR ÷ monthly burn**         | `finance-report` (burn = API + fixed) | > 1.0 to break even; target ≥ 3                        |
| **Gross margin per plan**      | `scripts/margin-report.mts`           | ≥ 3x worst case (the margin gate, fail-closed)         |
| **API cost per done video**    | `render_jobs.api_cost_usd` by tier    | Standard ≤ $0.10, Premium falling                      |
| **USD per 1k credits charged** | `finance-report` `byTier`             | Flat or falling                                        |
| **Failed-job spend**           | failed jobs' `api_cost_usd`           | Near 0 (provider calls are billed even when we refund) |
| **Trial burn**                 | trial credits × cost                  | ≤ $0.30 per signup                                     |
| Net revenue after VAT + Stripe | Stripe connector (Sigma / balance)    | Reconciles with MRR within 5%                          |

**Known measurement gap.** `api_cost_usd` is the catalog's list-price estimate,
not a provider invoice, and LLM/voice token or character counts are not stored.
First finance PR: record real per-call usage (provider, model, units, billed
USD from the response headers/usage object) in a new `provider_usage` table,
then reconcile it monthly against the fal.ai / ElevenLabs / Anthropic / Vercel
bills. Until then every cost conclusion is marked _estimated_.

---

## 3. Cost inventory (fill from invoices; the routine keeps it current)

| Line                                   | Type      | Now (best known)                                    | Owner action to get exact numbers      |
| -------------------------------------- | --------- | --------------------------------------------------- | -------------------------------------- |
| fal.ai (FLUX schnell/dev, Kling video) | variable  | schnell $0.003/img, dev $0.025/img, Kling ≈ $0.07/s | fal.ai usage export or billing API key |
| ElevenLabs (voice, Voice Studio slots) | var+fixed | Flash ≈ $0.05 / 1k chars + plan fee                 | Plan + monthly invoice                 |
| Anthropic (script, Sonnet 5.5)         | variable  | ≈ $0.04 per script                                  | Admin/usage key or console CSV         |
| Vercel                                 | fixed     | Hobby (unknown spend)                               | Vercel connector (billing charges)     |
| Supabase                               | fixed     | Free tier (unknown)                                 | Plan + storage/egress                  |
| Resend, Sentry, domain                 | fixed     | unknown                                             | Invoices                               |
| Stripe fees                            | variable  | ~1.5% + €0.25 (EU cards) + 0.5% billing if used     | Stripe connector                       |
| VAT                                    | pass-thru | 20–27% of EU consumer price                         | Accountant                             |

Put the monthly fixed total in `--fixed-usd` when running the report.

---

## 4. Optimisation backlog (ranked by expected $; candidates are **to verify**, not facts)

1. **Measure real per-call cost** (see §2 gap). Blocks trustworthy margin math.
2. **Premium video, the largest unit cost** (~$1.10 per 15s today). Test: hero-shot only (AI clip on scene 1), shorter clips, cheaper image-to-video models (Wan 2.x, LTX, Hailuo, Seedance, Veo fast tier), and other hosts of the same model (Replicate, Runware, WaveSpeed, Novita, Together) versus fal.ai. Gate: same quality on 10 fixed prompts, judged side by side.
3. **Images** (small per unit, many per video): FLUX schnell on other hosts or self-hosted on a pay-per-second GPU (Modal, RunPod) once volume justifies it; cache and reuse theme-level assets.
4. **Voice**: ElevenLabs is the biggest _fixed_ line. Compare a cheaper tier, character-count trimming, and alternatives (OpenAI TTS, Cartesia, self-hosted Kokoro) for Standard only; keep ElevenLabs for Voice Studio.
5. **Script LLM**: prompt caching on the fixed system prompt, a Haiku-class model for Standard, batch API where latency allows; compare quality on a fixed set.
6. **Don't pay for failures**: pre-flight checks before the expensive step, retries only on idempotent steps, cap spend per job (already capped by the hold).
7. **Revenue**: annual plan (≈2 months free; cash up front), top-up nudge when a balance is low, trial watermark/length tuned from activation data, price test on Starter/Pro, Premium priced by measured cost, reminder emails for unused credits (lifecycle cron exists), fix dunning (Stripe Smart Retries, failed-payment email).
8. **Platform costs**: stay on free tiers while MRR ÷ burn < 1; check egress and storage retention (prune renders of lapsed users after N days).

Every item ends in a number: expected $ per month saved or earned, and the
risk to quality or the north star.

---

## 5. Guardrails (inherits TheMasterPlan §9 rule)

- Read-only on live systems. Any write to Stripe, Supabase data or a vendor account needs the owner's explicit OK.
- Never ship a provider swap without side-by-side output samples and measured cost in the PR.
- The margin gate stays fail-closed: no change may lower any plan below 3x worst case.
- Never put secrets in the repo, the PR body or the digest.
- Prices come from vendor pages or invoices with a date and URL. If a page is blocked, say so and mark the figure _unverified_.
- Check open and recently closed PRs before picking an item (an open PR means it is in review).

---

## 6. Current state

- No finance run yet. `finance-report` and its tests exist (this PR); `provider_usage` does not.
- Margin gate passes (TheMasterPlan §7); Pro is at exactly 3.0x, so any measured increase fails it.
- Live revenue: none known; the app has no confirmed paying users, so burn coverage is the number to watch.

## 7. Log (newest first)

- **2026-10-17** — Track created: charter, `scripts/finance-report.mts` (MRR, cost per video by tier, burn coverage), `features/metrics/finance.ts` + tests, routine prompt in `docs/routines/finance-cfo.md`. (interactive)
