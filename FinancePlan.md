# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> Product, pricing-policy and priority calls still live in `TheMasterPlan.md`
> (§7 Monetization, §8 Risks); this file holds the finance charter, the cost
> ledger, the vendor watchlist and the routine's working rules.
>
> Last updated: 2026-10-14

---

## 1. Charter

**Goal:** maximise cash return. Every run answers four questions, in this order:

1. **MRR and its trend.** How much recurring revenue, from how many subscribers, at what ARPU, and is it growing?
2. **Unit cost.** What did a finished video really cost us in API spend (per tier), and how much was burned on jobs that failed?
3. **All other costs.** Hosting, database, voice plan, email, error tracking, domain, Stripe fees, anything that bills us.
4. **What would move the ratio.** Cheaper or better vendors, pricing and packaging changes, conversion and retention levers. The routine proposes them and, where allowed (§5), builds them.

**The number to steer by:** `revenue ÷ total cost` (the "MRR ratio") and monthly cash margin, from `scripts/finance-report.mts`. The existing margin gate (`features/billing/margin.ts`, ≥3x per plan) is the floor, not the target.

**Autonomy:** PR-gated, same as the other routines. It never merges, never touches live secrets, never switches Stripe to live mode, never changes a customer-facing price without the owner's explicit OK (a price change is a _proposal_ with numbers; the PR may contain the code but is labelled "needs owner decision"). Branches: `ceo-finance/*`.

---

## 2. The team (master agent + specialists)

The routine's session is the **master agent** (a "DM"): it reads this file, gathers the numbers, decides what is worth doing this run, and **splits the work across sub-agents in parallel** (one `Agent` call per specialist, all in a single message), then merges their results. It does not do the specialists' reading itself.

| Specialist                  | Job                                                                                                                                                                                                                                                                     | Reads                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Revenue analyst**         | MRR, ARPU, plan mix, new/churned subscribers, trial → paid, top-up revenue, refunds and failed payments. Sizes each lever (price, plan mix, yearly plans, annual discount, dunning, upsell) in euros per month.                                                         | `scripts/finance-report.mts`, `scripts/metrics-report.mts`, Stripe connector, `plans.ts`              |
| **Cost auditor**            | API spend per finished video by tier and by provider; spend on failed jobs; spend per user (top 10 heaviest); credits charged vs USD cost per job shape (real margin, not the gate's worst case). Flags drift between `models.ts` list prices and measured cost.        | `render_jobs.api_cost_usd`, Supabase connector (read-only SQL), provider usage pages/exports (see §3) |
| **Overheads auditor**       | Every other bill: Vercel (billing charges via the Vercel connector), Supabase plan and usage, ElevenLabs plan and slots, Resend, Sentry, domain, Stripe fees. Fills §4. Finds plan downgrades, unused seats, cache and bandwidth waste, function-duration waste.        | Vercel + Supabase connectors, owner-supplied invoices                                                 |
| **Vendor scout**            | Searches the web for cheaper or better models and services for each slot (video, image, voice, script LLM, render, hosting). Reads vendor price pages directly and records the date and URL. Maintains the watchlist in §6. Never recommends on a search snippet alone. | Web (WebSearch/WebFetch), `src/features/providers/**`                                                 |
| **Monetization strategist** | New revenue ideas: packaging, annual plans, credit-pack design, price anchoring, referral/affiliate economics, upsells at the credits-low moment, win-back emails, paid-feature gating (Premium, voices, long videos), B2B/agency tier. Sized and ranked by €/month.    | Plan files, `north-star.ts` output, lifecycle email code                                              |
| **Implementer**             | Takes the one change the master picked and ships it as a PR with tests: a provider adapter swap, a cheaper default model, caching, a cost-metering fix, a margin-gate update. Runs the full bar (§5) first.                                                             | Repo                                                                                                  |

The master picks **one implementation per run** (highest €/month per unit of risk and effort), keeps the rest as ranked proposals in the digest and in §7, and checks open and recently closed PRs first so it never duplicates the main CEO or Design CEO.

---

## 3. Data access (what the routine can and cannot see)

| Source                                           | Status                                          | How                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo (`TudorFnsn/Shortcraft`)                    | ✅ GitHub connector                             | Read/branch/PR.                                                                                                                                                             |
| Supabase (project `iqvrovjwoavvmhaithwn`)        | ✅ connector; falls back to `.mcp.json` locally | Read-only `select`s. If it fails to connect (this happened on the first run: `ERR_PROXY_TUNNEL`), the routine says so in its digest and works from the repo and Stripe.     |
| Stripe                                           | ✅ connector, **sandbox only** (test mode)      | Real MRR needs the live account connected (owner action). Until then MRR from the DB is list-price MRR.                                                                     |
| Vercel                                           | ✅ connector                                    | `list_billing_charges`, project usage, runtime errors.                                                                                                                      |
| Per-job API cost                                 | ✅ `render_jobs.api_cost_usd`                   | Metered by the orchestrator. **Gap:** it is one number per job. There is no per-step or per-provider ledger and no token counts, so provider-level questions are estimates. |
| Provider invoices: fal.ai, Anthropic, ElevenLabs | ❌ no connector                                 | See "Owner actions" below.                                                                                                                                                  |
| Product analytics / traffic                      | ❌ none (north-star report uses DB only)        | Vercel Web Analytics/Speed Insights, or PostHog (§8).                                                                                                                       |

**Owner actions that unlock the routine (any subset helps; do them in this order):**

1. **Set the fixed-cost table in §4** (30 minutes, biggest single unlock for "total spend").
2. **Create read-only usage keys** and add them as routine environment secrets (never commit them): Anthropic **Admin API key** (usage/cost reports), ElevenLabs key already has `GET /v1/user/subscription` for character usage, fal.ai: an API key plus the dashboard's usage export (fal has no public billing read scope that I could verify; if none exists, paste the monthly usage CSV into `docs/finance/` each month).
3. **Connect Stripe live mode** to the connector once go-live happens, so MRR, churn, refunds and fees are real.
4. **Approve the metering migration** (§7, F1) so cost is recorded per step and per provider, with token counts for Claude and characters/seconds for voice and video.

---

## 4. Fixed and semi-fixed costs (owner fills; the routine keeps it current)

Monthly, USD. `FIXED_MONTHLY_USD` for `scripts/finance-report.mts` is the sum of the "Fixed" rows.

| Item                                         | Type     | Monthly USD                      | Source / note                      |
| -------------------------------------------- | -------- | -------------------------------- | ---------------------------------- |
| Vercel (Hobby/Pro)                           | Fixed    | _owner_                          | Hobby is non-commercial: see §7    |
| Supabase (Free/Pro)                          | Fixed    | _owner_                          |                                    |
| ElevenLabs plan (custom-voice slots)         | Fixed    | _owner_                          | slots cap Voice Studio V4          |
| Resend (email)                               | Fixed    | _owner_                          |                                    |
| Sentry                                       | Fixed    | _owner_                          |                                    |
| Domain                                       | Fixed    | _owner_                          |                                    |
| Claude subscription / Claude Code (routines) | Fixed    | _owner_                          | the routines themselves cost money |
| Stripe fees                                  | Variable | ~1.5% + €0.25 (EEA cards) to ~3% | on net revenue                     |
| fal.ai, Anthropic, ElevenLabs usage          | Variable | metered per job                  | `render_jobs.api_cost_usd`         |
| Marketing / ads                              | Variable | _owner_                          |                                    |

---

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7, §8, §9, changelog), this file, `git log -20`, open and recent PRs (list via the GitHub connector). An item with an open PR is in review, not available.
- **Measure first:** run `FIXED_MONTHLY_USD=<§4 total> npx tsx scripts/finance-report.mts --json` and `scripts/metrics-report.mts --json` when `.env.local` or the Supabase connector gives read access; otherwise query read-only through the connector. If neither works, say so and work from code and the web.
- **Research with evidence:** every price in a proposal carries a URL and the date read. A search snippet is a lead, not a source. Prices that disagree between sources are stated as a range. A vendor recommendation always includes quality risk (a cheaper model that makes worse videos lowers conversion), data-processing/GDPR status (EU users) and the migration cost.
- **Implementation, one per run, PR-gated on `ceo-finance/*`:** allowed files are `src/config/models.ts`, `src/features/providers/**`, `src/features/billing/margin.ts`, `src/features/metrics/**`, `scripts/**`, `tests/**`, `FinancePlan.md`, and the finance lines of `TheMasterPlan.md`. It does **not** touch UI files (Design CEO's), the Stripe webhook, credit-ledger SQL, or a customer-facing price/credit grant without the owner's OK. New migrations may be _written_ but are applied only by the owner.
- **Margin gate stays on:** any adapter or price change must keep `features/billing/margin.ts` ≥3x on every product, using _measured_ cost where available. A change that lowers cost without lowering quality is a free win; a change that lowers quality needs the owner.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` all pass in mock mode.
- **Never:** spend money (no purchases, no plan upgrades), buy domains, change live Stripe objects, send emails to users, store a secret in the repo, or write to the production database.
- **Notify:** send a push notification only when something needs the owner: MRR or cash margin moved materially, the ratio fell below target, a cost spike (>2x the 30-day average per video), a vendor change worth >10% of monthly cost, a PR is ready, or the routine could not get the data it needs. A quiet "nothing changed" run sends nothing.
- **Output:** a digest: MRR and ratio (with change since last run), cost per finished video by tier, top 3 cost lines, ranked proposals with €/month, PR link, what is waiting on the owner, next run's item. Append one line to the changelog in §9 and update §7.

---

## 6. Vendor watchlist (leads, not facts: the vendor scout verifies each and records date + URL)

Today's stack: video **fal.ai → Kling 2.5 Turbo Pro** (Premium only; Standard is free Ken Burns stills), images **fal.ai FLUX schnell/dev**, voice **ElevenLabs Flash**, script **Claude Sonnet 5.5**, render **in-house ffmpeg**, hosting **Vercel + Supabase**.

Where the money is: Standard costs about $0.07 a video, so it is already high-margin. **Premium AI video is where cost concentrates** (the gate assumes ~$0.12 per scene-second). So the highest-leverage research is video, then image and script LLM.

| Slot          | Candidates to price-check                                                                                                                                                                                                                                                         | Why it might win                                                                     | Watch-outs                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Premium video | Kling direct API (skip the marketplace markup), Wan 2.x / LTX open-weights hosted on Replicate/Together/Runware/Novita, Seedance (BytePlus), Hailuo/MiniMax direct, Veo Fast via Gemini API, Luma/Runway for quality tier, **hero-shot only** (animate scene 1, stills elsewhere) | Direct APIs and open-weights hosts are often much cheaper than the marketplace price | China-hosted APIs: GDPR/data-transfer review; quality and motion consistency; clip length billing (fixed 5s clips) |
| Images        | Runware, Together, Replicate, fal FLUX.1 schnell vs newer low-cost models, Black Forest Labs direct, resolution trimmed to what 9:16 needs                                                                                                                                        | Image cost is already tiny; savings are small unless premium images are heavily used | Style consistency across scenes                                                                                    |
| Script LLM    | Claude Haiku 5.5 for scripts that pass a quality check, prompt caching for the fixed system prompt, Batch API where latency allows, shorter outputs                                                                                                                               | Script is ~$0.04 a job; a smaller model plus caching can cut it by a large share     | Script quality drives retention; A/B before switching                                                              |
| Voice         | ElevenLabs Flash plan tiers vs pay-as-you-go, Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural voices as a Standard-tier voice, caching repeated previews                                                                                                                 | ElevenLabs is the premium voice; a cheaper engine for Standard saves cost and slots  | Voice Studio V4 (designed voices) is ElevenLabs-only                                                               |
| Hosting       | Vercel Hobby vs Pro (Hobby forbids commercial use), function memory/duration for ffmpeg, Cloudflare R2 for video egress (no egress fees), Supabase Storage egress limits, signed-URL TTL and caching                                                                              | Egress and function time grow with every video watched or downloaded                 | Moving storage is a migration; do it only if egress is a top-3 line                                                |
| Payments      | Stripe fees vs Paddle/Lemon Squeezy (merchant of record handles EU VAT, higher fee), Stripe Tax                                                                                                                                                                                   | VAT handling cost and time for a solo owner                                          | Migration cost, payout timing                                                                                      |

---

## 7. Roadmap (ranked by €/month ÷ risk; the routine reorders it each run)

- [ ] **F1: Cost metering (blocker for everything else).** New table `job_cost_events` (job_id, step, provider, model, units, unit_kind, usd, input_tokens, output_tokens, created_at), written by the orchestrator next to the existing `apiCostUsd` roll-up; extend `finance-report.mts` with per-provider and per-step spend and tokens per video. Migration is written by the routine, applied by the owner. Answers "tokens used vs. money spent" exactly.
- [ ] **F2: Fill §4 and give the routine its read-only provider keys** (owner).
- [ ] **F3: Measure the Premium video cost on real calls** and replace the conservative $0.12/s in `models.ts` (owner runs `live-providers-smoke.mts --premium` with `FAL_KEY`; the routine updates the catalog from the numbers and re-runs the gate).
- [ ] **F4: Hero-shot Premium tier** (AI clip on the hook scene only, stills elsewhere): TheMasterPlan §7 estimates ~$0.45 per 15s video. A product that sells near Standard price with an AI opening is a conversion lever and a margin lever.
- [ ] **F5: Video vendor bake-off** (scout + implementer): price and quality-test the §6 candidates behind the adapter layer; ship the cheapest that passes a blind quality check.
- [ ] **F6: Script cost:** Haiku-class model or prompt caching behind a flag, A/B on completion rate.
- [ ] **F7: Pricing experiments** (proposal only, owner decides): yearly plans (cash up front, lower churn), a cheaper entry plan or a Starter price test, top-up pricing, a "credits running low" upsell in the lifecycle email, an agency/team tier.
- [ ] **F8: Failed-job spend:** cap retries, fail early before the expensive step, and track `failedCost30dUsd` so refunds don't hide real cost.
- [ ] **F9: Hosting/egress review** once real traffic exists; Hobby → Pro before commercial launch (Vercel Hobby is non-commercial).

---

## 8. Connectors, tools and add-ons that would make this routine better

Ask for these in the routine's environment; none is required to start.

1. **Stripe live-mode connector** (already installed, sandbox only): real MRR, churn, refunds, disputes, fees. Highest value.
2. **Supabase connector** (installed; keep it connected for the routine's environment): read-only SQL on the cost and subscription tables.
3. **Vercel connector** (installed): billing charges and usage.
4. **PostHog** (or Plausible): visitor → signup → paid funnel, to price acquisition against CAC. The north-star report has no traffic data.
5. **Sentry connector:** link error spikes to wasted spend (jobs that fail after paying for images).
6. **Google Sheets/Drive connector:** a place for the owner to keep invoices and the fixed-cost table, and for the routine to publish a monthly P&L.
7. **Slack or email connector:** the routine's digest in a channel instead of only a push notification.
8. **Anthropic Admin API key, ElevenLabs key, fal.ai usage export** (§3): the only way to reconcile provider invoices with metered cost.
9. **Claude Code tools worth enabling for this routine:** parallel sub-agents (the master/specialist split), WebSearch/WebFetch for vendor price pages, Artifacts (a monthly finance dashboard the owner can open), and the `schedule`/routines UI for cadence.

---

## 9. Changelog (newest on top)

- **2026-10-14** — Finance track created (owner request): this charter, `features/metrics/finance.ts` (+4 tests), and `scripts/finance-report.mts` (MRR, ARPU, 30-day metered API cost per tier, failed-job spend, cash margin, break-even subscribers; read-only). No migration, no dependency, no runtime change. Routine itself must be created in claude.ai (§10). (interactive)

---

## 10. Setting up the routine

Create it at https://claude.ai/code/routines → New routine, **repo `TudorFnsn/Shortcraft`**, connectors Stripe + Supabase + Vercel + GitHub, **Opus 5.5**, schedule **weekly Monday 07:30 UTC** (daily is overkill until there is paying traffic; the main CEO runs 06:00 and the Design CEO 09:00). Prompt:

```
You are the Shortcraft Finance CEO and master agent ("DM"). Your job is to maximise
the app's cash return: monitor the MRR ratio (revenue ÷ total cost), cut cost per
finished video, find cheaper and better vendors, and propose or implement changes
that monetise better.

1. Read FinancePlan.md, then TheMasterPlan.md (§7, §8, §9), `git log -20`, and the open
   and recently closed PRs. Anything with an open PR is in review.
2. Measure: run `FIXED_MONTHLY_USD=<FinancePlan §4 total> npx tsx scripts/finance-report.mts --json`
   (and scripts/metrics-report.mts --json). If .env.local is missing, use the Supabase
   connector read-only. Add Stripe and Vercel billing data. If a source is unreachable,
   say which one and continue.
3. Split the work: in ONE message, launch parallel sub-agents per FinancePlan §2
   (Revenue analyst, Cost auditor, Overheads auditor, Vendor scout, Monetization
   strategist). Give each the numbers it needs, a narrow scope and the question to answer.
   Tell the vendor scout to read vendor price pages directly and report URL + date.
4. Merge results. Rank proposals by €/month ÷ risk. Pick ONE to implement through the
   Implementer rules (FinancePlan §5), on a `ceo-finance/*` branch, with tests, passing
   format:check, lint, typecheck, test and next build. Never merge, never touch live
   secrets or live Stripe, never change a customer-facing price without the owner's OK
   (open the PR as "needs owner decision" instead).
5. Update FinancePlan.md (§4 numbers, §6 watchlist with dated sources, §7 roadmap,
   changelog) and the finance lines of TheMasterPlan.md.
6. Send a PushNotification (in <routine_summary> tags) only if the owner needs to
   act or know: MRR/ratio moved materially, a cost spike, a worthwhile vendor change,
   a PR ready, or missing access. Otherwise stay quiet. End with the digest from §5.
```
