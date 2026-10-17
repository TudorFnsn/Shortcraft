# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`,
> which wins on product and priority; this file wins on unit economics, vendor
> choice and monetization experiments. Every finance PR updates this file
> (scoreboard, backlog, changelog) in the same change.
>
> Last updated: 2026-10-17 (created; no measured data yet, see §2)

---

## 1. Charter (owner-configured 2026-10-17, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash return first.** Raise MRR, cut cost per video, keep every product at or above the 3x margin gate.                                                                       |
| Watches   | MRR and its ratios (MRR ÷ API cost, net MRR ÷ all costs), tokens/credits burned per video vs what the video cost us, hosting, and every other recurring payment.                               |
| Looks for | New revenue ideas, new cheaper tech and vendors (the owner thinks fal.ai video is expensive), pricing and packaging changes, churn and dunning fixes.                                          |
| Autonomy  | **Research + PR-gated code**, like the other routines. Branches `ceo-finance/<slug>`; never merge. Money-moving or customer-visible changes (live prices, Stripe live objects) wait for Tudor. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CFO"**, 12:00 UTC (after the CEO at 06:00 and Design at 09:00). Weekly deep run on Mondays (full vendor scan + pricing review).                      |
| Shape     | A **master agent** that does no analysis itself: it reads state, splits the work across five sub-agents (§4), merges their results and ships at most one PR a day.                             |

### Principles

1. **Measured beats researched.** Public list prices are a hypothesis (the margin gate was built on them and they disagreed by 2x). Replace each with a number from our own `render_jobs.api_cost_usd` or a provider invoice as soon as one exists.
2. **Cash before vanity.** Rank every idea by `expected extra cash in 90 days ÷ effort`, not by elegance. Annual prepay, fewer refunds, recovered failed payments and cheaper video beat new features.
3. **Never trade margin gate for growth.** `scripts/margin-report.mts` must pass after any change. A cheaper vendor only counts once its quality is checked on real clips (side-by-side, owner sees samples).
4. **Free users are a cost line.** Trial burn, unpaid users' API spend and failed-render waste are tracked separately from paying users.
5. **Everything reversible behind the provider layer.** A vendor swap is a new adapter plus a `providerId` change, so we can switch back in one PR.

---

## 2. Scoreboard (the routine refreshes this every run)

Source: `npx tsx scripts/finance-report.mts` (read-only DB) plus provider invoices. Until the routine has DB access (§5), values are `n/a` and the CFO says so in its digest instead of guessing.

| Metric                                           | Value | As of | Target                   |
| ------------------------------------------------ | ----- | ----- | ------------------------ |
| MRR (gross, EUR)                                 | n/a   |       | grow weekly              |
| Net MRR (after VAT + Stripe fees, USD)           | n/a   |       |                          |
| Live subscribers (Starter / Pro / Ultra)         | n/a   |       |                          |
| Top-up revenue, 30d (net USD)                    | n/a   |       |                          |
| API cost, 30d: done / failed-wasted / unpaid     | n/a   |       | failed-wasted < 3%       |
| Measured cost per 15s standard video             | n/a   |       | ≤ $0.07 (gate assumes)   |
| Measured cost per 15s premium video              | n/a   |       | ≤ $1.10 (Kling estimate) |
| **Revenue ÷ API cost, 30d**                      | n/a   |       | ≥ 3x                     |
| Gross margin, 30d                                | n/a   |       | ≥ 67%                    |
| Fixed costs / month (hosting, DB, email, Sentry) | n/a   |       | see §3                   |
| **Net cash, 30d (net revenue − all costs)**      | n/a   |       | > 0, then grow           |

The ratio the owner calls "the MRR ratio" is **MRR ÷ total monthly cost** (variable API + fixed). Below 1 the app loses cash; the margin gate's 3x is only the variable part.

---

## 3. Cost map (every payment the app makes or could make)

Variable (per video; catalog in `src/config/models.ts`, list prices, not yet measured):

| Step    | Vendor today                 | Unit cost assumed                  | Notes                                            |
| ------- | ---------------------------- | ---------------------------------- | ------------------------------------------------ |
| Script  | Anthropic Sonnet 5.5         | $0.04 per script (~2k in/1.5k out) | tokens metered per call in `anthropic-script.ts` |
| Image   | fal.ai FLUX schnell / dev    | $0.003 / $0.025 per image          | 720×1280 = 1 MP                                  |
| Video   | Standard: in-house Ken Burns | $0                                 | premium only                                     |
| Video   | Premium: fal.ai video        | ~$0.07–0.12 per second             | the expensive line; owner wants a cheaper vendor |
| Voice   | ElevenLabs Flash v2.5        | ~$0.00075 per second               | voice design rounds ~$0.025                      |
| Render  | In-house ffmpeg (Vercel fn)  | ~$0.01                             | function time on Vercel                          |
| Payment | Stripe                       | 1.5% + €0.25 (EEA cards)           | modelled in `margin.ts`                          |

Fixed (owner fills in actual invoices; the CFO asks for any missing one):

| Item                 | Plan today         | Cost/month  | Flag                                                                                                                                           |
| -------------------- | ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel               | Hobby (per docs)   | €0          | **Hobby is non-commercial under Vercel's terms.** Once real money flows the app needs Pro (~$20/seat). Budget it now; do not treat it as free. |
| Supabase             | Free (assumed)     | €0          | Free projects pause after inactivity and have no backups; Pro is $25. Needed before real customers' data matters.                              |
| Email provider       | see `.env.example` | ?           | check the plan against daily lifecycle batch volume                                                                                            |
| Sentry               | Free (assumed)     | €0          | errors only, quota capped                                                                                                                      |
| Domain               | ?                  | ?           |                                                                                                                                                |
| Stripe Tax / Billing | not enabled        | 0.5% / 0.7% | only if we need them; compare to doing VAT by hand (we assume 20% VAT in the gate; EU rates differ, so revenue may be over- or understated)    |

---

## 4. How the routine works (master agent + five sub-agents)

The master agent ("CFO") reads `TheMasterPlan.md`, this file, `git log -20`, open and recent PRs, and the latest `finance-report` output, then fans out **in parallel**, each sub-agent with a narrow brief and a required output format:

| #   | Sub-agent                   | Question it answers                                                                                                                                                                              | Output                                             |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | **Revenue analyst**         | MRR, net MRR, churn proxies, trial → paid, top-up mix, plan mix, failed payments. What moved since last run?                                                                                     | Scoreboard rows + 3 findings                       |
| 2   | **Cost auditor**            | Measured vs assumed cost per step; tokens and credits per video; failed-render waste; free-user burn; fixed costs. Does the margin gate still pass on measured numbers?                          | Cost table + gate result + biggest leak            |
| 3   | **Vendor scout**            | Cheaper or better replacements for the biggest cost line (AI video first, then voice, images, script, hosting). Real prices from vendor pages, quality notes, API fit with our adapter contract. | Ranked shortlist with $/video and migration effort |
| 4   | **Monetization strategist** | Pricing, packaging and cash-timing changes: annual plans, credit expiry or rollover, overage, upsell to Pro, referral/affiliate economics, dunning, trial size, refund policy.                   | Ranked experiments with expected 90-day cash       |
| 5   | **Implementer**             | Takes the master agent's single chosen item and ships it (code, tests, plan update) on `ceo-finance/<slug>`.                                                                                     | One PR, or none if nothing clears the bar          |

Sub-agents 1–4 are read-only and run concurrently. Only the master decides what the Implementer builds. Use `Explore` or `general-purpose` agents; the Vendor scout gets web search and web fetch and must cite the URL and date for every price.

**Choosing the day's item:** highest `cash impact ÷ effort` among items that need no owner decision. If the best item needs an owner decision or a secret, the digest asks for it and the routine takes the best item that does not.

**Collision rules:** list open and recently closed PRs first; an item with an open PR is in review, not available. Do not touch UI files while a `ceo-design/*` PR is open (changes to pricing copy go through a short PR to `src/config/*` only). Do not overlap with the main CEO's open PR files; improve it on its branch instead if that is the best move.

---

## 5. Access and connectors (what the routine needs, and who sets it up)

The cloud routine runs in a sandbox with the repo and the connectors attached to it. Status as of 2026-10-17:

| Need                      | How                                                                                                                       | Status                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo (read, branch, push) | GitHub connector, scoped to `tudorfnsn/shortcraft`                                                                        | ✅ in scope                                                                                                                                                |
| Database numbers          | **Supabase** MCP (`.mcp.json`, project `iqvrovjwoavvmhaithwn`). Prefer read-only; the finance script only runs `select`s. | ⚠️ failed to connect in the first run (`ERR_PROXY_TUNNEL`). Owner: retry or allow `mcp.supabase.com` in the routine's network policy.                      |
| Revenue truth             | **Stripe** connector (MRR, charges, refunds, failed payments, disputes, fees, payouts)                                    | ⚠️ needs OAuth in claude.ai connector settings. Use a **restricted read-only key** if a key is used instead.                                               |
| Hosting spend             | **Vercel** connector (`list_billing_charges`, usage, runtime errors)                                                      | ✅ attached                                                                                                                                                |
| Provider spend            | fal.ai usage API, ElevenLabs `/v1/user/subscription`, Anthropic Admin Usage & Cost API                                    | ❌ needs read-only keys as routine env vars: `FAL_ADMIN_KEY`, `ELEVENLABS_API_KEY` (read scope), `ANTHROPIC_ADMIN_KEY`                                     |
| Vendor price pages        | Web search + fetch from the routine's network                                                                             | ⚠️ some provider pages were blocked last time; allow `fal.ai`, `replicate.com`, `elevenlabs.io`, `anthropic.com`, `runware.ai`, `together.ai`, `modal.com` |
| Digest to a human         | `PushNotification`; optionally Slack or Gmail connector                                                                   | ✅ push                                                                                                                                                    |
| Ledger / model sheet      | Google Drive / Sheets connector for a living cost model (owner can edit assumptions)                                      | optional                                                                                                                                                   |

**Worth adding (suggested, owner opts in):**

- **Stripe connector** is the single biggest upgrade: real MRR, refunds, failed-payment recovery and fee data replace our list-price estimates.
- **A read-only Postgres role** for the routine (select on `render_jobs`, `subscriptions`, `credit_transactions`, `profiles`), exposed through the Supabase MCP in read-only mode, so the routine cannot change data.
- **Anthropic Admin API key** (usage + cost reports): gives exact tokens per model per day, to compare against `api_cost_usd`.
- **fal.ai** usage export: the only way to check that metered cost equals billed cost.
- **Google Sheets** connector plus the `xlsx` skill, for a cost model Tudor can tweak.
- **Skills:** `deep-research` (vendor scans), `dataviz` and a Dashboard artifact (the weekly scoreboard as a page Tudor opens), `claude-api` (token and caching optimisation).
- **PostHog or Plausible** (later): visitor → signup → paid funnel, so ad and SEO spend can be judged against cash.

---

## 6. Backlog (ranked by cash impact ÷ effort; the routine edits this)

Status: `[ ]` open · `[~]` in a PR · `[✓]` owner approved · `[x]` shipped.

**Measure first (unblocks everything else)**

- [x] **F0 — Finance report script.** `scripts/finance-report.mts` + `features/metrics/finance.ts` (MRR, cost per tier, failed-waste, unpaid-user burn, gross margin). _2026-10-17._
- [ ] **F1 — Run it and the margin gate on real data**, then replace list prices in `config/models.ts` with measured ones (needs DB access, §5).
- [ ] **F2 — Per-step cost breakdown.** Today `render_jobs.api_cost_usd` is one number per job. Store the step (script/image/video/voice/render) and tokens or seconds billed, so cost per step is measurable. Additive migration (owner applies).
- [ ] **F3 — Reconcile with invoices.** Monthly: metered cost vs fal / ElevenLabs / Anthropic bills. Alert if they differ by more than 10%.

**Cut cost (the owner's biggest concern: fal.ai video)**

- [ ] **F4 — Premium hero-shot variant.** AI clip only on the hook scene, stills for the rest: ~$0.45 vs ~$1.10 per 15s (see MasterPlan §7). Biggest saving for the least vendor risk.
- [ ] **F5 — Video vendor bake-off.** Same 6 prompts through fal.ai (Kling, Seedance, Wan, LTX), Kling's own API, Runware, Replicate, Together, and self-hosted open weights (Wan / LTX-Video) on a serverless GPU (Modal, RunPod). Compare $/second, 9:16 support, motion quality, latency, rate limits, commercial licence. Owner approves samples before any swap. The adapter contract makes it a new file in `providers/live/`.
- [ ] **F6 — Script model.** Move the script step to a cheaper tier (Haiku 5.5), with prompt caching and a quality check on 20 topics. Script is $0.04 of a $0.07 standard video: it is more than half of Standard's cost.
- [ ] **F7 — Voice.** Compare ElevenLabs Flash against cheaper TTS (Cartesia, OpenAI mini TTS, open-source Kokoro/F5 self-hosted) on quality and on whether word timestamps exist (captions need them).
- [ ] **F8 — Images.** FLUX schnell on fal ($0.003) is already near the floor; compare Runware and a self-hosted batch. Low priority.
- [ ] **F9 — Stop paying for waste.** Cache and reuse identical scenes/voices, cap retries, fail fast before video steps (moderation already does), and measure failed-render cost.
- [ ] **F10 — Free-user burn.** Trial is 3,000 credits (~$0.25 by the gate). Check measured burn, add abuse limits (one trial per device/IP/email domain), and keep trials on Standard only.

**Raise cash**

- [ ] **F11 — Annual plans** (Stripe prices already have a yearly slot): ~2 months free for 12 months paid up front. Cash now, lower churn. Needs owner OK on the discount.
- [ ] **F12 — Dunning and failed-payment recovery.** Stripe Smart Retries + emails on `invoice.payment_failed`; track recovered revenue.
- [ ] **F13 — Credit expiry and rollover rules.** Today unused credits are free float; decide expiry (30/60 days) vs capped rollover. Affects breakage revenue and trust; owner decision.
- [ ] **F14 — Pack and plan price tests.** Anchoring, a "best value" top-up, a Pro-priced overage, regional pricing. Run as flag-gated experiments, one at a time.
- [ ] **F15 — Upsell prompts at the right moment** (low credits, plan-blocked option such as 60s or Premium) with the cheapest plan that unlocks it.
- [ ] **F16 — Affiliate and referral economics.** MasterPlan §6 promises 30% recurring: model the cost so it never pushes a plan below the gate.
- [ ] **F17 — New revenue lines:** done-for-you series packs, a watermark-free export tier, team seats, API access, template marketplace. Model each; build only the cheapest test.

**Fixed costs and risk**

- [ ] **F18 — Vercel Pro and Supabase Pro budget** before real customers (Hobby is non-commercial; Free Supabase pauses). Owner decision; the CFO records the true monthly fixed cost in §3.
- [ ] **F19 — Chargeback and refund watch.** Track refund rate and disputes (fees of ~€15 each); tighten the refund text if needed.
- [ ] **F20 — VAT/OSS correctness.** The gate assumes a flat 20% VAT. Real EU VAT varies by country; check the effect on net revenue and whether Stripe Tax pays for itself.

---

## 7. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (§7 especially), this file, `git log -20`, open and recent PRs, then run `npx tsx scripts/margin-report.mts` and, when DB access exists, `npx tsx scripts/finance-report.mts --json`.
- **One PR per run, at most.** Prefer improving an open `ceo-finance/*` PR over starting a new one. Research-only runs are fine; say so.
- **Files it may change:** `FinancePlan.md`, `docs/routines/finance-cfo.md`, `scripts/finance-report.mts`, `src/features/metrics/finance.ts`, `src/features/providers/**` (new adapters behind flags only), `src/config/models.ts` and `src/config/plans.ts` (only with the margin gate passing and the numbers in the PR body), tests, and the finance lines of `TheMasterPlan.md`. New migrations only as additive files for the owner to apply.
- **Never:** merge a PR, change live Stripe prices or products, spend money on provider calls beyond a few cents of cost-sampling (`MOCK_PROVIDERS` stays true in CI and Preview), commit a secret, print a key, or switch the production vendor without owner-approved samples.
- **Invent nothing:** a price or metric without a source and date is marked `unverified`. If a page or tool is blocked, say what was blocked in the digest.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `margin-report` exits 0.
- **Output:** a short digest (pushed as a notification only when there is something to act on): scoreboard deltas, the biggest cost leak, the PR link, what is waiting on Tudor, the next item. Stay silent when nothing changed.

---

## 8. Open questions for Tudor

1. Do you give the routine a Stripe read-only connector and a read-only DB path (§5)? Without them every figure is an estimate.
2. What do you pay today, per month, for Vercel, Supabase, the email provider, Sentry, the domain? (§3)
3. How many paying subscribers and how much fal.ai spend so far? Even rough numbers sharpen the first ranking.
4. Is a quality drop on Premium video acceptable for a 3–5x cheaper vendor, or must it match fal's current model?
5. Annual plans, credit expiry and a watermark on the free trial: yes, no, or later? (F11, F13)

---

## 9. Changelog

- **2026-10-17** — Finance track created: this plan, the routine prompt (`docs/routines/finance-cfo.md`), `scripts/finance-report.mts` and `features/metrics/finance.ts` (+5 tests, 525 total). No runtime change, no migration, no new dependency. (CFO, interactive setup)
