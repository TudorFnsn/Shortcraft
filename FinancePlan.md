# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (`docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`, which wins
> on product and priority. This file wins on cost, pricing evidence and cash.
> Every finance PR updates this file (KPI snapshot, backlog, changelog).
>
> Last updated: 2026-10-17 (created)

## 1. Charter

- **Goal:** maximise cash return. Order of preference: (1) protect the 3x margin gate, (2) cut cost per finished video, (3) raise MRR (conversion, ARPU, retention), (4) cut fixed spend.
- **Always first:** read MRR and its trend (`npx tsx scripts/finance-report.mts --json`, cross-checked with Stripe), then the margin report (`npx tsx scripts/margin-report.mts`).
- **Autonomy:** research + PR-gated code on `ceo-finance/<slug>`. Never merge. Never change live prices, Stripe objects, migrations or vendor contracts without the owner's explicit OK (Master Plan: connectors are read-only by default). Pricing and vendor switches are proposals in §4 until Tudor approves.
- **Provider swaps** go through the model catalog + adapter port, and only after a measured side-by-side (same prompt, same clip length) shows lower cost per _approved_ clip, not the headline rate.

## 2. KPI snapshot (fill every run; `n/a` until live data exists)

| Date       | MRR (EUR) | Subs | ARPU | API spend 30d | Cost / finished video | Gross margin | Fixed costs / mo |
| ---------- | --------- | ---- | ---- | ------------- | --------------------- | ------------ | ---------------- |
| 2026-10-17 | n/a       | n/a  | n/a  | n/a           | n/a                   | n/a          | n/a              |

Pre-launch: no live providers or paying users yet, so the real baseline is the catalog (`src/config/models.ts`) and the margin gate (Pro at exactly 3.0x).

## 3. Cost map (what we pay for, and who to benchmark against)

| Line                          | Today                                    | Benchmark candidates (unverified list prices, 2026-10-17)                                                                                    |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Premium video clips           | fal.ai Kling 2.5 Turbo Pro (~$0.07/s)    | WaveSpeed (Wan 2.2 from ~$0.01/s, Veo 3.1 Fast ~$0.15/s), Atlas Cloud (Wan 2.2/2.6 $0.02–0.07/s, Seedance 2.0 Fast ~$0.08–0.10/s), Replicate |
| Images                        | fal.ai FLUX schnell ($0.003)             | Runware, WaveSpeed, self-hosted FLUX on a spot GPU at volume                                                                                 |
| Script                        | Claude Sonnet 5.5 (~$0.02–0.04/script)   | Haiku 5.5 for the first draft + prompt caching + Batch API for non-urgent jobs                                                               |
| Voice                         | ElevenLabs Flash v2.5 ($0.05/1k chars)   | Cartesia, Deepgram Aura, OpenAI TTS; ElevenLabs annual plan                                                                                  |
| Render                        | in-house ffmpeg on Vercel                | already ~$0.01/video                                                                                                                         |
| Hosting / db / email / errors | Vercel, Supabase, Resend, Sentry (free?) | confirm which tiers are paid; Vercel Pro is only needed for sub-daily crons (pg_cron avoids it)                                              |
| Payments                      | Stripe 1.5% + €0.25 (EU cards)           | Stripe Tax cost; annual plans cut per-charge fixed fees                                                                                      |

Caveat: third-party price pages disagree by up to 2x and some charge for failed or filtered generations. Treat every number as a lead to test.

## 4. Backlog (ordered by cash impact; status `[ ]` open, `[~]` PR open, `[x]` done, `[?]` needs owner)

- [ ] **Measure real cost.** Run `scripts/live-providers-smoke.mts` once with live keys and write measured USD per step into `models.ts` and §7 of the Master Plan. Everything below depends on it.
- [ ] **Benchmark a cheaper video provider** for Premium (WaveSpeed, Atlas Cloud, Replicate) with the same 5s clip on 5 prompts; compare cost per approved clip. Target: ≥40% cheaper than fal Kling at equal quality. If it wins, add one adapter + catalog row behind the existing port.
- [ ] **Hero-shot Premium** (AI clip on scene 1 only): already modelled at ~$0.45 per 15s; price it between Standard and full Premium.
- [ ] **Annual plans** (2 months free): improves cash up front, cuts churn and per-charge Stripe fixed fees. [?] owner approval for price.
- [ ] **Prompt caching + Haiku draft** for the script step: measure cost drop vs quality.
- [ ] **Failed-job spend**: track `failedSpendUsd` from the report; any provider that bills for filtered/failed output needs a pre-check or a different vendor.
- [ ] **Pricing experiments** (via Stripe, owner-approved): Starter €14.99 vs €12.99/€17.99, top-up pack sizes, trial size (3,000 credits = acquisition cost).
- [ ] **Churn levers**: dunning emails, pause instead of cancel, win-back lifecycle email.
- [ ] **Fixed-cost audit** once billing data is connected (Vercel `list_billing_charges`, Supabase, ElevenLabs plan slots).

## 5. Tooling the CFO routine needs

| Need                                  | Status                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo access (GitHub)                  | Connected.                                                                                                                                                                       |
| Supabase (read-only SQL)              | Connector failed from the cloud session on 2026-10-17 (proxy tunnel); `.env.local` service role is not available in cloud runs. **Owner action:** fix/reauthorise the connector. |
| Stripe (MRR, churn, Sigma)            | Needs authorisation in claude.ai connector settings. Today only the sandbox account is linked; live MRR needs the live account in **read-only** mode (restricted key).           |
| Vercel (billing, usage)               | Connector present: `list_billing_charges`, usage, runtime logs.                                                                                                                  |
| fal.ai / ElevenLabs / Anthropic spend | No connector. Needs a monthly invoice/usage export (CSV in a private path) or a read-only usage key in the routine env. **Owner action.**                                        |
| Web research                          | WebSearch/WebFetch (vendor pricing pages may be blocked from the routine network).                                                                                               |
| Suggested additions                   | PostHog (funnel + paywall conversion), Sentry (failure rate → wasted spend), Resend (email cost), a Google Sheet or Notion page for the invoice log.                             |

## 6. Changelog (newest on top)

- **2026-10-17** — Track created: `FinancePlan.md`, `src/features/finance/unit-economics.ts` (+ tests), `scripts/finance-report.mts`, routine prompt `docs/routines/finance-cfo.md`.
