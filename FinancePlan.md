# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> `TheMasterPlan.md` wins on product and priority; this file wins on cost,
> pricing, revenue and cash. Every finance PR updates this file (state, backlog,
> changelog) in the same change.
>
> Last updated: 2026-10-18 (track created, nothing measured live yet)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash return first.** Raise MRR, cut cost per video, keep gross margin above the 3x gate. Check the MRR ratio on every run.               |
| Scope     | Every payment in and out: Stripe revenue, fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, Sentry, domain, any other bill. Plus pricing and plans. |
| Ideas     | Always look for newer, cheaper providers and techniques (video, image, voice, script, render, hosting). fal.ai video looks expensive: find alternatives.   |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe, or run migrations.               |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00).                                         |
| Structure | A **master agent** (DM) reads the state, splits the work, runs workers in parallel, merges their findings into one PR + one digest.                        |

## 2. How the routine works

The master agent never does the deep work itself. Each run:

1. **Read:** `TheMasterPlan.md` §7/§8/§9, this file, `git log -20`, open + recently closed PRs (an item with an open PR is in review, not available).
2. **Measure** (read-only): `npx tsx scripts/finance-report.mts --json` (MRR, net revenue, API cost, cost per video, gross margin by tier), `scripts/metrics-report.mts --json` (north star), `scripts/margin-report.mts`. Then connectors: Stripe (revenue, MRR, churn, refunds, fees), Vercel (billing charges, usage), Supabase (advisors, db size, egress). Missing access goes in the digest as an **ask**.
3. **Split** into workers, in parallel, each with a narrow brief and the exact files it may read:
   - **Cost auditor:** provider spend vs credits charged, per step (script/image/video/voice/render), tokens per video for Claude, failed-job spend, retries, overruns (`warn` logs).
   - **Provider scout:** web research on cheaper or better models and hosts (video, image, TTS, LLM), with price per unit, quality, licence, latency, and a switch plan behind the existing adapter layer. Prices are claims, not facts, until measured on a real call.
   - **Revenue analyst:** MRR, ARPU, plan mix, trial → paid, churn, top-up share, price/plan experiments, annual plans, upsells, credit-expiry rules, discounts.
   - **Infra and bills:** Vercel/Supabase/Resend/Sentry/ElevenLabs plan sizes against real usage; downgrade or right-size.
   - **Implementer:** builds the single highest-return change the others found (adapter, pricing config, caching, a report), with tests.
4. **Rank** by expected cash per week of effort. One PR per run (`ceo-finance/<slug>`); improve an open finance PR before starting another.
5. **Report** a digest and **push a notification** when: gross margin < 3x on any product, a provider bill jumps > 25% week over week, MRR drops, a cheaper provider saves > 20% of API cost, or the routine lacks access it needs.

### Rules

- Bar before any PR: `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- May change: `src/config/models.ts`, `src/config/plans.ts`, `src/features/providers/**` (new adapters behind the registry, **disabled by default**), `src/features/metrics/**`, `src/features/billing/margin.ts` (reporting only), `scripts/**`, this file, finance lines of `TheMasterPlan.md`.
- Never: change live prices in Stripe, flip `MOCK_PROVIDERS`, apply migrations, store secrets, or change a customer-facing price without Tudor's OK (propose with the margin-report diff).
- A new provider ships only with: a priced adapter, a smoke script, a margin-gate run on the new cost, and a measured quality sample for Tudor.

## 3. Cost map (from code, 2026-10-18, list prices not measured)

| Step   | Provider today                                            | Unit cost                         | Notes                                                                                 |
| ------ | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Script | Anthropic Sonnet 5.5 ($2/$10 MTok)                        | ~$0.04 per video (est.)           | **Tokens are not stored**, only the dollar sum in `render_jobs.api_cost_usd`. See F1. |
| Image  | fal.ai FLUX schnell / dev                                 | $0.003 / $0.025 per MP            | Standard uses schnell.                                                                |
| Clip   | Standard: in-house Ken Burns                              | $0                                | Premium: fal Kling 2.5 turbo pro, ~$0.07/s (~$0.35 per 5s scene).                     |
| Voice  | ElevenLabs Flash                                          | ~$0.05 per 1k chars (~$0.00075/s) | Voice Studio adds design rounds and custom-voice slots (plan-capped).                 |
| Render | in-house ffmpeg                                           | ~$0.01                            | Runs in a Vercel function.                                                            |
| Fixed  | Vercel, Supabase, Resend, Sentry, domain, ElevenLabs plan | unknown                           | **Needs billing access** (see §5).                                                    |

Revenue model (TheMasterPlan §7): plans €14.99 / €29.99 / €79.99, top-ups €12 / €29 / €59, VAT 20% and Stripe 1.5% + €0.25 assumed (`REVENUE_ASSUMPTIONS`). Gate target 3x; Pro sits at exactly 3.0x, so any measured cost rise fails it.

## 4. Backlog (rank by cash per effort; routine re-ranks every run)

- [ ] **F0 Baseline.** First live `finance-report` run pasted into §6 (needs `.env.local` or the Supabase connector). Until then every number here is a list price.
- [ ] **F1 Record usage per step.** New table `provider_usage` (job_id, step, provider, model, input_tokens, output_tokens, units, cost_usd, created_at) written by the orchestrator, so "tokens vs spend per video" is measured, not estimated. Needs a migration (owner applies). The Anthropic adapter already computes `usage`; it just doesn't persist it.
- [ ] **F2 Cheaper premium video.** Scout result 2026-10-18 (vendor-blog snippets, unverified, resolution/audio differ): Seedance 2.0 Fast ~$0.076/s and Kling 3.0 Std ~$0.071/s on Atlas Cloud, Wan 3.0 ~$0.083/s on Alibaba Cloud, Runware Seedance 2.0 480p ~$0.07/s, vs fal's own Seedance 2.0 Fast $0.2419/s and Kling O3 Std $0.084/s. Our fal Kling 2.5 turbo is ~$0.07/s already, so the saving is not obvious: **measure real clips, not list prices**. The bigger lever is the hero-shot variant (AI clip on scene 1 only, ~$0.45 per 15s).
- [ ] **F3 Cheaper voice.** Scout result: Deepgram Aura-2 ~$0.03/1k chars, OpenAI TTS ~$0.015, Inworld 1.5 Max ~$0.035, Soniox ~$0.014 vs ElevenLabs Flash $0.05. Voice is under 2% of a Standard video's cost, so this only pays at volume and costs voice quality and word timings (captions need them). Low priority.
- [ ] **F4 Prompt caching + shorter scripts.** Cache the system prompt in the Anthropic adapter; measure tokens (needs F1). Script is the largest non-video cost of a Standard video.
- [ ] **F5 Annual plans** (cash up front, lower churn) and a Stripe coupon policy; propose prices to Tudor with the margin diff.
- [ ] **F6 Credit-expiry and rollover rules** (breakage raises margin; check EU consumer rules first).
- [ ] **F7 Fixed-cost review** once billing is visible: Vercel Pro vs Hobby, Supabase plan, ElevenLabs tier vs saved voices, Sentry quota.
- [ ] **F8 Failed-job spend.** `failedCostUsd` in the report; cut retries and add fail-fast checks if above 5% of spend.
- [ ] **F9 Spend alarms.** A daily cap on provider spend (kill switch to mock or queue) so a bug can't burn cash overnight.

## 5. Access the routine needs (ask Tudor; each is read-only unless stated)

| Need                                                     | Why                                            | How                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Stripe** connector authorised (live account when live) | MRR, churn, refunds, fees, payouts             | claude.ai → Settings → Connectors → Stripe. Currently needs authorisation; sandbox only.                          |
| **Supabase** connector working                           | run `finance-report`, read `render_jobs` costs | Failed in this session (`ERR_PROXY_TUNNEL`); retry or add `SUPABASE_SERVICE_ROLE_KEY` to the routine environment. |
| **Vercel** connector (billing, usage)                    | hosting cost, function and bandwidth usage     | Already available as an MCP server; confirm the team scope.                                                       |
| Provider billing exports                                 | fal.ai, ElevenLabs, Anthropic monthly spend    | Read-only API/usage keys or a monthly CSV in a private folder. Never paste live secrets in the repo.              |
| Env in the routine's environment                         | the report scripts                             | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (read-only use), nothing else.                            |
| Outbound web                                             | provider price pages                           | Allow `fal.ai`, `runware.ai`, `wavespeed.ai`, `elevenlabs.io`, `anthropic.com`, `vercel.com`, `stripe.com`.       |

Helpful add-ons to consider: a Stripe Sigma/Revenue Recognition read key, a Google Sheets/Drive connector (monthly cost ledger), PostHog (visitor → paid funnel, once the cookie banner exists), Sentry (cost-of-errors), and the Anthropic Admin/usage API for per-workspace token spend.

## 6. Measurements log (newest on top; paste `finance-report --json` highlights)

_No live measurement yet._

## 7. Changelog

- **2026-10-18** — Track created. `features/metrics/finance.ts` (pure MRR / net revenue / API cost / cost per video / gross margin by tier, 30-day window) + `scripts/finance-report.mts` (read-only) + 6 tests. First provider scout notes in F2/F3. (Finance CEO, interactive)

## 8. Decision log

- **2026-10-18 (owner)** — Add a separate Finance CEO routine with a master agent that splits work across workers; priority is cash return; PR-gated like the others.

## 9. Routine prompt (paste into the cloud routine "Shortcraft Finance CEO", 07:00 UTC, repo TudorFnsn/Shortcraft)

```
You are the Finance CEO and master agent for Shortcraft. Goal: maximum profit, cash return first.
1. Read TheMasterPlan.md (§7, §8, §9), FinancePlan.md, git log -20, and list open + recently closed PRs. Skip items that already have an open PR; improve an open ceo-finance/* PR before starting a new one.
2. Measure read-only: npx tsx scripts/finance-report.mts --json, scripts/metrics-report.mts --json, scripts/margin-report.mts, plus the Stripe, Supabase and Vercel connectors when available. Always state the MRR, net revenue, API cost, cost per video and gross margin (vs the 3x gate).
3. Split the work and run these workers in parallel with narrow briefs: cost auditor, provider scout (web research on cheaper/better video, image, voice, LLM and hosting; fal.ai video looks expensive), revenue analyst, infra/bills reviewer. Then one implementer builds the top-ranked change with tests.
4. Rank by expected cash per week of effort. Open ONE PR on ceo-finance/<slug> that updates FinancePlan.md (measurements, backlog, changelog) and TheMasterPlan.md. Follow the rules in FinancePlan.md §2. Never merge, never touch live secrets, live Stripe, migrations or customer-facing prices.
5. Send a PushNotification only when: margin < 3x on any product, a provider bill rose > 25% week over week, MRR fell, a cheaper provider saves > 20% of API cost, or you lack access you need (say exactly what). Otherwise stay silent. End with a digest: what moved, PR link, asks for Tudor, next item.
```
