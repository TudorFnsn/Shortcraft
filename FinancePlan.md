# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing and cash. Every finance PR updates this file (ledger,
> backlog, baseline) in the same change.
>
> Last updated: 2026-10-20 (created)

---

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question   | Owner's answer                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal       | **Maximum profit, cash return first.** Every run checks the MRR ratio and ships or proposes changes that earn more per euro of cost.                                                |
| Scope      | Revenue (plans, top-ups, pricing, conversion, churn), every cost line (model APIs, hosting, email, monitoring, Stripe fees, tools), and the tech that lowers them.                  |
| Known pain | fal.ai (images + premium video) looks expensive. Find cheaper or better providers and tech; prove it on measured calls before switching.                                            |
| Autonomy   | **PR-gated**, like the other routines: branches `ceo-finance/<slug>`, never merge, never touch live secrets, never write to Stripe or Supabase without the owner's OK.              |
| Cadence    | Separate daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design CEO at 09:00). Weekly deep dive on Mondays.                                 |
| Notify     | Push a notification only for: MRR coverage below target, spend above revenue, a provider saving worth switching for, a cost spike, or a blocker needing the owner. Quiet otherwise. |

### Targets (change only with the owner)

- **MRR coverage** (net MRR ÷ API + fixed costs, trailing 30 days) **≥ 3x**. Below 1x is an alert.
- **Gross margin per video** ≥ 3x on every plan at full burn (the margin gate in `features/billing/margin.ts`), and measured margin ≥ the gate's estimate.
- **Trial burn** (cost of a free signup) stays under **$0.30** and falls as conversion data arrives.
- **Failed renders** under 5% (a failed job still meters provider spend).

---

## 2. How a run works (Finance CEO is the master agent)

The routine is a **dispatcher**, like the other CEOs. It reads this file and `TheMasterPlan.md`, lists open + recently closed PRs (an item with an open PR is in review, not available), then splits the work across subagents in parallel and merges their findings into one PR and one digest.

1. **Measure (first, always).** Run `npx tsx scripts/finance-report.mts --json` (MRR, net MRR, ARPU, 30-day API cost, cost per video and per 1k credits by tier, flags) and `npx tsx scripts/margin-report.mts`. If there is no read-only DB path from the cloud, use the Supabase connector's `execute_sql` (selects only) with the queries in §6. If neither works, say so in the digest and notify: the run cannot see money.
2. **Fan out** (one subagent each, briefed with the numbers and what is ruled out; they report, they don't merge):

| Subagent            | Job                                                                                                                                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cost analyst**    | Tokens and metered units per video vs. dollars: Anthropic tokens per script, images, video seconds, ElevenLabs characters, render. Finds the biggest line and the waste (retries, failed jobs, over-long scripts, unused scenes).                                                                           |
| **Vendor scout**    | Cheaper or better providers per slot (image, video, voice, script, hosting, email). Fresh web research each run with dated sources; direct provider pricing pages first, aggregators second. Output: a table of candidates with price per unit, quality notes, API fit with our adapter contract, and risk. |
| **Revenue analyst** | MRR by plan, ARPU, trial → paid, churn, top-up share, credit breakage (credits sold but never burned), price tests, annual plans, upsell paths, win-back and abandoned-checkout flows.                                                                                                                      |
| **Platform cost**   | Vercel, Supabase, Sentry, Resend, domains, Stripe fees (including Stripe Tax, FX, payment-method mix): plan fit, idle spend, overage risk, free-tier headroom.                                                                                                                                              |
| **Implementer**     | Turns one approved-by-the-rules finding into a PR: adapter, catalog row, config change, report or test. Runs format, lint, typecheck and tests before pushing.                                                                                                                                              |
| **Reviewer**        | Reads the diff cold. Margin gate, tests, no secrets, no live calls from CI.                                                                                                                                                                                                                                 |

3. **Decide the day's one PR** by cash return: biggest verified saving or revenue gain per hour of work, risk last. Small, reversible, behind the margin gate.
4. **Update** this file (§5 baseline, §7 ledger) and `TheMasterPlan.md` §7/§10 when pricing or costs change. Report a digest; push a notification only per the charter.

### Rules

- **Measured beats researched.** A price from a web page is a hypothesis. Switch a provider in the catalog only with a measured smoke run (`scripts/live-providers-smoke.mts`) and the margin gate passing. Record the measurement in §5.
- **Never degrade the product silently.** A cheaper model that makes visibly worse videos is a product decision: put a before/after sample and the saving in the PR and let the owner choose. Keep the old adapter registered so the swap is one catalog row.
- **Cost savings that need a customer-visible price change** (credits, plan price, limits) are proposals with numbers, never merged defaults.
- **Fail closed.** The margin gate stays the last line of defence; never loosen `TARGET_MARGIN_MULTIPLE` to make a number pass.
- **No spending.** The routine never buys, upgrades or starts a paid plan anywhere and never calls a paid API in CI. Free-tier or sandbox calls need the owner's key and OK.
- **Cite sources** with dates; flag anything older than 30 days as stale.

---

## 3. Savings and revenue backlog (ranked by expected cash return; the routine re-ranks every run)

**Cost**

- [ ] **F1. Measure real cost per video.** Run the live smoke with `FAL_KEY` and record per-step spend in §5. Everything below depends on it. _Needs owner: a funded fal key in the cloud environment._
- [ ] **F2. Premium video: cheaper provider or model.** Evaluate, per second of 720p–1080p image-to-video: Kling 2.5 Turbo (current, via fal), Kling direct API, Wan 2.x, LTX-2, Seedance, Hailuo, Veo Fast, and hosts that resell them (Replicate, Runware, WaveSpeed, Novita, Together). Also the **hero-shot** variant (one AI clip, the rest Ken Burns) already modelled in `TheMasterPlan.md` §7.
- [ ] **F3. Images:** FLUX schnell is $0.003 per megapixel on fal. Compare Runware, Together, Replicate and self-host options; check whether a smaller size or fewer scenes holds quality. Image cost is likely small: confirm before spending effort.
- [ ] **F4. Voice:** ElevenLabs is likely the largest non-video line at scale. Compare per-character cost and quality of OpenAI TTS, Cartesia, Google, Azure and open models; add caching of repeated voice previews; check plan fit (custom-voice slots, included characters).
- [ ] **F5. Script:** Claude cost per script. Prompt caching on the fixed system prompt, a smaller model for the first draft, and output length caps; compare tokens in and out per video with the measured `anthropic-script` usage.
- [ ] **F6. Waste:** failed or abandoned jobs that still metered spend, scenes generated but cut, retries, regenerations. Add per-step cost to `render_jobs` if `api_cost_usd` alone can't show where money goes (migration: owner-applied).
- [ ] **F7. Platform:** Vercel function duration and cron cost, Supabase plan and egress for stored MP4s (retention policy, lower-bitrate renders), Resend volume, Sentry quota.
- [ ] **F8. Payments:** Stripe fee mix, annual billing to cut fixed fees per euro, failed-payment recovery (smart retries and dunning emails).

**Revenue**

- [ ] **R1. Annual plans** (cash up front, lower churn): add yearly prices with a discount that keeps the 3x gate. The catalog already has `stripePriceIdYearly`.
- [ ] **R2. Trial → paid:** the trial burns up to ~$0.25 per signup. Measure conversion with `scripts/metrics-report.mts`; tune trial credits, the watermark, the post-trial paywall copy and the lifecycle emails against it.
- [ ] **R3. Credit breakage and top-ups:** how many credits expire unused, and who runs out first. Top-up nudges at 80% burn; a larger pack for heavy users.
- [ ] **R4. Pricing experiments:** price points and credit sizes against the measured margin, not the worst case. Premium at a price that reflects its real cost (hero-shot).
- [ ] **R5. Affiliates and referrals** priced against CAC (30% recurring is in the plan); only worth it once signup → paid is measured.
- [ ] **R6. Churn:** cancel-flow offer (pause, downgrade, one month off) behind the Stripe portal.

**Tools that would sharpen this job:** see §4.

---

## 4. What the routine needs from the owner (ask once, then it's configured)

The routine can't see money it has no access to. Items marked ★ unblock the most.

| Need                                                                                                              | Why                                                                                         | How                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★ **Supabase connector working** in the routine's environment                                                     | Read-only selects on `subscriptions`, `render_jobs`, `credit_transactions` for MRR and cost | The connector failed to connect from the cloud on 2026-10-20 (`ERR_PROXY_TUNNEL`): reconnect it in claude.ai settings → Connectors, and allow `mcp.supabase.com` in the environment's network policy |
| ★ **Stripe connector authorised** (live mode, **read-only**; sandbox is test data only)                           | Real MRR, churn, refunds, fees, failed payments, payout timing. Sigma gives revenue SQL     | claude.ai connector settings → Stripe → authorise; restricted key with read scope for live                                                                                                           |
| ★ **A funded `FAL_KEY` + `ANTHROPIC_API_KEY` + `ELEVENLABS_API_KEY` in a _separate_, capped finance environment** | Measured smoke runs per slot; spend caps keep the experiment bounded                        | Routine environment variables (not the repo). Put a hard monthly cap on each provider dashboard                                                                                                      |
| **Vercel connector**                                                                                              | Plan, usage, billing charges (`list_billing_charges`), function duration, cron cost         | claude.ai connector settings → Vercel (the tools are present in the session)                                                                                                                         |
| **Fixed monthly costs** the code can't see                                                                        | Needed for true MRR coverage (`FIXED_COSTS_USD` in the report)                              | Paste into §5: Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, any tool seat                                                                                                              |
| **Provider invoices** (last 2 months of fal, ElevenLabs, Anthropic usage CSVs)                                    | Compare the metered `api_cost_usd` to what was actually billed: finds under-metering        | Drop into a private place the routine can read, or paste the totals into §5                                                                                                                          |
| **Analytics:** PostHog or Vercel Web Analytics connector                                                          | Visitor → signup → paid funnel; CAC by channel                                              | Connector or a read-only API key                                                                                                                                                                     |
| **Sentry** (read)                                                                                                 | Failed renders by cause, to size the waste                                                  | Connector or read-only token                                                                                                                                                                         |

**Connectors, plugins and tools worth adding** (suggest-only; the owner installs): Stripe (live read-only), Supabase, Vercel (billing and usage), PostHog or Vercel Analytics, Sentry, a Google Sheets or Notion connector for the cost ledger and invoices, and a web-research tool for current provider pricing (the routine already has WebSearch/WebFetch; direct provider pages were blocked from the cloud network before, so allow `fal.ai`, `replicate.com`, `elevenlabs.io`, `anthropic.com`, `runware.ai`, `together.ai` in the network policy).

---

## 5. Baseline (measured numbers; the routine overwrites with each measured run)

| Item                        | Value                                   | Source / date                               |
| --------------------------- | --------------------------------------- | ------------------------------------------- |
| MRR, subscribers, ARPU      | _not measured: app live, no read path_  | `finance-report.mts` (first run fills this) |
| Cost per 15s Standard video | ~$0.07 _(researched, not measured)_     | `TheMasterPlan.md` §7, 2026-10-04           |
| Cost per 15s Premium video  | ~$1.10 Kling 2.5 via fal _(list price)_ | `TheMasterPlan.md` §7, 2026-10-08           |
| Margin gate                 | passes: Pro 3.00x, Ultra 3.23x          | `margin-report.mts`, 2026-10-05             |
| Trial burn                  | $0.14–0.25 per signup                   | `TheMasterPlan.md` §7                       |
| Fixed monthly costs         | _unknown: owner to fill in_             | §4                                          |
| Stripe                      | sandbox only until live activation      | `TheMasterPlan.md` §9                       |

---

## 6. Read-only queries (for the Supabase connector when the script can't run)

```sql
-- Live subscribers by plan
select plan_id, count(*) from subscriptions
where status in ('active','trialing','past_due') group by plan_id;

-- 30-day measured cost and credits by tier
select model_tier, count(*) filter (where status='done') as videos,
       count(*) filter (where status='failed') as failed,
       sum(api_cost_usd) as api_cost_usd, sum(actual_credits) as credits
from render_jobs where created_at > now() - interval '30 days' group by model_tier;

-- Top-ups bought in 30 days
select delta as credits, count(*) from credit_transactions
where reason='topup' and created_at > now() - interval '30 days' group by delta;
```

---

## 7. Ledger (newest on top; every finance change lands a line)

- **2026-10-20** — Finance track created: charter, subagent roster, backlog, owner asks. Added `features/finance/unit-economics.ts` (pure MRR, net MRR, ARPU, 30-day cost per video and per 1k credits by tier, flags) with 4 tests, and the read-only `scripts/finance-report.mts`. No dependency, no migration, no runtime change. (interactive)

---

## 8. Routine prompt (paste into claude.ai/code/routines → New routine; repo `TudorFnsn/Shortcraft`, Opus 5.5, 12:00 UTC daily)

```
You are the Shortcraft Finance CEO, the master agent of the finance track.
Read FinancePlan.md (charter, rules, backlog, baseline) and TheMasterPlan.md first;
they are the source of truth. Goal: maximum profit, cash return first. Check the MRR
ratio every run.

1. Measure: run `npm ci` then `npx tsx scripts/finance-report.mts --json` and
   `npx tsx scripts/margin-report.mts`. If the database is unreachable, use the
   Supabase connector for the read-only queries in FinancePlan.md section 6, and the
   Stripe connector (read-only) for live revenue. If you cannot see money, say so and notify.
2. List open and recently closed PRs; skip anything already in review.
3. Fan out subagents in parallel (cost analyst, vendor scout, revenue analyst, platform
   cost), each briefed with the numbers. Vendor scout does fresh dated web research:
   cheaper and better image, video, voice, script and hosting options than fal.ai,
   ElevenLabs and the current stack, priced per unit against our adapter contract.
   Compare tokens and metered units per video with dollars spent, and every other
   payment (Vercel, Supabase, Stripe fees, Resend, Sentry, tools).
4. Pick the single highest cash-return item that is safe, and have an implementer
   subagent ship it as a PR on branch ceo-finance/<slug>, with a reviewer subagent
   reading the diff cold. Run format:check, lint, typecheck, test before pushing.
   Update FinancePlan.md (baseline, ledger) and TheMasterPlan.md when pricing/costs change.
5. Rules: PR-gated, never merge; never touch live secrets; no writes to Stripe or
   Supabase without the owner's OK; no paid plans or purchases; measured beats
   researched; never loosen the margin gate; price or quality changes are proposals.
6. Notify (PushNotification, inside <routine_summary>) only when: MRR coverage is below
   target, spend exceeds revenue, a provider switch saves real money, a cost spike, or
   something blocks you (a connector or key you need). Lead with the one thing that
   matters. Otherwise stay silent.
7. Also end every run by listing any connector, key or information you were missing,
   and suggest the Claude tools, connectors or add-ons that would help you do this
   better; put new asks in FinancePlan.md section 4.
```
