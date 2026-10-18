# FinancePlan — Shortcraft unit economics and cash return

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (`docs/routines/finance-ceo.md`). It sits under `TheMasterPlan.md`: the master
> plan wins on product and priority; this file wins on pricing, cost and margin
> numbers. Every finance PR updates this file (KPI snapshot, backlog, changelog)
> in the same change.
>
> Last updated: 2026-10-18 (created; no measurements yet)

---

## 1. Charter (owner request 2026-10-18, do not change without Tudor)

| Question  | Answer                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximise cash return.** Raise MRR and gross margin, cut cost per finished video, cut every other recurring payment that does not earn its keep.              |
| Always    | Check the MRR figures first, every run. Report them even when nothing else changed.                                                                             |
| Scope     | Pricing and plans, credit costs, provider choice (video, image, voice, script, render), hosting and tooling spend, trial burn, churn, upsell, conversion.        |
| Hard rule | The **3x margin gate** (`src/features/billing/margin.ts`, `npx tsx scripts/margin-report.mts`) must pass after every change. Never lower it to get a result.   |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge; no live Stripe writes; no live secrets; no price change without owner OK.   |
| Cadence   | Daily cloud routine "Shortcraft Finance CEO". Monthly deep review (first run of each month): full vendor price re-check.                                        |
| Neighbours| Main CEO owns the roadmap, Design CEO owns UI files. Finance never edits `src/components/**` styling; it may touch `config/models.ts`, `config/plans.ts`, providers, billing, scripts. List open PRs first. |

## 2. KPIs (fill from live data; write "n/a: <reason>" when a source is missing)

| KPI                                   | Source                                                   | Latest | Target |
| ------------------------------------- | -------------------------------------------------------- | ------ | ------ |
| MRR (EUR) and net new MRR             | Stripe subscriptions (connector needs OAuth) or `subscriptions` table x `config/plans.ts` | n/a    | up     |
| Paying subscribers, ARPU              | same                                                     | n/a    | up     |
| Churn (logo and MRR), 30 days         | Stripe / `subscriptions`                                 | n/a    | down   |
| Trial to paid                         | `scripts/metrics-report.mts`                             | n/a    | up     |
| Gross margin per plan (real, not worst case) | `render_jobs.api_cost_usd` vs net revenue per plan | n/a    | >= 67% (3x) |
| API cost per finished video, by tier  | `render_jobs.api_cost_usd`, `status = 'done'`            | n/a    | down   |
| Tokens/units per video vs USD spent   | provider usage (see 3) joined to jobs                    | n/a    | down   |
| Trial burn per signup                 | `margin-report.mts`                                      | n/a    | down   |
| Fixed monthly spend (hosting, tools)  | vendor billing pages / Vercel `list_billing_charges`     | n/a    | down   |
| Cash runway / break-even subscribers  | fixed spend / (ARPU x margin)                            | n/a    | down   |

## 3. Data sources and access

| Source                  | Access today                                                                  | Gap / how to close                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Repo                    | GitHub connector, scope `tudorfnsn/shortcraft`                                | none                                                                                                         |
| Supabase (jobs, subs)   | claude.ai connector, project `iqvrovjwoavvmhaithwn`; read-only SQL            | failed to connect (`ERR_PROXY_TUNNEL`) on 2026-10-18: re-authorise it for the routine                         |
| Stripe                  | claude.ai connector, **test mode sandbox**                                    | needs OAuth in claude.ai; live-mode read-only key for MRR once real customers exist                          |
| Vercel                  | connector (`list_billing_charges`, usage)                                     | confirm it is enabled for the routine                                                                        |
| fal.ai                  | none                                                                          | owner: add a read-only usage export or paste monthly invoice totals into section 6                           |
| Anthropic / ElevenLabs  | none                                                                          | owner: Anthropic Console usage by workspace (`ANTHROPIC_WORKSPACE_ID` is already supported), ElevenLabs usage |
| Supabase / Resend / Sentry / domain bills | none                                                        | owner: paste plan + monthly price into section 6                                                             |
| Web research            | WebSearch/WebFetch                                                            | provider pages were blocked from the routine network before (`TheMasterPlan` section 7); say so when a price is a snippet |

**Tokens vs cost.** Per finished job, record: Claude input/output tokens (script),
fal image count and megapixels, fal video billed seconds (Kling bills fixed 5 s
clips), ElevenLabs characters, ffmpeg seconds. First backlog item adds the
missing per-step usage columns so this is measured, not estimated.

## 4. Known cost levers (starting hypotheses, verify before acting)

1. **Premium video is the whole margin problem.** `video-premium` costs us about
   $0.12/s worst case and is priced at 1420 credits/s so Pro passes 3x. Cheaper
   image-to-video models (Wan 2.x, LTX, Hailuo, Seedance, Veo Fast tiers, hosted
   open weights on Replicate, Runpod, Modal, Together) can cut that sharply; the
   catalog swap is one row in `config/models.ts` plus an adapter.
2. **Self-host or batch.** Open video weights on rented GPU by the second can beat
   per-second API pricing once volume is steady. Test only with a measured volume.
3. **Short clips.** Kling bills 5 s minimum: align scene length to the billed
   unit, or cache and reuse clips across a series.
4. **Script step.** Prompt caching and a smaller model for the script cut the
   Claude spend; check it stays a rounding error versus video.
5. **Voice.** ElevenLabs Flash versus cheaper TTS; custom-voice slots are a
   scarce plan resource.
6. **Revenue side.** Annual plans (cash up front), top-up packs, a cheaper entry
   tier, credit expiry/rollover rules, trial length and trial burn, dunning and
   failed-payment recovery, win-back email, upsell at the Starter duration cap.
7. **Fixed costs.** Free-tier headroom on Vercel/Supabase/Resend/Sentry; drop any
   tool nobody reads.

## 5. Backlog (ordered by cash impact, owner adds items here)

- [ ] **F1 Measure.** Add `scripts/finance-report.mts` (read-only): MRR from `subscriptions` x plan price, real margin per plan, cost per finished video by tier from `render_jobs.api_cost_usd`. Add per-step usage columns if needed (migration is a PR, owner applies).
- [ ] **F2 Video provider bake-off.** Price/quality table of at least 5 image-to-video options at 5-6 s, 720x1280, with a live smoke clip each where a key exists. Recommend one; PR the catalog row + adapter behind `FAL_VIDEO_MODEL`-style env.
- [ ] **F3 Re-run the margin gate** with measured costs; lower `video-premium` credits only if the gate still passes, and tell the owner what it does to the price users see.
- [ ] **F4 Annual plan** and Stripe price wiring (no live writes; owner creates prices).
- [ ] **F5 Trial economics:** burn per signup versus trial to paid; propose caps.
- [ ] **F6 Fixed-spend audit** once the owner fills section 6.

## 6. Owner inputs (Tudor fills; the routine reads)

| Item                          | Monthly EUR | Plan / note |
| ----------------------------- | ----------- | ----------- |
| Vercel                        |             |             |
| Supabase                      |             |             |
| fal.ai (last 3 months)        |             |             |
| Anthropic API                 |             |             |
| ElevenLabs                    |             |             |
| Resend                        |             |             |
| Sentry / domain / other       |             |             |
| Marketing / ads               |             |             |

## 7. Changelog (newest on top)

- **2026-10-18** — Plan and routine created (owner request). No measurements yet. (setup)
