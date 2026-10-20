# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`, which
> wins on product and priority; this file wins on cost, pricing and cash. Every
> finance PR updates §6 (changelog) and, when a number changes, §3.
>
> Last updated: 2026-10-20 (track created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question   | Owner's answer                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal       | **Maximum profit, cash return first.** Raise MRR and gross margin; cut every avoidable cost.                                                                                                           |
| Always     | Check the MRR ratio each run; propose or implement changes that monetise the app better.                                                                                                               |
| Scope      | Revenue (plans, top-ups, upsells, annual, churn, dunning), COGS (video/image/voice/LLM/render per video), fixed costs (Vercel, Supabase, Sentry, Resend, ElevenLabs plan, domains), payment fees, tax. |
| Fresh tech | Actively scout cheaper and better providers and techniques than fal.ai (see §5), and prove them on real calls before any swap.                                                                         |
| Autonomy   | **PR-gated**, like the CEO routines: branches `cfo/<slug>`, never merge, never touch live secrets, no live-mode Stripe writes, no spending money. Read-only on connectors.                             |
| Cadence    | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the 06:00 CEO). Weekly deep audit on Mondays (full provider reconciliation + price scouting).                                       |
| Silence    | Notify only when something needs the owner (§7). A healthy, unchanged day sends nothing.                                                                                                               |

Hard rules the CFO must not break: the **margin gate** (`npx tsx scripts/margin-report.mts`) must still pass (≥3x on every plan, fail-closed); credit prices change only with an owner OK; a provider swap needs measured quality + cost on real calls first; nothing that weakens moderation, the AI label or EU consumer terms.

---

## 2. How to measure (run these first, every time)

| What                                          | Command / source                                                                                                        | Notes                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| MRR, ARR, ARPU, cost per video, waste, margin | `npx tsx scripts/finance-report.mts` (`--json`, `--days=30`)                                                            | Read-only. Math in `src/features/finance/unit-economics.ts` (tested).                    |
| Margin gate (worst case per plan)             | `npx tsx scripts/margin-report.mts`                                                                                     | Exit 1 = fail. Plan/top-up multiples vs API cost.                                        |
| North star (paying-retained creators)         | `npx tsx scripts/metrics-report.mts`                                                                                    | Revenue only matters if creators come back.                                              |
| Real revenue, fees, refunds, churn            | Stripe connector (**test mode only today**); once live: balance transactions, subscriptions, disputes                   | Reconcile against `subscriptions` rows.                                                  |
| Real provider spend                           | fal.ai usage/billing, Anthropic Console usage + cost, ElevenLabs usage, Vercel `list_billing_charges`, Supabase billing | **Reported `api_cost_usd` is the catalog assumption, not the invoice.** Compare monthly. |
| Tokens (LLM)                                  | Anthropic usage by key/workspace (input, output, cached) vs `script-default` assumption (~2k in / 1.5k out, $0.04)      | Per-script real cost = (in×$2 + out×$10)/1M for Sonnet 5.5.                              |
| Fixed costs                                   | Vercel billing, Supabase plan, ElevenLabs plan, Resend, Sentry, domain                                                  | Listed in §3 as they become known.                                                       |

**MRR ratio** (checked every run) = the set below, trended against the last report in §3:

- **MRR** (list, EUR) and **net MRR** (after VAT + Stripe fees, USD)
- **Gross margin** = (net MRR − API cost, monthly) / net MRR
- **Cost per finished video** by tier, **credits per $ of cost** (needs ≥ 12,000/3 = the gate's floor)
- **Waste** = API cost of failed/cancelled jobs (target < 3% of spend)
- **Trial burn** per signup vs **trial → paid** conversion (CAC proxy)
- **Revenue concentration**: share of MRR from top-ups vs subscriptions; churn and failed-payment recovery once live

---

## 3. Current numbers (CFO refreshes this table every run)

| Metric                 | Value                                       | As of      | Source                       |
| ---------------------- | ------------------------------------------- | ---------- | ---------------------------- |
| MRR (list)             | _not measured_                              | —          | `finance-report.mts`         |
| Paying subscribers     | _not measured_                              | —          | `finance-report.mts`         |
| Gross margin (monthly) | _not measured_                              | —          | `finance-report.mts`         |
| Standard 15s API cost  | ~$0.07 (assumed)                            | 2026-10-05 | TheMasterPlan §7             |
| Premium 15s API cost   | ~$1.10 (Kling list, assumed)                | 2026-10-08 | TheMasterPlan §7             |
| Margin gate            | PASS (Pro 3.00x, Ultra 3.23x, Starter 9.4x) | 2026-10-13 | `margin-report.mts`          |
| Fixed monthly costs    | _unknown_                                   | —          | needs owner / billing access |

The app is in Stripe **test mode** until go-live, so MRR is expected to read 0 until then. Until real revenue exists the CFO's main job is cost-side: measure real cost per video, shrink it, and prepare monetisation levers so launch day is profitable.

---

## 4. Access the CFO needs (owner checklist)

| Need                                           | Why                                                                                          | Status                                                             | Owner action                                                                                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft`             | PRs, plan edits                                                                              | ✅ in scope                                                        | —                                                                                                                                                                                                                                     |
| Supabase connector                             | `subscriptions`, `render_jobs`, `credit_transactions` read-only SQL                          | ⚠ failed to connect in the 2026-10-20 session (`ERR_PROXY_TUNNEL`) | Re-authorise at claude.ai connectors; confirm the routine's environment allows `mcp.supabase.com`. Fallback: read-only DB URL secret (below).                                                                                         |
| Stripe connector                               | Revenue, fees, refunds, churn, Sigma                                                         | ⚠ needs OAuth                                                      | Authorise Stripe in claude.ai connector settings (test now, restricted read-only live key later).                                                                                                                                     |
| Vercel connector                               | `list_billing_charges`, usage, function cost                                                 | ✅ connected                                                       | —                                                                                                                                                                                                                                     |
| Provider usage (fal.ai, Anthropic, ElevenLabs) | Reconcile billed vs reported cost                                                            | ❌ none                                                            | Add **read-only/usage** keys as routine environment secrets: `FAL_ADMIN_KEY` (usage API), `ANTHROPIC_ADMIN_KEY` (Admin API cost/usage report), `ELEVENLABS_API_KEY` (usage). Or paste monthly invoices into `docs/finance/invoices/`. |
| Read-only DB path for scripts                  | `finance-report.mts` needs `SUPABASE_SERVICE_ROLE_KEY`; prefer a **read-only Postgres role** | ❌                                                                 | Create a `cfo_readonly` role (select on the 4 tables) and expose its URL/key to the routine environment only.                                                                                                                         |
| Fixed-cost list                                | Fixed-cost line in §3                                                                        | ❌                                                                 | Fill the table in §3 once, or grant billing views.                                                                                                                                                                                    |
| Outbound network allowlist                     | Price pages (fal.ai, Replicate, Runware, Kling, ElevenLabs, Anthropic)                       | ⚠ earlier routine could not reach provider pages                   | Set the routine environment's network policy to allow the providers' domains, or "full".                                                                                                                                              |

**Suggested connectors / tools / add-ons** (ranked by cash impact):

1. **Stripe** (restricted live read key + Sigma) — the revenue truth; unlocks churn, failed-payment, refund and LTV analysis.
2. **Provider usage APIs** — fal.ai usage, Anthropic Admin API cost report, ElevenLabs usage — turns assumed COGS into measured COGS.
3. **Supabase read-only role** — same data without the service role.
4. **Vercel** (connected) — function/bandwidth cost; use `list_billing_charges` monthly.
5. **PostHog or Plausible** (later) — funnel from pricing page to checkout; needed for price tests.
6. **Sentry** (connector) — failure rate drives waste; cheap to add.
7. **Claude skills:** `xlsx` for a monthly P&L workbook, `dataviz` for the weekly chart, `deep-research` for the Monday provider scout, `claude-api` for token/caching/batch pricing questions.
8. **Resend / email** — dunning and win-back flows already partly built (lifecycle email); the CFO tunes them for revenue.

---

## 5. Opportunity backlog (hypotheses to prove, ranked; CFO owns the order)

Every item states the lever, the expected size and what to measure. None is adopted until measured (see Hard rules).

### 5.1 Cut COGS

1. **Premium video via a cheaper path than fal.ai's Kling.** Candidates to price on real calls: Kling direct API, Wan 2.x / LTX-Video / Hunyuan on a cheaper host (Runware, WaveSpeed, Replicate, Novita, Together) or self-hosted on serverless GPU (Modal, RunPod). Compare $/5s clip, latency, failure rate and visual quality on the same 10 prompts. Biggest single COGS line (~$1.10 per 15s premium).
2. **Hero-shot premium** — AI clip only on scene 1, stills elsewhere (~$0.45 per 15s). Cheapest way to keep a "AI video" selling point (already modelled in TheMasterPlan §7).
3. **Images:** FLUX schnell is already ~$0.003. Check Runware / Together / self-host for lower; cache and reuse across re-voice (done) and series.
4. **Script LLM:** try Haiku 5.5 for script drafts with Sonnet 5.5 only on retry; add prompt caching for the fixed system prompt; Batch API (-50%) for non-interactive jobs. Measure tokens per script first.
5. **Voice:** ElevenLabs Flash is ~$0.00075/s; test Cartesia / Deepgram Aura / OpenAI TTS / open Kokoro for the Standard tier and keep ElevenLabs for designed voices.
6. **Waste:** failed or cancelled jobs after paid steps; retry budget; fail before spending (moderation already does). Target < 3% of spend.
7. **Fixed costs:** right-size Supabase/Vercel/ElevenLabs plans to usage; pg_cron every-minute sweep vs Vercel function minutes.

### 5.2 Raise revenue

1. **Annual plans** (2 months free): cash up front, lower churn. Needs Stripe yearly prices (`stripePriceIdYearly` exists in `plans.ts`).
2. **Top-up and upgrade nudges at the moment of need** (cost meter shows "can't afford"): one-click top-up in Create; "Upgrade for AI video".
3. **Premium as the upsell**, priced from measured cost (gate allows lowering price once Kling cost is measured).
4. **Dunning and win-back:** Stripe Smart Retries, card-expiry emails, cancel-flow offer (pause, downgrade) instead of a hard cancel.
5. **Trial → paid:** tune trial burn (~$0.14) vs conversion; consider a card-up-front trial only if burn × abuse > gain.
6. **Credit expiry/rollover policy** (breakage): decide with the owner; EU terms apply.
7. **Affiliate payout** (30% recurring, §6.4 of the master plan) priced so contribution margin stays > 0.
8. **Price tests** (Starter €14.99 / Pro €29.99 / Ultra €79.99): only after traffic exists; test on new cohorts.

### 5.3 Protect margin

- Margin gate on every pricing or model change; keep "fail-closed".
- Per-user abuse caps (trial farming, chargebacks), Stripe Radar rules.
- Alert if reported cost per video drifts > 20% from the catalog, or credits/$ falls below the gate floor.

---

## 6. Changelog (append newest on top; every change lands a line here)

- **2026-10-20** — Finance track created (owner request): this plan, the Finance CFO routine prompt (`docs/routines/finance-cfo.md`, DM master agent that fans out to analyst/auditor/scout/strategist/implementer/reviewer subagents), and a read-only finance report (`scripts/finance-report.mts` + `features/finance/unit-economics.ts`: MRR/ARR/ARPU, net MRR, cost per finished video by tier, waste, monthly gross margin; +3 tests). No migration, no dependency, no runtime change. The cloud routine itself must be created by the owner (§8). (CFO, interactive)

---

## 7. When the CFO notifies the owner

Send a notification (and only then) when: the margin gate fails or is within 5% of failing; reported cost per video rose > 20%; gross margin < 60% with real revenue; waste > 5% of spend; a payment problem (failed-payment spike, dispute, refund spike); a provider swap candidate saves > 25% of COGS and is ready for approval; or the routine could not run (a connector or secret is missing). A "nothing changed" run is silent.

---

## 8. Setting up the routine (owner, once)

1. claude.ai/code/routines → **New routine** → name "Shortcraft Finance CFO", repo `TudorFnsn/Shortcraft`, model Opus 5.5, daily 07:00 UTC.
2. Paste the prompt from `docs/routines/finance-cfo.md` (between the markers).
3. Environment: network policy allowing the provider domains; secrets from §4; connectors Supabase, Stripe, Vercel, GitHub.
4. Add the routine's trigger id to `TheMasterPlan.md` §9 (ops runbook) next to the CEO routines.
