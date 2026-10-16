# FinancePlan — Shortcraft profit & cash track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on pricing, vendor cost and cash. Every finance PR updates this
> file (scorecard + changelog) in the same change.
>
> Last updated: 2026-10-16 (routine created; first baseline below)

---

## 1. Charter (owner request, 2026-10-16)

- **Goal:** maximise profit and cash return. Always watch MRR and monetise the app better.
- **Scope:** every cost line (fal.ai, Anthropic, ElevenLabs, Vercel, Supabase, Stripe fees, Resend, Sentry, domains) against every revenue line (subscriptions, top-ups, any future annual plan or affiliate).
- **Autonomy: PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`, never merge. **Never** change live prices, Stripe objects, vendor plans or secrets; those are proposals the owner approves. Read-only checks on Supabase, Vercel and (once authorised) Stripe are allowed.
- **Collision rules:** leave UI files while a `ceo-design/*` PR is open (changes to pricing page copy go through a design-aware proposal). Check open + recently closed PRs before picking work. Money numbers in `config/plans.ts` / `config/models.ts` change only on owner approval, then through the margin gate (`npx tsx scripts/margin-report.mts`, must stay ≥3x).

## 2. The routine: a master agent that splits the work

The routine's main session is the **master (CFO)**. It does not research or build itself; it measures, ranks and delegates to subagents in parallel (Agent tool), then merges their reports into one PR + one digest.

| Subagent            | Job                                                                                                                                                                | Output                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| **Metrics**         | Run `scripts/finance-report.mts` + `metrics-report.mts`; read Supabase (read-only SQL) and Stripe/Vercel connectors when available. MRR, net MRR, ARPU, churn      | scorecard numbers              |
| **Cost auditor**    | Cost per finished video by tier and by pipeline step (script / images / video / voice / render); failed-job spend; credits charged vs cost; unused-credit breakage | cost table + anomalies         |
| **Vendor scout**    | Price/quality of cheaper models and vendors per slot (see §5); fetch provider pricing pages directly, flag conflicting numbers                                     | ranked swap candidates         |
| **Pricing analyst** | Plan and top-up prices, annual plan, trial burn, credit scale, upgrade paths, margin gate; competitor prices (TrendStory, Captions, CapCut, Pictory)               | pricing proposals with numbers |
| **Growth-to-cash**  | Conversion levers that are code: paywall moments, trial → paid, win-back/dunning emails, upgrade nudges, referral/affiliate tracking                               | one buildable item             |
| **Builder**         | Implements the single highest cash-per-effort item, with tests (changes under `src/`, `tests/`, `scripts/`)                                                        | PR on `ceo-finance/<slug>`     |

Master loop: **1)** read this file, `TheMasterPlan.md` §7, open/closed PRs · **2)** run Metrics + Cost auditor first (numbers decide) · **3)** run Scout/Pricing/Growth in parallel only for the questions the numbers raise · **4)** rank by `expected € per month ÷ effort ÷ risk` · **5)** Builder ships the winner (or the routine writes a proposal when it needs the owner) · **6)** update §3 scorecard + §10 changelog · **7)** push a notification only when something needs Tudor (see §7).

## 3. Scorecard (append a row each run)

| Date       | Paying subs | MRR € | Net MRR $ | API cost all-time $ | Avg cost / std video | Avg cost / premium video | Fixed costs $/mo | Notes                                                       |
| ---------- | ----------- | ----- | --------- | ------------------- | -------------------- | ------------------------ | ---------------- | ----------------------------------------------------------- |
| 2026-10-16 | 2 (sandbox) | ~45\* | ~39\*     | 8.13 (17 jobs)      | n/a (run script)     | n/a                      | **unknown**      | 6 profiles, 44 ledger rows. \*test-mode data, not real MRR. |

Real MRR begins when Stripe goes live. Until the owner supplies fixed costs (§6) the profit line is incomplete.

## 4. Where the money goes (from the code, to be confirmed on measured data)

Standard 15s video ≈ **$0.07**: script (Claude Sonnet) **$0.04**, ~5 images $0.015, voice ~$0.011, in-house render $0.01. **The script is more than half of Standard's cost**, and Standard is what most users buy. Premium 15s ≈ $1.10–2.30, dominated by fal.ai Kling clips. Implications:

1. A cheaper script model is the biggest Standard saving (Haiku 5.5 for scripting, prompt caching of the system prompt, fewer output tokens). Test quality on `scripts/smoke.mts`, then change `ANTHROPIC_SCRIPT_MODEL` (env, no deploy).
2. fal.ai is **not** the main cost at Standard (images are $0.003 each). It matters only for Premium, where it is already near market (Kling 2.5 Turbo ≈ $0.07/s; Seedance 2.0 Fast ≈ $0.07–0.09/s; Wan ≈ $0.08/s). Swapping video vendors saves little; **hero-shot Premium** (one AI clip, stills for the rest, ≈ $0.45 per 15s) saves more.
3. Margins are healthy at Standard (~9x on Starter). The bigger profit lever is **revenue per user**: annual plans (cash up front), upgrade nudges, top-up prompts at zero credits, trial → paid, dunning emails, and breakage (unused credits).
4. Fixed costs (Vercel Pro, Supabase Pro, ElevenLabs plan, Sentry, Resend, domain) do not scale with usage; with few subscribers they, not API cost, decide profit. Break-even subscriber count = fixed costs ÷ net margin per subscriber.

## 5. Vendor watchlist (seed list; the Scout re-verifies with provider pages every run)

Search-snippet prices disagree between sources and are often vendor-written: **never switch on a snippet**; measure on a real call via the smoke scripts.

| Slot       | Now                                  | Candidates to test                                                                                                     |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Script     | Claude Sonnet 5.5 ($2/$10 per MTok)  | Claude Haiku 5.5 (same API, cheaper), prompt caching                                                                   |
| Image      | FLUX schnell on fal ($0.003/MP)      | Runware, Replicate, self-hosted; already near floor                                                                    |
| Video      | Kling 2.5 Turbo Pro on fal ($0.07/s) | Seedance 2.0 Fast (ByteDance direct / Runware), Wan via Alibaba Cloud, Hailuo 2.3 on Runware ($0.28 per fixed 6s clip) |
| Voice      | ElevenLabs Flash v2.5 ($50/1M chars) | Deepgram Aura-2 (~$30/1M), Inworld TTS (~$35/1M), Speechify, Smallest.ai; **must provide word timings** for captions   |
| Render     | in-house ffmpeg on Vercel (~$0.01)   | already cheap; watch function duration cost                                                                            |
| Payments   | Stripe (1.5% + €0.25 EU cards)       | Merchant of record (Paddle / Lemon Squeezy) removes VAT work but costs more; decide at scale                           |
| Hosting/DB | Vercel + Supabase                    | check plan tiers vs usage via connectors before paying for upgrades                                                    |

## 6. Information the routine needs (owner action list)

1. **Authorise the Stripe connector** (claude.ai → connectors) so the routine reads real MRR, churn, refunds, fees. Currently needs OAuth; until then MRR comes from the `subscriptions` table.
2. **Fixed monthly costs** (Vercel, Supabase, ElevenLabs plan, Sentry, Resend, domain, any ad spend). Put them in `docs/finance/fixed-costs.md` (create it; the routine reads it) or tell it.
3. **Real provider invoices/usage:** fal.ai, Anthropic Console and ElevenLabs usage pages are not reachable from here. Paste a monthly export, or add an env var for a **read-only usage key** in the routine's environment (Anthropic Admin API usage key, fal usage key).
4. **Token accounting gap:** `render_jobs` stores `api_cost_usd` but not tokens or per-step cost. Proposed first build (needs migration, so owner applies it): a `job_cost_events` table (job, step, provider, units, usd) written by the orchestrator. Then "tokens/seconds used vs money spent" is exact per step.
5. **Fix `.mcp.json`:** the Supabase server there failed to connect in this cloud session (proxy tunnel). The claude.ai Supabase connector works, so the routine uses that.

Suggested add-ons: Stripe connector (revenue), Vercel connector (already works: billing charges via `list_billing_charges`), PostHog (funnel + paywall conversion), Sentry (failed-job spend), a Google Sheet or Notion connector for the owner's cost sheet.

## 7. Notification policy

The routine sends a push notification only when: MRR drops week over week, margin gate fails or a measured cost breaks 3x, a vendor price rises, a new PR is ready for review, a decision is needed from Tudor, or it could not read its data. A quiet healthy run sends nothing.

## 8. Roadmap

- [x] `features/finance/unit-economics.ts` + `scripts/finance-report.mts`: MRR, net MRR, ARPU, cost per video by tier, failed-job spend, fixed-cost coverage (2026-10-16).
- [ ] Owner supplies §6 items 1–3.
- [ ] First measured scorecard row from real data; compare to the margin gate's assumed costs.
- [ ] Script cost test: Haiku 5.5 vs Sonnet 5.5 quality on the smoke script; if equal, propose the env change.
- [ ] `job_cost_events` migration + orchestrator metering (per-step cost and units).
- [ ] Annual plan proposal (price, Stripe prices, pricing page via design PR).
- [ ] Hero-shot Premium tier proposal with measured Kling cost.
- [ ] Dunning + win-back emails through the existing lifecycle email planner.
- [ ] Vendor bake-off for video and voice on real calls (only after the owner approves spend).

## 10. Changelog (newest on top)

- **2026-10-16** — Finance track created: this plan, `docs/routines/finance-cfo.md` (the routine prompt), `computeFinance` + `scripts/finance-report.mts` (+4 tests). Baseline: Supabase is readable from cloud sessions (6 profiles, 17 jobs, $8.13 API cost), Vercel connector works, Stripe needs authorising. (Finance CFO, interactive)
