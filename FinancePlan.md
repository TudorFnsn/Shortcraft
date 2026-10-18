# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on pricing, provider cost and cash. Every finance PR updates this
> file (baseline, backlog, changelog) in the same change.
>
> Last updated: 2026-10-18 (track created; no measured data yet)

---

## 1. Charter

**Goal:** maximise cash return. Concretely: raise MRR and contribution margin per
paying creator, and cut cost per finished video, without hurting the north star
(weekly paying-retained creators, `TheMasterPlan.md` §1).

**Priority order when goals conflict:** (1) never lose money on a sale (the 3x margin
gate stays fail-closed), (2) cash in the bank this month, (3) MRR growth, (4) cost
per video, (5) everything else.

| Question | Answer |
| --- | --- |
| Autonomy | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe, Supabase, Vercel and provider dashboards. |
| Hard stops (owner only) | Live Stripe mode, price changes shown to customers, Stripe objects/coupons, DB writes/migrations, provider contracts, any secret. The routine writes the proposal and the exact diff; Tudor approves. |
| Files it may change | `src/config/models.ts`, `src/config/plans.ts`, `src/features/billing/margin.ts`, `src/features/providers/**`, `src/features/metrics/**`, `scripts/*report*`, `tests/**`, `FinancePlan.md`, and the finance lines of `TheMasterPlan.md` (§7, §9, §10). UI files belong to the Design CEO; ask via a PR note. |
| Cadence | Daily cloud routine, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Weekly deep run on Mondays (full provider re-benchmark). |
| Notification | Only when a number crosses a threshold in §6, or the routine could not run. Quiet otherwise. |

---

## 2. How the routine works: master agent + specialists

The routine session is the **master agent ("Finance CEO")**. It does not analyse
everything itself. Each run it:

1. **Preflight (master):** read `TheMasterPlan.md` §7–§10, this file, and list open + recently closed PRs (skip anything already in review, as the main CEO does). Check which data sources answer (§4). A source that fails goes into the digest as a gap, never as a guess.
2. **Fan out in parallel** (one Agent call, all workers at once), each with a narrow brief and a required JSON-ish return (numbers + source + confidence):

| Worker | Question it answers | Sources |
| --- | --- | --- |
| **Revenue analyst** | MRR, net new MRR, churn, ARPU, trial → paid, refunds/disputes, top-up share, failed-payment recovery. MRR vs last week and 4 weeks ago. | Stripe (read), `scripts/metrics-report.mts`, `subscriptions`, `credit_transactions` |
| **Unit-economics analyst** | Per finished video: API cost (`render_jobs.api_cost_usd`) vs credits charged vs net revenue per credit; cost split by step (script / image / video / voice / render); tokens (Claude in/out per script) vs dollars; failed-job waste (cost spent on jobs that were refunded); trial burn per signup. Flags every model whose measured cost differs from `costUsdPerUnit` by >20%. | Supabase (read), `scripts/finance-report.mts`, Anthropic usage console |
| **Infra cost analyst** | Hosting and fixed costs: Vercel (function duration for the ffmpeg render, bandwidth, usage charges), Supabase (plan, storage/egress of `media`), Sentry, Resend, domain, ElevenLabs plan and custom-voice slots, fal.ai spend. Cost per active creator. Storage retention: how much `media` is old and re-creatable. | Vercel connector, Supabase advisors/usage, provider invoices |
| **Provider scout** | Cheaper or better replacements for each slot (video, image, voice, script, render). Re-prices the catalog on current list prices and runs the smoke script on candidates when keys exist. Output: a ranked table with cost per second/image, quality note, licence, latency, risk, and the one-row catalog change. | Web research, provider docs, `scripts/live-providers-smoke.mts` |
| **Pricing and growth analyst** | Plan/top-up price tests, annual plan discount, credit pack design, trial size, upgrade nudges (e.g. Premium hero-shot), win-back and dunning, referral/affiliate payout cost vs LTV. Models each change in `margin.ts` before proposing it. | Revenue + unit-economics outputs, competitor pricing |
| **Implementer** | Turns the single highest-return approved-by-the-rules item into a PR: catalog/adapter change, report script, tests, doc updates. Runs `format:check`, `lint`, `typecheck`, `test`, `scripts/margin-report.mts`. | Repo |

3. **Decide (master):** rank candidate actions by **expected monthly cash impact ÷ effort ÷ risk**. Pick one for the Implementer; everything that needs the owner goes into the digest as a numbered decision with the number it moves.
4. **Record (master):** update §3 baseline, §5 backlog and the changelog; keep `TheMasterPlan.md` §7 consistent in the same PR.
5. **Report:** short digest (MRR, margin per video, biggest cost line, top 3 actions, decisions needed) as the session reply. Push notification only per §6.

Workers get read-only tools. Only the Implementer writes, and only on a `ceo-finance/*` branch.

---

## 3. Baseline (to be filled by the first measured run)

Known from the repo (2026-10-18, list prices, NOT measured):

| Item | Value | Where |
| --- | --- | --- |
| Plans (EUR/mo) | Starter 14.99 / Pro 29.99 / Ultra 79.99 | `config/plans.ts` |
| Margin gate | Pro 3.00x (zero headroom), Starter 9.4x, Ultra 3.23x | `TheMasterPlan.md` §7 |
| Standard video (animated stills) | ~$0.07 API cost per 15s | `config/models.ts` |
| Premium video | fal.ai Kling 2.5 Turbo Pro, ~$0.07 per billed second, conservative $0.12/s in the gate | `config/models.ts` |
| Script | Claude Sonnet 5.5, $0.04 per script (~2k in / 1.5k out) | `config/models.ts` |
| Voice | ElevenLabs Flash, ~$0.00075/s | `config/models.ts` |
| Render | in-house ffmpeg on Vercel, ~$0.01 bound | `config/models.ts` |

To measure (first run fills these in):

| Metric | Value | Source | Date |
| --- | --- | --- | --- |
| MRR (EUR) | _unknown_ | Stripe | |
| Paying subscribers / ARPU | _unknown_ | Supabase | |
| Net revenue per credit | _unknown_ | Stripe + ledger | |
| Measured API cost per finished video (std / premium) | _unknown_ | `render_jobs.api_cost_usd` | |
| Wasted cost on failed jobs | _unknown_ | `render_jobs` | |
| Fixed monthly cost (Vercel, Supabase, ElevenLabs, fal, Resend, Sentry) | _unknown_ | invoices | |
| Cash return = net revenue − API cost − fixed cost | _unknown_ | derived | |

**Honest gap:** `api_cost_usd` is the catalog's assumed cost metered per step, not the
provider's invoice. Until the routine can read real provider bills (fal.ai, ElevenLabs,
Anthropic usage), "measured" means "catalog price × units". The first backlog item
(F1) is reconciling the two.

---

## 4. Access the routine needs (set up once, by the owner)

The routine can only report what it can read. Status as of 2026-10-18:

| Source | Status | What to do |
| --- | --- | --- |
| GitHub repo `TudorFnsn/Shortcraft` | ✅ in scope of this session | Add the repo to the routine's sources |
| Supabase (project `iqvrovjwoavvmhaithwn`) | ⚠️ MCP failed to connect from this cloud session (`ERR_PROXY_TUNNEL`) | Retry; make sure the routine's environment allows `mcp.supabase.com`. Fallback: a read-only Postgres role + `SUPABASE_FINANCE_READ_URL` secret on the routine environment |
| Stripe | ⚠️ connector needs authorisation (and is test mode only) | Authorise in claude.ai connector settings. When live, create a **restricted read-only key** (Balance, Charges, Customers, Subscriptions, Invoices, Disputes, Payouts, Reports) rather than the full key |
| Vercel | ✅ connector present | Usage/billing tools (`list_billing_charges`, `list_contract_commitments`) cover hosting cost |
| fal.ai spend | ❌ none | Add `FAL_ADMIN_KEY` (usage API, read-only) as a routine env var, or paste the monthly invoice into the plan |
| Anthropic usage | ❌ none | Add an Admin API key (usage + cost report endpoints, read-only) as `ANTHROPIC_ADMIN_KEY` |
| ElevenLabs usage | ❌ none | Read-only key can read `/v1/user/subscription` (character usage, voice slots) |
| Sentry / Resend | ❌ none | Optional; fixed costs, paste monthly or add read-only tokens |

**Rule (unchanged from `TheMasterPlan.md` §9):** read-only checks are free; any write needs the owner's OK. Keys go in the routine environment, never in a file or a PR.

### Suggested connectors, tools and add-ons

- **Stripe connector** (authorise): MRR, churn, refunds, payouts, Sigma SQL for cohort revenue.
- **Supabase connector** (fix the proxy): exact job costs, credit ledger, advisors for storage/egress.
- **Vercel connector** (already attached): usage charges, function duration, runtime logs.
- **Sentry / PostHog connector**: failed-render cost leakage and funnel (signup → paid).
- **Google Sheets or Notion connector**: owner pastes invoices (fal, ElevenLabs, domain) in one sheet the routine reads.
- **Slack or email connector**: weekly finance digest to a channel.
- **Cost-tracking layer in the app (recommended build):** an `ai_usage` table (job, step, provider, units, tokens in/out, USD, request id) written by the orchestrator, so cost per video is exact and queryable. Candidate for the first PR (F1).
- **LLM gateway with cost analytics** (e.g. Helicone, Portkey, LiteLLM, or Vercel AI Gateway): per-call token and dollar tracking, caching, fallback between providers. Evaluate against the DIY table above.
- **Anthropic prompt caching and Batch API:** the script prompt's fixed instructions can be cached; non-urgent bulk work (lifecycle emails, theme guide generation) can use batch at a discount.
- **Skills:** `claude-api` (token/caching/model pricing questions), `supabase-postgres-best-practices` (cost table design), `dataviz` (a MRR/margin chart in the digest or an artifact dashboard).

---

## 5. Backlog (ranked by expected cash impact; the routine re-ranks every run)

| # | Item | Why | Needs owner? |
| --- | --- | --- | --- |
| F1 | **Exact cost ledger** (`ai_usage` table + orchestrator writes) and `scripts/finance-report.mts` | Today's cost is assumed, not metered; every other decision depends on it | Migration needs owner OK |
| F2 | **Re-price the Premium video slot.** fal.ai Kling is the most expensive line. Candidates to benchmark: Wan 2.5/2.6 and LTX-2 Fast on fal ($0.04/s class), Seedance, Hailuo, and direct provider APIs (Kling, MiniMax) or self-hosted open models on Replicate/Modal/RunPod serverless GPUs for volume | Premium is the only tier that can lose money; Pro sits at 3.00x | Model switch = owner OK (quality) |
| F3 | **Hero-shot Premium**: AI clip on scene 1 only, stills elsewhere (~$0.45 per 15s vs ~$1.10) | Cuts Premium cost ~60% at similar perceived quality | Pricing = owner OK |
| F4 | **Annual plans** (2 months free) and dunning/retry settings | Cash up front, lower churn | Stripe objects = owner OK |
| F5 | **Script cost:** prompt caching, shorter output schema, Haiku-class model for the scene plan, Sonnet only for the hook | Script is ~$0.04 per video; Standard video total is ~$0.07, so script is >50% of Standard cost | No |
| F6 | **Image cost:** FLUX schnell at $0.003/MP is near the floor; check Flux 2 / Qwen-Image / local batch on cheaper GPUs only if volume grows | Small now | No |
| F7 | **Voice cost:** ElevenLabs is cheap per video but has plan and slot caps; benchmark Cartesia, Deepgram Aura, OpenAI TTS, Kokoro self-hosted | Fixed plan cost may dominate at low volume | Voice quality = owner OK |
| F8 | **Storage lifecycle:** expire or archive finished videos after N days for free users; egress via CDN | Supabase storage and egress grow without bound | Policy = owner OK |
| F9 | **Failed-job waste:** make failures cheaper (fail before paid steps, cache images across retries) | Refunded jobs still cost real money | No |
| F10 | **Trial economics:** trial burn $0.25 per signup; measure trial → paid and set the trial size at the point where CAC stays below first-month margin | Acquisition efficiency | Pricing = owner OK |
| F11 | **Top-up and upgrade nudges** at low balance; credit expiry policy; unused-credit breakage (legal check) | Raises ARPU | Legal OK |
| F12 | **Affiliate payout model** (30% recurring in `TheMasterPlan.md` §6) checked against margin | Payout must fit under contribution margin | Yes |

---

## 6. Alert thresholds (the routine sends a push notification only for these)

- MRR down more than 5% week over week, or any week with net new MRR below zero.
- Measured cost per finished video up more than 20% vs the 4-week median, or any model's measured cost above its catalog `costUsdPerUnit` (the 3x gate would then fail).
- Margin gate fails on a candidate catalog or a live cost reading.
- Monthly provider spend above 40% of net revenue.
- Failed-payment rate above 5% or a dispute opened.
- A data source the routine depends on stopped answering for two consecutive runs.
- A new provider or price found that saves more than EUR 100/month (or more than 10% of API spend) at equal quality.

---

## 7. Routine prompt (paste into claude.ai/code/routines as a new daily routine)

Settings: model Opus 5.5, daily 07:00 UTC, source repo `TudorFnsn/Shortcraft`, connectors Supabase, Stripe, Vercel, GitHub, environment variables from §4, network allowing the provider and pricing pages.

```
You are the Shortcraft Finance CEO, the master agent of the finance track. Goal:
maximise cash return from the app (MRR, margin per video, lower provider and hosting
cost) without hurting the north star in TheMasterPlan.md §1.

1. Read FinancePlan.md (charter, baseline, backlog, thresholds) and TheMasterPlan.md
   §7-§10. List open and recently closed PRs; skip any item already in review.
2. Check which data sources respond (Supabase, Stripe, Vercel, provider usage keys).
   Report a failing source as a gap; never invent a number.
3. Fan out in ONE message to the workers in FinancePlan.md §2: revenue analyst,
   unit-economics analyst, infra cost analyst, provider scout, pricing/growth analyst.
   Give each a narrow brief, read-only tools, and a required return of figures with
   source and confidence. Monday runs: full provider re-benchmark.
4. Rank actions by monthly cash impact / effort / risk. Delegate the best in-rules
   item to an implementer on a ceo-finance/<slug> branch: change code, run
   format:check, lint, typecheck, test and scripts/margin-report.mts, update
   FinancePlan.md and TheMasterPlan.md, open a PR. Never merge. Never write to
   Stripe, Supabase or any provider; never touch live secrets or customer-facing
   prices without owner approval (put it in the digest as a numbered decision).
5. Update the baseline table, backlog and changelog in FinancePlan.md.
6. Reply with a digest: MRR and trend, cost per video (std / premium) vs revenue per
   video, biggest cost line, tokens vs dollars, fixed costs, top 3 actions, decisions
   needed. Send a PushNotification only if a FinancePlan.md §6 threshold was crossed
   or the routine could not run; otherwise stay quiet.
```

---

## 8. Changelog (newest on top)

- **2026-10-18** — Finance track created: charter, master/worker split, access checklist, ranked backlog, alert thresholds and routine prompt. No code or data yet; Supabase MCP failed to connect and Stripe needs authorisation, so baseline figures are list prices, not measurements. (Finance CEO, interactive setup)
