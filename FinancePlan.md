# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt in `docs/routines/finance-cfo.md`). `TheMasterPlan.md` §7 keeps the
> pricing history and decisions; this file holds the live numbers, the cost-cutting
> backlog and the rules for the routine.
>
> Last updated: 2026-10-18 (created)

---

## 1. Charter

**Goal:** maximise cash return. In order: (1) never sell a video below cost, (2) lower
cost per finished video, (3) raise MRR and ARPU, (4) cut fixed spend, (5) shorten
time-to-cash (annual plans, fewer refunds, fewer failed renders).

**Every run starts with the same four numbers**, from `npx tsx scripts/finance-report.mts --json`
(read-only) and, once connected, Stripe:

| Number                            | Source                                             | Why                                    |
| --------------------------------- | -------------------------------------------------- | -------------------------------------- |
| MRR, ARPU, subscribers, plan mix  | `subscriptions` × `config/plans.ts` (Stripe later) | the revenue side                       |
| Cost per finished video, by tier  | `render_jobs.api_cost_usd`                         | the variable-cost side                 |
| Margin per plan vs the 3x gate    | `npx tsx scripts/margin-report.mts`                | fails closed before live mode          |
| Profit and break-even subscribers | report + `config/fixed-costs.ts`                   | fixed costs are owner-supplied (below) |

Report **MRR ratios**, not only MRR: variable cost ÷ MRR, net MRR ÷ MRR (VAT + fees),
trial burn ÷ new MRR, share of MRR on Pro/Ultra, and MRR growth week over week.

## 2. Known data gaps (the routine closes these, in this order)

1. **Fixed costs are unknown.** `src/config/fixed-costs.ts` lists each line as `null`.
   The report prints them as "MISSING" and counts them as 0, so **profit is overstated
   until the owner fills them in.**
2. **`api_cost_usd` is list price × usage, not invoices** (TheMasterPlan §10, 2026-10-09).
   Reconcile against the real fal.ai, ElevenLabs and Anthropic invoices monthly; the
   difference is the model's error.
3. **No per-step cost or token ledger.** One number per job hides which step is expensive
   (script tokens vs images vs clips vs voice vs render). Proposal F1 below adds a
   `provider_usage` table (job, step, provider, model, units, input/output tokens, cost).
   Until then "tokens per video" can only be read from the script step's `costUsd`.
4. **MRR is list-price MRR.** Coupons, yearly billing, tax and refunds are not in our DB.
   Stripe (Sigma) is the truth; the connector is test-mode only today.
5. **No real-money traffic yet** (Stripe sandbox). Until live, ratios describe the
   model, not customers. Say so in every digest.

## 3. Roadmap (top unchecked item that is not in an open `ceo-finance/*` PR)

- [ ] **F1 Cost ledger.** Migration `provider_usage` (owner applies) + write one row per
      provider call from the orchestrator; extend `finance-report` with cost and tokens
      per step and per video. Additive, no behaviour change.
- [ ] **F2 Prompt caching + right-size the script model.** The script call is the only
      token-priced step. Check cache hits, `max_tokens`, and whether Haiku-class output
      passes the same schema at a lower price; keep Sonnet where quality drops. Measure
      on 20 scripts before switching, behind an env flag.
- [ ] **F3 Premium video cost.** fal.ai Kling clips are the largest line (≈$1.1–1.9 per
      premium video). Benchmark, on the same 5 prompts, with the per-second price and a
      quality score: current Kling 2.5 Turbo, LTX-2 Fast, Wan 2.5, Seedance, Hailuo, plus
      direct provider APIs and other hosts (Replicate, Runware, WaveSpeed, Novita). Ship the
      winner behind `FAL_VIDEO_MODEL`-style config; keep the adapter contract.
      The **hero-shot** variant (AI on scene 1 only) is the biggest lever per TheMasterPlan §7.
- [ ] **F4 Images.** FLUX schnell is already $0.003/MP. Compare Runware and self-hosted
      options only if image spend becomes >10% of cost per video.
- [ ] **F5 Voice.** ElevenLabs Flash at $0.05/1k chars plus custom-voice slots is a fixed
      cost that scales with plan. Compare Cartesia, OpenAI TTS, Google, and ElevenLabs'
      annual/enterprise pricing; keep word timings (subtitles need them).
- [ ] **F6 Hosting and storage.** Move media to Cloudflare R2 (no egress; in TheMasterPlan
      Phase 2), add a retention rule (delete renders after N days unless downloaded), check
      Vercel function duration and Supabase compute add-ons.
- [ ] **F7 Pricing and packaging.** Annual plan (−17%, cash up front), top-up bundle
      pricing, trial size (3,000 credits costs ≈$0.25), credit expiry, Pro/Ultra feature
      fences, upgrade prompts at 80% credit use. Every change passes the margin gate and
      goes to the owner as a decision, never straight to Stripe.
- [ ] **F8 Retention and churn.** Cancel-flow save offers (pause, downgrade), dunning
      emails for `past_due`, win-back sequence in `features/email`. Churn needs Stripe data.
- [ ] **F9 Fraud and abuse.** Trial farming (multiple signups), card testing, chargebacks.
      Cost per trial vs trial-to-paid decides how generous the trial can be.
- [ ] **F10 Weekly digest.** Finance numbers appended to the owner's weekly digest, with the
      month-over-month trend and the single decision the owner needs to make.

## 4. Rules for the Finance CFO routine

- **Master agent + workers.** One run = the master reads this file, `TheMasterPlan.md` §7,
  `git log -20` and open/recent PRs, runs the report, then **splits the work** across
  subagents in parallel (see `docs/routines/finance-cfo.md`). The master picks, merges and
  writes; workers research and measure, they do not edit shared files.
- **PR-gated autonomy** like the other routines. Branches `ceo-finance/*`. Never merge.
  List open + recently closed PRs before picking an item.
- **No live money.** Never create or change Stripe prices, coupons, refunds, subscriptions
  or live-mode objects; never apply migrations; never touch live secrets or spend on paid
  provider calls. Propose them as a decision with the numbers; Tudor approves.
- **Read-only data access** to Supabase, Stripe (test), Vercel billing/usage and GitHub.
  If a connector fails, say so in the digest instead of guessing.
- **Every saving claim carries a number, a source and a date.** Vendor prices change
  weekly. Quote the page, the unit and the retrieval date; if a page was blocked, say the
  figure is from a snippet and mark it **unverified**. Do not switch a provider on list
  price alone: measure cost **and** quality on the same prompts.
- **The margin gate stays the floor.** A change that drops any product below 3x does not
  ship. A change that raises a price needs the Terms/Refunds text checked first.
- **Respect the other tracks.** Do not edit UI files while a `ceo-design/*` PR is open
  (see DesignPlan §5). Money-facing copy changes go through the owner.
- **Keep this file current:** tick items, refresh §1 numbers, append to §6.

## 5. Owner inputs needed (ask once, then it lives in the repo)

1. Fill `src/config/fixed-costs.ts` (monthly USD for each line; `0` if free).
2. Authorise the **Stripe** connector (claude.ai connector settings) and, when ready,
   live mode read-only (restricted key with read access).
3. Run `npx tsx scripts/finance-report.mts` weekly until the routine can read the DB, or
   re-authenticate the **Supabase** connector for the routine's environment (it failed to
   connect from the cloud session on 2026-10-18 with a proxy tunnel error).
4. Add invoices monthly (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase) as numbers in §6,
   or add the **Vercel** connector for billing and usage.
5. Confirm the **currency assumption** (EUR prices, USD costs, `usdPerEur` = 1.08).
6. Pick an **annual price** and a **target gross margin** (the gate uses 3x revenue ÷ cost).

## 6. Log (newest on top)

- **2026-10-18** — Track created: this plan, the routine prompt, `scripts/finance-report.mts`
  (MRR, cost per finished video by tier, margin, break-even; read-only), the pure
  `features/finance/unit-economics.ts` with 5 tests, and `config/fixed-costs.ts` (all
  `null` until the owner fills them). No live data was read: the Supabase connector failed
  to connect from the cloud session. (Finance CFO, setup)
