# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine.
> Product and priority calls stay in `TheMasterPlan.md` (§7 pricing, §8 risks).
>
> Last updated: 2026-10-16

## 1. Charter

Goal: **maximise cash return**. Every run answers four questions, in this order:

1. **How big is MRR and which way is it moving?** (`scripts/finance-report.mts`)
2. **Where does each euro go?** API spend per video and tier, hosting, email, error tracking, Stripe fees, VAT.
3. **What is the cheapest change that raises margin or MRR?** Cheaper providers, caching, pricing, plan mix, churn and trial-leak fixes.
4. **What do I need from the owner to know more?** Missing data is asked for, never guessed.

Cash first: a change that saves or earns money this month beats one that is elegant. Never trade away the §7 margin gate (≥3x worst case on every plan) or the safety rules (moderation, AI labels) for cost.

## 2. The DM master agent and its workers

The routine's main session is the **DM (master) agent**. It reads this file, loads the numbers, splits the work and merges the answers. It spawns workers in parallel with the `Agent` tool (one message, several calls) and keeps only their conclusions.

| Worker          | Job                                                                                                                              | Reads                                                   | Writes                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| **Revenue**     | MRR/ARR, plan mix, churn, trial → paid, failed payments, refunds, top-up share. Spots pricing and packaging wins.                | `finance-report.mts`, `metrics-report.mts`, Stripe      | §4 numbers               |
| **Unit cost**   | Cost and credits per video by tier; failed-job waste; script tokens (in/out) vs cost; realised vs gate markup.                   | `render_jobs`, `models.ts`, `anthropic-script.ts`       | §4 numbers               |
| **Vendors**     | Re-prices every slot (video, image, voice, LLM, render, hosting, email) against alternatives; checks what current ones now cost. | web search, vendor pages, invoices if provided          | §5 shortlist             |
| **Infra spend** | Vercel usage and billing, Supabase plan and size, Sentry, Resend, domain. Finds idle or oversized spend.                         | Vercel and Supabase connectors, owner-provided invoices | §4 numbers               |
| **Implementer** | Builds the one approved-by-rule change as a PR (adapter, catalog row, cache, report).                                            | the repo                                                | code on `cfo/*` branches |

The DM agent picks **one** change per run (highest cash return per effort, not already in an open PR), runs the Implementer on it, and reports the rest as proposals.

## 3. Rules

- **Read first:** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recently closed PRs (an item with an open PR is in review).
- **Autonomy: PR-gated.** Branches `cfo/*`. Never merge. Never touch live secrets, live Stripe, or production data. Connectors are read-only (TheMasterPlan §9).
- **Needs the owner's OK before it ships:** any change to customer prices, credit grants, plan limits, or a provider swap that changes output quality. The routine writes the proposal with numbers; the owner approves in the PR or by editing §6.
- **May change on its own (in a PR):** `src/config/models.ts` cost fields once measured, new adapters behind the registry (off until measured), caching and retry/waste fixes, `scripts/finance-*`, `src/features/metrics/finance*`, this file, finance lines of `TheMasterPlan.md`. It leaves UI files to the Design CEO.
- **Evidence bar:** a price counts as _verified_ only from the vendor's own page or a real invoice or API response. Search snippets are _unverified_ and labelled so. Replace researched costs with **measured** `api_cost_usd` as soon as live jobs exist.
- **Gate:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode, plus `npx tsx scripts/margin-report.mts` still passing.
- **Notify the owner (PushNotification) only when** MRR falls week over week, gross margin drops below 70% or a plan falls under 3x, failed-job waste exceeds 5% of API spend, a vendor price change breaks the gate, a payment is failing, or the routine is blocked on data it needs. Quiet runs stay quiet.

## 4. Latest numbers

_No live data read yet._ First run: `npx tsx scripts/finance-report.mts --json` and `npx tsx scripts/metrics-report.mts --json`, then paste the date and figures here (MRR, subscribers by plan, cost per video by tier, margin, failed-job waste).

Known from the code (2026-10-16):

| Item                 | Value                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Plans (EUR/mo)       | Starter 14.99 · Pro 29.99 · Ultra 79.99                                                                                       |
| Standard 15s video   | ~$0.07 API (script $0.04 + FLUX schnell images + voice + in-house ffmpeg); Ken Burns stills, **no video model**               |
| Premium AI video     | fal.ai Kling 2.5 Turbo Pro, ~$0.07/billed second, bills fixed 5s clips; catalog assumes $0.12/s (to be measured)              |
| Gate                 | Starter 9.4x · Pro 3.00x · Ultra 3.23x · top-ups 4.0–5.9x (fail-closed on live mode)                                          |
| Not stored in the DB | Script tokens (only the USD cost is metered), hosting, email, Sentry and Stripe fees. These need invoices or connectors (§7). |

## 5. Cost-cutting shortlist (unverified until the Vendors worker confirms)

Premium video is the only large cost, so it comes first. fal.ai also resells these models, so a swap is usually one env var (`FAL_VIDEO_MODEL`) or one adapter, not a new account.

1. **Measure before anything:** run `scripts/live-providers-smoke.mts --premium` once and record real `api_cost_usd`; the catalog's $0.12/s is a conservative guess and Pro sits at exactly 3.00x.
2. **Hero-shot premium:** AI clip on scene 1 only, stills for the rest (~$0.45 per 15s vs ~$1.10). Biggest saving with the smallest quality loss. Needs a product decision.
3. **Cheaper image-to-video models to price against Kling:** Wan 2.x, LTX-2 Fast, Seedance Lite/Fast, Hailuo, and Veo 3.1 Fast. Check per-second price, minimum billed length (Kling's fixed 5s is why short scenes cost extra) and 9:16 support.
4. **Direct-provider or open-model hosting** (Replicate, Together, Runware, WaveSpeed, self-hosted on a GPU rental) when monthly video seconds make the reseller markup bigger than the ops cost. Not before there is volume.
5. **LLM:** script is ~$0.04/video on Sonnet. Use prompt caching for the fixed system prompt, a Haiku-class model for moderation/rewrites, and the Batch API for non-urgent work. Measure tokens in/out per job first (add them to the metering if the owner wants a split).
6. **Voice:** ElevenLabs Flash is cheap per second; the risk is custom-voice slots and the plan tier. Compare Cartesia, OpenAI TTS and Google Chirp only if voice becomes >10% of API cost.
7. **Waste:** failed jobs that already spent API money, regenerate loops, and the free trial (3,000 credits ≈ one short video, ~$0.25 burn per signup).
8. **Fees and tax:** annual plans (cash up front, lower churn, fewer Stripe fixed fees), Stripe Tax/OSS handling, and regional pricing.
9. **Infra:** Vercel Hobby vs Pro limits (a commercial app may need Pro; confirm against Vercel's terms), Supabase plan size, Sentry quota, Resend tier.

## 6. Decisions waiting on the owner

_None yet._ The routine adds rows here: change, expected monthly saving or gain in EUR, risk, and the PR link.

## 7. Data and connectors the CFO needs

| Need                                                                 | Why                                                            | How                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Supabase read access from the routine**                            | MRR, cost per video, waste (`finance-report.mts`)              | The Supabase connector failed to connect in cloud sessions (proxy tunnel). Add the project's host to the routine environment's network allowlist, or set `SUPABASE_URL` + a **read-only** key as routine env vars. |
| **Stripe connector (authorize it)**                                  | Real MRR, churn, refunds, failed payments, fees, Sigma queries | claude.ai → Settings → Connectors → Stripe → connect. Currently test mode; live later.                                                                                                                             |
| **Vercel connector**                                                 | Usage, billing charges, runtime errors, cost per function      | Connected in this session (`list_billing_charges`, usage tools); keep it on.                                                                                                                                       |
| **Network access to vendor pages**                                   | Price checks (earlier routines were blocked)                   | Routine environment → network policy → allow fal.ai, replicate.com, elevenlabs.io, anthropic.com, vercel.com, supabase.com, resend.com                                                                             |
| **Invoices** (fal, ElevenLabs, Anthropic, Resend, Sentry, domain)    | These spends are not in the DB                                 | Drop monthly totals into §4, or give the routine API keys with usage/billing scope only (fal and Anthropic offer usage endpoints).                                                                                 |
| **Anthropic usage**                                                  | Tokens vs cost for the script step                             | Admin/usage API key with read scope as a routine env var, or paste the monthly console export.                                                                                                                     |
| Optional: **PostHog or Plausible** (read), **Google Search Console** | Visitor → signup → paid, SEO payback                           | Connector if available.                                                                                                                                                                                            |
| Optional: **Sentry connector**                                       | Failure causes behind wasted spend                             | Connector.                                                                                                                                                                                                         |

Questions for the owner (answer by editing this list): current monthly infra bill; target gross margin; is annual billing allowed; are price changes allowed for new customers only; is a lower-quality premium tier acceptable.

## 8. Routine

Weekly (Monday 07:00 UTC) cloud routine, Opus-class model, PR-gated, created from the prompt in `docs/routines/finance-cfo.md`. A daily cadence is not needed until there is revenue to watch.

## 9. Changelog

- **2026-10-16** — Finance track created: charter, DM + worker roster, rules, vendor shortlist and data needs (this file); `features/metrics/finance.ts` (MRR, per-tier cost, waste, realised markup; pure, +4 tests); `scripts/finance-report.mts` (read-only). No live data read yet. (CEO, owner request)
