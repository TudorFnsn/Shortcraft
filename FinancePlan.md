# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> Product, pricing-policy and priority calls still live in `TheMasterPlan.md`
> (§7 Monetization, §8 Risks). This file holds the cost ledger, the numbers the
> routine steers by, the vendor watchlist, the sub-agent roster and the run rules.
>
> Last updated: 2026-10-20

---

## 1. Charter

**Goal:** maximise cash returned per euro spent. In order:

1. Keep every product at or above the **3x margin gate** on real, measured costs.
2. Raise the **MRR ratio** (net MRR ÷ API cost of the last 30 days, `scripts/finance-report.mts`).
3. Cut cost per finished video without a visible quality loss (cheaper or better providers, new techniques).
4. Raise cash collected per user (annual plans, dunning, upsell, win-back, top-ups).
5. Cut fixed and usage bills (hosting, storage, seats) to what usage needs.

**Autonomy:** PR-gated, like the other routines. The routine reads, measures, proposes and opens PRs on `ceo-finance/*` branches. It never merges, never spends money, never touches live secrets, never changes a customer-facing price, and never switches a live provider on its own.

**Cadence:** weekly cloud routine "Shortcraft Finance CFO" (suggested Monday 07:00 UTC, after the main CEO at 06:00) plus a manual run before any pricing or provider change.

---

## 2. Numbers it steers by

| Metric                                   | Source                                       | Target                      |
| ---------------------------------------- | -------------------------------------------- | --------------------------- |
| MRR, ARR, ARPU, net MRR (after VAT+fees) | `npx tsx scripts/finance-report.mts`         | up, week over week          |
| **MRR ratio** (net MRR ÷ 30d API cost)   | same                                         | ≥ 3x (the gate's own bar)   |
| API cost per finished video, by tier     | same (`byTier`)                              | down, and ≤ catalog         |
| API cost per 1,000 credits charged       | same                                         | ≤ gate's worst case         |
| Failed-job burn (refunded, pure loss)    | same (`failedCostUsd`)                       | < 3% of API cost            |
| Free/trial users' API cost               | same (`freeUserCostUsd`)                     | < 15% of API cost           |
| Margin gate per plan and top-up          | `npx tsx scripts/margin-report.mts`          | all ≥ 3x                    |
| Trial → paid, activation, north star     | `npx tsx scripts/metrics-report.mts --json`  | per TheMasterPlan §1        |
| Churned MRR, failed payments, refunds    | Stripe connector                             | down                        |
| Fixed bills vs plan limits               | Vercel / Supabase connectors, owner invoices | no unused headroom paid for |

**Known gap (tokens):** the app stores only the sum `render_jobs.api_cost_usd` per job. Script tokens are priced in `anthropic-script.ts` and then discarded, and nothing records seconds, megapixels or characters per step. So "tokens/units used vs dollars spent per video" can be computed only as a total today. **F1** below fixes this; until then the cost auditor reports the total and the catalog split, and says which is which.

---

## 3. Roadmap (top unchecked item first; one item per run)

- [ ] **F0 Baseline.** First run with Stripe authorised and a working database path: fill §4 and §5 with real numbers, record MRR, MRR ratio and cost per video in the changelog.
- [ ] **F1 Per-step cost metering.** New table `render_job_costs (job_id, step, provider_id, units, unit, cost_usd, input_tokens, output_tokens, created_at)` written by the orchestrator's `meter()`, plus a migration (owner-applied, additive, RLS on, no grants to `anon`/`authenticated`, see `tests/billing/migrations-security.test.ts`). Extend `computeFinance` with a per-step split. This is what answers "how many tokens/units per video vs what they cost".
- [ ] **F2 Read-only finance access.** Migration for a `finance_ro` Postgres role (select-only on `render_jobs`, `subscriptions`, `credit_transactions`, `profiles`) so the routine never needs the service role. Owner applies it and stores the connection in the routine's environment.
- [ ] **F3 Measure real provider cost.** Run `scripts/live-providers-smoke.mts` (owner-run, needs `FAL_KEY`) and replace researched `costUsdPerUnit` values with measured ones; re-run the margin gate.
- [ ] **F4 Premium video provider swap.** Vendor scout's best candidate vs `fal:video` (Kling 2.5 Turbo Pro, catalog $0.12/s): new adapter behind the same `fal:video`-style port, A/B on 20 scenes for cost and quality, then a catalog row. Hero-shot-only variant priced separately.
- [ ] **F5 Script cost.** Prompt caching, a Haiku-class draft with Sonnet only on retry, token budget per script. Script is $0.04 of a ~$0.07 Standard video, so it is more than half of Standard's API cost.
- [ ] **F6 Storage retention.** Delete intermediate images/clips N days after the final render; keep finals; lifecycle rule on the `media` bucket. Needs the infra auditor's size numbers first.
- [ ] **F7 Annual plans.** Stripe annual prices (the catalog already has `stripePriceIdYearly`), checkout toggle, margin gate on the annual net. OWNER DECISION on the discount.
- [ ] **F8 Dunning + win-back.** Failed-payment emails and a lapsed-subscriber win-back through the existing Resend lifecycle emails.
- [ ] **F9 Finance dashboard.** A private Dashboard artifact fed by `finance-report.mts --json`, so the owner sees MRR, ratio and cost per video without opening a terminal.
- [ ] **F10 Trial economics.** Trial burn is $0.14–0.25 per signup on Standard (§7 of TheMasterPlan). Tune trial size, watermark and Premium lock against trial → paid.

Items needing the owner (price changes, provider switches, migrations, paid plans) are written up as a PR or a note, never done silently.

---

## 4. Costs ledger (what we pay; "unknown" = ask the owner)

| Service           | What it bills                                | Monthly cost | Plan / limit                                   | Source / checked      |
| ----------------- | -------------------------------------------- | ------------ | ---------------------------------------------- | --------------------- |
| fal.ai            | FLUX images, Premium AI video (Kling)        | usage        | pay-as-you-go                                  | catalog, not measured |
| Anthropic         | script (Sonnet 5.5, $2/$10 per MTok)         | usage        | API                                            | catalog, not measured |
| ElevenLabs        | voice (Flash v2.5), designed voices          | unknown      | unknown plan; custom-voice slots               | ask owner             |
| Vercel            | hosting, functions, cron, bandwidth          | unknown      | Hobby per TheMasterPlan §8 (Previews on Hobby) | ask owner             |
| Supabase          | Postgres, Auth, Storage (`media`)            | unknown      | project `iqvrovjwoavvmhaithwn`, eu-west-1      | ask owner             |
| Stripe            | 1.5% + €0.25 per charge (assumed, margin.ts) | % of revenue | account `acct_1UKkSC0LHtTQ4zpU`, test mode     | margin.ts             |
| Resend            | lifecycle email                              | unknown      | unknown                                        | ask owner             |
| Sentry            | error tracking                               | unknown      | unknown                                        | ask owner             |
| Domain / DNS      | domain                                       | unknown      | unknown                                        | ask owner             |
| Tax / accounting  | VAT (OSS), bookkeeping                       | unknown      | unknown                                        | ask owner             |
| Claude (routines) | the CEO, Design and Finance routines         | unknown      | subscription                                   | ask owner             |

---

## 5. Vendor watchlist (to verify; none of these numbers is measured)

Slots and the incumbent, from `src/config/models.ts`:

| Slot           | Incumbent                   | Catalog cost                                         | Candidates to price (scout verifies, with source + date)                                                                                                              |
| -------------- | --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image-to-video | fal.ai, Kling 2.5 Turbo Pro | $0.12 / scene-second (list ~$0.07/s, fixed 5s clips) | Replicate, Runware, WaveSpeed, Novita, Together, direct Kling / Hailuo / Seedance / Wan / LTX APIs, open-weight Wan or LTX on a GPU marketplace (RunPod, Modal, Vast) |
| Image          | fal.ai, FLUX schnell / dev  | $0.003 / $0.025 per MP                               | Runware, Replicate, Together, DeepInfra, self-hosted FLUX                                                                                                             |
| Voice          | ElevenLabs Flash v2.5       | $0.05 / 1k chars                                     | Cartesia, OpenAI TTS, Google/Azure neural, self-hosted Kokoro                                                                                                         |
| Script         | Claude Sonnet 5.5           | $0.04 / script                                       | Haiku 5.5 draft + Sonnet fallback, prompt caching, Batch API                                                                                                          |
| Render         | in-house ffmpeg on Vercel   | $0.01 / video                                        | already minimal; watch function duration and memory                                                                                                                   |

Techniques with likely upside, to test (not assume): hero-shot-only AI video (AI clip on scene 1, stills for the rest, ≈ $0.45 vs ≈ $1.10 per 15s Premium video per §7), reuse of generated clips/images across a series, lower-resolution clips upscaled in ffmpeg, batch/async endpoints, prompt caching on the script system prompt.

---

## 6. The Finance CFO routine

### 6.1 Rules

- **Read first:** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recent PRs (list them with the GitHub MCP tools; an item with an open `ceo-finance/*` PR is in review, not available), then the numbers in §2.
- **Measure before proposing.** Run `scripts/finance-report.mts --json`, `scripts/margin-report.mts`, `scripts/metrics-report.mts --json`. If a data source is unreachable (Stripe unauthorised, Supabase not connected, no `.env.local`), say so in the digest and **notify the owner**; never invent numbers or extrapolate test-mode data.
- **One item per run** from §3, plus the report. Prefer improving an open finance PR over starting a new one.
- **Files it may change:** `src/features/metrics/finance*`, `scripts/finance-*`, `tests/metrics/finance*`, `src/features/providers/live/**` and `src/features/providers/registry.ts` (new adapters, registered but not made default), `costUsdPerUnit` fields in `src/config/models.ts`, `supabase/migrations/**` (new, additive files only, never applied by the routine), this file, and the finance lines of `TheMasterPlan.md`. It leaves UI files to the Design CEO.
- **Never, without the owner's explicit OK:** change `creditsPerUnit`, plan or top-up prices, plan limits, the trial grant, `REVOICE_CREDITS_PER_USD`; switch a default provider; apply a migration; create or change a Stripe object; use live-mode keys; spend on a paid plan. Write these as "OWNER DECISION" with the recommendation and the diff.
- **Margin gate is a hard stop:** `scripts/margin-report.mts` must pass after any catalog change (it exits 1 otherwise).
- **Bar for a PR:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode.
- **Notify the owner** (PushNotification) when: the MRR ratio or any product falls below 3x; failed-job burn or free-user cost crosses its threshold; a data source is unreachable; an OWNER DECISION is waiting; a PR is opened. Stay silent when nothing changed.
- **Output:** a digest: MRR, MRR ratio and cost per video vs last week; what moved; PR links; OWNER DECISIONS; questions; next item. Append one line to the changelog below and to `TheMasterPlan.md` §10.

### 6.2 Master prompt (paste into the routine)

```
You are the Shortcraft Finance CFO, the master agent of the finance routine. You
do not do the specialist work yourself: you split it across sub-agents, check
their evidence, decide, and ship at most one PR.

1. Read TheMasterPlan.md (§7-§9), FinancePlan.md, `git log -20` and the list of
   open and recently closed PRs. If a ceo-finance/* PR is open, improve it before
   starting anything new.
2. Measure: run `npm ci`, then `npx tsx scripts/finance-report.mts --json`,
   `npx tsx scripts/margin-report.mts` and `npx tsx scripts/metrics-report.mts --json`.
   If a data source is unreachable, record that and send the owner a notification;
   never guess numbers.
3. Dispatch in ONE message, in parallel, only the sub-agents the week needs
   (subagent_type = file name in .claude/agents):
   - finance-cost-auditor    what a video really costs, per step; leaks
   - finance-vendor-scout    cheaper / better providers and techniques vs the incumbents
   - finance-pricing-analyst margin gate, plans, credits, annual, trial, top-ups
   - finance-revenue-analyst Stripe MRR, churn, failed payments, conversion experiments
   - finance-infra-auditor   Vercel / Supabase / ElevenLabs / Resend / Sentry bills
   Give each one the question, the files to read and what you already ruled out.
   Their reports are claims to verify: spot-check one number from each against
   the scripts or a source before you rely on it.
4. Rank everything by cash impact per month x confidence / effort. Pick the top
   unchecked FinancePlan §3 item that is not already in an open PR. Build it on a
   `ceo-finance/<slug>` branch, with tests, passing the bar in FinancePlan §6.1.
   Cost-only changes may ship in the PR; every price, limit, provider default or
   migration is written up as an OWNER DECISION instead.
5. Update FinancePlan.md (numbers, ledger, roadmap, changelog) and the finance
   lines of TheMasterPlan.md in the same PR.
6. Notify via PushNotification only when FinancePlan §6.1 says to. Lead with the
   single most important sentence (the MRR ratio and what changed), then the
   OWNER DECISIONS and questions. Silence if nothing changed.

Never merge, never apply a migration, never use live Stripe or live provider
keys, never change a customer-facing price.
```

### 6.3 Sub-agent roster

Defined in `.claude/agents/`: `finance-cost-auditor`, `finance-vendor-scout`, `finance-pricing-analyst`, `finance-revenue-analyst`, `finance-infra-auditor`. Each is read-only and returns evidence with sources; only the master edits files.

### 6.4 Access the routine needs

| Need                          | How                                                                                                                                          | Status (2026-10-20)                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| GitHub repo + PRs             | GitHub connector on `TudorFnsn/Shortcraft`                                                                                                   | connected                                                 |
| Stripe revenue data           | Stripe connector (OAuth, claude.ai connector settings)                                                                                       | **needs authorising**                                     |
| Supabase (jobs, subs, ledger) | Supabase connector, or `SUPABASE_SERVICE_ROLE_KEY` in the routine environment; better, the F2 `finance_ro` role                              | **failed to connect (proxy tunnel) in the setup session** |
| Vercel bills, usage, logs     | Vercel connector                                                                                                                             | connected                                                 |
| Real provider spend           | read-only usage/cost keys in the routine environment: Anthropic Admin API (cost + usage report), fal.ai usage, ElevenLabs subscription/usage | not set (owner)                                           |
| Web research (vendor prices)  | WebSearch / WebFetch in the routine; network policy must allow vendor pricing pages (TheMasterPlan §7 notes some were blocked)               | check network policy                                      |
| Dashboard for the owner       | Artifact tool (Dashboard type)                                                                                                               | available                                                 |

Suggested additions, most useful first: **Stripe** (authorise it), **Supabase** (fix the connection), an **Anthropic Admin/usage key** for exact token spend, **fal.ai** and **ElevenLabs** usage keys, **Resend** and **Sentry** connectors if they exist, a **Google Drive/Sheets** or accounting connector (Xero, QuickBooks, Qonto, Wise) for invoices and bank costs, and **PostHog** or **Plausible** for visitor → paid funnel. In Claude Code: the `Workflow` tool for fan-out when a run needs more than five workers, `Artifact` + `ArtifactData` for the finance dashboard, `WebSearch` in "extended" mode for vendor pricing.

---

## 7. Questions for the owner (answer in a PR comment or edit §4)

1. Monthly bills for ElevenLabs, Vercel, Supabase, Resend, Sentry, domain, accounting: plan names and last invoice amounts.
2. Real paying subscribers and live-mode revenue so far? (Stripe is sandbox-only today; until live, every MRR figure is test data.)
3. Is fal.ai pay-as-you-go or prepaid credits, and what was last month's spend (fal dashboard)?
4. Budget rules: monthly API-spend ceiling, minimum acceptable gross margin per plan (3x now), and how much you will pay for a better video model (quality over cost for Premium?).
5. OK to open the F1 (per-step metering) and F2 (read-only finance role) migrations as PRs for you to apply?
6. Annual plan: is a 2-months-free discount acceptable (F7)?
7. Which currency do you want reports in (EUR for revenue, USD for providers today)?

---

## 8. Changelog (append newest on top)

- **2026-10-20** — Finance track created: charter, cost ledger, vendor watchlist, five sub-agents in `.claude/agents/`, `features/metrics/finance.ts` (MRR, net MRR, 30-day API cost, MRR ratio, cost per video by tier, failed-job and free-user burn) with `scripts/finance-report.mts` (read-only) and tests. No live numbers yet: Stripe was unauthorised and the Supabase connector failed to connect in the setup session, so F0 (baseline) is the first job. (Finance CFO, setup)
