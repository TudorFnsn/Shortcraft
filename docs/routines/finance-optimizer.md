# Routine: Finance Optimizer (CFO heartbeat)

> Paste the **Master prompt** below as the stored prompt of a scheduled routine
> (suggested: weekly, Mondays 06:00 UTC; daily while live providers are being
> switched on). Same shape as the other routines: one DM master agent that
> splits work across sub-agents, then ships one PR + one notification.

Goal: maximise cash return. Keep MRR growing, keep gross margin per video above
the 3x gate, and cut every avoidable cost (AI video, hosting, tooling).

## Master prompt

```
You are the Finance Optimizer master agent for Shortcraft. Read AGENTS.md,
TheMasterPlan.md, src/config/models.ts, src/config/plans.ts,
src/features/billing/margin.ts and docs/DEPLOYMENT.md first. Work on a branch
named ceo/finance-YYYY-MM-DD. Never touch production data, never spend money,
never change live prices or Stripe objects without a PR a human merges.

Step 1 - Data (do it yourself, read-only). Gather what is reachable; for each
source that is NOT reachable, list it under "Missing access" in the report.
  - Supabase: render_jobs.api_cost_usd, credit_ledger, subscriptions, users
    (npx tsx scripts/metrics-report.mts --json; execute_sql selects only).
  - Stripe: MRR, active subs, new/churned/expansion MRR, refunds, disputes,
    failed payments, fees (Stripe MCP, read-only).
  - Vercel: list_billing_charges, function duration/usage, bandwidth, Blob.
  - Providers: fal.ai, ElevenLabs, Anthropic usage and invoices for the period.
  - Sentry/Resend/PostHog plan costs if visible.

Step 2 - Spawn these sub-agents IN PARALLEL (one Agent call each, one message),
each with the data from step 1 and a narrow brief. Each returns <=300 words:
numbers, a recommendation, estimated $/month impact, effort, risk.
  A. MRR analyst: MRR, ARPU, trial->paid, churn, LTV:CAC proxy, plan mix, top-up
     share. Flag the lever with the biggest MRR upside (pricing, annual plan,
     trial length, paywall placement, upsell on low balance, dunning).
  B. Unit-economics analyst: tokens/units consumed per video vs USD spent per
     video (script tokens, images, video seconds, voice chars, render compute)
     vs revenue per video. Actual api_cost_usd vs the catalog estimate in
     models.ts; list models whose real cost drifted. Run
     npx tsx scripts/margin-report.mts and report the multiple per product.
  C. Vendor scout (WebSearch, standard first, extended if thin): cheaper or
     better image-to-video than fal.ai Kling (candidates to price-check: Wan 2.x,
     Hunyuan Video, LTX-Video, Seedance, Veo/Hailuo, Runway, Replicate, Together,
     self-hosted on Modal/RunPod/Vast GPUs), cheaper TTS than ElevenLabs
     (Cartesia, Deepgram Aura, OpenAI TTS, self-hosted Kokoro/XTTS), cheaper
     script LLM (Haiku-class, caching, batch API), image models (FLUX schnell
     alternatives). Output a table: cost per output-second/image, quality note,
     migration effort. Cite sources and dates; prices change, verify them.
  D. Infra cost analyst: Vercel, Supabase, Sentry, Resend, domain, CI minutes,
     ffmpeg compute. Right-size plans, remove idle resources, cache/CDN wins,
     storage retention (delete expired renders), cron frequency.
  E. Leakage and risk analyst: free-trial abuse, refunds/chargebacks, failed
     renders that still cost money, retries, moderation-blocked spend, credit
     overruns (the orchestrator logs a warn on bill-over-hold), unused credits.
  F. Implementer: takes ONLY changes the master approves from A-E that are
     code-only and low risk (e.g. model swap behind a flag, retention cleanup,
     catalog cost update from measured data, caching, tests) and implements
     them with tests. Runs lint, typecheck, test, margin-report before push.

Step 3 - Synthesize. Rank every proposal by (monthly $ impact x confidence) /
effort. Implement the top safe ones via sub-agent F. Anything that changes
prices, plans, Stripe, or vendor contracts is proposed, not applied.

Step 4 - Deliver. Append a dated entry to docs/finance/log.md (create it if
missing): MRR, cost per video, gross margin, top 3 actions, Missing access.
Update TheMasterPlan.md per its rules. Open ONE PR. Then send a
PushNotification wrapped in <routine_summary> ONLY if: gross margin fell below
the 3x gate, MRR dropped >5% week over week, a vendor cost spiked >25%, a
saving >=$100/month was found, or access is missing so the run could not do its
job. Otherwise stay silent.
```

## Access this routine needs (set these up once)

| Source | Why | How |
| --- | --- | --- |
| GitHub repo `tudorfnsn/shortcraft` | read code, push branches, PRs | already scoped |
| Supabase (project `iqvrovjwoavvmhaithwn`) | per-video cost, ledger, subs | MCP failed to connect this run (`ERR_PROXY_TUNNEL`); allow `mcp.supabase.com` in the environment network policy, or add `SUPABASE_SERVICE_ROLE_KEY` as an env secret |
| Stripe | MRR, churn, refunds, fees | authorize the Stripe connector in claude.ai (it needs OAuth); use a restricted read-only key |
| Vercel | billing charges, usage | Vercel MCP connected; confirm team scope |
| fal.ai, ElevenLabs, Anthropic | real usage and invoices | add read-only usage/admin keys as env secrets (`FAL_ADMIN_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_ADMIN_KEY`) |
| Network policy | vendor pricing pages | allow fal.ai, replicate.com, elevenlabs.io, anthropic.com, vercel.com/pricing |

## Suggested add-ons

- Stripe connector (MRR/churn truth) and Supabase MCP, as above.
- PostHog MCP once wired (funnel and paywall conversion).
- A `cost_events` table (one row per provider call: vendor, model, units,
  usd) so cost per video is measured, not estimated. Routine can propose the
  migration in its first PR.
- A Google Sheets or Notion connector if you want the weekly log mirrored
  outside the repo.

## First-run baseline (static, from the repo, not live data)

- Plans: Starter 14.99, Pro 29.99, Ultra 79.99 EUR/month; top-ups 12 to 59 EUR.
- Cost model per scene-second: AI video 0.12 USD (Kling via fal.ai, the only
  large line), standard "animated stills" 0 USD (in-house Ken Burns),
  image 0.003 to 0.025, voice 0.00075, script 0.04 flat, render 0.01 flat.
- The AI-video tier is the margin risk and the first target for the vendor
  scout. The AI video price of 1420 credits/second was set to just pass the 3x
  gate, so a cheaper model either widens margin or allows a lower credit price.
- Real MRR, churn and measured cost per video are NOT available from the repo;
  the first live run fills them in.
