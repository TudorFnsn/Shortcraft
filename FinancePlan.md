# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on pricing, unit economics, vendor choice and cash. Every finance
> PR updates this file (metrics, backlog, changelog) in the same change.
>
> Last updated: 2026-10-15 (created)

---

## 1. Charter (proposed 2026-10-15, owner confirms by editing this file)

| Question    | Answer                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal        | **Maximise cash return**: more MRR, lower cost per paid video, no loss-making user. Cash first, vanity metrics last.                           |
| Autonomy    | **Analyse + PR-gated code.** Branches `ceo-finance/<slug>`; never merge. Any write outside the repo (Stripe object, price change, migration, vendor signup, live mode) needs Tudor's explicit OK. |
| Cadence     | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the main CEO 06:00 and Design CEO 09:00). Weekly deep run on Mondays.      |
| Margin rule | Keep the existing gate (`features/billing/margin.ts`, 3x worst case). A change may never make `scripts/margin-report.mts` fail.               |
| Silence     | A routine run that finds nothing new sends no notification. It notifies on: MRR drop, margin gate failing, a vendor price change that matters, a saving ≥ 10% of monthly spend, a blocker (missing access). |

## 2. The DM master agent and its team

The Finance CEO is a **master agent that only plans, delegates and decides**. It
never does the analysis itself. Each run it spawns the agents below **in parallel**
(one message, several `Agent` calls), gives each a self-contained brief (goal, files,
what is already ruled out), then merges the answers into one digest and at most one PR.

| Agent               | Job                                                                                                                                                              | Reads                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Revenue analyst** | MRR, net new MRR, churn, ARPU, trial→paid, plan mix, top-up share, failed payments, refunds. Compare with the last run.                                          | Stripe connector (`stripe_analytics` templates: `active_subscribers`, `net_mrr_churn_rate`, `new_subscribers`, `gross_volume`), `scripts/metrics-report.mts` |
| **Cost analyst**    | Real cost per finished video by shape and tier: `render_jobs.api_cost_usd` vs credits charged vs measured provider invoices; trial burn per signup; failed-job waste. | Supabase connector (read-only SQL), `margin.ts`, provider billing (see §5)                    |
| **Infra analyst**   | Hosting and platform bill: Vercel usage and charges, Supabase plan and egress/storage, Sentry, domain, storage growth of `media`, cron cost. Find what to downgrade or prune. | Vercel connector (`list_billing_charges`, usage), Supabase advisors and logs                  |
| **Vendor scout**    | Cheaper or better replacements per slot (video, image, voice, script, render), with a normalised $/finished-second and a quality note. Sources must be provider pages, not only aggregators. | Web search/fetch                                                                               |
| **Pricing and growth strategist** | Pricing, packaging, annual plans, top-up ladder, trial size, upsell triggers, win-back and dunning, referral. Models each idea against the margin gate before proposing it. | `config/plans.ts`, `config/models.ts`, Revenue and Cost analyst output                        |
| **Implementer**     | Only after the master picks ONE item: writes the code/config change on a `ceo-finance/<slug>` branch, tests, updates docs. Reviewed by a second agent before the PR. | repo                                                                                          |

Master decision rule: rank every candidate by **(expected monthly cash gain × confidence) ÷ effort**,
pick the top one that is not already in an open `ceo-finance/*` PR, and park the rest in §4.

## 3. Metrics the routine must report every run

Always the same table, so trends are visible (append a row to §6, newest first):

1. **MRR** (EUR, from Stripe), net new MRR, subscriber count by plan, **MRR growth %** week over week.
2. **Churn**: subscriber and net MRR churn. **Trial→paid** conversion, ARPU, top-up revenue share.
3. **Gross margin** = (net revenue − API cost − infra) ÷ net revenue, where net revenue is after VAT and Stripe fees (`netRevenueUsd`).
4. **Cost per finished video** by shape (15s/30s/60s, standard/premium) from `api_cost_usd`, next to credits charged and the gate's worst case. Flag any gap > 25% between the catalog `costUsdPerUnit` and measured cost.
5. **Token and provider usage vs spend**: Anthropic tokens in/out per script and $ per script (Anthropic usage page/API), fal.ai seconds and $ per image/clip, ElevenLabs characters and $ per voiced second, ffmpeg compute time. Compare each to its catalog row in `models.ts`.
6. **Fixed monthly costs**: Vercel, Supabase, Sentry, ElevenLabs plan, domain, any SaaS. **Break-even**: paying subscribers needed to cover fixed costs, and how far away we are.
7. **Cash priorities** (ordered): payments we are owed (failed invoices, open disputes) → leaks (trial abuse, free-tier burn, failed-job cost) → cost cuts → price/packaging → growth spend.

## 4. Backlog (seed ideas; the routine re-ranks them each run)

Status: `[ ]` open · `[~]` in an open PR · `[x]` shipped · `[✗]` rejected (reason).

**Cost (vendor swaps; verify every price on the provider's own page before acting)**

- [ ] **Premium video (fal.ai Kling 2.5 Turbo, ~$0.07/s billed in 5s clips, catalog $0.12/s)** is the largest cost line. Candidates to benchmark on the same 3 prompts: Wan 2.6 (~$0.05/s listed), Seedance 2.0 Fast (reported $0.022–0.04/s), LTX-2 (per-megapixel pricing, cheapest), Kling 3.0 Pro (~$0.09/s). Also call the model providers directly (BytePlus/ByteDance for Seedance, Alibaba Model Studio for Wan, Kuaishou for Kling) or compare Replicate/WaveSpeed/Novita, since aggregators add a margin. Output: a table of $/finished second at 720p and 9:16, plus a quality note, then make `FAL_VIDEO_MODEL` (already env-driven) or a new adapter the cheapest that passes quality.
- [ ] **Hero-shot premium** (AI clip on scene 1 only, stills for the rest): ~$0.45 vs ~$1.10 per 15s. Needs the pricing in §7 of the master plan.
- [ ] **Clip length waste**: Kling bills fixed 5s clips, so a 3s scene pays for 5s. Align scene length to the billed unit or pick a per-second-billed model.
- [ ] **Script (Claude Sonnet 5.5, ~$0.04/script)**: use prompt caching for the fixed system prompt, a cheaper model (Haiku 5.5) for the first draft or for revisions, and the Batch API for non-urgent work. Measure tokens per script first.
- [ ] **Voice (ElevenLabs Flash $0.05/1k chars)**: compare Deepgram Aura-1 (~$0.015/1k, no cloning), Cartesia, Polly/Google standard (~$0.004/1k, lower quality). Voice Studio needs custom voices, so keep ElevenLabs for those and use a cheaper engine only for stock voices if quality is accepted. Also watch the ElevenLabs plan's custom-voice slots.
- [ ] **Images (FLUX schnell $0.003)** are already cheap; only check cache reuse (same prompt → same image) and failed-job waste.
- [ ] **Failed and abandoned jobs**: sum `api_cost_usd` on `failed`/cancelled jobs; add refunds-of-cost guards (retry limits, fail-fast moderation before paid steps).
- [ ] **Storage and egress**: auto-expire old video files for free users, compress, serve from a cheaper CDN if Supabase egress grows.
- [ ] **Hosting**: right-size Vercel (function duration/memory for the ffmpeg render, cron frequency), check Fluid compute and the Hobby→Pro cost, and whether Supabase compute can stay on the smallest add-on.
- [ ] **Payments**: Stripe fees are the second cost. Check Stripe Tax cost vs a merchant of record (Paddle, Lemon Squeezy, Polar) only as a research item: they take ~5% + $0.50 but remove VAT filing; compare at the current volume before suggesting anything.

**Revenue**

- [ ] **Annual plans** (price ids already modelled: `stripePriceIdYearly`): ~2 months free for cash upfront and lower churn.
- [ ] **Trial economics**: trial burn is ~$0.25 per signup; track cost per paid conversion (CAC from trials). Add card-on-file for the trial or shrink it if conversion is low.
- [ ] **Top-up ladder and auto-recharge** (offer a top-up at the moment credits run out; best conversion point).
- [ ] **Upgrade nudges**: Starter users who hit the 30s cap or the 1-saved-voice cap; Pro users who want premium video.
- [ ] **Dunning and win-back**: Stripe smart retries, a card-expiring email, a cancel-flow offer (pause instead of cancel), a lifecycle email at day 3/7/14 (the lifecycle cron already exists).
- [ ] **Credit expiry/rollover policy**: unused monthly credits are pure margin; decide rollover with the legal text first.
- [ ] **Add-ons**: priced extra saved voices, priority queue, watermark-free export on Starter, team seats.
- [ ] **Price test**: Starter €14.99 has a ~9x margin, so there is room to either add value or test a higher price; test, don't guess. Never change a live Stripe price without Tudor's OK.
- [ ] **Referral / affiliate** (creators bring creators); a revenue-share program costs nothing until it converts.

## 5. Data access the routine needs (set these up once; ask Tudor for anything missing)

| Need                        | How                                                                                                                                                       | Status (2026-10-15)                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Repo read/write on branches | GitHub connector (this session has it)                                                                                                                    | OK for `tudorfnsn/shortcraft`                                    |
| Stripe revenue/MRR          | Stripe connector → `stripe_analytics`. **The connected account is a test-mode sandbox, so MRR is not real yet.** Tudor: connect the live account read-only (restricted key or the live connector) once live. | Sandbox only                                                     |
| Per-job cost                | Supabase connector, read-only SQL on `render_jobs.api_cost_usd`, `credit_transactions`, `subscriptions`                                                    | Connector failed to connect on 2026-10-15 (`ERR_PROXY_TUNNEL`); retry |
| Vercel bill and usage       | Vercel connector (`list_billing_charges`, usage tools)                                                                                                    | Connector present                                                |
| Anthropic usage             | Admin API key (`ANTHROPIC_ADMIN_KEY`) for the usage and cost reports, or the Console export                                                              | **Missing — ask Tudor**                                          |
| fal.ai usage                | fal usage/billing API needs an admin key (`FAL_ADMIN_KEY`), or a monthly invoice export                                                                    | **Missing — ask Tudor**                                          |
| ElevenLabs usage            | `GET /v1/user/subscription` with the existing key returns characters used and the slot count (read-only)                                                  | Key exists in Vercel; add to the routine's env                   |
| Sentry/analytics            | A Sentry connector; PostHog or Vercel Analytics for funnel (visit→signup→trial→paid)                                                                      | Not connected                                                    |
| Fixed-costs sheet           | Tudor lists every subscription once in §8 (name, EUR/month, renewal date)                                                                                  | **Missing — ask Tudor**                                          |

Suggested connectors and tools that would help most: **Stripe live (read-only)**, **PostHog** (funnel and
paywall tests), **Sentry**, **Google Sheets/Drive** (a fixed-costs and cash-flow sheet the routine can update),
**Slack or email** for the digest, and a bank/accounting feed (Wise, Qonto, Xero or QuickBooks) for real cash
position. Useful Claude tools: `Agent` fan-out for the team in §2, `stripe_analytics` (SQL on Sigma tables),
`WebSearch` in extended mode for vendor pricing, the Artifact tool for a private live finance dashboard, and
`PushNotification` for the alerts in §1.

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 monetization, §9 ops), this file, `git log -20`, open and recent PRs (`ceo-finance/*` first), the last row of §7.
- **Run the numbers before opinions:** `npx tsx scripts/margin-report.mts`; `npx tsx scripts/metrics-report.mts` when `.env.local` exists; Stripe and Supabase connector reads; write the results in the digest with their source and date. If a source is unreachable, say so and notify; never invent a figure, and mark estimates as estimates.
- **One change per run**, on `ceo-finance/<slug>`, never merged by the routine. The main CEO's `models.ts` / `plans.ts` edits and the Design CEO's UI files are left alone while their PRs are open; if a finance change needs them, rebase on theirs and say so.
- **Files it may change:** `src/config/models.ts`, `src/config/plans.ts`, `src/features/billing/**`, `src/features/providers/**`, `scripts/**`, `tests/**` for those, `docs/**`, this file, and the money lines of `TheMasterPlan.md`. Not allowed: secrets, live Stripe objects, migrations without Tudor's OK, UI redesign.
- **Evidence bar for a vendor swap:** price from the provider's own page (date and URL in the PR), measured quality on the same prompts (stored under `docs/finance/`), the margin report before and after, and a fallback to the old model through the registry.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test` pass; `npx tsx scripts/margin-report.mts` still passes.
- **Output:** a digest (metrics table from §3, what moved, decision and why, PR link, what is waiting on Tudor, next item) and a `PushNotification` only for the conditions in §1.

## 7. Metrics log (newest first)

| Date       | MRR (EUR) | Subs | Churn | Gross margin | Cost per 15s std / premium | Note                                                    |
| ---------- | --------- | ---- | ----- | ------------ | -------------------------- | ------------------------------------------------------- |
| 2026-10-15 | n/a       | n/a  | n/a   | n/a          | catalog $0.07 / $1.10 est. | Plan created. No live revenue data yet (Stripe sandbox). |

## 8. Fixed monthly costs (Tudor to fill)

| Item                     | EUR/month | Renews | Notes |
| ------------------------ | --------- | ------ | ----- |
| Vercel                   | ?         | ?      |       |
| Supabase                 | ?         | ?      |       |
| ElevenLabs plan          | ?         | ?      | Custom-voice slot count matters. |
| Domain                   | ?         | ?      |       |
| Other (Sentry, tools...) | ?         | ?      |       |

## 9. Routine registration

- Name: **Shortcraft Finance CEO** · Opus-class model · 12:00 UTC daily · PR-gated · repo `TudorFnsn/Shortcraft`.
- Connectors to attach: GitHub, Stripe, Supabase, Vercel (add PostHog/Sentry/Sheets when available).
- Routine prompt (paste into the routine): "You are the Finance CEO of Shortcraft, a master agent. Read `FinancePlan.md` and `TheMasterPlan.md`, then follow FinancePlan §2 (spawn the six agents in parallel with self-contained briefs), §3 (report the metrics), §6 (rules). Pick one highest cash-impact item, implement it on a `ceo-finance/<slug>` branch, open a PR, never merge, update FinancePlan §7 and the changelog. Send a PushNotification only for the conditions in §1; if nothing changed, stay silent."
- Routine id: _fill in after creation_.

## 10. Changelog

- **2026-10-15** — FinancePlan created: charter, master-agent team, metrics, backlog, data-access checklist, run rules. Prices in §4 come from search snippets (fal.ai, teamday.ai, devtk.ai, camb.ai, apiframe.ai) and are unverified. (Finance CEO, interactive setup)
