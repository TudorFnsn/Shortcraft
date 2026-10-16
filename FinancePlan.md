# Shortcraft Finance Plan

Owned by the **Finance CFO** routine (prompt: `docs/routines/finance-cfo.md`; specialists in `.claude/agents/`). Goal: **maximize cash**. Watch MRR and unit economics every day, cut the cost of making a video without hurting quality, and find revenue levers, without breaking the 3x margin gate (`scripts/margin-report.mts`).

Companion docs: `TheMasterPlan.md` §7 (pricing and gate history), §9 (ops), `DesignPlan.md` (UI track, separate).

---

## 1. The numbers that matter

| Metric                         | Definition                                                         | Target                                   |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| MRR (EUR)                      | list price of live subscriptions                                   | growth week over week                    |
| Net MRR (EUR)                  | MRR after VAT and the Stripe fee                                   | tracks MRR                               |
| API cost ÷ net revenue         | 30-day `render_jobs.api_cost_usd` ÷ net subscription + top-up cash | ≤ 33% (the 3x gate)                      |
| Cost per finished video (tier) | API cost of `done` jobs ÷ count                                    | Standard ≈ $0.07, Premium 15s ≤ $1.10    |
| Failed-job burn                | API cost of `failed` jobs                                          | → 0 (we refund them, so it is pure loss) |
| Cost per 1k credits            | realized API USD ÷ credits charged × 1000                          | below the catalog assumption             |
| Trial burn per signup          | printed by the margin report                                       | ≤ $0.25                                  |
| Gross profit (USD/month)       | net revenue − API cost − fixed costs                               | positive, then growing                   |
| Revenue multiple               | net revenue ÷ (API + fixed)                                        | ≥ 3                                      |

Run: `npx tsx scripts/finance-report.mts` (add `FIXED_COSTS_USD=<n>`; `--json` for digests). Math lives in `src/features/metrics/finance.ts` (pure, tested).

## 2. Snapshots (append newest on top; one row per run)

| Date       | MRR € | Subs | API cost 30d $ | Failed burn $ | Std $/video | Prem $/video | Revenue multiple | Note                                                               |
| ---------- | ----- | ---- | -------------- | ------------- | ----------- | ------------ | ---------------- | ------------------------------------------------------------------ |
| 2026-10-16 | n/a   | n/a  | n/a            | n/a           | n/a         | n/a          | n/a              | Baseline: report built; no DB/Stripe access from the setup session |

## 3. Cost lines and candidates

Today's stack: script = Claude Sonnet 5.5 (~$0.04/script, catalog); images = FLUX schnell $0.003/MP and dev $0.025/MP on fal.ai; Standard video = Ken Burns stills ($0); **Premium video = Kling 2.5 Turbo Pro image-to-video on fal.ai, ~$0.07 per billed second, catalog 0.12 $/scene-second (the big line)**; voice = ElevenLabs Flash v2.5 (~$0.05/1k chars); render = in-house ffmpeg (~$0.01).

Ranked by where the money goes. Everything below is a **lead, unverified**: the scout must confirm on the vendor's own pricing page and on a real A/B before any switch.

| Line          | Lead                                                                                                                                                   | Why it might pay                                                                     | Status |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------ |
| Premium video | Hero-shot variant (AI clip on scene 1 only, stills elsewhere): ~$0.45 per 15s vs ~$1.10                                                                | Cuts the largest line ~60% and lets Premium be sold near Standard                    | open   |
| Premium video | Other image-to-video models: LTX-2 Fast, Wan 2.5, Seedance, Hailuo, Veo 3.1 Fast, Kling direct API (no fal.ai markup)                                  | Some list well under $0.07/s; 5 s minimum billing can erase it                       | open   |
| Premium video | Same models on cheaper hosts: Replicate, WaveSpeed, Runware, Novita, direct vendor APIs; per-second vs per-clip billing                                | Host markup differs a lot                                                            | open   |
| Premium video | Generate at 480p/720p and upscale in ffmpeg; trim clips to the scene length before paying for a full 5 s                                               | Resolution and billed seconds drive price                                            | open   |
| Voice         | Cheaper TTS with word timestamps: Cartesia, Deepgram Aura-2, OpenAI gpt-4o-mini-tts, Inworld; self-hosted Kokoro for the default voice                 | Voice is small per video but scales with volume; keep ElevenLabs for designed voices | open   |
| Script LLM    | Haiku 5.5 for scripts with Sonnet fallback on validation failure; prompt caching of the system prompt; Batch API where latency allows                  | Cheapest tokens that pass schema + quality checks                                    | open   |
| Images        | FLUX schnell is already near the floor; check Runware / fal batch pricing and cache images for repeated themes                                         | Small line                                                                           | open   |
| Infra         | Vercel function duration and memory for the ffmpeg render, Supabase compute size and egress, Storage lifecycle (delete old renders), signed-URL egress | Fixed costs hide here; needs §4 access                                               | open   |
| Waste         | Failed-job cost, retries that pay twice, abandoned jobs, trial abuse (multi-account signups burning trial credits)                                     | Pure loss                                                                            | open   |

Revenue leads (owner decides anything customer-facing): annual plans with ~2 months free (Stripe yearly price ids already modelled), card-on-file trial, watermark on trial output, a plan between Starter and Pro, Premium sold pay-per-use, top-up auto-recharge, credit expiry and rollover rules, dunning and Smart Retries, pause-instead-of-cancel and cancel-flow offers, win-back emails (lifecycle email exists), affiliate economics (30% recurring vs CAC).

## 4. Access and information still needed (ask the owner; fill in as answered)

The CFO cannot see these today. Each item says what to connect and why.

| Need                                                | How                                                                                                                                                                                                      | Unlocks                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Supabase connector working in the cloud routine** | It failed to connect when this plan was written (`ERR_PROXY_TUNNEL`). Reconnect under claude.ai Settings → Connectors, check the routine's network policy allows `mcp.supabase.com` and `*.supabase.co`. | Every DB-derived number (jobs, cost, subscribers). The most important gap. |
| **Stripe LIVE (read-only) access**                  | The connector is the test sandbox only. Create a **restricted read-only key** or connect the live account read-only.                                                                                     | Real MRR, churn, refunds, disputes, failed payments, coupons.              |
| **Fixed monthly costs (USD)**                       | Fill the table below: Vercel plan, Supabase plan, ElevenLabs plan, Anthropic spend, fal.ai balance, domain, email (Resend), Sentry, anything else                                                        | Real profit, not just gross margin. Set `FIXED_COSTS_USD`.                 |
| **fal.ai usage/billing**                            | Billing page export or API key with usage read; a monthly CSV is enough                                                                                                                                  | Compare billed vs `api_cost_usd`; find hidden fees                         |
| **Anthropic usage**                                 | Console usage/cost export (or Admin API key, read-only); keep `ANTHROPIC_WORKSPACE_ID` for the Shortcraft workspace                                                                                      | Real tokens per script, cache hit rate                                     |
| **ElevenLabs usage**                                | Subscription page / usage export (characters used, plan, custom-voice slots)                                                                                                                             | Real voice cost, plan right-sizing                                         |
| **Vercel billing**                                  | Vercel connector is attached (`list_billing_charges`, runtime logs); needs the project scope                                                                                                             | Hosting, function and bandwidth cost                                       |
| Traffic and conversion source                       | Analytics (Vercel Web Analytics is available via the connector; PostHog if added)                                                                                                                        | Funnel: visit → signup → trial → paid                                      |

Fixed costs (owner to fill in, USD/month):

| Item          | Plan / tier | USD per month |
| ------------- | ----------- | ------------- |
| Vercel        | ?           | ?             |
| Supabase      | ?           | ?             |
| ElevenLabs    | ?           | ?             |
| Anthropic     | usage       | measured      |
| fal.ai        | usage       | measured      |
| Resend        | ?           | ?             |
| Sentry        | ?           | ?             |
| Domain / misc | ?           | ?             |

Helpful connectors and tools to add (suggestions; the owner enables them): a **Google Sheets/Drive** connector for a monthly finance sheet and receipts; **PostHog** or Vercel Web Analytics for funnel numbers; a **Slack** or email connector for the digest (the routine already has PushNotification); **Sentry** connector for failure-rate-to-cost correlation; an **accounting** export (Stripe Tax / Xero / QuickBooks) once there is real revenue; **Stripe Sigma** (already reachable through the Stripe connector's analytics tool) for cohort MRR and churn; Cloudflare R2 or Backblaze B2 if Storage egress becomes a line.

## 5. Experiments (one active at a time; owner approves anything customer-facing)

| #   | Experiment | Hypothesis | Metric | Status |
| --- | ---------- | ---------- | ------ | ------ |
| E1  | (none yet) |            |        |        |

## 6. Decided (do not relitigate)

- Standard = Ken Burns animated stills; render in-house (2026-10-04/05).
- Premium AI video = 1,420 cr/s; the margin gate must pass before live providers resolve (2026-10-05).
- Credit scale option C (cost-tied credits) is not adopted until costs are measured on real calls.
- Direct provider pages were blocked from earlier routines' network: prices were snippets and disagree by up to 2x. **Measure before switching.**

## 7. Backlog (CFO picks the top one per run)

1. Get the Supabase connector healthy in the routine and fill §2 with real numbers.
2. Measure real costs on live calls (`scripts/live-providers-smoke.mts`), then correct `costUsdPerUnit`, which may unlock headroom on Pro (currently exactly 3.0x).
3. Premium hero-shot variant: price, build, A/B (needs owner decision on the customer price).
4. Scout the cheapest acceptable Premium video model; add a second adapter behind an env switch.
5. Cost per finished video dashboard row in the weekly digest; alert on cost per video drifting up more than 20% from the catalog.
6. Failed-job burn: find the top failure causes and stop paying for steps that can't finish.
7. Annual plan proposal with numbers for the owner.
