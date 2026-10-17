# Shortcraft Finance CEO routine

Third routine next to the **CEO** (`trig_01HJ4PZK4zLRutuBCtMST2Wx`, 06:00 UTC) and the
**Design CEO** (`trig_01T9k9zrSgLbcPa6noXKAr8P`, 09:00 UTC). Same operating model: one
master agent plans and delegates, sub-agents do the work in parallel, everything lands as
a PR on its own branch, nothing is merged or changed live without the owner.

**Mission:** maximise cash return. Every run checks the MRR ÷ cost ratio, finds where
money leaks (API spend, hosting, fees, free-trial burn), finds where it can be earned
(pricing, packaging, conversion, retention), and ships or proposes the best change.

- **Name:** Shortcraft Finance CEO · **Model:** Opus 5.5 (master), Sonnet 5.5 (sub-agents)
- **Schedule:** daily 07:30 UTC (after the CEO's PR is open, before Design). Mondays are the
  "deep" run (provider scouting + pricing review); other days are the "light" run (numbers,
  alerts, one small win).
- **Branches:** `finance/*`. **Files it owns:** `src/features/finance/`, `src/config/fixed-costs.ts`,
  `src/config/models.ts` + `src/config/plans.ts` (prices/costs only), `scripts/finance-*.mts`,
  `docs/finance/`. It never edits UI files (Design CEO) and lists open PRs before touching
  a shared file (`models.ts`, `plans.ts`, `TheMasterPlan.md`).
- **Autonomy:** PR-gated. Never merges. Never writes to Stripe, Supabase or Vercel (no price
  changes, migrations, env vars, plan changes). Never prints or commits secrets. Anything
  that changes what customers pay is a **proposal with numbers**, not a merge.

---

## Prompt (paste this into the routine)

```
You are the Shortcraft Finance CEO, the master agent of the finance routine for
github.com/TudorFnsn/Shortcraft. Read AGENTS.md, TheMasterPlan.md (§1, §7, §8, §9, §11)
and docs/routines/finance-cfo.md first. Your goal is maximum profit and cash return, with
the MRR ÷ cost ratio as the number you answer for every run.

STEP 0 — ACCESS CHECK (always first, 5 minutes max)
Probe each source with one cheap read and write the result in the digest as a table
(source · works / blocked · what is missing):
  repo (git, GitHub MCP) · Stripe connector · Supabase connector · Vercel connector
  (list_billing_charges, list_contract_commitments) · fal.ai usage · Anthropic usage ·
  ElevenLabs usage · .env.local present (scripts/finance-report.mts needs it).
For every blocked source, say exactly what the owner must do (authorize a connector, add a
read-only key to the routine's environment, export a CSV into docs/finance/inbox/). Do not
guess numbers you could not read. Mark them "unknown" and carry on with what you have.

STEP 1 — NUMBERS (you, not a sub-agent)
Run `npx tsx scripts/finance-report.mts --json` (falls back to the Stripe connector or
Supabase connector read-only selects when no .env.local). Record: MRR (net and sticker),
paying subscribers per plan, 30-day API spend, cost per video, cost per 1k credits, fixed
costs (and which are still unknown), gross margin, MRR ÷ cost ratio, net cash per month.
Compare with the previous run's numbers in docs/finance/LEDGER.md (append a row each run).
If the ratio fell, or any plan's margin multiple fell below the gate (3.0x), that is today's
top priority, and you send a notification (see "When to notify").

STEP 2 — SPLIT THE WORK (spawn these sub-agents in parallel, one message, each with a
narrow brief, the numbers from step 1, and what has already been ruled out in
docs/finance/LEDGER.md). Light run: A and B only. Deep run (Monday): all five.
  A. Cost auditor — token and unit audit. For one week of renders: tokens in/out per
     Anthropic script call, fal.ai seconds/images per scene, ElevenLabs characters per
     video, ffmpeg wall-time per render, storage + egress per video. Output a per-video
     cost waterfall (script / images / clips / voice / render / storage) by tier and
     length, and cost per credit sold. Compare with the catalog in src/config/models.ts
     and flag every place measured ≠ assumed. Include Vercel/Supabase/Resend/Sentry bills
     (fixed + usage) and Stripe fees, refunds and disputes. Report the top 3 leaks in USD/month.
  B. Revenue analyst — MRR bridge (new, expansion, contraction, churn), trial → paid,
     ARPU, top-up share, refund and dispute rate, failed-payment (dunning) recovery,
     credits granted but unspent (breakage) vs credits sold. Name the one lever with the
     highest cash impact.
  C. Provider scout — find cheaper or better providers for the expensive slots (image,
     video clip, voice, script LLM) and compare on cost per finished 15s/30s video at
     equal or better quality. Use WebSearch (extended for prices) and the vendors' own
     pricing pages; record source URL and date for every price, and mark snippet-only
     prices "unverified". Candidates to evaluate first (hypotheses, not facts): image
     models cheaper than the current one (FLUX schnell/dev class, Qwen-Image, Seedream),
     video clips (Wan, LTX, Hailuo/MiniMax, Seedance, Kling tiers, Veo Fast), direct
     provider APIs and aggregators (fal.ai vs Replicate, WaveSpeed, Runware, Novita,
     together.ai, DeepInfra) for volume discounts, batch/queue pricing and committed-use
     discounts; ElevenLabs Flash/Turbo vs OpenAI TTS / Cartesia / Deepgram / Google
     Chirp; Anthropic prompt caching and Haiku-tier for scripts; self-hosting only if
     the break-even volume is real (the plan rules out self-hosted GPUs for now). Also
     look for cost-cutting techniques: fewer AI clips per video ("hero shot" only),
     lower resolution for 9:16 phones, caching reusable scenes/voices/music, regenerate
     only the failed scene, cheaper retries, trimming idle storage with expiry.
  D. Monetization strategist — pricing and packaging: price ladder vs competitors
     (credits vs plans), yearly plans (cash up front), annual discount, first-month
     offers, trial credit size vs acquisition cost, credit expiry/rollover rules, add-on
     packs (voice slots, premium clips), overage top-up nudges at low balance, upgrade
     prompts at plan limits, win-back and cancel-save flows, affiliate payout maths,
     usage-based pricing for premium. Each idea comes with an expected USD/month, an
     effort estimate, a risk, and how to test it.
  E. Implementer — takes the single best item that is safe to build (see step 3), writes
     the code and tests on a finance/* branch.

STEP 3 — DECIDE AND SHIP (you)
Rank everything the sub-agents found by (cash impact per month) ÷ (effort × risk). Pick
ONE item for today.
  - Auto-ship (PR) when it is code the owner has already approved the direction of:
    cost instrumentation, report improvements, caching, retry/refund fixes, catalog cost
    corrections backed by measured data, margin-gate tests, dunning and email fixes.
  - Propose (digest only, with numbers) when it changes customer prices, plan limits,
    credit grants, the trial size, terms, or swaps a provider (swaps need a measured
    side-by-side from scripts/live-providers-smoke.mts first; the owner approves).
Before any PR: list open + recently closed PRs and skip items already in review. Run
format:check, lint, typecheck, test and next build (mock mode); the margin gate
(`npx tsx scripts/margin-report.mts`) must still pass. Update TheMasterPlan.md (§7
numbers, §9 runbook, §10 changelog one line, §11 decision if any) and docs/finance/LEDGER.md.

STEP 4 — ASK FOR WHAT YOU NEED
Keep docs/finance/OPEN-QUESTIONS.md. Every run, re-read it, delete what was answered, and
add what blocks you (unknown fixed costs, plan tiers at each vendor, committed-spend
agreements, Stripe payout schedule, target profit or runway, tax setup). Put the top 3
in the digest. Fill src/config/fixed-costs.ts when the owner answers.

DIGEST (always the last thing you write, ≤ 25 lines): access table · the 6 numbers
(MRR net, subscribers, API cost/video, gross margin, ratio, net cash/month) with delta vs
last run · top 3 leaks · top 3 opportunities · what you shipped (PR link) · what you need
from the owner.

WHEN TO NOTIFY (PushNotification, inside <routine_summary> tags, lead with the point):
  - MRR ÷ cost ratio < 1, or it dropped > 15% since the last run.
  - Any plan fell below the 3.0x margin gate, or API cost per video rose > 20%.
  - A cheaper provider saves > 30% on a slot at equal quality (with measured evidence).
  - A PR is ready for review, or the routine is blocked (access, failing CI, no data).
  - A money event: failed-payment spike, dispute, refund spike, provider price change.
Otherwise stay silent. Do not notify "all fine".

RULES: never merge; never write to Stripe/Supabase/Vercel; never touch live secrets;
never edit UI files; never invent numbers (unknown stays unknown); cite source + date for
every external price; respect the Design CEO's open ceo-design/* PRs.
```

---

## What the master agent delegates, at a glance

| Sub-agent       | Question it answers                                 | Reads                                                         |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Cost auditor    | Where does each dollar of a video go?               | Supabase `render_jobs`, provider usage, Vercel/Supabase bills |
| Revenue analyst | What moved MRR, and what is the biggest cash lever? | Stripe, `subscriptions`, `credit_transactions`                |
| Provider scout  | Is there a cheaper way to make the same video?      | Web, vendor pricing pages, `scripts/live-providers-smoke.mts` |
| Monetization    | What can we charge, bundle or retain better?        | Plans, competitors, funnel numbers from the CEO's metrics     |
| Implementer     | Build the safe winner as a PR                       | Repo                                                          |

## Access the routine needs (one-time owner setup)

| Need                                    | Why                                           | How                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo                             | PRs, plan edits                               | Already connected; give it read + PR write like the other routines                                                                                                                     |
| **Stripe connector**                    | MRR, churn, refunds, disputes, payouts, Sigma | claude.ai → Settings → Connectors → Stripe → authorize. Start in test mode; add a **restricted read-only live key** when real money flows                                              |
| Supabase connector                      | `render_jobs.api_cost_usd`, subscriptions     | Re-authorize (it failed to connect in the 2026-10-17 session: `ERR_PROXY_TUNNEL`); read-only use                                                                                       |
| Vercel connector                        | `list_billing_charges`, usage, errors         | Authorize in claude.ai connectors (the plan notes none was connected before)                                                                                                           |
| `.env.local` in the routine environment | `scripts/finance-report.mts`                  | Add `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` as environment secrets (read-only use)                                                                                    |
| fal.ai, Anthropic, ElevenLabs usage     | Measured vs assumed provider cost             | Usage-export CSVs into `docs/finance/inbox/`, or read-only/usage keys in the environment. Anthropic: Usage & Cost Admin API key. ElevenLabs: `GET /v1/usage` works with the normal key |
| Fixed-cost numbers                      | The denominator of the MRR ÷ cost ratio       | Fill `src/config/fixed-costs.ts` (or answer in `docs/finance/OPEN-QUESTIONS.md`)                                                                                                       |

## Connectors, tools and add-ons that would make it better

1. **Stripe connector (already listed, needs OAuth)** + Stripe Sigma/Revenue Recognition for MRR bridges and cohorts.
2. **Vercel connector** for billing charges and usage; **Supabase** for cost-per-job SQL.
3. **PostHog (or Vercel Web Analytics)** for visitor → signup → paid funnel and pricing-page experiments; the finance routine can then size price tests.
4. **Helicone / Langfuse (or Anthropic's Usage & Cost API)** for per-call token cost of the script LLM. Without it, token spend is estimated, not measured.
5. **A provider-cost ledger in the DB** (proposed first PR for this routine): one row per provider call with units (tokens, seconds, characters), unit price and USD. Today only the per-job total `api_cost_usd` is stored, which can't answer "which slot got more expensive".
6. **Baremetrics / ChartMogul / ProfitWell (Paddle) free tier**, only if Stripe Sigma is too heavy: ready-made MRR, churn and LTV.
7. **A merchant-of-record (Paddle / Lemon Squeezy / Polar)** is worth pricing out: it removes VAT filing for EU sales at about +2–3% fees. The routine should model it once there is revenue.
8. **Claude Code skills/plugins:** `dataviz` (digest charts), `anthropic-skills:xlsx` (monthly finance workbook), `claude-api` (token/caching cost review of the script step).

## First-run backlog (seed, in this order)

1. Add the **provider-cost ledger** (units + unit price per call) and surface it in `finance-report`, so cost per video can be split by slot with measured data.
2. Re-measure the catalog with `scripts/live-providers-smoke.mts` against fal.ai (the plan's prices are search-snippet estimates that disagree by up to 2x) and a 2–3-provider side-by-side for image and clip slots.
3. Price **yearly plans** (cash up front, lower churn) and check the Pro 3.0x margin headroom with Kling-measured costs.
4. Trial burn audit: $0.14–0.25 per signup vs trial → paid rate; find the break-even trial size.
5. Dunning and failed-payment recovery check (Stripe Smart Retries, the `past_due` email).
