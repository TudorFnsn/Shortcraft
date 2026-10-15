# FinancePlan — Shortcraft Finance CEO

> Owned by the **Finance CEO** routine. Product, priority and pricing calls still
> live in `TheMasterPlan.md`; this file holds the finance charter, the cost
> ledger, the vendor backlog and the routine's rules. Read `TheMasterPlan.md` §7
> (pricing) and §8 (risks) first.
>
> Last updated: 2026-10-15 (created)

---

## 1. Charter

**Goal: maximise cash return.** Watch MRR against everything we pay out, and ship
(or propose) the change that moves profit most: cheaper providers, better prices,
less waste, more paid conversion and retention.

Always, every run:

1. **MRR vs cost.** MRR, paying subscribers, net revenue after VAT + Stripe fees, and total monthly spend. Report the ratio (revenue ÷ spend) and the trend.
2. **Cost per video.** API cost per finished video by tier, tokens/credits burned per video, failed-job spend (a failed job still costs money; credits are refunded), and cost per 1,000 credits sold.
3. **Every other payment.** fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, Sentry, domain, Stripe fees, tax, ads. Nothing is "too small to list"; recurring fixed costs matter most at low volume.
4. **Prioritise cash return.** Rank every idea by (monthly € gain × confidence) ÷ effort, and say what it costs to be wrong.
5. **Find cheaper and better.** Review the vendor backlog (§5) for new models, prices and techniques. Verify before recommending.

**Not in scope:** UI work (Design CEO), roadmap features (main CEO), live Stripe or provider writes without the owner.

## 2. Measuring (read-only)

| What                             | Source                                                                     | Notes                                                             |
| -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| MRR, subscribers, tier economics | `npx tsx scripts/finance-report.mts [--json]` (service role, selects only) | Needs `.env.local`; cloud sessions use the Supabase connector SQL |
| Cost per video                   | `render_jobs.api_cost_usd` × `actual_credits`                              | Real usage × catalog list prices, **not invoices**                |
| Margin gate                      | `npx tsx scripts/margin-report.mts`                                        | Must stay ≥ 3x on every product                                   |
| North star, churn proxies        | `npx tsx scripts/metrics-report.mts`                                       |                                                                   |
| Real MRR, refunds, fees, churn   | Stripe connector (`stripe_analytics`, `stripe_api_read`)                   | Test mode only until the live account is added                    |
| Hosting spend                    | Vercel connector `list_billing_charges`, `list_contract_commitments`       | Hobby is free; flag the day a limit forces Pro                    |
| Provider invoices                | Owner-maintained ledger (§3) until a billing API is wired                  | fal.ai and ElevenLabs show usage in their dashboards              |

If a source is unreachable, say so in the digest and use the last known figure marked **stale**. Never invent a number.

## 3. Cost ledger (owner-maintained; the routine reads it and may propose edits)

Fill in monthly, from invoices. Empty cells are the routine's questions to the owner.

| Month   | MRR €         | fal.ai $ | ElevenLabs $ | Anthropic $ | Vercel $ | Supabase $ | Resend $ | Other $ | Stripe fees € | VAT/tax € |
| ------- | ------------- | -------- | ------------ | ----------- | -------- | ---------- | -------- | ------- | ------------- | --------- |
| 2026-10 | 0 (test mode) |          |              |             |          |            |          |         |               |           |

Fixed monthly costs known today: ElevenLabs plan (custom-voice slots, see TheMasterPlan §8), domain (if any). Everything else is on free tiers or usage-based.

## 4. Operating model: master agent + specialists

The routine runs as one **master agent** (the "DM") that never does the deep work itself. It reads this file, `TheMasterPlan.md`, open PRs, and the numbers, then splits the run across specialists in parallel and merges the results into one ranked digest.

| Specialist          | Job                                                                                                                              | Output                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Metrics**         | Run `finance-report`, `margin-report`, `metrics-report` (or the connector equivalents). MRR, tier economics, margin gate status. | A table with source + freshness for each figure     |
| **Spend auditor**   | Read the ledger (§3), Vercel billing, Stripe fees; list every payment; flag anything that grew > 20% or sits unused.             | Spend table, ratio, anomalies                       |
| **Vendor scout**    | Web-search for cheaper or better video, image, voice and LLM options (§5); fetch the vendors' own pricing pages when reachable.  | Candidates with price, quality, licence, source URL |
| **Cost engineer**   | Find waste in the pipeline: token use in the script step, retries, failed-job spend, clip length vs billed seconds, caching.     | Code-level findings with € impact                   |
| **Pricing analyst** | Credits/plans/top-ups vs measured cost; annual plan, price tests, trial burn, overage; conversion levers.                        | Proposals with the margin-gate result               |
| **Implementer**     | Takes the top approved-by-rule item, makes the change on a branch, runs the full bar, opens the PR.                              | One PR (`ceo-finance/*`) or none                    |

Split rule: spawn Metrics + Spend auditor + Vendor scout at once; Cost engineer and Pricing analyst start when Metrics returns; the Implementer runs last and alone. Every specialist gets a narrow brief and returns facts with sources; the master checks any number that drives a decision.

## 5. Vendor backlog (candidates to verify, not recommendations)

Prices below are **unverified leads** from earlier research (TheMasterPlan §7 sources disagree by up to 2x). The Vendor scout re-checks each against the vendor's own page, then a real call, before anything reaches the margin gate.

- **Video (biggest cost):** Kling 2.5 Turbo Pro on fal.ai is the current default (~$0.07/s listed, billed in fixed 5s clips). Candidates: LTX-2 Fast, Wan 2.x, Seedance, Hailuo, Veo Fast, direct-from-vendor APIs (Kling, MiniMax, ByteDance) instead of the fal.ai markup, and hosts like Replicate, Runware, WaveSpeed, Novita, Together. Compare cost per _usable_ second, not list price.
- **Cheapest structural win:** "hero shot" Premium (AI clip on the hook scene only, stills for the rest, ~⅓ the cost) and shorter AI clips (3s) with Ken Burns on the remainder.
- **Images:** FLUX schnell is already ~$0.003. Check for cheaper hosts, batch pricing, and reusing images across re-voices (already done).
- **Voice:** ElevenLabs Flash ($0.05/1k chars). Candidates: other TTS APIs, self-hosted open TTS (only if volume justifies it), caching repeated lines.
- **LLM:** the script step uses Claude Sonnet 5.5 at ~$0.04/video. Test Haiku-class for the script and for moderation; use prompt caching and tighter output schemas.
- **Hosting/media:** Cloudflare R2 for media (no egress fees, already on the roadmap); Vercel function minutes for ffmpeg; Supabase egress.
- **Revenue side:** annual plans (cash up front, lower churn), price test on Starter, credit expiry / rollover rules, top-up nudges at 80% burn, win-back emails, affiliate payout cap, Stripe fee mix (cards vs SEPA), Stripe Tax vs manual VAT.

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7, §8, §9), this file, `git log -20`, open and recent PRs. An item with an open PR is in review, not available.
- **One PR per run at most**, branch `ceo-finance/<slug>`, never `main`. Prefer improving an open finance PR.
- **Autonomy:**
  - _May do alone:_ read-only measurement, pure analysis code, scripts, tests, docs, adapter work **behind a flag with the old path kept**, catalog cost corrections that match measured numbers.
  - _Needs the owner's OK first:_ anything that changes what customers pay or get (plans, credit prices, trial size, limits), any live provider swap, any Stripe write, any migration, any new paid subscription, any spend. Put these in the digest as a decision with a recommendation, the € impact and the downside.
- **Never:** merge, touch live secrets, run a paid API call without a stated budget, drop below the 3x margin gate, weaken moderation, or remove an AI label to save money.
- **Files it may change:** `FinancePlan.md`, `scripts/finance-report.mts`, `src/features/finance/**`, `src/config/models.ts` (costs only), provider adapters under `src/features/providers/live/**`, `docs/**`, finance lines of `TheMasterPlan.md`. It does not touch UI files or `src/features/credits|billing` logic without an owner-approved item.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode, plus `margin-report` before and after any cost or price change.
- **Evidence:** every recommendation carries current € per month, expected € per month, confidence (low/med/high), source, and what to measure to confirm.
- **Digest + notification:** report MRR, spend, ratio, top 3 ranked ideas, PR link, owner decisions pending, data gaps. **Send a push notification only when something needs the owner**: ratio falls below target, a cost jumps > 20%, the margin gate fails, a decision is waiting, or the routine could not run. A quiet "all steady" run sends nothing.

## 7. Owner questions (the routine cannot get these itself)

1. **Invoices:** monthly totals for fal.ai, ElevenLabs (plan tier + slots), Anthropic, Vercel, Supabase (plan), Resend, domain, Sentry, anything else. Fill §3.
2. **Targets:** minimum revenue ÷ spend ratio, runway/cash target, and the monthly profit you want. Default used until told: ratio ≥ 3, margin gate ≥ 3x.
3. **Live Stripe:** add the live account to the Stripe connector (read-only restricted key is enough for reporting) so MRR is real. Until then MRR reads 0 or test data.
4. **Budget for experiments:** a monthly $ cap for the Vendor scout's test calls (suggested $10), and a dedicated low-limit key per provider.
5. **fal.ai reachability:** the cloud sandbox cannot reach fal.ai, so measured clip costs must come from you running `scripts/live-providers-smoke.mts --premium`. Send the dashboard totals for 2026-10-08 (still open in TheMasterPlan §5).
6. **Tax:** Stripe Tax or manual EU VAT, and the company country (changes net revenue and fees).
7. **Ad spend / affiliate payouts**, if any, so CAC is in the ratio.

## 8. Suggested connectors, tools and add-ons

- **Already connected:** Supabase (read-only SQL), Stripe (sandbox), Vercel (billing, runtime logs), GitHub.
- **Worth adding, in order of value:**
  1. **Stripe live account (restricted read key)**: real MRR, fees, refunds, churn.
  2. **Sentry connector**: error volume on paid paths (failed renders are wasted spend).
  3. **PostHog connector**: funnel (visit → signup → first video → paid) to price conversion levers.
  4. **fal.ai and ElevenLabs usage**: neither exposes a connector today; a monthly CSV export dropped in `docs/finance/` (or a restricted read key if offered) closes the gap. Use `search_mcp_registry` to look for newer connectors.
  5. **Google Sheets/Drive connector** if you prefer keeping the ledger in a sheet.
  6. **Open-source cost trackers** (e.g. a Langfuse or Helicone-style proxy for LLM calls) if Anthropic spend grows.
- **Claude tools that help:** parallel subagents (the master/specialist split above), `WebSearch` in extended mode for vendor pricing, the `dataviz` skill for a monthly chart artifact, and an Artifact page as a live finance dashboard (private, shareable) once there are paying users.

## 9. Findings so far (2026-10-15)

- No paying users yet and Stripe is in test mode, so **MRR is 0**; every number below is a unit-economics estimate, not cash.
- Standard video is cheap (measured $0.037–$0.049 per 15–30s video, ~$0.04 of it the script) and carries ~9x margin. The risk is Premium: $1.92 measured at the conservative $0.12/s; Pro sits at exactly 3.0x.
- The biggest open lever is **measuring Premium on real invoices** (§7 question 5). Until then the margin gate uses a pessimistic cost, which may be hiding room to cut Premium credit prices or allow it on Starter.
- Fixed costs are not in the repo anywhere. The ratio cannot be computed until §3 is filled.

## 10. Changelog

- **2026-10-15** — Finance track created: charter, cost ledger, master/specialist model, rules, vendor backlog; `scripts/finance-report.mts` + `features/finance/unit-economics.ts` (MRR, cost per video by tier, failed-job spend; +3 tests). (interactive/scheduled setup)

---

## Appendix: routine prompt (paste into the new routine)

> You are the **Finance CEO master agent** for Shortcraft (repo TudorFnsn/Shortcraft). Read `FinancePlan.md` and `TheMasterPlan.md` first, then run the plan in `FinancePlan.md` §4: spawn the Metrics, Spend auditor and Vendor scout specialists in parallel, then the Cost engineer and Pricing analyst, then the Implementer for at most one PR on a `ceo-finance/*` branch. Follow the rules in §6 exactly (PR-gated, never merge, no live secrets, owner approval for anything customer-facing or paid). Compute MRR, spend and the revenue ÷ spend ratio; compare cost per video to credits sold; rank ideas by € gain. Update `FinancePlan.md` (ledger questions, findings, changelog) in the same PR. End with the digest. Send a PushNotification only when the owner must act or the run could not complete; stay silent on an unchanged, healthy run.
>
> Schedule suggestion: daily 07:00 UTC (after the CEO at 06:00, before the Design CEO at 09:00). Model: Opus 5.5. Connectors: GitHub, Supabase, Stripe, Vercel.
