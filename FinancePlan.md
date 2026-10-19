# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this
> file wins on pricing, provider cost and cash. Every finance PR updates this
> file (metrics log, backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (created)

---

## 1. Charter (owner-configured 2026-10-19, do not change without Tudor)

**Goal:** maximise profit and cash return. Watch MRR, cut cost per finished video, and raise revenue per paying user, without hurting the north star (weekly paying-retained creators).

| Question  | Owner's answer                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape     | Same as the other routines: a **master agent** (the "DM") that reads the data, splits the work and hands it to sub-agents. It does not do the deep work itself.                             |
| Every run | Check **MRR** and the margin ratio first. Then find a change that earns more or spends less, and propose or implement it.                                                                   |
| Cost lens | Compare **what a video costs to make** (API spend, tokens, hosting) with **what it earns** (credits burned × net revenue per credit). Count every other recurring payment too (see §3).     |
| Providers | Question every vendor. fal.ai looks expensive: research cheaper or better image, video, voice and LLM options, including new ones.                                                          |
| Autonomy  | **PR-gated**: branches `ceo-finance/<slug>`, never merge. Reads are free. Any write outside the repo (migration, Stripe object, live mode, vendor signup or key) needs Tudor's explicit OK. |
| Cadence   | Daily cloud routine "Shortcraft Finance CEO", suggested 07:30 UTC (after the 06:00 CEO, before the 09:00 Design CEO).                                                                       |
| Priority  | Cash first: protect margin, then raise revenue per user, then cut cost, then grow.                                                                                                          |

## 2. Orchestration

The master agent spawns these in **one parallel batch** (independent), each with a narrow brief, and reads back only their conclusions:

| Sub-agent        | Job                                                                                                                                                                                                    | Output                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Ledger**       | Run `npx tsx scripts/finance-report.mts --json` and `scripts/margin-report.mts`; query Supabase/Stripe read-only (if the connectors are up). Reconcile MRR with Stripe.                                | MRR, net revenue/credit, cost per video by tier, wasted spend, gate multiples.             |
| **Cost**         | Per provider, per video: tokens, seconds, megapixels, characters billed vs `costUsdPerUnit` in `src/config/models.ts`. Include Supabase, Vercel, Sentry, Resend, ElevenLabs plan fees and Stripe fees. | Table of cost per video by line item, drift vs catalog, fixed monthly spend.               |
| **Vendor scout** | Web research (`WebSearch`, `extended` for prices) on cheaper or newer image, video, TTS, LLM and render options. Check the provider's own pricing page, not aggregators.                               | Ranked shortlist: price, quality, API fit with our adapter ports, risk, savings per video. |
| **Revenue**      | Pricing, packaging, trial, annual plan, top-up and upsell ideas; funnel leaks (trial → paid, churn) from the north-star report.                                                                        | Ranked experiments with expected € impact.                                                 |
| **Builder**      | Implements the one chosen item on a `ceo-finance/<slug>` branch (adapter, catalog change, report). Runs format, lint, typecheck, test.                                                                 | The PR.                                                                                    |

Master rules: list open and recently closed PRs first (an item with an open PR is in review); one PR per run; prefer the change with the best (€ saved or earned per month) ÷ effort; never lower a price or raise a credit allowance without the margin gate passing; keep the 3x gate fail-closed.

## 3. What to measure each run

1. **MRR (net)**, paying subscribers by plan, trial → paid, churn (needs Stripe).
2. **Gross margin multiple** on burned credits vs the 3x target, per tier.
3. **Cost per finished video** by tier, split by line item (script tokens, images, clips, voice, render). **Wasted spend** on failed jobs.
4. **Tokens:** Claude script calls (input/output tokens, cost per script). The API usage and cost report in the Anthropic Console (or Admin API) is the source; the DB only stores total `api_cost_usd` per job.
5. **Fixed costs:** Vercel, Supabase, ElevenLabs, fal.ai minimums, Sentry, Resend, domain. Burn per month vs MRR; break-even subscriber count.
6. **Cash drift:** Stripe payouts vs expected, refunds, disputes, fee rate.

## 4. Known gaps (access to fix; the routine asks, Tudor answers)

| Gap                                                        | Why it matters                                                                  | What to do                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stripe connector is not authorised in cloud sessions**   | No real MRR, churn, fees or refunds. The report estimates MRR from plan prices. | claude.ai → Settings → Connectors → Stripe → authorise (read-only restricted key is enough).                                                                                     |
| **Supabase connector fails from cloud (ERR_PROXY_TUNNEL)** | The routine cannot read `render_jobs`/`subscriptions`.                          | Retry the connector; or add a read-only DB role and put `SUPABASE_URL` + a service-role key in the routine's environment (never in the repo).                                    |
| **No provider invoices or usage**                          | Catalog costs are list prices, not measured (§7 of the master plan says so).    | Add read-only usage access: fal.ai usage/billing, ElevenLabs subscription usage, Anthropic Console cost report (Admin API key), Vercel usage (connector exists), Supabase usage. |
| **No fixed-cost ledger**                                   | Profit needs fixed spend.                                                       | Tudor lists plans and monthly fees once; the routine writes them into §6.                                                                                                        |
| **Web access to provider pricing pages**                   | The 2026-10-04 research was blocked and used aggregators that disagree by 2x.   | Allow outbound access to fal.ai, replicate.com, together.ai, runware.ai, elevenlabs.io, openai.com, google.dev, anthropic.com in the routine's environment.                      |

Suggested connectors and tools: **Stripe** (read), **Supabase** (read), **Vercel** (usage and billing charges, already connected), **Sentry** (error cost), **PostHog or Plausible** (funnel and visitor → paid), **Google Sheets** (a P&L sheet Tudor can edit), **Slack or email** (digest). Claude tools that help: `WebSearch extended`, `Agent` fan-out, Sigma queries in the Stripe connector, `PushNotification` for the digest.

## 5. Seed backlog (researched list prices are not measured; verify first)

Order by expected € per month. Each item needs measured numbers from the Ledger and Cost agents before it ships.

1. **Measure real cost per video** with the live smoke script, then replace catalog placeholders. Everything else depends on it.
2. **Cheaper image and video clips than fal.ai Kling** for Premium: candidates to price on their own pages are Wan 2.x, LTX-2, Seedance, Hailuo and Veo Fast via fal, Replicate, Runware, Together or self-hosted GPU (Modal, RunPod). Keep the hero-shot variant (AI clip on scene 1 only).
3. **Cheaper TTS** for Standard: ElevenLabs Flash vs OpenAI, Google, Azure neural or Kokoro/Piper self-hosted; keep ElevenLabs for Voice Studio.
4. **Prompt caching and a smaller script model** (Haiku-class for scenes, Sonnet for hooks): measure tokens per script first.
5. **Annual plan** (cash up front; typically 15–20% discount, lower churn) if not already live.
6. **Trial burn:** cap at the cheapest path (stills only, watermark already on).
7. **Re-use and caching:** same topic and theme within a window reuses scene images.
8. **Failed-job spend:** stop paid steps earlier on failures; refund only what was not spent.

## 6. Metrics log (newest first; the routine appends one line per run)

_No runs yet. First run: collect the baseline from `scripts/finance-report.mts`._

Fixed monthly costs: _unknown, owner to fill in (see §4)._

## 7. Changelog

- **2026-10-19** — Track created: this plan, `features/metrics/finance.ts` (MRR, cost by tier, wasted spend, gross margin; pure and tested) and `scripts/finance-report.mts` (read-only). (Interactive setup)

---

## 8. The routine prompt (paste into claude.ai/code/routines → new routine)

Name: **Shortcraft Finance CEO**. Model: Opus 5.5. Repo: `TudorFnsn/Shortcraft`. Schedule: daily 07:30 UTC. Connectors: GitHub, Supabase, Stripe, Vercel.

```text
You are the master agent ("DM") of the Shortcraft Finance CEO routine. Read FinancePlan.md,
TheMasterPlan.md §7 and §8, and AGENTS.md first. Your job is profit and cash return.

1. Check access: GitHub, Supabase, Stripe, Vercel. For anything that fails or is missing,
   note it in the digest and say exactly what to enable (FinancePlan.md §4). Do not stop on it:
   work with what you have, and state which numbers are estimates.
2. List open and recently closed PRs. An item with an open PR is in review; skip it.
3. In ONE parallel batch spawn the Ledger, Cost, Vendor scout and Revenue sub-agents from
   FinancePlan.md §2, each with a narrow brief and the file paths to read. Ask each for
   conclusions with numbers, not dumps.
4. Report MRR and the margin ratio first. Pick the single change with the best monthly € impact
   per effort. Spawn the Builder to implement it on branch ceo-finance/<slug>, open one PR,
   and never merge. Keep the 3x margin gate fail-closed; run format:check, lint, typecheck, test.
5. Never touch live secrets, run migrations, change Stripe objects, enable live mode or sign up
   to a vendor without Tudor's explicit OK. Put those asks in the PR description and digest.
6. Update FinancePlan.md (metrics log, backlog, changelog) and the TheMasterPlan.md changelog
   in the same PR.
7. Finish with PushNotification only when there is something to act on: MRR change, margin below
   3x, a saving over €20/month found, a PR to review, or a blocker. Otherwise stay silent.
```
