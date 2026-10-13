# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on costs, pricing, providers and cash. Every finance PR updates
> this file (baseline, backlog, changelog) in the same change.
>
> Last updated: 2026-10-13 (created, interactive)

---

## 1. Charter (owner request 2026-10-13)

**Goal: maximum profit, cash first.** Every run checks MRR and the cost side, then
proposes or implements the change with the best cash return per hour of owner time.

| Question   | Answer                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope      | Revenue (MRR, ARPU, churn, conversion, pricing, packaging), cost of goods (fal.ai, ElevenLabs, Anthropic, ffmpeg compute), fixed costs (Vercel, Supabase, Resend, Sentry, domain), cash timing. |
| Autonomy   | **PR-gated.** Branches `ceo-finance/<slug>`; never merge; no live Stripe writes; no price, plan or credit-scale change goes live without the owner's explicit OK.             |
| Cadence    | Daily cloud routine **"Shortcraft Finance CEO"**, suggested 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Weekly deep run on Mondays (full report + provider scan). |
| Files owned | `src/config/models.ts`, `src/config/plans.ts` (proposals only), `src/features/providers/live/*`, `src/features/billing/margin.ts`, `src/features/finance/*`, `scripts/finance-report.mts`, this file. **Not** UI files (Design owns them) and not migrations without the owner applying them. |
| Hard limits | Never print or commit secrets. Never touch live-mode Stripe. Never lower the 3x margin gate to make a number pass. Never skip tests. Moderation and the AI label stay on whatever provider we use. |

### Priority order (when items compete)

1. **Stop a loss** (margin gate failing, a cost spike, a runaway job loop, a refund leak).
2. **Raise cash in** (conversion, trial → paid, pricing and packaging, annual plans, top-up nudges, churn saves).
3. **Cut cost of goods** (cheaper provider, fewer billed seconds, caching, smaller models) without changing what the customer sees.
4. **Cut fixed costs** (plan tiers of Vercel/Supabase/Resend/Sentry; only pay for what the volume needs).
5. **Measure better** (cost ledger, dashboards), but only when it unblocks 1–4.

---

## 2. The routine: master agent + sub-agents

The routine's session is the **master agent ("CFO")**. It does not do deep work
itself: it reads state, decides which lanes need work today, spawns sub-agents in
parallel (Agent tool, one message), reviews their outputs, then ships at most **one PR**
and one digest. Sub-agents get a narrow brief and return a short structured report;
the CFO verifies anything it will act on.

### Step 0 — Guard rails (every run, before anything else)

1. `git fetch`; read `TheMasterPlan.md` (§5, §7, §8, §9) and this file.
2. List open + recently closed PRs (GitHub connector). An item with an open PR is in
   review, not available. Never open a duplicate. If a `ceo-finance/*` PR is open,
   improve it instead of starting another.
3. Check tool access (see §4). If a data source is missing, say so in the digest and
   continue with what exists; do not invent numbers.

### Step 1 — Fan out (parallel sub-agents, pick the lanes that apply today)

| Lane | Sub-agent brief | Sources | Returns |
| ---- | --------------- | ------- | ------- |
| **A. Revenue / MRR** | Compute MRR, new / expansion / contraction / churned MRR, active subs by plan, trial → paid, ARPU, refunds and disputes, failed payments, top-up revenue, net of VAT and Stripe fees. Compare with last week's baseline in §6. | Stripe connector (API read + Sigma analytics), `scripts/metrics-report.mts` | A table + the single biggest MRR lever (and a number for it) |
| **B. Unit economics** | Cost per finished video by shape (Standard/Premium × length), cost per signup (trial burn), cost per paying user per month, gross margin by plan, failure/refund cost (money spent on jobs that were refunded), and the margin gate result. Tokens/characters/seconds consumed vs dollars spent per provider. | Supabase (`render_jobs.api_cost_usd`, `credit_transactions`, `scenes`, the cost ledger once it exists), `scripts/margin-report.mts`, provider dashboards (owner paste, see §4) | Cost table, the most expensive step, drift between catalog cost and invoiced cost |
| **C. Vendor & fixed costs** | List every recurring and metered cost: Vercel (billing charges, function duration, bandwidth, blob), Supabase plan + usage, Resend, Sentry, domain, Stripe fees. Flag anything on a paid tier the volume doesn't need, and anything about to hit a free-tier cliff (e.g. Hobby limits, Resend 100/day, Supabase 500 MB). | Vercel connector (`list_billing_charges`, `get_runtime_logs`), Supabase connector (`get_advisors`, usage), owner paste for the rest | A monthly fixed-cost table, cliffs with dates, savings with a number |
| **D. Provider scan** | Find cheaper or better models and services for each slot (see §5 watchlist). Search first-party pricing pages, changelogs and independent benchmarks; ignore aggregator snippets for anything that will drive a decision (they disagree by up to 2x). For each candidate: price per unit, quality evidence, latency, licence, safety filter, API shape, effort to integrate as an adapter. | WebSearch/WebFetch, fal.ai / Replicate / Together / Runware / provider docs | Ranked candidates with a savings estimate **per finished video**, and a proposed A/B test |
| **E. Growth & monetization ideas** | One fresh idea per run, justified by the numbers from lanes A and B: pricing/packaging (yearly plans, credit packs, an overage top-up at checkout, a hero-shot Premium tier, usage nudges), conversion, churn saves, referral/affiliate, payment-method and tax setup. Cites a competitor or a source; sizes the upside in €/month. | Web, Stripe data, §6 of the master plan | One proposal with an expected € impact and the test that would prove it |
| **F. Implementation** | Only after the CFO picks the winning item: build it on `ceo-finance/<slug>` with tests (provider adapter behind the registry, pure finance math, a script, a config change). Runs `npm run format:check`, `lint`, `typecheck`, `test`, `next build` before reporting. | Repo | A green branch |

Rules for the fan-out: lanes A–E are read-only. At most one lane-F sub-agent runs
(one PR per run). Run A–D in parallel on weekly runs; on daily runs run A + B and
only the other lanes whose trigger fired (cost spike, new model release, a
free-tier cliff within 14 days, no idea queued).

### Step 2 — Decide

The CFO ranks candidates by **€/month gained ÷ owner minutes needed**, applying the
priority order in §1. It picks one item for implementation. It writes the other
good ones into the backlog (§7) with numbers, so the next run doesn't redo the search.

### Step 3 — Ship (PR-gated)

- One PR from `ceo-finance/<slug>`. The PR body states: the number it moves (before →
  after, with the source), how it was verified, the rollback, and what the owner must
  do (env var, migration, dashboard click, an approval).
- A provider swap is **always** behind a feature flag or env var (`FAL_VIDEO_MODEL`
  style), default off, and ships with a script that runs the old and new provider on
  the same input and prints cost, latency and a path to both outputs, so quality can be
  judged by a person. Nothing is enabled for customers without the owner's OK.
- A pricing change is a **proposal in the PR with the expected effect**; the PR changes
  config only once the owner has approved it in the PR conversation. Stripe prices are
  immutable: a change means new prices + `lookup_key` handling, which the PR describes
  but does not execute against live mode.
- Update this file (baseline §6, backlog §7, changelog §9) and `TheMasterPlan.md`
  (changelog line, and §7/§9 if prices or ops changed) in the same PR.

### Step 4 — Report and notify

- Nothing needing the owner → **stay silent** (no notification).
- Notify (PushNotification, `<routine_summary>`) when: MRR fell week over week, the
  margin gate fails, a cost per video rose >20% vs baseline, an invoice or free-tier
  cliff is within 14 days, a PR needs a decision, or a data source the routine needs
  is missing or broken. Lead with the number and the ask.
- Always end the run with a short digest in the transcript: MRR, margin, the one
  thing shipped or proposed, the owner's to-do list.

---

## 3. Metrics (definitions the routine must use)

- **MRR** = sum of live subscriptions' monthly price, net of discounts, in EUR (annual plans ÷ 12). "Live" means `isLiveSubscription` in `features/billing/entitlements`. Report new / expansion / contraction / churned MRR separately; net new MRR = the sum.
- **Net revenue** = charge − VAT − Stripe fees (the margin gate's `REVENUE_ASSUMPTIONS`). Top-ups are cash but not MRR; report them separately.
- **Gross margin** = net revenue − API cost of goods − refunds paid. Target ≥ 70% blended and **≥ 3x revenue ÷ worst-case API cost on every product** (the gate).
- **Cost per finished video** = `api_cost_usd` of `done` jobs, plus the spend wasted on `failed` jobs, per finished video. This is the number to push down.
- **Trial burn** = API cost of an unpaid signup's trial credits (CAC floor).
- **Payback** = CAC ÷ (ARPU × gross margin); report once ad spend exists.
- **Catalog drift** = invoiced provider cost ÷ `api_cost_usd` for the same period. The catalog's costs are list prices times usage, not invoices; drift above 15% means the gate is lying.
- **Token / unit usage** per provider: Anthropic input/output tokens, ElevenLabs characters, fal.ai images/megapixels and billed video seconds, ffmpeg wall seconds. Report units ÷ videos and $ ÷ videos.

---

## 4. Access, data and what the routine still needs

### Available now (claude.ai connectors in the routine's environment)

| Tool | Use | State |
| ---- | --- | ----- |
| GitHub (repo `TudorFnsn/Shortcraft`) | read code, PRs, push `ceo-finance/*`, CI status | ✅ |
| Stripe ("Shortcraft sandbox", test mode) | API read, Sigma analytics, docs | ✅ test mode only. **Live account not connected: MRR will be real only after the owner adds it (read-only restricted key is enough).** |
| Supabase (ref `iqvrovjwoavvmhaithwn`) | read-only SQL, advisors, logs | ⚠️ the Supabase MCP failed to connect from the cloud session on 2026-10-13 (`ERR_PROXY_TUNNEL`); the connector in the routine's environment may work, otherwise see "Read-only DB path" below |
| Vercel | billing charges, deployments, runtime logs | ✅ |
| WebSearch / WebFetch | provider scan | ✅ (provider pricing pages were blocked from a cloud network in 2026-10-04; fall back to search snippets and label the figure "unverified") |

### Gaps — the owner needs to provide these (or approve the routine configuring them)

1. **Invoiced provider spend (biggest blind spot).** `api_cost_usd` is usage × list price. Needed, monthly: fal.ai, ElevenLabs, Anthropic invoices/usage totals. Cheapest path: ask the routine to read them from each provider's usage API with **read-only/admin-read keys** stored as routine environment variables (`FAL_ADMIN_KEY`, `ELEVENLABS_API_KEY` read scope, `ANTHROPIC_ADMIN_KEY`); until then paste the three totals into the PR conversation monthly. The 2026-10-08 request in master plan §5 is still open and is the first thing to close.
2. **Read-only DB path.** Create a Postgres role `finance_ro` (select on `profiles`, `render_jobs`, `scenes`, `credit_transactions`, `subscriptions`, plus the new cost ledger; no PII columns beyond ids) and give the routine its connection string as `FINANCE_DATABASE_URL`. This beats the service-role key: the routine can read, never write.
3. **Stripe live (read-only).** A restricted key (`rk_live_…`: Subscriptions, Invoices, Charges, Refunds, Disputes, Balance, Products/Prices: read) as `STRIPE_LIVE_READONLY_KEY`. Without it MRR is sandbox data and says so.
4. **Fixed costs.** One-time list of what is paid and when: Vercel plan, Supabase plan, domain, Resend, Sentry, any other SaaS, plus any ad spend. The routine keeps it in §6 afterwards.
5. **Business facts:** target monthly profit/MRR goal and a deadline, budget the routine may suggest for ads/experiments, entity country and VAT status (EU OSS vs Stripe Tax, which changes net revenue by up to ~20%), whether a yearly plan or a refund policy change is acceptable.
6. **Cost ledger (code, owner applies the migration).** Today only `render_jobs.api_cost_usd` is stored: no tokens, characters or seconds per step, so lane B can't say where a dollar went. First implementation item (§7 F1): a `cost_events` table (job id, step, provider, model, unit, quantity, cost USD, tokens in/out, created_at) written by the orchestrator, plus `scripts/finance-report.mts`. Needs the owner to run the migration.

### Suggested connectors, tools and add-ons (in value order)

1. **Stripe live, read-only** (above): turns every MRR number from a guess into fact.
2. **Provider usage APIs as env vars** (above): invoiced cost, tokens and units; removes catalog drift.
3. **Read-only Postgres role** (above), or the Supabase connector once it connects.
4. **Vercel connector** (already attached): `list_billing_charges` for the platform bill, `get_runtime_logs` for function duration (ffmpeg compute is our hidden cost).
5. **fal.ai / Replicate / Runware accounts** with a small prepaid balance for A/B runs (~€10–20 / month cap), so the routine's smoke scripts can produce side-by-side outputs. The owner runs them (the cloud network can't reach fal.ai).
6. **PostHog** (already planned): funnel (landing → signup → first video → checkout) for conversion work; the routine reads it via API key. Needs the cookie banner first.
7. **Sentry connector** (alerting on `alert` tags like `stripe_webhook_failed`) so revenue-affecting incidents reach the routine.
8. **Resend** analytics read key: lifecycle email effect on activation / reactivation.
9. **Claude tools:** Sigma queries through the Stripe connector for cohort retention and churn; Artifact tool for a private, shareable finance dashboard page (MRR, margin, cost per video, provider table); `/loop` or a second weekly routine for the Monday deep dive; the `dataviz` skill for charts.

---

## 5. Provider watchlist (starting hypotheses — verify before acting)

Seeded 2026-10-13 from search snippets (sources disagree by up to 2x; every number below is **unverified** until measured on our own calls). Today's catalog: Claude Sonnet 5.5 script (~$0.04), FLUX schnell/dev images, ElevenLabs Flash voice ($0.05 / 1k chars), in-house ffmpeg render, Kling 2.5 Turbo Pro at ~$0.07 per billed second for Premium AI video (the catalog carries a conservative $0.12 / s).

| Slot | Today | Candidates to test | Why it could pay |
| ---- | ----- | ------------------ | ---------------- |
| **AI video (Premium)** | fal.ai Kling 2.5 Turbo Pro ≈ $0.07/s | Kling 3.0 on fal (one source: ≈ $0.03/s), Seedance 1.5 Pro / 2.0 Fast or Mini (≈ $0.045–0.09/s), Hailuo 2.3 on Runware ($0.28 per 6s clip ≈ $0.047/s), Wan 2.5 / 3.0, LTX-2 Fast, Veo 3.1 Fast; also Runware, Replicate, Together and direct-from-vendor APIs vs fal's markup | Video is ~95% of a Premium job's cost. Halving $/s moves Pro's 3.0x gate to ~4–5x or lets us cut credit prices to win share. |
| **Premium shape** | AI clip on every scene | **Hero shot** (AI clip on the hook scene only; ≈ $0.45 vs ≈ $1.10 per 15s video), shorter clips (3s), reuse one clip with Ken Burns on the others, cache clips for repeated ideas | Largest saving with no new vendor; the pricing decision is already open in master plan §5. |
| **Images** | FLUX schnell $0.003 / MP; dev $0.025 / MP | Cheaper FLUX/Z-Image/Qwen-Image/SDXL-Turbo variants on Runware or Replicate; fewer images per video (reuse across scenes); lower resolution upscaled | Already cheap; only worth it if a provider swap is a config change. |
| **Voice** | ElevenLabs Flash $0.05 / 1k chars | Deepgram Aura-2 (≈ $0.03), Amazon Polly standard (≈ $0.004), Cartesia, OpenAI TTS (check the reported deprecation), self-hosted Kokoro (≈ $0.0007 hosted-cost estimate) | Voice is small per video (~$0.01) but quality drives retention; test only if a clearly better or cheaper voice appears. Needs word timestamps for captions (alignment fallback: forced alignment). |
| **Script** | Claude Sonnet 5.5, ~$0.04 | Haiku 5.5 for drafts + Sonnet only on retry; prompt caching of the system prompt; shorter structured output; batch API for non-urgent (queued) videos | Cuts the Anthropic line 50–80%; run an eval on 30 topics to confirm script quality parity. |
| **Render / compute** | ffmpeg on a Vercel function (≈ $0.01) | Fluid compute settings, lower CRF, skip re-encode when possible; a container job only if functions fail | Check function GB-seconds in Vercel billing before optimising anything. |
| **Platform** | Vercel Hobby, Supabase free, Resend free | Stay free as long as limits hold; the routine tracks cliffs (§2 lane C) | Don't pay for a tier before the limit is within 14 days. Note Hobby is non-commercial; Vercel Pro is required once the app earns money. Price it into the plan. |
| **Payments** | Stripe | Stripe Tax vs manual VAT, local payment methods (cards cost more for non-EU), Link; Paddle / Lemon Squeezy (merchant of record handles VAT, higher fee) | A merchant of record can beat Stripe + accountant for a solo founder; compare all-in cost at 50 and 500 subscribers. |

Non-vendor levers the routine should size every week: **yearly plans** (cash up front, lower churn), **top-up prompt at zero balance**, **trial length / watermark** tuning, **annual-prepay discount**, **credit expiry or rollover rules**, **abuse limits** (trial farming, refund loops), **affiliate payout cost vs CAC**, **price testing** (€14.99 → €19.99 Starter; Standard videos carry a ~9x margin).

---

## 6. Baseline (the routine updates this table each run; 2026-10-13 values come from the repo, not from Stripe or invoices)

| Metric | Value | Source / confidence |
| ------ | ----- | ------------------- |
| MRR | **not measured** (live Stripe not connected; sandbox has test data only) | gap 3 in §4 |
| Paying subscribers | not measured | `scripts/metrics-report.mts` once a DB path exists |
| Plans | Starter €14.99 / 30k cr · Pro €29.99 / 100k · Ultra €79.99 / 250k; top-ups 20k €12 · 60k €29 · 150k €59 | `src/config/plans.ts` |
| Margin gate | Starter 9.4x · Pro 3.00x (zero headroom) · Ultra 3.23x · top-ups 4.0–5.9x | master plan §7, list-price costs |
| Trial burn | $0.14 per unpaid signup | margin report |
| Measured cost per video | Standard 15s **$0.037**, Standard 30s **$0.049**, Premium 30s **$1.92** (catalog price, actual likely lower) | 3 live renders, 2026-10-08 |
| Charged per video | Standard 15s 1,768 cr, Standard 30s 3,096 cr, Premium 30s 42,636 cr | same |
| Catalog drift | unknown (no invoice data) | gap 1 in §4 |
| Fixed costs | unknown; assumed Vercel Hobby, Supabase free, Resend free, Sentry free, domain `shortcraft-rho.vercel.app` (no custom domain yet) | gap 4 in §4 |

**What the baseline already says (from the repo's own numbers):**

- Standard videos cost ~4 cents and cost the customer ~1.8–3.2k credits, i.e. a ~9x margin. The money is in selling more Standard output, not in squeezing its cost.
- Premium is the only expensive thing. Pro is at exactly 3.0x on a catalog cost of $0.12/s that may be 40% too high (Kling's list price is $0.07/s). Measuring Premium on invoiced cost is the single most valuable open number: it either gives Pro headroom or removes it.
- Hobby-tier hosting is for non-commercial use; the moment real money flows the platform line moves from €0 to Vercel Pro (≈ $20/mo per seat). That is the first fixed cost the model must cover (~2 Starter subscribers).
- Nothing records tokens or units per step, so the first build item is the cost ledger (§7 F1).

---

## 7. Backlog (ranked; the routine edits this list)

- [ ] **F0 Owner: grant access** (§4 gaps 1–5). Until then lanes A–C run on the sandbox and repo data and label it so.
- [ ] **F1 Cost ledger + finance report.** Migration `cost_events` (job_id, step, provider, model, unit, quantity, cost_usd, tokens_in, tokens_out, created_at; RLS on, no policies, service role only), written by the orchestrator at each step, `features/finance/*` pure math, `scripts/finance-report.mts` (read-only; MRR from Stripe if a key is set, cost per video, units per video, margin by plan, catalog drift when invoice totals are given, `--json` for the digest). Owner applies the migration.
- [ ] **F2 Premium cost measurement** (`--premium` smoke run on fal, ~$0.35) and the **hero-shot Premium** decision; reprice Premium once measured, re-run the margin gate.
- [ ] **F3 Video provider A/B**: adapter for the top 2 candidates from §5 behind `FAL_VIDEO_MODEL`-style env, plus `scripts/provider-compare.mts` printing cost, latency, output paths for the same still.
- [ ] **F4 Yearly plans** (cash up front): 2 months free, Stripe prices via the setup script, `/pricing` toggle (Design track owns the UI file: coordinate through a plan note).
- [ ] **F5 Script cost**: Haiku draft + Sonnet retry, prompt caching, 30-topic quality eval.
- [ ] **F6 Fixed-cost table + free-tier cliff alerts** (lane C, once the owner supplies the list).
- [ ] **F7 Finance dashboard artifact** (private page: MRR, net new MRR, margin, cost per video, provider spend).
- [ ] **F8 Tax/payments review**: Stripe Tax vs merchant of record, before the first live euro.

---

## 8. Coordination with the other routines

- **Main CEO (06:00 UTC)** owns product, security and ops. If a finance change touches orchestration code it owns (`features/render`), keep it minimal and mention it in the PR. If the CEO has an open PR on the same files, wait.
- **Design CEO (09:00 UTC)** owns UI files. Finance never edits `src/app/**` page components or `src/components/**`; when a finance change needs UI (yearly toggle, usage nudge) the PR adds the logic and config and leaves a note in `DesignPlan.md` §follow-ups for the Design routine.
- All three read `TheMasterPlan.md`. Finance appends its changelog line there.

---

## 9. Changelog (newest on top)

- **2026-10-13** — Finance track created (interactive): charter, master-agent/sub-agent protocol, metrics, access gaps, connector suggestions, provider watchlist, baseline from repo numbers, backlog F0–F8. No code or runtime change.
