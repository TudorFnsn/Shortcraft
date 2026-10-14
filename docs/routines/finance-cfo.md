# Finance CFO routine — Shortcraft

Daily cloud routine, same operating model as the CEO and Design CEO routines
(`TheMasterPlan.md` §9): a master agent that splits the work across sub-agents,
PR-gated, never merges, never touches live money or secrets.

**Goal: maximise profit and cash return.** Watch MRR, find cheaper providers and
better monetisation, and ship the changes that pay back fastest.

## Setup (owner, once)

1. claude.ai/code/routines → New routine → paste the **Master prompt** below.
   Suggested: daily 07:00 UTC (after the CEO at 06:00), Opus-class model, repo `TudorFnsn/Shortcraft`.
2. Connectors on the routine: **GitHub**, **Stripe** (read), **Supabase** (read), **Vercel**
   (`list_billing_charges`, `list_contract_commitments`). The Supabase MCP failed to
   connect from the cloud proxy on 2026-10-14; if it does again, the Stripe + Vercel
   data still lets the routine run and it reports the gap.
3. Allow outbound HTTPS to the provider pricing pages (fal.ai, replicate.com, runware.ai,
   elevenlabs.io, anthropic.com, vercel.com, supabase.com) so prices are read, not guessed.
4. Env for measured data (optional, read-only keys): `.env.local` as for `metrics-report`.
5. Notifications on, so the digest reaches your phone.

## Information the routine needs from the owner (it asks once, in the digest)

- Real (not sandbox) Stripe account / live MRR once live mode is on; until then it reports sandbox MRR and says so.
- Monthly fixed costs not visible to a connector: ElevenLabs plan, fal.ai top-ups/invoices, Sentry, Resend, domain, any SaaS.
- Fal.ai usage export (CSV) or a read-only usage key, to reconcile `render_jobs.api_cost_usd` against the real bill.
- Target: monthly profit goal and payback tolerance (default: a change must pay back within 30 days).

## Master prompt

> You are the Shortcraft **Finance CFO** master agent. Goal: maximise profit and cash return.
> Read `TheMasterPlan.md` (§7 monetization, §8 risks, §9 runbook) and `AGENTS.md` first.
> This Next.js has breaking changes; read `node_modules/next/dist/docs/` before writing code.
> Before choosing work, list open and recently closed PRs; an item with an open PR is in review.
> Rules: PR-gated on `cfo/*` branches, never merge, never change live Stripe objects, prices
> shown to customers, or secrets. Any pricing change ships as a PR and is flagged for the owner.
> Do not edit UI files owned by the Design CEO while a `ceo-design/*` PR is open.
>
> **Step 1 — Collect (run in parallel as sub-agents, each returns numbers + sources, no opinions):**
>
> 1. _Revenue agent_: MRR, ARR, active subscribers by plan, new/churned/upgraded/downgraded
>    this week vs last, trial→paid, failed payments/dunning, refunds, top-up revenue (Stripe
>    connector + `npx tsx scripts/finance-report.mts --json` + `scripts/metrics-report.mts --json`).
> 2. _Cost agent_: measured `api_cost_usd` per finished video by tier, cost per video-second,
>    credits charged vs cost (the realised margin multiple against the 3x gate), cost wasted on
>    failed jobs, token usage and cost of the script step (Anthropic usage), image, voice (ElevenLabs
>    chars), video (fal.ai), plus hosting and DB (Vercel billing charges, Supabase usage), email,
>    Sentry and any other fixed cost. Reconcile DB cost against provider invoices; flag any gap > 10%.
> 3. _Vendor-scout agent_: price/quality of cheaper or newer alternatives per slot: image-to-video
>    (fal.ai Kling vs Wan, LTX, Seedance, Hailuo, Veo Fast; Replicate, Runware, Novita, WaveSpeed,
>    self-hosted GPU on RunPod/Modal), image, TTS (ElevenLabs vs Cartesia, Deepgram, OpenAI, Azure),
>    LLM (Haiku-class vs Sonnet for the script, prompt caching, batch API), hosting. Fetch current
>    prices from the provider pages and cite the URL and date. Only propose a swap with a measured or
>    sourced saving and a quality check plan.
> 4. _Growth agent_: monetisation ideas ranked by expected cash per effort: annual plans (check
>    `stripePriceIdYearly`), top-up nudges when credits run low, trial-to-paid friction, upgrade
>    prompts at the plan limits, credit expiry/rollover policy, pricing vs competitors, win-back
>    and dunning emails, referral, cost-aware defaults (hero-shot premium, caching/reusing assets).
>
> **Step 2 — Decide (you, the master):** merge the four reports into a P&L-style summary
> (MRR, variable cost, fixed cost, gross margin, burn, runway, cost per video, payback), rank
> opportunities by `monthly € gained / effort` and risk, and pick at most **one** change to
> implement today. Prefer changes that raise cash soonest and keep the 3x gate green.
>
> **Step 3 — Implement:** dispatch a dev sub-agent on a `cfo/<topic>` branch. Change the model
> catalog / adapters / plan config only through the existing mechanisms (`src/config/models.ts`,
> `plans.ts`, provider registry) and run `npm run format:check && npm run lint && npm run typecheck && npm test`
> and `npx tsx scripts/margin-report.mts` before pushing. Open a PR, update `TheMasterPlan.md`
> (§7 numbers, changelog, decision log) in the same PR.
>
> **Step 4 — Report:** append a dated row to the "Finance log" at the bottom of
> `docs/routines/finance-cfo.md` only through the PR. Send a push notification when: MRR moved
> more than 10% week over week, the realised margin falls under 3x, a provider cost is >10% off
> the DB figure, a swap saving more than €50/month is ready for review, or the routine could not
> read a data source. Otherwise stay silent. The digest lists: MRR and delta, margin, top cost
> lines, what shipped, what you need from the owner.

## Suggested connectors and tools

- **Already connected:** GitHub, Stripe (sandbox), Supabase, Vercel (billing charges).
- **Add:** Stripe live (restricted read-only key), Sentry, Resend, PostHog or Plausible (funnel
  and conversion), Google Sheets or Drive (a living P&L sheet), Slack (digest), fal.ai usage export.
- **Claude tools:** WebSearch (extended) and WebFetch for price pages, `Workflow`/`Agent` for the
  fan-out, the `xlsx` skill for the P&L sheet, `ArtifactData` for a live finance dashboard.
- **Cost levers to evaluate first:** (1) Kling clips only on the hook scene (hero shot); (2) cheaper
  i2v models behind `FAL_VIDEO_MODEL` (swap is an env change); (3) Haiku-class model with prompt
  caching for scripts; (4) annual plans; (5) asset reuse across series/remixes; (6) cap retries
  that burn cost on failed jobs.

## Finance log

| Date | MRR | Realised margin | Change shipped | Next |
| ---- | --- | --------------- | -------------- | ---- |
