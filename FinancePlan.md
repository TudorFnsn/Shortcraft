# FinancePlan — Shortcraft money track

> **Source of truth for the money track.** Owned by the **Finance CFO** routine. It sits
> under `TheMasterPlan.md`: the master plan wins on product and priority; this file wins on
> revenue, cost, pricing experiments and vendor choices. Every finance PR updates this file
> (metrics ledger, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-17 (created)

---

## 1. Charter (owner request 2026-10-17, do not change without Tudor)

| Question       | Owner's answer                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose        | Maximise **profit and cash return**. Check MRR every run; propose and (PR-gated) implement changes that monetise better and cost less.                         |
| Priority       | **Cash first**: money in sooner (annual prepay, dunning, conversion) beats money saved later; then cost-out; then research.                                    |
| Look at        | Every payment in and out: Stripe, fal.ai, Anthropic, ElevenLabs, Vercel, Supabase, Resend, Sentry, domain, ads, affiliate payouts, refunds, Stripe fees, VAT.  |
| Unit economics | Tokens/units consumed per video **vs** dollars spent per video, **vs** credits charged. Realised margin, not just the margin gate's worst case.                |
| Vendors        | Open to swapping any provider. fal.ai looks expensive to the owner: find cheaper and better, with measured numbers, not snippets.                              |
| New ideas      | Fresh techs and models are welcome (new video/image/voice models, cheaper hosts, caching, batching, hybrid pipelines), each behind the provider adapter layer. |
| Autonomy       | **Research + PR-gated code**, like the CEO routine. Branches `cfo/<slug>`, never merge, never touch live secrets, no live Stripe writes without Tudor's OK.    |
| Shape          | One **master agent (the CFO)** that triages, then splits work across specialist sub-agents in parallel (see §4).                                               |
| Cadence        | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the CEO at 06:00, before Design at 09:00). Mondays run the deep vendor/pricing pass.        |

### Principles

1. **Measure before you change.** Prices in `config/models.ts` were researched, not measured (master plan §7). A vendor swap needs a measured cost per unit from a real call, or an owner-run smoke script, not a search snippet.
2. **Customers never pay more because we changed vendor.** Cheaper vendor → bigger margin or a cheaper credit price, decided by Tudor. Never a quality drop without a label.
3. **The margin gate stays law.** `scripts/margin-report.mts` must pass (>= 3x on every plan, top-up and job shape). Any PR that touches costs or prices shows the before/after table.
4. **Cash timing counts.** Annual prepay, fewer failed payments and shorter payback beat a slightly better gross margin.
5. **Silence is a result.** The routine only pings Tudor for a trigger in §6; a healthy run is a quiet commit.

---

## 2. Data access: what the routine can see

| Source                                              | Needed for                                   | Status (2026-10-17)                                                                                                                | Owner action                                                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft`                  | code, PRs, plans                             | Connected                                                                                                                          | none                                                                                                                                                                                                  |
| Supabase connector (project `iqvrovjwoavvmhaithwn`) | MRR, jobs, `api_cost_usd`, ledger            | Connected on claude.ai; the project-scoped `.mcp.json` server failed to connect from the cloud (proxy tunnel). Read-only SQL only. | none; keep the claude.ai connector enabled for the routine                                                                                                                                            |
| Vercel connector                                    | hosting bill, usage, runtime errors, billing | Connected (`list_billing_charges`, `list_contract_commitments`, runtime logs)                                                      | none                                                                                                                                                                                                  |
| **Stripe connector**                                | live MRR, churn, refunds, disputes, fees     | **Needs reconnect** (claude.ai connector shows `needs_reconnect`); sandbox account only, no live account yet                       | reconnect in claude.ai connectors; add the **live** account when Stripe go-live is done (master plan §5 Phase 3)                                                                                      |
| Firecrawl connector                                 | read vendor pricing pages the sandbox blocks | Connected                                                                                                                          | none                                                                                                                                                                                                  |
| **fal.ai usage/billing**                            | real spend per model, per request            | **Missing**                                                                                                                        | create a read-only/admin usage key, add it as routine env `FAL_ADMIN_KEY` (usage + billing endpoints). Never the generation key                                                                       |
| **Anthropic usage & cost**                          | tokens in/out, $ per model, cache hit rate   | **Missing**                                                                                                                        | create an Admin API key (Usage & Cost API) in the console; add as `ANTHROPIC_ADMIN_KEY`                                                                                                               |
| **ElevenLabs usage**                                | characters, voice slots, plan tier           | **Missing**                                                                                                                        | key with `usage_read` (or a user-read key): `ELEVENLABS_USAGE_KEY`                                                                                                                                    |
| Resend / Sentry / domain / ads                      | fixed costs and CAC                          | **Missing**                                                                                                                        | list them once in §3 (amounts are enough); add a read-only key later if the bill grows                                                                                                                |
| Outbound network                                    | fresh vendor prices, model pages             | Master plan §7 notes provider pages were blocked from a routine's network                                                          | in the routine's environment settings allow `fal.ai`, `replicate.com`, `wavespeed.ai`, `runware.ai`, `elevenlabs.io`, `anthropic.com`, `openrouter.ai`, `artificialanalysis.ai`; or rely on Firecrawl |

Until a key exists the routine falls back to the DB (`render_jobs.api_cost_usd` is our metered cost per job) and says in the digest which numbers are metered vs invoiced.

### Questions only Tudor can answer (the routine re-asks until they are in §3)

1. Monthly fixed costs: Vercel plan, Supabase plan, ElevenLabs plan, Sentry, Resend, domain, any other subscription (amounts).
2. Cash on hand and the monthly burn you can afford (runway), and any payback target for paid acquisition.
3. Ad spend and affiliate payout terms actually in use (master plan says 30% recurring: confirm it, since it is a cost line on every sale).
4. Is the entity VAT-registered and OSS-enabled, and is Stripe Tax on? (changes net revenue by up to 20%).
5. Appetite for a merchant of record (Paddle, Lemon Squeezy, Polar): they handle EU VAT but take a larger cut than Stripe. The routine will model it; you decide.

---

## 3. Money snapshot (the routine overwrites this block each run)

_No live data yet. First run: `npx tsx scripts/finance-report.mts` (needs `.env.local` with the Supabase service role) and paste the numbers here._

| Metric                                | Value           | Date |
| ------------------------------------- | --------------- | ---- |
| MRR (gross, EUR)                      | n/a             |      |
| Net MRR (USD, after VAT + fees)       | n/a             |      |
| Paying subscribers / ARPU             | n/a             |      |
| API cost, trailing 30d (metered, USD) | n/a             |      |
| Cost per finished video (std / prem)  | n/a             |      |
| Burn ratio (API cost / net MRR)       | n/a             |      |
| Realised gross margin                 | n/a             |      |
| Fixed costs / month (owner-supplied)  | n/a             |      |
| Trial burn per signup                 | $0.25 (catalog) |      |

---

## 4. Operating model: master agent + specialists

The CFO (master) never does the deep work itself. It reads state, triages, and fans out **in one message** to specialists that run in parallel, then merges, decides and acts.

| Agent                  | Job                                                                                                                                                                    | Output                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **CFO (master)**       | Read this file, `TheMasterPlan.md`, open/recent PRs. Run the finance report. Triage (§5). Dispatch specialists. Pick ONE shippable change. Notify on triggers (§6).    | Digest, PR, updated §3/§7                        |
| **Revenue analyst**    | MRR, ARPU, churn, trial→paid, failed payments and dunning, refunds, disputes, Stripe fees, annual-vs-monthly mix, top-up share (Stripe connector + DB).                | Revenue table + the 3 biggest leaks              |
| **Cost analyst**       | Per-video cost by step and tier; metered (`api_cost_usd`) vs invoiced (fal/Anthropic/ElevenLabs usage); failure waste; fixed costs; credit-to-cost realised ratio.     | Cost waterfall + anomalies                       |
| **Vendor scout**       | Cheaper/better providers for each slot (video, image, script LLM, TTS, hosting). Reads pricing pages (Firecrawl) and benchmarks; records source URL, date, confidence. | Comparison table, ranked shortlist, a bench plan |
| **Pricing strategist** | Plan/top-up prices, credit scale, annual plans, trial size, upgrade prompts, packaging, discounts, affiliate economics, merchant-of-record trade-off.                  | 1–3 experiments with expected € impact and risk  |
| **Builder**            | Implements ONE approved-in-principle change on `cfo/<slug>` (adapter, catalog row, script, test). Runs the bar.                                                        | PR                                               |
| **Auditor**            | Adversarial review of the Builder's diff and of every number in the digest (recompute from raw rows; check the margin gate; hunt for a customer-visible regression).   | Pass/fail + corrections before the PR opens      |

Run-time mode: **Daily** = revenue + cost analysts, optional builder. **Monday** = also vendor scout + pricing strategist. A mode never skips the auditor on code or on a recommendation that moves money.

---

## 5. Triage order (cash first)

1. **P0 — money is leaking now:** realised margin < gate, API cost > net MRR, a cost spike (> 2x the 7-day mean per finished video), failed-payment spike, webhook not granting credits, fal/Anthropic bill with no matching jobs. Fix or flag today.
2. **P1 — cash in:** dunning/retry settings, annual plan with prepay (master plan Phase 4 item), trial→paid funnel, low-balance upsell, top-up packs, abandoned checkout, unused-credit reminders (they drive churn, not revenue, so weigh carefully).
3. **P2 — cost out:** the biggest cost line first (see §7 baseline), hybrid pipelines, caching, cheaper model for the same quality, fewer failed jobs.
4. **P3 — research:** new models/hosts worth benchmarking; the next Monday's bench plan.

One shippable change per run; prefer improving an open `cfo/*` PR to starting another.

---

## 6. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (§1, §7, §9, §10, §11), this file, `git log -20`, open and recently closed PRs (an item with an open PR is in review, not available), and the last digest in §8.
- **Files it may change:** `src/config/models.ts` (costs and providers), `src/config/plans.ts` and `src/features/billing/margin.ts` **only via a PR Tudor approves for any customer-visible price/credit change**, `src/features/finance/**`, `src/features/providers/live/**` and `registry.ts` for new vendors, `scripts/finance-*.mts`, `scripts/*-smoke.mts`, `tests/**`, `docs/**`, this file and the finance lines of `TheMasterPlan.md`. Never UI files (Design track), never migrations without flagging them as owner-applied, never `.env*` or secrets.
- **A vendor swap needs:** an adapter behind the existing contract, a unit test with a stubbed HTTP response, a smoke script entry the owner can run (`live-providers-smoke.mts`), the catalog row with `costUsdPerUnit` marked _researched_ or _measured_, and the margin table before/after. Keep the old provider registered as a one-line fallback.
- **Stripe, Supabase, Vercel:** read-only. Any write (Stripe object, price, coupon, migration, env var, project setting, domain purchase) is a proposal for Tudor with the exact change, never an action.
- **Never** spend money: no paid API experiments beyond what Tudor pre-approved in §7 ("bench budget"), no purchases, no plan upgrades.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` and `npx tsx scripts/margin-report.mts` pass in mock mode.
- **Output:** a digest (what moved, the money table, what's waiting on Tudor, next item).
- **Notify Tudor (PushNotification) only when:** a P0 fires; MRR drops week over week; a cost anomaly or a margin-gate failure; a data source is missing/blocked and a number can't be trusted; a decision is needed (vendor swap, price change) with the € impact; or the routine could not run. Otherwise stay quiet.
- **Suggest tooling:** each Monday digest ends with at most 3 connectors, skills, plugins or MCP servers that would make the next run better (see §9).

---

## 7. Roadmap (priority order)

Baseline from the catalog (`src/config/models.ts`, researched not measured), 15 s Standard video ≈ **$0.07**:

| Step      | Vendor / model                | USD   | Share |
| --------- | ----------------------------- | ----- | ----- |
| Script    | Anthropic `claude-sonnet-5-5` | 0.040 | ~57%  |
| 3 images  | fal.ai FLUX [schnell]         | 0.009 | ~13%  |
| Voiceover | ElevenLabs Flash              | 0.011 | ~16%  |
| Render    | in-house ffmpeg               | 0.010 | ~14%  |

Premium (AI video) is **the expensive line**: Kling 2.5 Turbo Pro on fal.ai, $0.12 per scene-second in the catalog (about $2.30 for 15 s). So fal.ai is cheap where Standard uses it (images) and costly where Premium uses it (video). Revenue side: Starter €14.99, Pro €29.99, Ultra €79.99; top-ups €12/29/59; net of 20% VAT and Stripe fees.

- [ ] **F0 First measurement.** Run `scripts/finance-report.mts`; fill §3; get the owner answers in §2; reconnect Stripe; add the three usage keys. _Blocked on Tudor._
- [ ] **F1 Script cost.** The script is ~57% of a Standard video. Bench `claude-haiku-5-5` (and prompt caching on the theme/system prompt) against Sonnet on the same 20 topics: quality (a rubric judged by Sonnet + 5 videos read by Tudor) and `usage.input/output/cache_*` tokens per script. Expected: 3–5x cheaper per script. One catalog row + env var, no pipeline change (`ANTHROPIC_SCRIPT_MODEL` already exists).
- [ ] **F2 Premium video vendor bench.** Candidates to price and measure on the same 10 image→video prompts at 720p, per **billed second incl. minimum clip length**: Kling 2.5 Turbo Pro (current), Wan 2.x, Seedance, Hailuo, LTX-2, Veo fast; hosts fal.ai vs Replicate vs WaveSpeed vs Runware vs direct provider API. Output: $/s, latency, failure rate, quality notes, source + date. Note Kling bills fixed 5 s clips, so scenes of 2–3 s are over-billed.
- [ ] **F3 Hybrid Premium.** AI clips only for the hook and 1–2 key scenes, Ken Burns for the rest. Cuts Premium cost by roughly half at similar perceived quality. Needs a pipeline decision (Tudor) and a UI line (Design track).
- [ ] **F4 Failure waste.** Sum `api_cost_usd` of failed jobs and of steps that ran before a failure; add per-step idempotent retry or earlier moderation if > 3% of spend.
- [ ] **F5 Annual plans** (cash-up-front). Price at ~2 months free; Stripe price + checkout + entitlement mapping + grants-per-month cron. Cash-return priority: ~10x the cash of a monthly sub on day one.
- [ ] **F6 Payment recovery.** Stripe Smart Retries and dunning emails on `invoice.payment_failed`; track recovered MRR.
- [ ] **F7 Trial and conversion.** Trial burn is $0.25 per signup; test 3,000 vs 1,500 credits and a "first video free, then pay to download without watermark" variant. Needs traffic: only after distribution has volume.
- [ ] **F8 Pricing review.** After 30 days of real data: realised cost per credit vs credit price per plan, breakage (unused credits at period end), price anchoring, an Ultra annual, premium top-up pack.
- [ ] **F9 Fixed-cost audit.** ElevenLabs plan vs voice-slot use, Vercel and Supabase tiers vs usage, Sentry and Resend tiers, any idle subscription. Cancel or downgrade proposals with € saved.
- [ ] **F10 Merchant of record model.** Paddle / Lemon Squeezy / Polar vs Stripe + Stripe Tax: fee delta, VAT filing time, chargeback handling. Proposal only.
- [ ] **F11 Self-hosted or cached ideas** (only if volume justifies): result cache for identical (topic, theme, voice) scripts; batch API for non-urgent script generation; a stock-footage or reused-clip library for Premium b-roll.

**Bench budget:** $0 until Tudor sets one here. The scout can read prices and docs for free; real calls go through `scripts/live-providers-smoke.mts`, run by Tudor.

**Out of scope:** buying followers or fake reviews, anything that breaks provider or Stripe terms, training own models, running GPUs (master plan §5, "Out of scope").

---

## 8. Changelog and digests (newest on top)

- **2026-10-17** — Finance track created: this plan, the routine prompt (`docs/routines/finance-cfo.md`), `features/finance/unit-economics.ts` (MRR, ARPU, cost per finished video, burn ratio, realised margin) with tests, and `scripts/finance-report.mts` (read-only). No runtime change, no migration, no dependency. The routine itself must be created on claude.ai (see `docs/routines/finance-cfo.md`). (Finance CFO, interactive)

---

## 9. Tools and connectors that would help (suggestions, owner decides)

- **Stripe (reconnect + live account):** MRR, churn, refunds, disputes, Sigma queries for cohort revenue. Highest value; nothing else substitutes for it.
- **Anthropic Admin API key** and **fal.ai / ElevenLabs usage keys** as routine environment variables: invoiced truth to reconcile against metered `api_cost_usd`.
- **Firecrawl** (already connected): vendor pricing pages. Pair with the routine's network allowlist.
- **Artificial Analysis** (artificialanalysis.ai) as a read target: independent price/quality/latency leaderboards for video, image and TTS models.
- **Google Sheets / Drive connector:** a place for Tudor to drop fixed costs, invoices and the ad-spend log the routine can read.
- **Gmail connector (read-only):** vendor invoices and receipts arrive there; lets the routine reconcile fixed costs without anyone typing them in.
- **Sentry / PostHog connector:** failed-job rate and funnel (visitor→signup→paid) for CAC and activation.
- **Claude Code skills/plugins:** a spreadsheet skill (xlsx) for the monthly P&L file, and the dataviz skill for the MRR/cost trend chart in the Monday digest.
