# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file wins on
> cost, pricing experiments and cash. Every finance PR updates this file (backlog +
> changelog) in the same change.
>
> Last updated: 2026-10-15 (created)

---

## 1. Charter

**Goal:** maximise cash return. Grow MRR, lower cost per finished video, never let a
product fall under the margin gate (3x).

| Question         | Answer                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steering metrics | Net MRR, ARPU, gross margin %, API cost per finished video, credits metered vs credits granted, trial burn per signup, trial → paid, churn, fixed monthly costs |
| Hard floor       | `npx tsx scripts/margin-report.mts` passes (every plan and top-up ≥ 3x worst-case API cost). A change that breaks it does not ship.                             |
| Autonomy         | **PR-gated.** Branches `ceo-finance/<slug>`. Never merges, never touches live secrets, never changes a live Stripe price or turns on a paid vendor.             |
| Cadence          | Daily cloud routine **"Shortcraft Finance CFO"**, 08:00 UTC (after the main CEO at 06:00, before Design at 09:00).                                              |
| Prioritisation   | Rank every idea by `monthly € gained (or saved) × confidence ÷ effort`. Cash now beats cash later. A cost cut that keeps quality beats a price rise.            |
| Notifications    | Push the owner only for: MRR down week over week, margin gate failing, a vendor bill above its budget, a decision only the owner can make, or the run blocked.  |

---

## 2. How the routine works (master agent + sub-agents)

The CFO routine is the **master agent**. It reads this file and the data, picks the
work, **splits it across sub-agents in parallel** (one message, several `Agent`
calls), merges what they return, and ships at most one PR a day.

| Sub-agent               | Job                                                                                                                                                                                               | Reads / writes                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Metrics analyst**     | Runs `scripts/finance-report.mts --json`, `scripts/metrics-report.mts --json`, `scripts/margin-report.mts`; or reads the same via the Supabase and Stripe connectors. Reports MRR, churn, margin. | read-only                                      |
| **Vendor-cost auditor** | Pulls actual spend per vendor (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, Sentry, domain) and compares it with `costUsdPerUnit` in `config/models.ts`. Flags drift.                 | read-only                                      |
| **Model scout**         | Web research on cheaper or better models per slot (image, video, voice, script). Needs a price, a quality sample, a licence check and an API shape. Returns a ranked shortlist.                   | web only                                       |
| **Pricing strategist**  | Plans, top-ups, annual billing, trial size, credit scale, upsell and win-back. Backs each idea with numbers from the margin model.                                                                | read-only; proposes edits to `config/plans.ts` |
| **Implementer**         | Builds the one chosen change (adapter, catalog row, script, test) on a `ceo-finance/*` branch with the full quality bar.                                                                          | writes allowed files only                      |
| **Reviewer**            | Fresh agent, given the diff only: checks correctness, margin gate, secrets, that mock mode still works.                                                                                           | read-only                                      |

Run order: Metrics + Cost auditor + Model scout + Pricing strategist in parallel →
master ranks → Implementer → Reviewer → master writes the digest. Skip a sub-agent
whose input has not changed since the last run (note it in the changelog).

### Rules

- **Read first:** `TheMasterPlan.md` §5, §7, §8, §11, then this file, `git log -20`, and open + recently closed PRs (an item with an open PR is in review, not available).
- **One shipped item per run.** Prefer improving an open `ceo-finance/*` PR.
- **Files it may change:** `src/config/models.ts`, `src/config/plans.ts` (only with the owner's `[✓]` below for price changes), `src/features/providers/**`, `src/features/metrics/**`, `src/features/billing/margin.ts`, `scripts/**`, `tests/**`, `.env.example`, this file, and the money lines of `TheMasterPlan.md` (§7, §9, §10). It never touches migrations, webhooks, auth, or UI files (Design track).
- **Measured beats researched.** A new model replaces a catalog row only after a real smoke call (`scripts/live-providers-smoke.mts`) shows cost and quality, or the PR says in its first line that the price is unmeasured and ships it behind the existing fail-closed gate.
- **Price changes need `[✓]`.** Raising, lowering or restructuring a customer price is proposed with numbers (revenue, margin, churn risk) in §4; only the owner sets `[✓]`.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Output:** a digest (what moved, numbers before/after, PR links, what waits on the owner) and a push notification when §1 says so.

---

## 3. Data the routine needs (state, access, gaps)

| Source                                | Used for                                          | Status (2026-10-15)                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo                           | code, PRs                                         | In scope (`tudorfnsn/shortcraft`).                                                                                                                            |
| Supabase connector                    | subscriptions, ledger, `render_jobs.api_cost_usd` | Configured; it failed to connect from the cloud session on 2026-10-15 (`ERR_PROXY_TUNNEL`). Re-check; fall back to the owner pasting `finance-report --json`. |
| Stripe connector                      | real MRR, churn, refunds, fees, payouts           | Connected, **test mode only** until go-live.                                                                                                                  |
| Vercel connector                      | hosting bill, function usage, bandwidth           | Connected (read-only use).                                                                                                                                    |
| fal.ai / ElevenLabs / Anthropic usage | the real vendor bills                             | **Not available.** Needs the owner (see §6).                                                                                                                  |
| Ad / analytics spend                  | CAC, payback                                      | **Not available.** No PostHog or ad account yet.                                                                                                              |

`render_jobs.api_cost_usd` is only as good as the adapters' metering. The first CFO
task is to check it against the vendor invoices; if they disagree, fix the metering
before trusting any margin figure.

---

## 4. Backlog (ranked; the routine re-ranks every run)

Status: `[ ]` open · `[~]` in review · `[x]` shipped · `[✓]` owner approved a price/plan change.
Everything below is a **hypothesis**: prices come from search snippets and must be measured.

### Cost side

- [ ] **F1. Prove the numbers.** Compare `api_cost_usd` and the catalog with real invoices (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase). Output: a drift table in §7.
- [ ] **F2. Premium video: shortlist cheaper models than Kling on fal.ai.** Candidates to price and sample: LTX-2 (open weights), Wan 2.x (open weights, self-hostable), Seedance, Hailuo/MiniMax, Veo 3.1 Fast, Kling direct API. Also compare **other hosts** for the same model (Replicate, Together, Runware, Fireworks, WaveSpeed, Novita, Modal/RunPod self-host, direct vendor APIs): the same model is often 30–60% cheaper off fal.ai. Keep adapters behind the existing registry so a swap is one catalog row.
- [ ] **F3. Hero-shot premium.** AI clip on the hook scene only, stills elsewhere (~$0.45 vs ~$1.10 per 15s). Needs a pricing line and an entitlement decision.
- [ ] **F4. Image cost.** FLUX schnell at $0.003 is already cheap. Check cheaper hosts only if images exceed 5% of cost per video.
- [ ] **F5. Voice cost.** ElevenLabs is likely the largest fixed + variable line for Standard. Compare Flash vs Turbo/Multilingual per character, OpenAI/Azure/Google neural TTS, Cartesia, Deepgram Aura, Kokoro/Piper self-host for the default voice, keeping ElevenLabs for designed voices. Check the custom-voice slot cost (§8 of the master plan).
- [ ] **F6. Script cost.** Sonnet 5.5 at ~$0.04/script. Test Haiku 5.5 for the first draft with Sonnet only on failure; use prompt caching for the theme/system prompt; Batch API is not suitable (latency). Measure tokens in vs out per job and log them (see F9).
- [ ] **F7. Cache and reuse.** Cache stills and voice lines for repeated topics/themes; skip regenerating identical scene prompts; cap retries so failed jobs stop burning spend.
- [ ] **F8. Infra.** Vercel function duration/bandwidth for in-house ffmpeg render, Supabase egress and storage retention (delete renders after N days unless posted), Resend volume, Sentry quota. Right-size before they become a bill.
- [ ] **F9. Token telemetry.** Store per-job token counts and per-vendor unit counts next to `api_cost_usd` (needs an additive migration, owner-applied) so cost per video can be broken down by vendor. Until then the routine estimates from the catalog.

### Revenue side

- [ ] **R1. Trial economics.** Trial burn is $0.14 on Standard. Measure trial → paid; try a smaller or watermarked trial video, or a credit card up front, only with data.
- [ ] **R2. Annual plans** (2 months free) for cash up front and lower churn. Price IDs already exist as `stripePriceIdYearly`.
- [ ] **R3. Top-up and upgrade nudges** at the moment a creator runs low (Library and Create), and an Ultra anchor on the pricing page.
- [ ] **R4. Credit breakage and expiry.** Decide whether unused monthly credits roll over (retention) or expire (margin). Needs a legal check (EU consumer terms).
- [ ] **R5. Win-back and dunning.** Stripe smart retries + a failed-payment email; win-back email to cancelled subscribers. Lifecycle email infra exists.
- [ ] **R6. Affiliate economics.** 30% recurring (master plan §6) against net margin per plan: confirm it still clears the gate.
- [ ] **R7. New revenue lines.** Series/agent plans, done-for-you packs, premium voices, API access, team seats, template marketplace. Estimate before building.
- [ ] **R8. Regional pricing / PPP and local currencies** once traffic data shows where signups come from.

---

## 5. Metrics snapshot

Run `npx tsx scripts/finance-report.mts` (read-only; add `--days 7` or `--json`). The
routine pastes the numbers here each run.

| Date | Net MRR | Subs | Gross margin | API $/video | API spend (30d) | Notes                  |
| ---- | ------- | ---- | ------------ | ----------- | --------------- | ---------------------- |
| –    | –       | –    | –            | –           | –               | No live data read yet. |

---

## 6. What the routine needs from the owner (ask, then record the answer)

1. **Vendor usage and billing access.** Read-only API keys or monthly invoice exports for fal.ai, ElevenLabs, Anthropic (Console usage + workspace), Vercel, Supabase, Resend, Sentry, domain registrar. Put read-only keys in the routine's environment, never in the repo.
2. **Fixed monthly costs** (tools, subscriptions, domain, any contractor) so net profit is real, not only gross margin.
3. **Stripe live mode date,** and whether payouts, VAT (Stripe Tax / OSS) and refunds are set up.
4. **Targets:** monthly net MRR goal, minimum gross margin %, budget for ads, and risk appetite for price changes.
5. **Ad / analytics accounts** (Meta, TikTok, PostHog) once spending starts, for CAC and payback.
6. **Supabase connector fix** (it failed with `ERR_PROXY_TUNNEL` in the cloud session) so the routine can read live data without help.

---

## 7. Vendor drift table

| Vendor | Catalog $/unit | Invoice $/unit | Drift | Checked |
| ------ | -------------- | -------------- | ----- | ------- |
| –      | –              | –              | –     | –       |

---

## 8. Tools that would help (suggest to the owner; do not enable on your own)

- **Connectors (claude.ai):** Stripe live mode (MRR, churn, refunds, payouts), Vercel (already), Supabase (fix), PostHog or Plausible (funnel, trial → paid), Google Sheets or Notion (a shared finance sheet the owner edits), Slack or email for the digest, and an accounting connector (QuickBooks, Xero, or Wise/Revolut Business) for fixed costs and cash.
- **Usage APIs:** fal.ai usage/billing API, ElevenLabs `/v1/usage`, Anthropic Admin API usage and cost report, Vercel billing via the connector (`list_billing_charges`).
- **Observability for cost:** Helicone or Langfuse in front of the LLM calls (token and cost per job), or the app's own per-job metering (F9).
- **Claude Code add-ons:** a read-only `finance` skill that wraps `finance-report` and the margin math; a `WebSearch` budget rule for the Model scout; a scheduled weekly "vendor price check" that re-reads the vendors' public price pages.

---

## 9. Changelog (newest on top)

- **2026-10-15** — Finance track created: this plan, `docs/routines/finance-cfo.md` (routine prompt), `src/features/metrics/finance.ts` + tests (+4) and `scripts/finance-report.mts` (read-only MRR, cash, API spend, cost per video, gross margin). No migration, no dependency. (Interactive)
