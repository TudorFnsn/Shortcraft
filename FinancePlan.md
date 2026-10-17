# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine.
> Product, pricing and priority calls still live in `TheMasterPlan.md` (§7 is the
> pricing history); this file holds the cost baseline, the vendor watchlist, the
> roadmap and the rules for the routine. Prompt to register the routine:
> `docs/routines/finance-cfo.md`.
>
> Last updated: 2026-10-17

---

## 1. Charter

Maximise **cash return**: net MRR minus everything we pay (providers, hosting,
tools), without hurting the north star (weekly paying-retained creators).

The routine always, in this order:

1. **Measures** MRR, API spend, wasted spend, cost per finished video, coverage
   (`npx tsx scripts/finance-report.mts`), plus the margin gate
   (`npx tsx scripts/margin-report.mts`).
2. **Finds** the biggest leak or lever (cheaper provider, wasted retries, price
   or plan mix, churn, trial burn, annual billing, fixed-cost bloat).
3. **Proposes or implements** the smallest change that moves cash, PR-gated.
4. **Reports** a digest, and pushes a notification only when something needs the
   owner (see §6).

Priorities, highest first: (a) stop losing money per video, (b) raise revenue per
paying user, (c) cut provider cost per video, (d) cut fixed cost, (e) grow MRR
through conversion and retention levers.

## 2. Operating model: DM master agent + specialists

One master agent (the "DM") reads this file, runs the report, then splits the
work across parallel specialist agents and merges their findings into one
ranked list. It does not do deep research itself. Specialists (see
`docs/routines/finance-cfo.md` for exact briefs):

| Specialist          | Question it answers                                                           |
| ------------------- | ----------------------------------------------------------------------------- |
| **Provider Scout**  | Is there a cheaper or better video / image / voice / LLM provider or model?   |
| **Cost Auditor**    | Where does each video's cost go, and what do tokens and seconds cost vs earn? |
| **Revenue Analyst** | MRR, plan mix, ARPU, churn, trial → paid, top-up share, pricing headroom      |
| **Fixed-Cost Scan** | Hosting, DB, tools: plan right-sizing, free tiers, annual discounts           |
| **Growth Levers**   | Monetisation ideas: annual plans, upsells, referral, credit expiry, caching   |
| **Implementer**     | Builds the one approved-by-rule change (on a `ceo-finance/*` branch)          |

## 3. Cost baseline (list prices, NOT yet measured)

From `src/config/models.ts` (2026-10-04 research) and `TheMasterPlan.md` §7.
Margin gate: every product must clear **3x** worst-case API cost.

| Slot             | Provider today              | Cost basis (USD)                        | Credits charged |
| ---------------- | --------------------------- | --------------------------------------- | --------------- |
| Script           | Anthropic Sonnet 5.5        | $0.04 per generation (est.)             | 100             |
| Image (standard) | fal.ai FLUX schnell         | $0.003 per image                        | 80              |
| Image (premium)  | fal.ai FLUX dev             | $0.025 per image                        | 200             |
| Video (standard) | In-house Ken Burns (ffmpeg) | $0                                      | 80 / s          |
| Video (premium)  | fal.ai Kling 2.5 Turbo Pro  | ~$0.07 / s list, $0.12 / s conservative | 1,420 / s       |
| Voice            | ElevenLabs Flash v2.5       | ~$0.00075 / s                           | 8 / s           |
| Render           | In-house ffmpeg             | ~$0.01 per video                        | 100             |

Known: standard video ≈ $0.07 per 15s (margin ~9x on Starter); premium AI video
is the cost center (≈ $1.10–$2.30 per 15s). Pro sits at exactly 3.0x.

### Known data gaps (the routine closes these first)

1. **No per-step cost or token log.** `render_jobs.api_cost_usd` is one number
   per job; token counts are computed in `anthropic-script.ts` but discarded.
   Roadmap F1 adds a `provider_usage` table.
2. **Costs are list prices, not measured.** Roadmap F2 compares recorded cost to
   each vendor's real invoice.
3. **Fixed costs unknown.** `src/config/fixed-costs.ts` is all zeros until the
   owner fills it in.
4. **No revenue source of truth beyond the DB.** Stripe is sandbox-only and its
   connector needs authorisation (see §7).

## 4. Roadmap

Statuses: `[ ]` open · `[~]` in review · `[x]` shipped. One item per run; never
duplicate an item that already has an open `ceo-finance/*` PR.

- [x] **F0 Finance report** — `scripts/finance-report.mts` + `features/finance/unit-economics.ts`: MRR (net of VAT + fees), API spend, wasted spend, cost per finished video by tier, coverage, API share of MRR. Read-only. _(2026-10-17)_
- [ ] **F1 Usage ledger** — migration `0013_provider_usage` (owner applies): one row per provider call (job, step, provider id, units: tokens / seconds / images, cost USD, latency, ok). Orchestrator writes it through the existing `meter`. Report gains cost-per-step and tokens-per-video.
- [ ] **F2 Provider Scout round 1: video** — compare fal.ai Kling 2.5 Turbo against cheaper image-to-video options (open-weight Wan / LTX / Hunyuan on fal, Replicate, RunPod or Modal; Seedance; Veo Fast) on price per second, quality, max length. Output: a table in §5, plus an adapter behind the existing registry only if one is clearly cheaper at equal quality.
- [ ] **F3 Hero-shot premium tier** — AI clip on the hook scene only, stills elsewhere (already modeled in `TheMasterPlan.md` §7, ≈ $0.45 per 15s). Needs F2 numbers.
- [ ] **F4 Annual plans** — yearly Stripe prices (fields already exist in `plans.ts`) at ~2 months free: cash up front, lower churn.
- [ ] **F5 Waste cuts** — failed-job spend, retry caps, prompt-cache the script system prompt, cache identical scene images, cap trial burn.
- [ ] **F6 Pricing review** — plan mix and top-up share vs headroom; propose price or credit changes with numbers (owner decides).
- [ ] **F7 Fixed-cost right-sizing** — after the owner fills `fixed-costs.ts`.

## 5. Provider watchlist (verify before acting; prices move monthly)

The Scout re-checks these every run and records the date and source. Never put an
unverified number in `models.ts`.

- **Video (the big lever):** fal.ai Kling 2.5 Turbo (current), Wan 2.x, LTX-2 / LTX-2 Fast, Seedance, Hunyuan Video, Veo Fast, MiniMax Hailuo. Self-hosted open-weight on GPU-per-second hosts (Modal, RunPod, Replicate) can undercut per-clip pricing at volume; fal alternatives to compare against the same model on the vendor's own site.
- **Images:** FLUX schnell already ~$0.003. Check cheaper distilled variants and fal's per-megapixel vs flat pricing; consider 576x1024 if quality holds.
- **Voice:** ElevenLabs Flash vs Cartesia, Deepgram Aura, OpenAI TTS, Kokoro / open-weight TTS. Voice cost is tiny (~$0.0008 / s) unless the ElevenLabs plan's fixed fee dominates at low volume.
- **Script LLM:** Sonnet 5.5 ($2 in / $10 out per MTok) vs Haiku 5.5 for scripting. Use prompt caching and the Batch API where latency allows. Test quality before switching.
- **Infra:** Vercel Hobby vs Pro, Supabase free vs Pro, Cloudflare R2 for media egress, Resend free tier.

Findings log (append, newest first): _none yet_

## 6. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recently closed PRs (list them via the GitHub tools; an item with an open `ceo-finance/*` PR is in review, not available), then run the two reports.
- **Autonomy: PR-gated.** Opens PRs from `ceo-finance/<slug>` branches. Never merges, never touches live secrets, never changes live Stripe, never applies a migration or changes data (owner applies migrations; read-only DB checks are fine).
- **Pricing rule:** it may _propose_ price, plan or credit changes with numbers, and may implement them only when they keep the margin gate green and the owner has said yes in this file or a PR comment. Never lower a customer price on its own.
- **Provider rule:** a new provider needs (1) a verified price with source and date, (2) a measured smoke run or an explicit "unmeasured" label, (3) an adapter behind the registry, off by default (env flag), so nothing live changes until the owner flips it.
- **Files it may change:** `FinancePlan.md`, `scripts/finance-report.mts`, `src/features/finance/**`, `src/config/models.ts` and `plans.ts` (only per the rules above), `src/features/providers/**`, `tests/**`, and the finance lines of `TheMasterPlan.md`. It leaves UI files to the Design CEO.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `margin-report.mts` still passes.
- **Notify the owner (PushNotification) only when:** the margin gate fails; contribution is negative or coverage < 1; wasted spend > 10% of API spend; a provider is >30% cheaper at equal quality; a PR needs their decision; or the routine could not run (no repo, no DB, no network). Otherwise stay silent and just update the file.
- **Output:** a digest: numbers vs last run, the one change made or proposed and its expected monthly cash effect, what waits on the owner, the next item.

## 7. Access and tooling

What the routine has: this repo (GitHub MCP, scoped to `tudorfnsn/shortcraft`), Supabase connector (read-only SQL), Vercel connector (billing charges, usage, runtime logs), web search / fetch for vendor pricing.

What would help, in order (owner to enable):

1. **Stripe connector, authorised** (claude.ai connector settings). Gives real MRR, churn, refunds, fees, and Sigma queries. It is currently unauthorised. Prefer a **restricted read-only key** and the account in use.
2. **Supabase connector reachable from cloud sessions.** It failed to connect on 2026-10-17 (proxy tunnel error), so the DB report could not run. Alternative: add `SUPABASE_URL` + a read-only role to the routine's environment.
3. **Vendor invoices / usage:** fal.ai, ElevenLabs and Anthropic usage dashboards (or their usage APIs with read-only keys) so recorded cost can be reconciled with real bills (F2).
4. **Fill `src/config/fixed-costs.ts`.**
5. **Optional:** PostHog or Plausible (funnel to paid), Sentry connector (failure waste), Vercel Analytics, Cloudflare (R2/egress).

## 8. Changelog (newest first)

- **2026-10-17** — Finance track started: this plan, the routine prompt (`docs/routines/finance-cfo.md`), the read-only finance report (F0) with 5 tests, and `src/config/fixed-costs.ts` (owner to fill). No migration, no dependency, no runtime change. (Finance CFO, interactive)
