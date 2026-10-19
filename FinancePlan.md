# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (a master agent that splits work across the finance sub-agents in
> `.claude/agents/finance-*.md`). `TheMasterPlan.md` stays the product source of
> truth; this file holds revenue, cost, vendor and pricing decisions.
>
> Last updated: 2026-10-19 (created)

---

## 1. Charter

**Goal:** maximise cash return. In order: (1) never sell a video below cost,
(2) cut cost per finished video without hurting quality users notice,
(3) grow MRR and the share of it that survives (retention, annual plans, upsell),
(4) keep fixed costs flat until MRR pays for them.

**What "better" means, measured weekly** (`npx tsx scripts/finance-report.mts`):

| KPI                        | Definition                                              | Direction                     |
| -------------------------- | ------------------------------------------------------- | ----------------------------- |
| MRR (gross / net)          | live subscriptions × list price; net = after VAT + fees | up                            |
| API share of net MRR       | API spend per 30d ÷ net MRR                             | down (target <35%)            |
| Cost per finished video    | `api_cost_usd` per `done` job, by tier                  | down                          |
| Cost per 1k credits burned | API cost ÷ credits burned × 1000, by tier               | down, and stable across tiers |
| Failed-job spend           | `api_cost_usd` on `failed` jobs                         | → 0                           |
| Monthly contribution       | net MRR − API(30d) − fixed costs                        | up, then > 0                  |
| Break-even subscribers     | fixed costs ÷ (net MRR − API) per subscriber            | down                          |
| Trial burn / signup        | margin gate `trialCostUsd`                              | down                          |
| Trial → paid, paid churn   | from `metrics-report.mts`                               | up / down                     |

**Guardrails (never traded away):** the margin gate (`npm run` → `scripts/margin-report.mts`)
must stay PASS at ≥3x worst case; no live provider is enabled while it fails;
moderation stays on; prices shown to customers change only with owner approval.

## 2. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` §5–§9, this file, `git log -20`, open and recent PRs
  (check the `finance/*` and `ceo/*` branches, an item with an open PR is in review, not
  available), then run the three reports (below).
- **Master agent splits the work.** The CFO does not research or code everything itself. It runs
  the reports, picks the 1–3 highest-cash items, and delegates in parallel to the sub-agents
  in `.claude/agents/`: `finance-cost-auditor`, `finance-vendor-scout`, `finance-pricing-analyst`,
  `finance-growth-analyst`. Each returns a short evidence-backed brief; the CFO decides.
- **One shippable change per run, PR-gated.** Branch `finance/<slug>`, one PR. Never merge,
  never touch live secrets, never change a Stripe price/product in the live account, never switch
  a production provider. Anything that moves customer prices or a live vendor is a **proposal in
  §6 awaiting Tudor**, with the numbers and a rollback.
- **Files it may change:** `FinancePlan.md`, `src/config/models.ts` (cost numbers only, with
  evidence), `src/features/finance/**`, `src/features/providers/**` (new adapters behind the
  registry, mock-first, off by default), `scripts/finance-*.mts`, `tests/finance/**`,
  `docs/finance/**`, the finance lines of `TheMasterPlan.md`. Not UI files (Design CEO's).
- **Evidence standard:** every vendor price carries its source URL and date. A price from a
  search snippet is `unverified` until a real call measures it (see §5 measurement protocol).
  Prices go stale in weeks; re-check anything older than 30 days before acting on it.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build`
  pass in mock mode. The margin gate passes.
- **Notify only when it matters** (PushNotification): a KPI crosses a threshold (§3), the margin
  gate fails, a vendor price drops enough to beat the current one by >25%, a PR is ready for
  Tudor's decision, or the routine could not read its data. A quiet "all fine" week sends nothing.
- **Output:** a digest — KPIs vs last week, the decision made, PR link, what waits on Tudor,
  next item.

## 3. Alert thresholds

| Condition                                            | Action                             |
| ---------------------------------------------------- | ---------------------------------- |
| Margin gate FAIL                                     | notify now, block live providers   |
| API share of net MRR > 50%                           | notify, top priority is cost       |
| Failed-job spend > 5% of API spend                   | notify, fix the failing step first |
| Any tier's cost per 1k credits > 1/3 of credit price | notify, repricing proposal         |
| Net MRR down 2 weeks running                         | notify, retention/pricing analysis |
| Report cannot read the DB or Stripe                  | notify, access problem             |

## 4. Data and access the routine needs

| Need                                                                | Why                                                | Status                                                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft`                                  | read code, open PRs                                | granted (session scope)                                                                                                               |
| Supabase read path (`.env.local` service role, or the Supabase MCP) | `render_jobs.api_cost_usd`, credits, subscriptions | **blocked in the cloud sandbox**: Supabase MCP failed to connect (proxy tunnel) on 2026-10-19; no service-role key in the routine env |
| Stripe (read-only)                                                  | real MRR, churn, refunds, fees, payouts            | **needs OAuth**: Stripe connector needs authorizing in claude.ai connector settings                                                   |
| Vercel (usage/billing)                                              | hosting cost, function GB-hours, bandwidth         | MCP available (`list_billing_charges`, `list_contract_commitments`); confirm team scope                                               |
| fal.ai usage/billing                                                | actual video/image spend per model                 | no connector; export CSV or add `FAL_ADMIN_KEY` (read-only) to the routine env                                                        |
| Anthropic Console usage                                             | script-writer token spend                          | no connector; add an Admin API key with usage-report access                                                                           |
| ElevenLabs usage                                                    | voice spend and plan                               | read-only API key or monthly export                                                                                                   |
| Fixed costs (domain, tools, Supabase plan)                          | needed for break-even                              | **Tudor to supply** → `FIXED_MONTHLY_COST_USD` and a table in §7                                                                      |

Until the DB path exists the routine works from the code (catalog costs, margin gate) and from
what Tudor pastes in §7; it must label those numbers `modelled`, not `measured`.

## 5. Strategy backlog (highest cash first)

Status: `[ ]` open · `[~]` in review · `[x]` shipped · `[?]` needs Tudor.

**A. Measure first (nothing below is trustworthy without it)**

- [~] A1. `finance-report.mts` + pure `unit-economics.ts` (this PR): MRR, API share, cost/video and cost/1k credits per tier, failed spend, contribution, break-even.
- [ ] A2. Per-step cost ledger: `render_jobs.api_cost_usd` is one number per job. Add a `job_costs(job_id, step, provider_id, units, cost_usd)` table so cost can be split by vendor/model (migration; owner applies). Needed to know whether fal, Anthropic or ElevenLabs is the real spend.
- [ ] A3. Token accounting: log Anthropic input/output/cache tokens per script call into `job_costs`. This answers "how many tokens vs how much spent" per video.
- [ ] A4. Reconcile: monthly, compare our `api_cost_usd` sum to the vendor invoices (fal, Anthropic, ElevenLabs). Gap > 10% means the catalog prices are wrong; fix `models.ts`.
- [?] A5. Stripe connector authorised → real MRR, churn, refund rate, Stripe fee %.

**B. Cut cost per video** (premium AI video is the only large line; Standard is already ~$0.07)

- [ ] B1. fal.ai video alternatives, benchmark on identical prompts, 5s 720p image-to-video. Candidates to verify (prices are **unverified recollection**, re-check): Wan 2.2/2.5 and LTX-Video via fal itself (often a fraction of Kling), Runware, WaveSpeed, Replicate, Novita, Together; open weights (Wan, LTX, Hunyuan) self-hosted on Modal/RunPod serverless GPUs with per-second billing. Rule: quality blind-test against Kling 2.5 Turbo on 10 prompts; adopt if ≥ parity and ≥25% cheaper.
- [ ] B2. Clip-length discipline: Kling bills fixed 5s clips. Plan scenes so every AI clip uses its full 5s, or use a model with per-second billing for short scenes. Check wasted billed seconds in the cost ledger (A2).
- [ ] B3. Hybrid premium: AI-animate only the hook scenes (first 3–6s) and use Ken Burns for the rest. Likely 50–70% off premium cost with little perceived loss. Ship behind a flag, A/B on retention.
- [ ] B4. Script writer: Sonnet-class at ~$0.04/video is small, but cut it: prompt caching for the fixed system prompt, a Haiku-class model for the first draft with a Sonnet pass only when a quality check fails, Batch API for non-interactive series jobs (50% off). Verify current rates in the `claude-api` skill before changing.
- [ ] B5. Images: FLUX schnell at $0.003 is near floor; check cheaper hosts only if image spend > 15% of API cost. Reuse/cache images for repeated themes.
- [ ] B6. Voice: ElevenLabs Flash vs cheaper TTS (Cartesia, Deepgram Aura, OpenAI TTS, self-hosted Kokoro/F5) with a blind test; keep ElevenLabs for Voice Studio custom voices. Volume plan or annual plan if usage justifies it.
- [ ] B7. Retry and failure policy: failed jobs still cost money. Stop paid steps after the first non-retryable failure, reuse completed scene assets on retry, and cap retries.
- [ ] B8. Render on Vercel: measure wall time and GB-s of a 60s render; compare to a container job only if Vercel compute exceeds ~$0.03/video.

**C. Grow and keep revenue**

- [ ] C1. Annual plans (≈2 months free): cash up front, lower churn, lower Stripe fee share. Stripe price objects exist (`stripePriceIdYearly` is already in the plan type); needs owner approval to create live prices.
- [ ] C2. Trial economics: trial burn is ~$0.25/signup. Test a smaller trial or a watermarked/lower-res trial render if trial → paid is below ~5%; test a card-on-file trial if signup volume is healthy.
- [ ] C3. Credit economics: breakage (unused credits at period end) is margin. Decide rollover policy on data: no rollover on subscription credits, top-up credits never expire (already the Stripe copy; confirm in code).
- [ ] C4. Upsell triggers: out-of-credits paywall shows the cheapest next step (top-up vs plan upgrade) by value per euro; Starter users hitting the 30s cap see Pro.
- [ ] C5. Premium pricing reality check: 1,420 credits/s is a 3x floor, not a market price. Compare to competitors' price per AI-video minute; if the market bears more, raise the premium credit rate (proposal only).
- [ ] C6. Dunning and win-back: Stripe Smart Retries on, failed-payment email, cancel-flow offer (pause 1 month or 30% off 2 months). Involuntary churn is often 20–40% of churn.
- [ ] C7. Other revenue: API/white-label for agencies, template packs, an affiliate programme (pay 20–30% recurring for 3 months; only pays on conversion).
- [ ] C8. Stripe fees: check Stripe Tax vs Paddle/Lemon Squeezy (merchant of record) once EU VAT admin cost is known; MoR costs more per sale but removes VAT filing.

**D. Fixed costs**

- [ ] D1. Inventory all recurring costs (Vercel plan, Supabase plan, domain, email sender, Claude plan, tools) into §7. Cut idle ones. Stay on Hobby/Free tiers until MRR covers the next tier; know the limit that forces the upgrade.
- [ ] D2. Vercel function cost: cron every minute is on Supabase `pg_cron` (migration 0007); keep Vercel crons daily to stay inside the free plan.

## 6. Proposals awaiting Tudor

_None yet. The routine appends here: proposal, expected € per month, evidence, risk, rollback._

## 7. Money ledger (owner-supplied or measured)

| Item                 | Monthly cost | Source / date | Measured? |
| -------------------- | ------------ | ------------- | --------- |
| Vercel               | ?            |               |           |
| Supabase             | ?            |               |           |
| Domain / email       | ?            |               |           |
| fal.ai (actual)      | ?            |               |           |
| Anthropic (actual)   | ?            |               |           |
| ElevenLabs (actual)  | ?            |               |           |
| Stripe fees (actual) | ?            |               |           |

## 8. Tools and connectors that would help

- **Stripe connector** (listed in this project, needs OAuth): MRR, churn, refunds, payouts. Highest value.
- **Supabase MCP**: configured in `.mcp.json` but failed from the cloud sandbox (proxy tunnel). Either allow `mcp.supabase.com` in the environment's network policy, or add a read-only Postgres role and a `FINANCE_DATABASE_URL`/service key to the routine's env so `finance-report.mts` can run.
- **Vercel MCP**: connected; billing/usage tools available.
- **Environment network policy**: allow-list vendor pricing pages and APIs (`fal.ai`, `replicate.com`, `runware.ai`, `wavespeed.ai`, `docs.anthropic.com`, `elevenlabs.io`, `stripe.com`) so the scout can verify prices; the earlier price research was blocked for this reason (TheMasterPlan §7).
- **Read-only usage keys** for fal, Anthropic (Admin API), ElevenLabs.
- **Optional:** a Google Sheets/Drive connector if Tudor keeps invoices there; a PostHog or Plausible connector for visitor → signup → paid funnel; Slack for the weekly digest.
- **Claude tools worth using:** `claude-api` skill (current model ids, prices, caching, batch), `WebSearch` in extended mode for vendor price checks, the `dataviz` and Artifact tools for a weekly finance dashboard artifact (private by default).

## 9. Decisions log

_Append newest first. Format: date — decision → why._

## 10. Changelog

- **2026-10-19** — Finance track created: this plan, the CFO routine prompt (`docs/routines/finance-cfo.md`), four sub-agents, `scripts/finance-report.mts` and `features/finance/unit-economics.ts` with tests. No live behaviour changed. (setup)
