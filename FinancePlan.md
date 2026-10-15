# FinancePlan — Shortcraft profit & unit economics

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing experiments and cash. Every finance run updates this file
> (baseline, backlog, changelog) in the same change.
>
> Last updated: 2026-10-15 (created; no live revenue data read yet)

---

## 1. Charter (owner request 2026-10-15, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Maximise **profit and cash return**. Check MRR every run; propose or implement changes that monetise the app better.                                                   |
| Scope     | Revenue (plans, top-ups, conversion, churn, pricing), **cost per video** (every provider), fixed costs (hosting and tools), payment fees and VAT, new cheaper tech.   |
| Headline  | fal.ai video looks expensive. Find cheaper or better models and vendors, **measured on real calls**, not on list prices.                                              |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge. Read-only on live money systems.                                                    |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"** (suggested 07:30 UTC, after the main CEO at 06:00 and before Design at 09:00). Weekly deep run on Mondays.            |
| Squad     | A **master agent** (this routine's session) that splits work to sub-agents (§4) and merges their results into one PR and one digest.                                  |

### Principles

1. **Cash before cleverness.** Rank every idea by expected extra euros per month ÷ effort, and by payback time. A saving that needs a week of work for €3/month loses to a pricing tweak that takes an hour.
2. **Measure, don't quote.** List prices disagree by up to 2x (TheMasterPlan §7). A vendor swap is only "proven" with a smoke-script run that records real `api_cost_usd`.
3. **Margin gate stays.** No change may take any plan or top-up below **3x** worst-case API cost (`npm run` → `npx tsx scripts/margin-report.mts`). Fail-closed stays fail-closed.
4. **Quality is a cost too.** A cheaper model that raises render failures or refunds, or that creators dislike, is not cheaper. Check failure rate and refunds next to cost.
5. **No surprises about money for customers.** Price changes need 30 days' notice (Terms), so they are always owner decisions.

---

## 2. Baseline (fill from live reads; numbers below are the repo's, not revenue)

**Revenue side** (Stripe is test mode only today, account "Shortcraft sandbox"; see §6 blockers).

| Metric                       | Value  | Source / how to read                                                                          |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| MRR (EUR, net of VAT)        | _n/a_  | Stripe: list active subscriptions → sum `price × quantity` normalised to month (Sigma is not enabled) |
| Paying subscribers           | _n/a_  | same                                                                                          |
| ARPU, top-up revenue         | _n/a_  | Stripe charges + `credit_transactions` (top-ups)                                              |
| Trial → paid                 | _n/a_  | `npx tsx scripts/metrics-report.mts` (needs `.env.local` service role)                        |
| Paid churn                   | _n/a_  | Stripe subscription cancellations ÷ start-of-period actives                                   |
| Refunds + disputes           | _n/a_  | Stripe                                                                                        |

**Cost side** (catalog values, `src/config/models.ts`, unmeasured):

| Step              | Model today                   | Catalog cost            | Notes                                                              |
| ----------------- | ----------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Script            | Claude Sonnet 5.5             | $0.04 / video           | Candidate: Haiku 5.5 + prompt caching + shorter schema             |
| Image             | FLUX schnell on fal           | $0.003 / image          | Already cheap; check batch/other hosts                             |
| Image (premium)   | FLUX dev on fal               | $0.025 / image          |                                                                    |
| Video (Standard)  | Ken Burns, in-house ffmpeg    | $0                      | The everyday product, ~9x margin                                   |
| Video (Premium)   | Kling 2.5 Turbo Pro on fal    | $0.12 / s (list ~$0.07) | **The biggest cost.** ~$1.10–1.80 per 15s video. Main saving target |
| Voice             | ElevenLabs Flash v2.5         | $0.00075 / s            | Plus a custom-voice slot cost per saved voice                      |
| Render            | In-house ffmpeg               | $0.01 / video           | Serverless compute                                                 |

**Fixed costs to track** (owner to confirm tiers, §6): Vercel (Hobby), Supabase (free/Pro), ElevenLabs plan, Resend, Sentry, domain, Anthropic/fal prepaid balances, Stripe fees (≈1.5% + €0.25 EU cards, more for non-EU), VAT handling.

---

## 3. Backlog (ranked by cash impact; the routine takes the top item that has no open `ceo-finance/*` PR)

Status: `[ ]` open · `[~]` in review · `[x]` done · `[?]` needs owner or data.

### P — Premium video cost (biggest lever)

- `[ ]` **P1. Real cost per Premium video.** Run `scripts/live-providers-smoke.mts --premium` (needs `FAL_KEY`, owner-run or a funded key) and record real fal billing per clip; replace the $0.12/s guess in `models.ts`. Without this every other number is a guess.
- `[ ]` **P2. Model/vendor bake-off for image-to-video.** Candidates to verify live (prices change monthly; use Firecrawl/WebSearch on the vendor pages, never snippets alone): Kling (direct API vs fal), Wan 2.x (open weights, many hosts), LTX-2 / LTX Video, Seedance, Hailuo/MiniMax, Veo Fast, Runway/Luma budget tiers; hosts fal, Replicate, Runware, WaveSpeed, Novita, Together, DeepInfra, Modal/RunPod self-host. Output: a table of $/second of 720p, clip length rules (fixed 5s clips cost more per used second), p50 latency, failure rate, and a side-by-side sample frame set. The adapter layer makes a swap one file + one catalog row.
- `[ ]` **P3. Hero-shot Premium.** AI clip on scene 1 only, stills elsewhere: ~$0.45 per 15s video. Model it in `margin.ts`, propose a price between Standard and full Premium.
- `[ ]` **P4. Clip reuse and trimming.** Request the shortest clip that covers the scene, cache clips per (image, prompt), and never regenerate on retry after a persisted step.

### S — Script, voice, image cost

- `[ ]` **S1. Script on a cheaper model.** A/B Haiku 5.5 vs Sonnet 5.5 on the script schema (quality rubric + failure rate); add prompt caching for the fixed system prompt. Even at $0.04 → $0.01 this matters only on Standard, where it is now the largest line after render.
- `[ ]` **S2. Voice cost.** Compare ElevenLabs Flash against cheaper TTS that still gives word timings (needed for captions): Cartesia, Deepgram Aura, OpenAI TTS plus forced alignment, self-hosted Kokoro/Piper. Check the ElevenLabs plan tier against actual character volume.
- `[ ]` **S3. Image hosts.** Same FLUX schnell on Runware/Together/other at lower $/MP; batch endpoints.

### R — Revenue, pricing, retention (all owner-approved before shipping)

- `[ ]` **R1. Annual plans** (e.g. 2 months free): cash up front, lower churn. Stripe prices are a write → owner OK, then `scripts/stripe-setup.mts`.
- `[ ]` **R2. Top-up and credit-pack packaging:** best-value anchor, "most popular" badge, a low entry pack (€5–9) to convert trial users; test via `/pricing` copy only.
- `[ ]` **R3. Trial economics:** trial burn is ~$0.25 per signup. Compare against trial → paid once data exists; consider a card-required trial or a smaller trial for Premium.
- `[ ]` **R4. Failed-payment recovery:** Stripe Smart Retries and dunning emails on (settings, not code); lifecycle email for `past_due`.
- `[ ]` **R5. Upsell moments:** at the paywall and when a Starter user hits a plan limit; show the plan that unlocks it (exists in UI, measure it).
- `[ ]` **R6. Churn exit survey and pause option** in the Stripe portal; win-back email (needs opt-in rules, see lifecycle email decision).
- `[ ]` **R7. Affiliate economics:** 30% recurring is in the plan (TheMasterPlan §6); model it against margin so it never goes below 3x on the discounted revenue.

### F — Fixed costs and fees

- `[ ]` **F1. Stack bill.** List every recurring cost with current tier and the trigger to upgrade or downgrade (Vercel, Supabase, ElevenLabs, Resend, Sentry, Anthropic, fal). Flag anything paid but unused.
- `[ ]` **F2. Stripe fees and VAT.** Confirm Stripe Tax decision, EU OSS, currency handling, and the VAT/fee assumptions in `REVENUE_ASSUMPTIONS` (`features/billing/margin.ts`).
- `[ ]` **F3. Storage and egress.** Retention policy for finished MP4s (Supabase Storage grows with every video); move to R2 (no egress fee) when storage or egress costs justify it.

---

## 4. The squad (how the master agent splits the work)

The routine's own session is the **master agent**. It does the reading, picks the item, delegates in parallel, reviews every result, then writes the single PR and the digest. Sub-agents get a self-contained brief and return findings, never edits to shared files.

| Sub-agent            | Job                                                                                                                       | Tools                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Revenue analyst**  | MRR, subscribers, ARPU, churn, refunds, disputes, trial → paid. Writes §2 numbers and the MRR trend line.                  | Stripe (read), Supabase (read), `metrics-report` |
| **Cost analyst**     | Real tokens and dollars per video: `render_jobs.api_cost_usd` by tier/step, Anthropic usage (input/output tokens per script), fal and ElevenLabs bills, failure and retry waste. Credits charged vs API cost per job. | Supabase (read), `margin-report`, provider billing pages if reachable |
| **Vendor scout**     | Finds cheaper or better models and hosts (§3 P2, S2, S3); verifies prices from vendor pages; proposes a swap with evidence. | Firecrawl, WebSearch, WebFetch          |
| **Pricing modeller** | Re-runs the margin gate for any proposed change, models plan and credit changes, annual plans, packs, affiliate cuts.     | repo + `margin-report`                  |
| **Infra auditor**    | Fixed costs and plan tiers (Vercel, Supabase, storage growth, cron frequency, logs), Stripe fees and VAT.                  | Vercel (read), Supabase advisors/logs   |
| **Implementer**      | Turns the chosen item into code on a `ceo-finance/<slug>` branch with tests; runs the full bar.                            | repo                                    |

The master agent must not delegate what it can check in two tool calls, runs the analysts and the scout in parallel, and keeps the number of agents proportional to the day's item (a pricing tweak needs the modeller, not the scout).

---

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 monetisation, §8 risks, §9 runbook, latest changelog), this file, `git log -20`, open and recent PRs (open + recently closed, so an item in review is not picked twice), and the open `ceo/*` and `ceo-design/*` PRs so it never edits the same files.
- **Every run, in this order:**
  1. **MRR check.** Read live Stripe subscriptions (read-only) and compute MRR, subscribers, new, churned. Compare with the last line in §7 below. If Stripe has no live data, say so, report the sandbox numbers separately, and do not invent revenue.
  2. **Cost check.** Read `render_jobs` costs (Supabase, read-only) and compute API cost per video by tier and the gross margin on credits charged vs cost. Compare with the catalog; if measured cost exceeds catalog for any model, that is a margin-gate alert.
  3. **Pick one item** from §3 (top unchecked, no open PR), or the item that fixes an alert from steps 1–2.
  4. **Split the work** to the squad (§4), merge results, implement or propose.
  5. **Append a line to §7 (MRR & cost log)** and the changelog, and update the TheMasterPlan finance lines.
- **Files it may change:** this file, `src/config/models.ts` and `src/config/plans.ts` **only for measured cost values**, `src/features/billing/margin.ts`, `src/features/providers/**` (new adapters behind the existing port, registered but **not default** until measured), `scripts/**`, `tests/**` for those, `.env.example`, and finance lines of `TheMasterPlan.md`. It never changes customer-facing **prices, credit amounts, Stripe objects, Terms or refund wording** without Tudor's explicit OK in this file or in the conversation; it proposes them as a table with the margin-gate result instead.
- **Live systems:** read-only. No Stripe write, no migration applied, no env var changed, no vendor account created or funded. A new vendor adapter is committed behind a flag and its smoke script is handed to Tudor to run with a key.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, plus `npx tsx scripts/margin-report.mts` passes (gate ≥ 3x).
- **Notify (PushNotification) only when it matters:** MRR dropped ≥10% week over week, a payment/dispute spike, measured cost above catalog (margin gate fails), a vendor swap saving ≥20% of cost per video, an owner decision is blocking money, or the routine could not read Stripe/Supabase. A quiet "all healthy" run sends nothing.
- **Output:** a digest with MRR (now, last week, change), cost per video by tier, gross margin, what moved, PR links, what is waiting on Tudor, and the next item.

---

## 6. What the routine needs from the owner (blockers)

1. **Live Stripe, read-only.** The connector only sees the *sandbox* account (`acct_1UKkSC0LHtTQ4zpU`, test mode) and Sigma is not enabled, so there is no real MRR yet. When the live account exists: connect it, and either enable Sigma or let the routine read `subscriptions`/`charges` through the API (read is enough). Ideally create a **restricted read-only key**.
2. **Supabase read access from the cloud.** The project's MCP failed to connect in this session (proxy tunnel error); the claude.ai Supabase connector is connected. Needed: `render_jobs` (cost, status, tier, duration), `credit_transactions`, `subscriptions`. Alternative: a Postgres **read-only role** and a `FINANCE_DB_URL` secret in the routine's environment so `metrics-report` style scripts can run.
3. **Provider billing data.** Real spend per vendor: fal usage export or billing page, ElevenLabs usage, Anthropic Console usage (tokens). Easiest: the owner pastes a monthly export into `docs/finance/` (CSV), or provides **admin/usage-only API keys** (Anthropic Admin API for usage and cost; fal and ElevenLabs usage endpoints).
4. **`FAL_KEY` (and a small prepaid budget)** to run the smoke scripts that measure real clip cost for P1/P2. A hard budget cap, e.g. €10, is plenty.
5. **Fixed-cost list** (F1): which plan tier each tool is on and the monthly price, plus the domain and any other subscription.
6. **Business inputs:** target monthly profit, how much monthly spend on ads is acceptable, EU VAT status/Stripe Tax decision, and whether price changes (annual plan, new pack) may be tested.

### Connectors and tools that would help

| Tool                                       | Why                                                                                              | Status                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------- |
| Stripe (live, read)                        | Real MRR, churn, refunds, fees, disputes                                                         | Sandbox only          |
| Supabase connector                         | `render_jobs.api_cost_usd`, ledger, subscriptions                                                | Connected (MCP file: failing) |
| Vercel connector                           | Usage and billing charges (`list_billing_charges`), function duration, bandwidth                 | Connected             |
| Firecrawl                                  | Read vendor pricing pages reliably (the routine's network blocked some pages before)             | Connected, **not enabled in routine sessions** |
| Anthropic Admin/Usage API key              | Exact tokens and dollars per script call                                                         | Not set up            |
| PostHog (analytics)                        | Funnel visitor → signup → paid, to find the conversion lever                                     | Planned in master plan |
| Google Drive / Sheets connector            | Optional: a finance spreadsheet the owner edits (fixed costs, targets)                           | Not connected         |
| Gmail connector                            | Optional: pick up vendor invoices                                                                | Not connected         |
| Sentry                                     | Render failure rate = wasted spend                                                               | Installed in app; no connector |
| Open-source: `ccusage`-style cost logging  | Not needed for the app; the DB already records per-job cost                                      | n/a                   |

---

## 7. MRR & cost log (newest first; the routine appends one line per run)

- _2026-10-15 — plan created. MRR: no live data (Stripe sandbox only, Sigma not enabled). Cost: catalog only, nothing measured._

---

## 8. Changelog

- **2026-10-15** — Finance track created: charter, backlog, squad, rules, blockers. No code changes. (Finance CEO, interactive setup)

## 9. Decision log

- **Finance runs as its own routine and plan file** (2026-10-15, owner) → money decisions need a daily MRR read and a vendor-research habit that the product CEO has no slot for, and finance must be able to stop a launch (margin gate) without owning product scope. It reads everything, writes only cost data, adapters and its own file, and proposes every customer-facing price change.
- **Vendor swaps need measured cost and quality, not list prices** (2026-10-15) → list prices disagreed by up to 2x in the 2026-10-04 research and Kling bills fixed 5s clips, so $/second on a page is not the cost per scene.
