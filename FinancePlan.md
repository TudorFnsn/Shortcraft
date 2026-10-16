# FinancePlan — Shortcraft profit & cash

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on cost, price and cash. Every finance PR updates this file
> (ledger, backlog, changelog) in the same change.
>
> Last updated: 2026-10-16 (routine created; no live revenue data reachable yet)

---

## 1. Charter (owner-configured 2026-10-16, do not change without Tudor)

| Question | Owner's answer                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal     | **Maximum profit and cash return.** Cash in the bank beats vanity metrics.                                                                     |
| Always   | Check the **MRR ratio** (net MRR, churn, trial → paid, cost ÷ revenue) every run, and propose or build changes that monetise better.           |
| Also     | New ideas and fresh tech worth integrating. First target: **fal.ai looks expensive**; find cheaper/better video, image and voice providers.    |
| Measure  | Tokens/credits used per video vs what it **costs us** to make it, host the app, and every other payment (SaaS, fees, tax, refunds, disputes).  |
| Autonomy | **PR-gated.** Branches `ceo-finance/<slug>`; never merge; never change live Stripe, live DB or live secrets. Connectors are read-only.         |
| Cadence  | Daily cloud routine **"Shortcraft Finance CEO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00).                             |
| Asks     | If a number is missing, **ask Tudor** (digest section "Needs from Tudor") or add the connector/config that supplies it. Never invent a number. |

---

## 2. Operating model: lead agent + specialists

The routine's first agent is the **Finance Lead** (DM-style master). It does no deep work itself: it reads this file, decides which of the lanes below have something to do today, spawns them in parallel with the Agent tool (one tight brief each: goal, files, what is already ruled out), checks their output against the data, and writes one PR + one digest.

| Lane                | Job                                                                                                                                                                                           | Reads                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Revenue analyst** | MRR, net new MRR, churn, trial → paid, ARPU, refunds, disputes, failed payments. Stripe Sigma templates (`active_subscribers`, `gross_mrr_churn_rate`, `net_mrr_churn_rate`, `gross_volume`). | Stripe connector (live when available, sandbox otherwise)                          |
| **Cost analyst**    | Real cost per video by tier/length (`node scripts/finance-report.mts`), failed-job burn, cost per 1k credits vs price, hosting and SaaS bills.                                                | Supabase read-only, Vercel `list_billing_charges`, `docs/finance/fixed-costs.json` |
| **Provider scout**  | Cheaper/better models and vendors for video, image, voice, script, render, hosting. Verifies prices on the vendor's **own pricing page** (WebSearch/WebFetch), notes the date and source.     | Web, `src/config/models.ts`                                                        |
| **Pricing analyst** | Plans, credit scale, top-ups, annual plans, trial size, overage, free-trial abuse. Always runs `npx tsx scripts/margin-report.mts` before and after.                                          | `src/config/plans.ts`, `src/features/billing/margin.ts`                            |
| **Implementer**     | Builds the one approved-by-rule change (provider adapter behind a flag, price change proposal, caching, cost guard) with tests, on a `ceo-finance/*` branch.                                  | repo                                                                               |
| **Reviewer**        | Fresh read of the diff and the numbers; tries to prove the saving is smaller than claimed (retries, 5-second billing minimums, quality loss, lock-in).                                        | diff only                                                                          |

Rules for the lead: spawn lanes in one message so they run in parallel; do not spawn a lane with nothing new to check; prefer a small PR that moves a measured number over a broad one.

---

## 3. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 money, §9 runbook, §11 decisions), this file, `git log -20`, open and recent PRs (`ceo-finance/*`, `ceo/*`; an item with an open PR is in review, not available).
- **Always run:** `npx tsx scripts/margin-report.mts` (must PASS) and, when a read-only DB path exists, `npx tsx scripts/finance-report.mts --json` and `npx tsx scripts/metrics-report.mts --json`. If a path fails, say so in the digest and add the missing access to "Needs from Tudor".
- **One change per run:** the highest cash-return item in §5 that is not already in an open PR. Prefer improving an open `ceo-finance/*` PR.
- **A cost claim needs a source:** vendor pricing page + date, or a measured call. Aggregator blogs disagree by up to 2x (see TheMasterPlan §7); they can seed a hypothesis, never a price change.
- **Provider swaps** ship behind an env flag and the existing `ModelSpec`/registry port, default **off** until a quality sample (`scripts/live-providers-smoke.mts`) is reviewed by Tudor. Quality of the video is the product; a cheaper model that loses customers is not a saving.
- **Price/plan changes** are proposals with the margin table attached. Only Tudor approves them; the code change lands after approval.
- **Never:** merge, touch live Stripe objects, apply migrations, spend money on providers beyond a smoke test the plan already allows, or put a secret in the repo.
- **Files it may change:** `FinancePlan.md`, `docs/finance/**`, `scripts/finance-report.mts`, `src/features/metrics/finance.ts`, `src/config/models.ts` + `src/features/providers/**` (behind a flag), plan/price config **only as an approved proposal**, and its lines in `TheMasterPlan.md`. It does not touch UI files (Design CEO) or the roadmap items of the main CEO.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Output:** one digest (see §6) and, if warranted, **a push notification when something needs Tudor**: margin gate failing, cost per video above plan, a vendor price change, a dispute/refund spike, MRR falling, or a missing data path.

---

## 4. Cost ledger (what we pay, what drives it)

Facts from the repo (2026-10-16). Unknown means Tudor has not given the number; the routine asks and never guesses.

| Line                   | Driver                                 | Current unit cost / state                                                                                                                             |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script (Claude)        | per video                              | ~$0.04 (est. ~2k in / 1.5k out, Sonnet-class). Not measured; token usage isn't stored per job.                                                        |
| Images (fal FLUX)      | per scene image                        | Standard $0.003 (schnell), Premium $0.025 (dev)                                                                                                       |
| Video, Standard tier   | per second                             | **$0**: Ken Burns in our own ffmpeg                                                                                                                   |
| Video, Premium tier    | per second                             | $0.12/s conservative (Kling 2.5 Turbo Pro on fal, billed in fixed 5s clips). **The main cost.** Re-measure and lower.                                 |
| Voiceover (ElevenLabs) | per second + plan + custom-voice slots | $0.00075/s variable; **plan fee unknown**                                                                                                             |
| Render                 | per video                              | ~$0.01 (in-house ffmpeg on Vercel function)                                                                                                           |
| Trial burn             | per signup                             | $0.23 (3,000 credits)                                                                                                                                 |
| Stripe                 | per charge                             | 1.5% + €0.25 assumed (EEA cards); real mix unknown. Disputes/refunds: unknown                                                                         |
| VAT                    | on every EU sale                       | 20% assumed in the margin gate; real OSS/VAT setup unknown                                                                                            |
| Vercel                 | hosting, functions                     | Hobby plan; billing API returned "no costs" (2026-10-16). Pro needed for sub-daily crons or commercial use? **Check terms** (Hobby is non-commercial) |
| Supabase               | DB, auth, storage (video files!)       | plan unknown; **storage + egress of MP4s will grow with every video**                                                                                 |
| Resend, Sentry, domain | fixed                                  | unknown                                                                                                                                               |

Fixed-cost numbers live in `docs/finance/fixed-costs.json` (null = unknown).

**Margin gate today (PASS):** Starter 5.62x, Pro 3.00x, Ultra 3.23x, top-ups 3.96–5.92x worst case; Premium 6s is the worst shape. Pro sits exactly on the floor, so any provider price rise or lower-than-assumed revenue breaks it.

---

## 5. Backlog (highest cash return first)

Status: `[ ]` open · `[~]` in a PR · `[x]` done · `[?]` waiting on Tudor.

1. `[?]` **Get real data.** The Supabase connector failed from this routine's network and the Stripe connector is sandbox-only, so MRR/actual cost can't be read yet. See §7 for exactly what to connect.
2. `[ ]` **Measure Premium video cost.** Run `scripts/live-providers-smoke.mts` once per candidate model and record billed cost per 5s clip, retries and failure rate. Replace the $0.12/s guess (it drives the whole price scale: lowering it lets Pro/Ultra grant more credits or lets us cut price to convert).
3. `[ ]` **Cheaper video provider (flagged, default off).** Seed list below. Target: same visual quality at ≤ $0.05/s billed, or short-clip tricks (generate 5s once, loop/slow/crossfade).
4. `[ ]` **Cut waste:** failed-job API burn (refund-safe retries only), regenerate caps, cache identical image prompts, lower Premium image from FLUX dev where schnell is indistinguishable in blind samples.
5. `[ ]` **Store per-job cost lines** (script tokens in/out, image count, video seconds, voice chars) so cost per video is measured, not estimated. Needs a migration: a proposal PR, owner applies.
6. `[ ]` **Monetisation levers (proposals, owner approves):** annual plan (~2 months free) to lift cash up front and cut churn; trial size vs trial-abuse cost ($0.23/signup); credit expiry/rollover policy; top-up upsell when balance < 1 video; Premium-only add-ons (longer videos, 1080p, extra voices); referral credit that costs credits not cash; price test on Starter.
7. `[ ]` **Stripe cost:** check fee mix, enable Stripe Tax/OSS correctly, dispute prevention (clear descriptor, receipts), failed-payment retries (Smart Retries) and dunning email.
8. `[ ]` **Hosting cost watch:** Supabase Storage size/egress per video, MP4 retention policy (delete or archive after N days for free users), Vercel function minutes for ffmpeg renders.

### Provider candidates (UNVERIFIED seeds from search snippets, 2026-10-16; confirm on vendor pages before any decision)

| Need  | Candidate                                              | Claimed price                        | Notes                                                                                  |
| ----- | ------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------- |
| Video | Wan 2.5 on fal                                         | ~$0.05/s                             | cheapest on fal in the snippets; same vendor, so no new integration                    |
| Video | Wan 3.0 (Alibaba Cloud)                                | ~$0.083/s at 720p                    | direct vendor, new adapter                                                             |
| Video | Hailuo 2.3 (e.g. via Runware)                          | ~$0.28 per 6s (~$0.047/s)            | fixed 6s billing; fits our 5-6s scenes                                                 |
| Video | Kling 3.0 / Seedance 2.0 / 1.5 Pro                     | $0.03 to $0.16/s depending on source | sources disagree 5x; price per resolution and audio                                    |
| Video | LTX-2 (open weights)                                   | not found                            | could be self-hosted on rented GPU if volume justifies it                              |
| Any   | Direct vendor APIs or aggregators (Runware, Replicate) | often below fal's markup             | compare billed cost on the same prompt                                                 |
| Voice | ElevenLabs Flash vs cheaper TTS                        | unknown                              | variable cost is tiny ($0.00075/s); the **plan fee and voice slots** are the real cost |

---

## 6. Digest format (each run)

1. **MRR ratio:** net MRR, new/churned, trial → paid, cost ÷ revenue, margin gate multiples (or "no live data: why").
2. **Cost per video vs price:** by tier, measured vs estimate; failed-job burn.
3. **Cash:** fixed costs known/unknown, break-even subscribers, runway if known.
4. **What moved:** PR link and the number it changes.
5. **Needs from Tudor:** missing data, approvals, connectors.
6. **Next item.**

---

## 7. Access, connectors and tools this routine needs

State on 2026-10-16: GitHub repo ✅ (write to `ceo-finance/*`), Vercel connector ✅ (team `tudorfnsns-projects`; `list_billing_charges` returned no costs, consistent with the free Hobby plan), Stripe connector ⚠️ sandbox only (`acct_1UKkSC0LHtTQ4zpU`, no live MRR), Supabase connector ❌ failed to connect from the cloud session (`ERR_PROXY_TUNNEL`), so actual `api_cost_usd` per job can't be read.

**Tudor, to unlock real numbers:**

1. **Live Stripe read access.** Connect the live account in the Stripe connector (or create a **restricted read-only key** with Charges, Subscriptions, Invoices, Refunds, Disputes, Balance, Sigma read, and store it as `STRIPE_RESTRICTED_READ_KEY` in the routine's environment). Read-only; the routine never writes live.
2. **A read-only database path.** Either fix the Supabase connector for cloud sessions (allow `mcp.supabase.com` in the environment's network policy), or give the routine environment `NEXT_PUBLIC_SUPABASE_URL` + a **read-only Postgres role** key (not the service role) so `scripts/finance-report.mts` and `scripts/metrics-report.mts` run. Add `mcp.supabase.com`, `api.stripe.com`, `fal.ai`, `elevenlabs.io`, `vercel.com` to allowed hosts so the routine can reach vendor pricing pages and APIs.
3. **Vendor bills.** Fill `docs/finance/fixed-costs.json` (Vercel, Supabase, ElevenLabs plan, fal prepaid/minimum, Anthropic, Resend, Sentry, domain). Paste last month's invoices' totals; that's enough.
4. **Provider usage/billing APIs** (read-only keys): fal.ai usage, ElevenLabs subscription/usage, Anthropic usage and cost report (admin key). They show what we really paid vs what `api_cost_usd` recorded.
5. **Business facts:** company country and VAT/OSS status, whether you want annual plans, a target monthly profit, and your tolerance for lowering video quality to save cost.

**Connectors and add-ons that would help (suggestions, not installed):**

- **Stripe live (read-only)**: MRR, churn, cohorts, refunds, disputes via Sigma.
- **PostHog**: funnel visit → signup → first video → paid, so pricing changes can be judged by conversion, not guesses.
- **Sentry connector**: error rate by provider; failed jobs are burnt money.
- **A bookkeeping/bank connector (Qonto, Wise, or a spreadsheet export)**: the only way to see _every_ payment, including subscriptions we forgot.
- **Google Sheets connector**: a shared P&L sheet Tudor can edit.
- **fal.ai, ElevenLabs, Anthropic usage APIs** (above), and the **Vercel** connector's billing/usage tools (already connected).
- Claude Code side: the `loop` skill for polling vendor price pages, `Workflow` for multi-vendor price sweeps, and an `Artifact` dashboard (shared DB capability) to chart cost per video and MRR weekly.

---

## 8. Changelog (newest on top)

- **2026-10-16** — Finance track started: this plan, `scripts/finance-report.mts` (read-only: cost per finished video by tier, cost per 1k credits, failed-job burn, fixed-cost coverage), `features/metrics/finance.ts` (pure, tested), `docs/finance/fixed-costs.json` (all unknown until Tudor fills it). Margin gate re-run: PASS. No live revenue or cost data was reachable (see §7). Candidate cheaper video providers are listed as unverified seeds. (Finance CEO, setup)
