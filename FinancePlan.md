# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on cost, pricing, vendors and cash. Every finance PR updates this
> file (numbers, decisions, changelog) in the same change.
>
> Last updated: 2026-10-16 (track created)

---

## 1. Charter

**Goal: maximum cash return.** Grow MRR, cut cost per delivered video, never ship a
product that loses money at full burn. Cash beats elegance: when two options tie,
pick the one that returns cash sooner.

| Question   | Answer                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy   | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe, prices in Stripe, or vendor accounts. |
| Cadence    | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design CEO at 09:00). Weekly deep run on Mondays.                       |
| Owns       | `src/config/models.ts` cost figures, `src/config/plans.ts` prices/grants, provider adapters in `src/features/providers/live/`, `scripts/*report*`, this file.   |
| Leaves     | UI files while a `ceo-design/*` PR is open (see `DesignPlan.md` §5). Product roadmap items belong to the main CEO.                                              |
| Hard rules | The margin gate (`scripts/margin-report.mts`, 3x at full burn) must pass on every PR. A vendor swap ships only behind a flag with a measured A/B (§5).          |

### North-star for this track

1. **Contribution per month** = net MRR − realized API cost − fixed costs (`scripts/finance-report.mts`).
2. **Cost per delivered video** by tier (standard, premium), measured, not list price.
3. **Burn ratio** = (API cost + fixed) ÷ net MRR. Must stay well under 1; at launch it is what decides whether we can afford ads.
4. Support metrics: ARPU, trial burn per signup, failed-job spend, trial → paid, churn.

---

## 2. Operating model: DM master agent + specialist agents

The routine session is the **master agent**. It does not do the research itself. It
reads the numbers, decides what is worth money today, then fans out specialists
in parallel with the Agent tool (one message, several calls), each with a narrow
brief, and merges their findings into at most **one PR**.

| Agent                     | Owns                                                                                                                                                                     | Output                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Metrics analyst**       | MRR, net MRR, ARPU, churn, trial → paid, burn. Runs `finance-report.mts` + `metrics-report.mts`, Stripe/Supabase read-only.                                              | Table for §3 + one-paragraph reading.                                 |
| **Cost auditor**          | Realized vs assumed cost per step (script tokens, images, video, voice, render, hosting). Compares `api_cost_usd` and the Anthropic/fal/ElevenLabs usage to `models.ts`. | Cost-per-video breakdown, biggest line, drift vs catalog.             |
| **Vendor scout**          | Cheaper/better providers per slot (§5 watchlist). Live pricing from provider pages and docs.                                                                             | Ranked shortlist with $/unit, quality notes, risks, switching effort. |
| **Pricing strategist**    | Plan prices, credit grants, annual plan, top-up packs, free-trial burn, upsell, discounts.                                                                               | Proposed numbers, each run through `margin-report.mts`.               |
| **Growth-for-cash**       | Conversion and retention levers that raise MRR (paywall, annual billing, win-back, dunning, referral). Reads funnel numbers.                                             | 1–3 ideas with expected € impact and cost to build.                   |
| **Implementer**           | Turns the one chosen item into code + tests on `ceo-finance/<slug>`.                                                                                                     | The PR. Runs format, lint, typecheck, test, build; margin gate green. |
| **Reviewer** (fresh eyes) | Reads the diff cold for money bugs: double charges, cost under-metering, failing open.                                                                                   | Findings fixed before the PR is opened.                               |

Run order each day: **(1) master reads §3/§9 and lists open PRs → (2) Metrics analyst + Cost auditor in parallel → (3) Vendor scout, Pricing strategist, Growth-for-cash in parallel, briefed with (2)'s numbers → (4) master picks the single highest cash-return item → (5) Implementer → (6) Reviewer → (7) PR + digest.** If nothing beats "wait for data" (e.g. no paying users yet), the day's output is research and a §3 update, not code.

Priority rule (cash first): rank candidates by `expected € per month ÷ days to ship`, then discount by risk. Cost cuts that are measured and reversible beat price hikes; price hikes beat new features; new features only if they plausibly lift paid conversion.

---

## 3. Numbers (master agent refreshes every run)

| Metric                                 | Value                 | As of      | Source                            |
| -------------------------------------- | --------------------- | ---------- | --------------------------------- |
| MRR (gross, EUR)                       | _not read yet_        | —          | `finance-report.mts`              |
| Net MRR (USD)                          | —                     | —          | same                              |
| Paying subscribers (starter/pro/ultra) | —                     | —          | same                              |
| Realized cost / standard video         | —                     | —          | same (`render_jobs.api_cost_usd`) |
| Realized cost / premium video          | —                     | —          | same                              |
| Failed-job spend (30d)                 | —                     | —          | same                              |
| Fixed costs (USD / month)              | _owner to supply, §8_ | —          | invoices                          |
| Burn ratio                             | —                     | —          | same                              |
| Trial burn / signup                    | $0.14 (assumed)       | 2026-10-04 | `margin-report.mts`               |

Assumed catalog (from `models.ts`, **not yet measured**): script $0.04 · image $0.003 (FLUX schnell) / $0.025 (dev) · standard video $0 (Ken Burns, in-house ffmpeg) · premium video $0.12/scene-second (Kling 2.5 Turbo on fal.ai, ~$0.07/s list) · voice $0.00075/s (ElevenLabs Flash) · render $0.01. A 15s standard video ≈ $0.07; a 15s premium ≈ $1.10–1.80.

---

## 4. Cost map: where every dollar goes

Variable (per video): Anthropic script tokens · fal.ai images · fal.ai video (premium only) · ElevenLabs TTS (+ voice design) · in-house render compute on Vercel · Supabase Storage egress for MP4s.

Fixed / semi-fixed: Vercel plan · Supabase plan · ElevenLabs plan (custom-voice slots, §8 of the master plan) · Resend · Sentry · domain · Stripe fees (2.9%-class + fixed, in the margin math) · VAT (20% assumed).

Known leaks to check first:

1. **Premium video is ~95% of the cost** of any job that uses it (master plan §7). Hero-shot variant (AI clip on scene 1 only) is the biggest unshipped saver.
2. **Failed and refunded jobs still bill the provider.** Measure `failedCostUsd`; add cheap pre-checks before the expensive step.
3. **Free trial burn** (3,000 credits per signup) is paid acquisition cost; verify it against abuse (multi-account signups).
4. **Storage and egress** of finished MP4s grow forever; add retention or move to cheaper object storage if the bill shows it.
5. **Prompt tokens:** system prompt and scene schema are resent every script call; Anthropic prompt caching and a smaller model for scripting may cut the script line 50–80% (check quality first).

---

## 5. Vendor watchlist (research seeds, verify live before acting)

The Vendor scout re-prices these every Monday from the providers' own pages and records results in §10. Prices below are **unverified recollections to be checked**, not facts.

| Slot        | Today                      | Candidates to evaluate                                                                                                                 | What would make us switch                                      |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Image→video | fal.ai Kling 2.5 Turbo Pro | fal.ai LTX-2 Fast / Wan 2.5 / Seedance (cheaper per second); Replicate; Runware; Together/Novita; self-hosted Wan on RunPod/Modal GPUs | ≥40% lower $/s at comparable motion quality on 10 real prompts |
| Images      | fal.ai FLUX schnell/dev    | Runware, Replicate, Together FLUX, Recraft, self-hosted FLUX on Modal; fewer images per video; reuse across scenes                     | ≥30% cheaper at equal blind-rated quality                      |
| Voice       | ElevenLabs Flash           | Cartesia Sonic, OpenAI TTS, Google/Azure neural, Deepgram Aura; open-source Kokoro/F5 on a small GPU                                   | Word timestamps available and listener test not worse          |
| Script      | Claude Sonnet 5.5          | Claude Haiku 5.5 for scripting, prompt caching, batch API for non-urgent jobs                                                          | Same moderation pass-rate and hook quality on 50 saved topics  |
| Render      | in-house ffmpeg on Vercel  | Already ~$0.01; watch function duration/memory cost                                                                                    | Only if Vercel compute bill becomes a top-3 line               |
| Hosting     | Vercel Hobby→Pro, Supabase | Compare Pro seat cost vs Cloudflare/Fly for the render worker; Supabase egress vs R2/Bunny                                             | Monthly bill, not list price                                   |
| Payments    | Stripe                     | Stripe Tax vs Paddle/Lemon Squeezy (merchant of record removes VAT work; higher %): compare net per €                                  | Net margin after VAT handling cost, not headline fee           |

A switch is a **PR behind an env flag** with: the adapter, a cost/quality comparison in `scripts/` (like `live-providers-smoke.mts`), updated `costUsdPerUnit`, and a green margin gate. The owner flips the flag after looking at samples.

---

## 6. Monetization levers to evaluate (ranked by expected cash)

1. **Measure first**: wire `finance-report.mts` into every run; replace assumed costs with measured ones (blocks everything below).
2. **Hero-shot premium** (AI clip on the hook only): premium margin with a mass-market price.
3. **Annual plans** (2 months free): cash up front, lower churn. Needs Stripe yearly prices (`stripePriceIdYearly` already in the plan type).
4. **Trial tightening**: cap trial to one video, watermark, require verified email, block disposable domains; track burn per signup.
5. **Top-up packs and auto-recharge**: highest-margin revenue; nudge at low balance.
6. **Dunning and win-back**: failed-payment retries (Stripe Smart Retries), cancel-flow offer, lapsed-user emails (Resend lifecycle exists).
7. **Overage / pay-per-premium-video** instead of only credits for heavy users.
8. **Affiliate payouts at 30% recurring** (master plan §6) only if CAC math holds; track in the ledger.
9. **Price test** Starter/Pro with a Stripe price experiment once there are ≥100 visitors/week at `/pricing`.

---

## 7. Tools, connectors and add-ons that would help this routine

Already connected (claude.ai connectors): **Supabase** (read DB), **Stripe** (sandbox only so far), **Vercel**, **GitHub**.

| Wanted                                                | Why                                                                                         | Action for the owner                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Stripe live, restricted read-only key**             | Real MRR, churn, refunds, fees, payouts (Sigma). Today only sandbox.                        | Create a restricted key (read: customers, subscriptions, invoices, charges, balance) and connect the live account.                       |
| **Anthropic Usage & Cost Admin API key**              | Exact token spend per workspace/model, not estimates.                                       | Org admin key, read-only; store as routine env `ANTHROPIC_ADMIN_KEY`.                                                                    |
| **fal.ai usage/billing**                              | Per-model spend and request counts to compare with `api_cost_usd`.                          | Export usage CSV weekly to a private bucket, or give a read-only API key.                                                                |
| **ElevenLabs usage**                                  | Characters used, slot count, plan headroom.                                                 | Read-only key or weekly screenshot of Usage.                                                                                             |
| **Vercel billing** (connector exists)                 | Hosting/bandwidth/function bill (`list_billing_charges`).                                   | Ensure the routine's Vercel scope includes the team.                                                                                     |
| **Supabase billing/usage**                            | Storage, egress, DB size.                                                                   | Supabase connector is configured in `.mcp.json`; it failed to connect in the first run (proxy tunnel error), re-authenticate it.         |
| **Analytics (PostHog or Plausible)**                  | Visitor → signup → paid funnel, needed for ad/pricing decisions.                            | Add a connector or share a read-only API key.                                                                                            |
| **Bank / accounting (Qonto, Wise, Xero, QuickBooks)** | Complete "every other payment": domains, SaaS, ads, taxes.                                  | Optional read-only export; a monthly CSV of expenses works.                                                                              |
| **Web search / fetch**                                | Live vendor pricing.                                                                        | Already available to the routine; provider pages sometimes blocked from the cloud network, so the scout records the source URL and date. |
| **Claude Code plugins/skills**                        | `dataviz` for the weekly chart artifact; `anthropic-skills:xlsx` for the monthly P&L sheet. | Already installed; the routine publishes the weekly dashboard as an Artifact.                                                            |

---

## 8. Information the routine needs from the owner (ask once, record here)

Reply in the PR or edit this table; the routine reads it every run. Until filled, the routine uses the stated assumption.

| #   | Question                                                                                     | Answer | Assumption until answered             |
| --- | -------------------------------------------------------------------------------------------- | ------ | ------------------------------------- |
| 1   | Monthly fixed costs: Vercel, Supabase, ElevenLabs, Resend, Sentry, domain (USD each)         |        | 0 (burn ratio shows API cost only)    |
| 2   | Is Stripe live yet? If so, connect the live account read-only (§7)                           |        | Sandbox only → MRR is 0               |
| 3   | Current fal.ai, ElevenLabs and Anthropic plan/tier and any prepaid balance or discounts      |        | Pay-as-you-go list prices             |
| 4   | Paid acquisition budget per month and target CAC / payback period                            |        | €0 ads                                |
| 5   | Target gross margin (3x at full burn is the gate; what do you want realized?)                |        | 3x gate, 70% realized                 |
| 6   | Legal entity / VAT setup (OSS, Stripe Tax, or a merchant of record?)                         |        | 20% VAT included, Stripe Tax later    |
| 7   | OK to run A/B quality tests that spend up to $X per week on candidate providers?             |        | $10 per week max                      |
| 8   | OK to add annual plans and change price points (needs new Stripe prices, owner creates them) |        | Propose only, owner creates in Stripe |

---

## 9. The routine prompt (paste into claude.ai/code/routines → New routine)

Name **Shortcraft Finance CEO** · repo `TudorFnsn/Shortcraft` · model Opus 5.5 · daily 12:00 UTC · connectors Supabase, Stripe, Vercel, GitHub · notifications on.

```
You are the Finance CEO of Shortcraft, running as a scheduled routine with no one
watching. You are the DM master agent: you split the work to specialist subagents
(Agent tool, parallel where independent) and own the final decision.

Read first: FinancePlan.md (charter, numbers, agents, rules), TheMasterPlan.md §7
and §8, AGENTS.md. Do not skip AGENTS.md: this Next.js has breaking changes.

Goal: maximum cash return. Grow MRR, lower cost per delivered video, and keep the
margin gate green. Every run, in order:

1. List open and recently closed PRs (GitHub). An item with an open PR is in
   review: not available. Leave ceo-design/* UI files alone.
2. Get the numbers: `npx tsx scripts/finance-report.mts --json` and
   `npx tsx scripts/metrics-report.mts --json` (needs .env.local or the Supabase
   connector for read-only selects), Stripe analytics read-only, Vercel billing
   charges, Anthropic/fal/ElevenLabs usage if connected. Compare MRR, net MRR,
   cost per video by tier and failed-job spend to the assumed catalog in
   src/config/models.ts. Update FinancePlan.md §3.
3. Fan out the specialists from FinancePlan.md §2 (metrics analyst, cost auditor,
   vendor scout, pricing strategist, growth-for-cash). Brief each with the
   numbers, the goal, and the exact output wanted. Weekly (Mondays) the vendor
   scout re-prices the §5 watchlist from provider pages and searches for new
   cheaper models, techs and tools (e.g. cheaper image-to-video models than
   fal.ai Kling, batch/caching for Claude, open-source TTS).
4. Pick the ONE item with the best expected € per month ÷ days to ship. Cost
   cuts that are measured and reversible first. Implement it with tests on a
   branch ceo-finance/<slug>; every vendor swap is behind an env flag with a
   measured cost/quality comparison script. Run format:check, lint, typecheck,
   test, build and `npx tsx scripts/margin-report.mts`; the gate must pass.
   Have a fresh reviewer agent read the diff for money bugs before opening the PR.
5. Update FinancePlan.md (numbers, decisions, §10 changelog) and the master plan
   §9/§10 line in the same PR. Never merge. Never touch live secrets, live
   Stripe objects, Stripe prices, or vendor accounts; ask the owner instead.
6. If the numbers show a loss-making product, a cost spike, a failed gate, a
   payment failure wave, a missing connector, or you could not run at all, call
   PushNotification right away with <routine_summary> (lead sentence + detail).
   Also notify when a PR is ready or a decision/answer is needed from the owner
   (FinancePlan.md §8). Stay silent when nothing changed.
```

---

## 10. Changelog (newest on top)

- **2026-10-16** — Track created (Finance CEO, routine setup run). Added this plan, `features/metrics/finance.ts` (MRR, net MRR, ARPU, cost per video by tier, failed-job spend, burn ratio) with tests, and `scripts/finance-report.mts` (read-only). No migration, no dependency, no runtime change. Open: owner answers in §8; the cloud routine itself must be created from §9 because the setup session cannot create routines.

## 11. Decision log

- **Separate finance routine** (2026-10-16, owner) → money decisions need measured data and vendor research that would crowd the product CEO's one-slot-a-day; same PR-gated rules, different files.
