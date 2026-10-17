# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> `TheMasterPlan.md` §7 holds the current prices and the margin gate; this file holds the routine's charter, its agent team, its data needs and its backlog. Product and pricing decisions that change what customers pay stay with Tudor.

Last updated: 2026-10-17 (routine created; no live revenue data read yet).

---

## 1. Charter

**Goal:** maximise profit per month, in this order: (1) never sell a credit below cost, (2) cut unit cost per finished video, (3) raise revenue per paying user, (4) raise paid conversion and retention. Cash return beats polish.

**Rule of thumb for every proposal:** state the € per month it should move, the evidence behind the number, and how to measure it afterwards. No number, no proposal.

**What the routine does on every run**

1. Reads the money: MRR, ARR, active subscribers, ARPU, churn, new MRR, trial → paid, refunds, failed payments (Stripe), and the API cost actually spent (`render_jobs.api_cost_usd`, which the orchestrator meters per job).
2. Computes the unit economics: cost per finished video by model tier and length, credits charged vs dollars spent, gross margin per plan, per cohort and per user (find the heavy users who cost more than they pay), trial burn per signup.
3. Lists every recurring bill (see §4) and ranks them by € per month and by how much each could be cut.
4. Scans for cheaper or better tech (video, image, voice, script, render, hosting, payments) and prices each swap against the real call mix, not list prices alone.
5. Implements what is safe and small in a PR; proposes the rest to Tudor with numbers.
6. Updates this file and `TheMasterPlan.md` §7/§10, then reports a digest. It sends a push notification only when something needs Tudor (see §6).

**Autonomy: PR-gated, like the other routines.** It may open PRs on `ceo-finance/*` branches. It never merges, never touches live secrets, never writes to Stripe or the database (no price changes, no refunds, no migrations applied), and never switches a provider in production. Anything that changes what customers pay needs Tudor's explicit OK.

---

## 2. The agent team (DM master agent)

The routine's main agent is the **DM** (master). It reads this file, `TheMasterPlan.md` §7, the open and recent PRs and the latest numbers, decides which lanes matter today, and spawns only those as subagents **in parallel**, each with a narrow brief and a required output shape. The DM merges their reports, de-duplicates, ranks by €/month and picks at most one change to implement.

| Lane                  | Question it answers                                                                                      | Reads                                                                                                  | Output                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Revenue analyst**   | What is MRR, net new MRR, churn, ARPU, trial → paid, refunds, failed payments? Which plan mix is moving? | Stripe (read-only), `scripts/metrics-report.mts`                                                       | MRR table + 4-week trend + the one lever with the biggest €                         |
| **Cost accountant**   | What did we actually spend per video, per tier, per provider? Where does credit price ≠ cost?            | `render_jobs.api_cost_usd`, `credit_transactions`, `src/config/models.ts`, `scripts/margin-report.mts` | Cost per finished video, margin per plan/cohort, heavy users, margin-gate status    |
| **Fixed-cost auditor**| What do we pay every month regardless of usage, and is each line the right plan?                         | Vercel billing, Supabase, ElevenLabs, fal.ai, Anthropic, Resend, Sentry, domain, Stripe fees           | Table of every bill with € / month and a keep / downgrade / drop call               |
| **Tech scout**        | Is there a cheaper or better model, host or API for any pipeline step?                                   | Web (provider pricing pages, benchmarks, changelogs), `src/features/providers/**`                      | Ranked swap candidates with measured-or-estimated cost per finished video           |
| **Pricing & growth**  | Should prices, credit scale, trial, plans, top-ups, annual billing or upsells change?                    | §7 of the master plan, Stripe data, competitors' public pricing                                        | Experiments with expected € / month, risk, how to measure                           |
| **Implementer**       | Can the chosen change ship as a small, tested PR?                                                        | The repo                                                                                               | One PR (`ceo-finance/<slug>`) that passes the bar in §5, or a precise spec for Tudor |

The DM skips a lane when its inputs are not available yet and says so in the digest (e.g. no Stripe access → revenue lane runs on the DB only). Lanes never write anywhere except the Implementer, and only in the files listed in §5.

---

## 3. Data the routine needs (and what to connect)

| Need                                        | Source                                                                         | Status 2026-10-17                                                                                                                  | Action for Tudor                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MRR, churn, refunds, fees, failed payments  | **Stripe connector** (read-only; Sigma if enabled)                             | Connector needs sign-in (`Stripe` showed "requires authentication"); account is the **sandbox** (test mode), so there is no real MRR | Authorise the connector in claude.ai → Connectors. After go-live, connect the **live** account with a **restricted read-only key** |
| Per-job API cost, credits, users, plan mix  | **Supabase connector** (read-only SQL)                                         | Registered, but the cloud session could not connect (`ERR_PROXY_TUNNEL`)                                                           | Reconnect it; if it keeps failing, add a read-only Postgres role and a `FINANCE_DATABASE_URL`, or let the routine run `scripts/metrics-report.mts` with a read-only service key |
| Real provider spend                         | fal.ai usage page, ElevenLabs usage, Anthropic Console usage/cost API          | Not connected; the DB's `api_cost_usd` is an estimate from `costUsdPerUnit` list prices                                            | Export last month's invoices/usage (CSV) into a private place the routine can read, or add each as a connector/read-only admin key. This **reconciles** the estimate against the bill |
| Hosting bills and usage                     | **Vercel connector** (billing charges, usage, function duration)               | Connector is attached (billing tools available)                                                                                    | None                                                                                                                     |
| Traffic → signups → paid                    | Vercel Web Analytics, Stripe checkout events                                   | Partly available                                                                                                                   | Optional: PostHog or Plausible connector for funnel data                                                                 |
| Fixed subscriptions (SaaS, domain, tools)   | A one-time list from Tudor                                                     | Missing                                                                                                                            | Fill the table in §4                                                                                                     |
| Repo                                        | GitHub connector, `TudorFnsn/Shortcraft`                                       | Works                                                                                                                              | None                                                                                                                     |

**Claude tools and add-ons that would help the most, in priority order**

1. **Stripe connector (live, read-only)**: the single biggest unlock; without it the routine cannot see MRR.
2. **Supabase connector** (working): lets the cost accountant query `render_jobs` directly instead of through scripts.
3. **Vercel connector**: already attached; covers hosting cost and usage.
4. **A spreadsheet/Drive connector** (Google Drive or similar): a place for invoices and a running cost ledger the routine can read and update.
5. **Web search + fetch**: pricing pages are often blocked from the cloud network (the 2026-10-04 research had to use aggregator snippets). Allow the pricing domains (fal.ai, replicate.com, runware.ai, wavespeed.ai, elevenlabs.io, anthropic.com, vercel.com, supabase.com, stripe.com) in the environment's network policy, or the scout will keep working from snippets.
6. **Sentry / PostHog connectors** (later): failure rate is a cost (a failed video burns provider calls) and funnel data feeds the growth lane.
7. Skills worth installing for this routine: `xlsx` (cost ledger), `dataviz` (digest charts), `deep-research` (the tech scout's multi-source price comparisons). Already available.

Questions only Tudor can answer (the routine will keep asking until they are in §4): the real monthly bills, the go-live date for Stripe live mode, the target monthly profit, and how much of the margin may go to growth (ads, affiliates at 30%).

---

## 4. Cost map

### 4.1 Variable cost (per finished video) — from `src/config/models.ts`, list prices, **not yet measured**

| Step     | Provider today                      | List cost             | Note                                                                                      |
| -------- | ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| Script   | Anthropic `claude-sonnet-5-5`       | ~$0.04 per script     | Candidate: Haiku-class + prompt caching for the fixed system prompt                       |
| Images   | fal.ai FLUX schnell / dev           | $0.003 / $0.025 per MP | Standard uses schnell: already cheap                                                      |
| Voice    | ElevenLabs Flash                    | ~$0.00075/s of audio  | Per-seat plan fees and custom-voice slots are fixed cost (see 4.2)                        |
| Video    | fal.ai Kling 2.5 turbo pro (Premium)| ~$0.07/s of clip      | **The dominant cost.** Premium 15s ≈ $1.10; hero-shot variant ≈ $0.45                    |
| Render   | In-house ffmpeg (serverless)        | ~$0.01                | Done                                                                                      |

Standard (animated stills) is ~$0.07 for 15s. **Premium AI video is where the money leaks and where a cheaper model matters.**

### 4.2 Fixed cost — **Tudor to fill in** (monthly, EUR)

| Line                         | Plan today                 | € / month | Could it be cheaper / dropped?                                       |
| ---------------------------- | -------------------------- | --------- | -------------------------------------------------------------------- |
| Vercel                       | _Hobby per the master plan_ | ?         | **Hobby's terms exclude commercial use**; plan for Pro (~$20/seat) before taking real money |
| Supabase                     | _free `ShortCraft` project_ | ?         | Pro (~$25) is needed for backups/PITR and no auto-pause at launch    |
| ElevenLabs                   | ?                          | ?         | Custom-voice slots cap sign-ups (master plan §8)                     |
| Anthropic / fal.ai           | pay-as-you-go              | usage     | Reconcile against the bill monthly                                    |
| Resend, Sentry, domain       | ?                          | ?         |                                                                      |
| Stripe                       | % + fixed per charge       | fees      | Check EU vs non-EU card mix; Stripe Tax if used                      |
| Claude routines (3)          | Claude plan usage          | ?         | These routines are a cost too; the DM should skip empty lanes         |

---

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 prices + margin gate, §8 risks, §9 runbook), this file, `git log -20`, and open + recent PRs (list them before picking work; an item with an open PR is in review, not available). Never touch UI files while a `ceo-design/*` PR is open.
- **Numbers first:** run `npx tsx scripts/margin-report.mts` and `npx tsx scripts/metrics-report.mts` (read-only) and query Stripe + `render_jobs` through the connectors if they are reachable. Report which sources worked.
- **One change per run**, the highest € per month with the lowest risk. Prefer improving an open `ceo-finance/*` PR over a new one.
- **Files it may change:** `FinancePlan.md`, the money lines of `TheMasterPlan.md` (§7, §10, §11), `src/config/models.ts` cost fields, `src/features/billing/margin.ts` and its tests, `src/features/providers/**` (new adapters behind the registry, never switching the default without Tudor's OK), `scripts/*report*.mts`, and new read-only reporting scripts. **Never**: migrations, webhooks, Stripe or Supabase writes, live secrets, prices or credit grants without approval, UI files.
- **Provider swaps** ship as an additional adapter plus a smoke script result (`scripts/live-providers-smoke.mts`) showing measured cost and a link to sample output; Tudor flips the env var (`FAL_VIDEO_MODEL` or a new one) after he has watched the output. Quality is part of margin: a cheaper clip that makes people churn is not a saving.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and the margin gate still passes (it fails closed in live mode).
- **Notify (PushNotification) only when** MRR falls week over week, a margin gate fails or measured cost exceeds list cost by >20%, a bill is about to exceed a plan limit, failed payments spike, or a decision is waiting on Tudor with a deadline. Quiet days stay quiet. If a connector is down or access is denied, notify once per day with what is missing.
- **Digest:** MRR/ARR and trend, cost per video vs credits charged, top 3 cost lines, what shipped, what is waiting on Tudor, next run's focus.

---

## 6. Backlog (ranked by expected € per month; the routine reorders it)

Premium video is the biggest lever, so the first items are about the video step.

- [ ] **F1 — Measure, don't guess.** Run the live smoke with real keys, record real fal.ai/ElevenLabs/Anthropic spend per step, and compare to `costUsdPerUnit`. Reconcile `render_jobs.api_cost_usd` against the monthly invoices. _Needs: FAL_KEY in the routine's env or Tudor's run._
- [ ] **F2 — Video model bake-off** for Premium and the hero-shot variant, on the same 5 prompts: today's Kling 2.5 turbo pro on fal.ai versus candidates, scored on cost per 5s clip, motion quality, failure rate, latency and commercial-use terms. Candidates to price (verify every figure first): Wan 2.x, LTX-2 (Fast), Seedance, Hailuo, Veo 3.1 Fast, Kling's own API, and the same open models on cheaper hosts (Replicate, Runware, WaveSpeed, Modal/RunPod serverless GPU). Self-hosting only wins at sustained volume: compute the break-even jobs per month before building anything.
- [ ] **F3 — Hero-shot Premium tier** priced close to Standard (≈$0.45 vs ≈$1.10 for 15s): AI clip on the hook scene only, Ken Burns elsewhere. Likely the best margin-to-wow ratio; needs a pricing decision from Tudor.
- [ ] **F4 — Cheaper script model:** try a Haiku-class model with prompt caching for the fixed instructions; compare script quality on 20 topics and the moderation pass rate. Small per video, but it is on every video including the trial.
- [ ] **F5 — Trial burn:** trial is 3,000 credits (~$0.25). Check conversion by cohort; cap the trial to Standard, and consider a card-on-file trial only if abuse shows up.
- [ ] **F6 — Heavy-user report:** users whose spend/credit exceeds plan revenue; premium-only use at Pro's exact 3.0x gate is the exposure. Decide on fair-use limits or Premium add-on pricing.
- [ ] **F7 — Revenue levers:** annual plans (cash up front, lower churn), top-up nudges when credits run low, credit expiry/rollover policy, a higher-priced tier for agencies, an affiliate programme sized to the margin. Each as an experiment with expected € and a measurement plan.
- [ ] **F8 — Payments:** effective fee per charge by card type; compare Stripe against a merchant-of-record (Paddle, Lemon Squeezy) once EU VAT handling cost and time are priced in. Stripe Tax if staying.
- [ ] **F9 — Voice cost:** ElevenLabs plan fit versus slots and character volume; evaluate cheaper TTS (e.g. Cartesia, Deepgram, OpenAI TTS) for Standard while keeping ElevenLabs for custom voices.
- [ ] **F10 — Hosting right-sizing:** function duration/memory per route, media storage and egress (signed URLs, retention of old renders), Supabase egress; delete old render artefacts after N days if the user has not downloaded them.
- [ ] **F11 — Failure cost:** failed or refused jobs that still burned provider calls; measure and cut (earlier moderation, retry limits).

---

## 7. Routine setup (for Tudor, once)

Create it at https://claude.ai/code/routines the same way as the other two: daily, Opus 5.5, repo `TudorFnsn/Shortcraft`, PR-gated, connectors Stripe, Supabase, Vercel, GitHub. A good slot is **07:30 UTC**, after the main CEO (06:00) and before Design (09:00), so the three do not collide on `main`.

Paste this as the routine prompt:

```
You are the DM (master agent) of the Shortcraft Finance CEO routine. Goal: maximise monthly profit and cash return. Always check the MRR ratio and unit economics first.

1. Read FinancePlan.md and TheMasterPlan.md (§7, §8, §9), `git log -20`, and list open + recently closed PRs. An item with an open PR is in review, not available.
2. Run `npm ci`, then `npx tsx scripts/margin-report.mts` and `npx tsx scripts/metrics-report.mts`. Query Stripe (read-only) for MRR, churn, refunds, fees, failed payments, and Supabase (read-only) for render_jobs.api_cost_usd, credit_transactions and plan mix. Vercel billing/usage for hosting. Record which sources worked.
3. Decide which lanes matter today (Revenue analyst, Cost accountant, Fixed-cost auditor, Tech scout, Pricing & growth) and spawn only those as parallel subagents with narrow briefs, each returning: finding, evidence, €/month effect, confidence, next step. Skip lanes whose inputs are missing and say so.
4. Merge, de-duplicate, rank by €/month. Pick at most ONE change to implement, on a `ceo-finance/<slug>` branch, PR only (never merge). Follow the rules in FinancePlan.md §5: no migrations applied, no Stripe/Supabase writes, no live secrets, no price changes without Tudor's OK, no UI files.
5. Update FinancePlan.md (backlog, numbers, §4 tables) and the money lines of TheMasterPlan.md §7/§10/§11.
6. Send a PushNotification (in <routine_summary> tags, first sentence = the headline) only when FinancePlan.md §5 says to: MRR drop, failed margin gate, cost overrun, payment failures, a deadline decision for Tudor, or a connector/access failure. Otherwise stay silent.
7. End with a digest: MRR/ARR + trend, cost per video vs credits charged, top 3 cost lines, what shipped, what waits on Tudor, next focus.

If you need information you do not have, say exactly what and where it would come from, and add it to FinancePlan.md §3 as an open question.
```

---

## 8. Log

- **2026-10-17** — Plan and routine prompt created (interactive/scheduled setup). Findings from the repo: per-job API cost is already metered in `render_jobs.api_cost_usd` (estimate from list prices), the margin gate passes at the 2026-10-05 prices with Pro at exactly 3.0x, and no live revenue data is readable yet (Stripe connector unauthorised and in test mode; Supabase connector failed to connect from the cloud session). Also flagged: Vercel Hobby excludes commercial use, so hosting moves to a paid plan before real revenue.
