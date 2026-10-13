# FinancePlan — Shortcraft unit economics and cash

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file wins on pricing
> math, vendor cost and cash. Every finance PR updates this file (baseline + changelog) in the same change.
>
> Last updated: 2026-10-13 (set up interactively; first baseline below)

---

## 1. Charter (proposed 2026-10-13, Tudor confirms or edits)

| Question  | Answer                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Maximise **cash return**: net revenue minus every cost, per month. MRR growth only counts when contribution margin stays at or above the gate.                      |
| Steering  | **MRR**, **contribution margin per plan**, **API cost per finished video**, **credits sold vs credits burned (breakage)**, **trial burn per signup**, **runway**.    |
| Autonomy  | Same as the other routines: **PR-gated**. Branches `ceo-finance/<slug>`. Never merges. Read-only on live money. Any Stripe write, price change or live-mode action needs Tudor's explicit OK first. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO at 06:00). Proposed; weekly is enough until there are real paying users.             |
| Files     | May change `src/config/models.ts`, `src/config/plans.ts`, `src/features/billing/margin.ts`, `src/features/providers/**`, `scripts/**`, tests, this file and the money lines of `TheMasterPlan.md`. Never touches UI files while a `ceo-design/*` PR is open, migrations without Tudor's OK, or secrets. |
| Bar       | `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, **and** `npx tsx scripts/margin-report.mts` still passes the 3x gate. |

---

## 2. Data sources (what the routine reads)

| Source                         | Access today (2026-10-13)                                                                 | Gives                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Supabase `ShortCraft` (`iqvrovjwoavvmhaithwn`) | Connector works, `execute_sql` read-only                                  | Jobs, `api_cost_usd`, credits charged, subscriptions, signups                        |
| Stripe sandbox `acct_1UKkSC0LHtTQ4zpU`         | Connector works for API reads. **Sigma is not enabled**, so no MRR/churn templates. **Test mode only.** | Subscriptions, invoices, prices. MRR is computed by hand from active subscriptions |
| Vercel team `tudorfnsns-projects`              | Connector works; `list_billing_charges` returned 404 (no billing data yet, free plan) | Hosting + function cost once the team is on a paid plan                  |
| GitHub `tudorfnsn/shortcraft`  | Works                                                                                     | PRs, CI                                                                               |
| fal.ai, ElevenLabs, Anthropic  | **No connector.** Costs come from `render_jobs.api_cost_usd` (our own metering)           | Invoice totals are the truth; see §7 for what Tudor can paste in                      |
| Sentry                         | No connector                                                                              | Error rate (failed renders refund credits, so they cost money)                        |

**MRR query (until Sigma or live mode):** sum `price.unit_amount` of subscriptions with `status in (active, trialing)`, normalised to EUR monthly (yearly ÷ 12), and ignore subscriptions whose metadata has `foo: bar` (API-test noise in the sandbox).

**Cost per video query:**

```sql
select model_tier, count(*) videos,
       round(avg(api_cost_usd)::numeric,4) avg_api_usd,
       round(avg(target_duration_sec)) avg_sec,
       round(avg(nullif(charged_credits,0))) avg_credits
from render_jobs where status='done' and api_cost_usd is not null
group by 1;
```

---

## 3. Baseline (measured 2026-10-13, sandbox, test mode)

**This is test data: 6 profiles, 2 Pro subscriptions. Treat it as unit-cost evidence, not revenue.**

| Metric                          | Value                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| MRR (sandbox, real app subs)    | **€59.98** = 2 × Pro €29.99. Two extra USD $15 subscriptions in Stripe are API-test noise.     |
| Standard 15s video, measured    | **$0.037** API cost (5 runs after repricing: $0.036–0.066). Catalog assumed $0.07–0.09.          |
| Standard 30s video, measured    | **$0.049** (1 run)                                                                              |
| Premium 30s video, measured     | **$1.92** (2 runs, ≈ **$0.064 per second**). Catalog worst case assumes $0.12/s.                |
| Credits charged                 | Standard 15s ≈ 1,760 cr; Premium 30s ≈ 42,600 cr                                                |
| Revenue per credit (Pro)        | €29.99 / 100,000 = **€0.0003**. Standard 15s earns ≈ €0.53 for $0.037 cost (**≈ 13x**).         |
| Premium 30s earns               | ≈ €12.80 for $1.92 cost (**≈ 6x**), but it burns **43% of a Pro month** in one video.            |
| Failed jobs                     | 3 of 13 (all Standard, $0 cost, refunded)                                                       |
| Fixed costs                     | Not measured yet (Vercel, Supabase plan, Sentry, domain, Resend). **Tudor to supply, see §7.**  |

**What this says**

1. **The margin gate is conservative.** Measured costs are about half the catalog's worst case, so the 3x gate has real slack, mostly on Premium.
2. **Standard is almost pure margin** at $0.037/video. The risk there is not API cost; it is acquisition (trial burn) and fixed costs.
3. **Premium is the only variable cost that matters**, and it is where the fal.ai bill lives.
4. **Nothing here proves revenue.** Everything is sandbox. The first real number is live-mode MRR.

---

## 4. Vendor review: is fal.ai too expensive?

Research 2026-10-13 (aggregator pages from Sep 2026; they disagree by up to 2x, so **verify on a real call before switching**; the master plan already warns about this).

| Slot            | Today                                           | Cheaper or better candidates                                                                                          | Verdict                                                                                   |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Premium video   | fal Kling 2.5 Turbo Pro, **$0.064/s measured**  | Wan 3.0 720p ≈ $0.10/s on fal; LTX-2.3 ≈ $0.04–0.08/s; Atlas Cloud budget tiers ≈ $0.025–0.05/s; Seedance 2.0 direct (BytePlus) ≈ $0.15/s vs ≈ $0.30 on fal | Kling 2.5 Turbo is already among the cheapest *good* models. Switching vendors saves less than changing **how much** video we generate (below). |
| Standard image  | fal FLUX schnell, $0.003/image                  | Already near the floor                                                                                                | Keep.                                                                                     |
| Voice           | ElevenLabs Flash, $0.05/1k chars (≈ $0.00075/s) | Resellers quote ≈ $0.048/1k (not worth the risk). Other TTS vendors not priced yet                                    | Keep; it is under 2% of a video's cost. Only revisit if word timings can be had elsewhere. |
| Script          | Claude Sonnet 5.5, ≈ $0.04/video                | Haiku-class model for the script                                                                                      | Test quality on 20 scripts; saves maybe $0.03/video. Low priority.                         |
| Direct vs fal   | fal marks up some models (Seedance ≈ 2x BytePlus) | Call the model's owner directly (BytePlus, Kuaishou, Alibaba) or a cheaper host (WaveSpeed, Replicate for some)       | Worth a 1-day spike **only for Premium**, behind the existing `FAL_VIDEO_MODEL`-style adapter seam. |

**The real levers, in order of cash impact**

1. **Hybrid Premium.** Animate only the hook scene and the payoff scene with AI video; use Ken Burns on the rest. Premium cost falls roughly 50–65% for a similar perceived quality. One adapter change, no pricing change for customers.
2. **Stop paying for unused seconds.** Kling bills fixed 5-second clips; a 3-second scene wastes 2. Align scene lengths to 5s multiples for Premium scripts.
3. **Re-price Premium on measured cost.** At $0.064/s the 1,420 cr/s rate leaves ≈ 6x margin where 3x is the gate. Either lower the credit rate (more conversions to Pro) or keep it and treat the slack as acquisition budget. Decide with data, not now.
4. **Annual plans.** Yearly prepay (2 months free) moves cash forward and cuts churn; Stripe prices already have a yearly slot (`stripePriceIdYearly`).
5. **Credit breakage and top-ups.** Credits that expire or go unused are pure margin; the lifecycle email already nudges unused credits. Track the breakage rate before changing expiry rules.
6. **Cheaper trial.** Trial burn is already ≈ $0.04 (one Standard video). Keep it; it is the best-value acquisition spend.

---

## 5. Roadmap (top unchecked item that has no open `ceo-finance/*` PR)

- [ ] **F0 Unit-economics report.** `scripts/unit-economics.mts` + pure helper in `src/features/metrics/`: per tier cost per video vs credits charged vs revenue per credit, breakage, trial burn, MRR from `subscriptions` joined to plan prices. Read-only, no migration. Prints the §3 table.
- [ ] **F1 Margin gate on measured cost.** Feed measured averages into `margin.ts` as a second report (catalog worst case stays the gate). Flag when measured and catalog differ by more than 30%.
- [ ] **F2 Hybrid Premium spike.** Ken Burns for non-key scenes, AI clips for hook and payoff. Behind a flag; needs one paid live run by Tudor to confirm quality.
- [ ] **F3 5-second clip alignment** in the Premium script prompt and `fitScenesToBudget`.
- [ ] **F4 Annual plan.** Yearly Stripe prices + pricing toggle. Needs Tudor's OK for any Stripe write.
- [ ] **F5 Vendor bake-off for Premium video.** Same 5 prompts through Kling 2.5, Wan 3.0, LTX-2.3 and one direct-API model; cost per usable second. Needs paid runs by Tudor.
- [ ] **F6 Breakage and expiry study** once there is real usage.
- [ ] **F7 Fixed-cost ledger** (`docs/finance/fixed-costs.md`) once Tudor supplies invoices (§7).

---

## 6. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md`, this file, `git log -20`, open and recent PRs (list them; an item with an open PR is in review, not available).
- **One item per run.** If nothing in §5 is available, refresh §3 with new numbers and stop.
- **Measure before proposing.** Cite the query and the date for every number. Mark anything researched but not measured as such.
- **Never** change a customer-facing price, create or edit a Stripe object, run a migration or switch live providers without Tudor's explicit OK in the session or this file.
- **Notify Tudor** (push notification) when: measured margin on any plan drops under 3x; a cost per video moves more than 30% week over week; MRR changes by more than 10%; a connector or secret the job needs is missing; or a decision is waiting on him. Stay silent when nothing changed.
- **Output:** a digest with MRR, cost per video by tier, margin multiple by plan, what changed, what is waiting on Tudor, and the next item.

### Sub-agent split (master agent = "CFO")

The CFO reads the plan, picks the item and fans out. Run independent agents in parallel, then merge.

| Agent                | Job                                                                                          | Tools                                  |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Revenue analyst**  | MRR, plan mix, trial → paid, churn, failed payments from Stripe + `subscriptions`            | Stripe connector, Supabase `execute_sql` |
| **Cost analyst**     | Cost per video by tier, per-step cost, failed-job cost, measured vs catalog                  | Supabase `execute_sql`, `margin-report` |
| **Vendor scout**     | Current prices and quality of video/image/voice/script options; bake-off plan                | WebSearch, WebFetch                    |
| **Infra analyst**    | Vercel, Supabase, Sentry, Resend spend and plan limits                                       | Vercel + Supabase connectors, `get_advisors` |
| **Builder**          | Implements the chosen §5 item on `ceo-finance/<slug>`, tests, opens the PR                   | Repo tools, GitHub                     |
| **Reviewer**         | Reads the Builder's diff cold against the margin gate and the "never" list                   | Repo tools                             |

---

## 7. What Tudor needs to give the routine (access checklist)

1. **Go live in Stripe** (or connect the live account) so MRR is real. Until then every revenue number is sandbox.
2. **Stripe Sigma** (optional, paid) for MRR/churn templates. Without it the routine computes MRR from subscriptions, which is fine at this size.
3. **Invoices or monthly totals** for fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, Sentry and the domain. Paste them into `docs/finance/fixed-costs.md` (F7), or create **read-only** dashboards/keys and tell the routine where they live. fal.ai and ElevenLabs have usage endpoints that a read-only key can query.
4. **Vercel plan** (Hobby or Pro). The Hobby plan forbids commercial use; Pro is $20/seat. This is the first fixed cost to count.
5. **Network allowlist** for the routine environment: `fal.ai`, `api.elevenlabs.io`, `api.anthropic.com`, `wavespeed.ai`, `replicate.com`, provider pricing pages. The master plan notes that pricing pages were blocked from routines, which is why prices disagree.
6. **Supabase MCP in routines:** the `.mcp.json` server failed to connect from the cloud (`ERR_PROXY_TUNNEL`), but the claude.ai **Supabase connector** works. Keep using the connector.

**Suggested connectors and tools**

| Add                                                | Why                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stripe live-mode account + Sigma                   | Real MRR, churn, cohorts, disputes                                                  |
| PostHog                                            | Trial → paid funnel and pricing-page conversion (already planned in the master plan) |
| Sentry                                             | Failed renders cost money (refunds); ties error rate to margin                      |
| Google Sheets / Drive (optional)                   | Owner-maintained fixed-cost ledger the routine can read                              |
| Slack or email connector (optional)                | Weekly CFO digest outside the session; push notifications already reach the phone    |
| Claude `schedule` / routines                       | Runs the CFO daily; create it with the prompt in `docs/routines/finance-cfo.md`      |

---

## 8. Links

- Master plan: `TheMasterPlan.md` (§7 Monetization, §9 Ops runbook)
- Margin gate: `src/features/billing/margin.ts`, `scripts/margin-report.mts`
- Model catalog (what we pay and charge): `src/config/models.ts`
- Plans and prices: `src/config/plans.ts`
- Routine prompt: `docs/routines/finance-cfo.md`

---

## 9. Changelog

- **2026-10-13** — Finance track created (interactive, from Tudor's request). First baseline from live Supabase + sandbox Stripe: Standard 15s costs **$0.037** (catalog said $0.07–0.09), Premium costs **≈ $0.064/s** (catalog worst case $0.12/s), sandbox MRR €59.98. Vendor review says Kling 2.5 Turbo on fal is not overpriced for its quality; the bigger savings are hybrid Premium and 5-second clip alignment. No code changed.
