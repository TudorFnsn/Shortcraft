# FinancePlan — Shortcraft unit economics & cash

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`,
> which wins on product and priority; this file wins on cost, price and cash
> return. Every finance PR updates this file (numbers + changelog) in the same change.
>
> Last updated: 2026-10-20 (track created)

---

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash return first.** Watch MRR every run; cut cost per finished video; find what monetises better.                                                      |
| Steering  | Net MRR, gross margin (net MRR − API cost) / net MRR, cash coverage (net MRR ÷ all spend), cost per finished video per tier, free-user burn.                              |
| Autonomy  | **PR-gated.** Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe, provider dashboards or paid plans. Reads are free, writes need Tudor.    |
| Cadence   | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Weekly deep-dive on Mondays (vendor + pricing review). |
| Scope     | `config/models.ts`, `config/plans.ts`, `features/finance/`, `features/billing/margin.ts`, provider adapters (`features/providers/live/`), `scripts/`, this file.          |
| Hard rule | The **3x margin gate** (`scripts/margin-report.mts`) must stay green on _measured_ cost. A change that fails it does not ship. Never lower a price without the numbers.   |

## 2. Operating model: the DM master agent

The routine's main session is the **CFO master**. It does not research or code
everything itself: it reads the numbers, decides what matters, and **splits the
work across specialist sub-agents in parallel** (`.claude/agents/finance-*.md`),
then merges their findings into one decision and one PR.

| Agent                     | Job                                                                                                       | Writes code? |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| `finance-cost-auditor`    | Runs `finance-report` + `margin-report`; cost per tier/step, failed-job waste, tokens vs spend, anomalies | no           |
| `finance-vendor-scout`    | Prices & quality of cheaper/newer providers (video, image, voice, LLM, render, hosting); adapter effort   | no           |
| `finance-pricing-analyst` | Plans, top-ups, credit scale, annual plans, trial burn, upsells; simulates the margin gate                | no           |
| `finance-growth-analyst`  | Conversion, churn, retention levers that raise MRR; reads Stripe/Sigma and `metrics-report`               | no           |

The master picks **one** highest-cash-return item per run (savings per month or
MRR gained per month, in USD), has the right agent's finding verified, implements
it itself on a `ceo-finance/*` branch, and opens a PR. Before choosing it lists
open + recently closed PRs (an item with an open PR is in review).

## 3. Cost stack (what we pay, what drives it)

| Line                   | Vendor today                                  | Driver                                            | Cost (catalog, list price, **unmeasured**)          |
| ---------------------- | --------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Script LLM             | Anthropic Sonnet 5.5 ($2/$10 MTok)            | ~2k in / 1.5k out per video                       | $0.04 / video                                       |
| Image                  | fal.ai FLUX schnell / dev                     | per megapixel, 1 per scene                        | $0.003 / $0.025 per image                           |
| Premium AI video       | fal.ai Kling 2.5 Turbo Pro                    | billed seconds, fixed 5s clips                    | $0.07/s list, **$0.12/s in catalog**                |
| Voice                  | ElevenLabs Flash v2.5                         | characters (~15 chars/s)                          | $0.00075 / s of speech + **plan seat fee**          |
| Render                 | in-house ffmpeg on Vercel                     | function seconds                                  | ~$0.01 / video                                      |
| Standard motion        | local Ken Burns                               | none                                              | $0                                                  |
| Hosting / DB / storage | Vercel Hobby, Supabase free, Supabase Storage | users, egress                                     | fixed; **Hobby is not licensed for commercial use** |
| Email, errors          | Resend, Sentry                                | volume                                            | free tiers                                          |
| Payments               | Stripe                                        | 1.5% + €0.25 (EEA cards) + VAT 20% (gross prices) | in `REVENUE_ASSUMPTIONS`                            |

Known economics (TheMasterPlan §7): Standard video ≈ $0.04–0.05 API cost against ~2,000–3,000 credits (≈9x margin); Premium 30s ≈ $1.92 (Pro plan sits at exactly 3.0x, zero headroom). **Premium AI video is the only line that can lose money; free-trial burn is the second.**

### Token / cost visibility gap (fix first)

`render_jobs` stores only the **sum** `api_cost_usd` and `charged_credits`. We cannot yet answer "how many LLM tokens, image MP, video seconds and voice characters did a video use, and what did each cost?", nor compare our estimate with the invoice. Backlog item **F1**: add a per-step usage ledger (`job_usage`: job_id, step, provider, units, unit, cost_usd) written by the orchestrator, plus the Anthropic `usage` token counts already returned by `anthropic-script.ts`. Needs an additive migration (owner applies, per the migration rule).

## 4. Dashboards the routine reads each run

1. `npx tsx scripts/finance-report.mts --json` (MRR, cost by tier, free burn, margin, coverage). Needs `.env.local`/service role; in a cloud session use the Supabase connector's read-only SQL with the same selects (see §7).
2. `npx tsx scripts/margin-report.mts` (3x gate on catalog cost).
3. `npx tsx scripts/metrics-report.mts --json` (activation, trial → paid, retention).
4. Stripe connector (read-only): MRR, churn, refunds, failed payments, disputes.
5. Provider spend dashboards (fal.ai, ElevenLabs, Anthropic) — **owner supplies totals** until an API/connector exists (§6).

## 5. Backlog (ordered by expected cash return; the master re-ranks every run)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why / expected effect                                                                                      | Status                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| F0  | Finance report script + pure math (`features/finance`, `scripts/finance-report.mts`)                                                                                                                                                                                                                                                                                                                                                                                                             | MRR/cost/margin visible every run                                                                          | done 2026-10-20                         |
| F1  | Per-step usage ledger + token counts (migration, owner applies)                                                                                                                                                                                                                                                                                                                                                                                                                                  | measured cost; tokens vs spend; replaces list-price guesses                                                | todo                                    |
| F2  | **Measure real costs**, then lower catalog `costUsdPerUnit` (Kling 0.12 → measured) and re-run the gate                                                                                                                                                                                                                                                                                                                                                                                          | Pro has zero headroom at $0.12/s; list is ~$0.07/s → either more headroom or cheaper credits that convert  | needs owner totals                      |
| F3  | **Premium video vendor swap** behind `FAL_VIDEO_MODEL` / new adapter. Candidates to measure (list prices from search snippets, unverified): Seedance 2.0 Fast (~$0.02–0.09/s depending on source), Wan 2.5/2.7 (~$0.05–0.2/s), Kling 3.0 (~$0.08–0.11/s), VEED Fabric ($0.08/s), direct vendor APIs (ByteDance BytePlus, Alibaba DashScope ~$0.105/s) and resellers (Atlas Cloud) vs fal.ai markup. Self-hosting Wan 2.2 on rented H100 (~$2/h) ≈ $0.30+/5s clip: **not cheaper at our volume**. | Premium is ~96% of cost per Premium video; a 2–4x cheaper model frees the margin or allows a lower price   | todo                                    |
| F4  | **Hero-shot Premium**: AI clip on the hook scene only, stills elsewhere (~1/3 cost, ~$0.45 / 15s)                                                                                                                                                                                                                                                                                                                                                                                                | makes Premium sellable to Starter/Pro without losing the gate                                              | needs owner decision (TheMasterPlan §5) |
| F5  | Free-trial burn control: cap trial to Standard 15s, watermark (done), require email confirm (done), per-IP/device limit, block disposable emails                                                                                                                                                                                                                                                                                                                                                 | every trial costs ≈ $0.14 (Standard) – up to $3 if Premium were allowed; converts to MRR only if activated | todo                                    |
| F6  | Cut failed-job waste: refund is automatic, but provider cost is not. Check `failedCostUsd`; fail fast before expensive steps; retry only idempotent steps                                                                                                                                                                                                                                                                                                                                        | any failure after image/video steps burns real money for $0 revenue                                        | todo                                    |
| F7  | Cheaper script LLM for simple themes (Haiku 5.5 class) with Sonnet fallback; prompt caching for the theme system prompt                                                                                                                                                                                                                                                                                                                                                                          | script is the only per-video LLM line, ~$0.04 → ≈$0.01; prompt cache cuts input cost ~90%                  | todo                                    |
| F8  | Annual plans (2 months free) and credit expiry/rollover rules                                                                                                                                                                                                                                                                                                                                                                                                                                    | cash up front, lower churn, breakage                                                                       | pricing decision (owner)                |
| F9  | Top-up upsell at the moment of "not enough credits" + usage-based add-ons (extra voices, more length)                                                                                                                                                                                                                                                                                                                                                                                            | highest-intent moment; top-ups already carry 4–6x margin                                                   | todo                                    |
| F10 | Hosting: move off Vercel Hobby before charging (license), check Supabase Pro need (leaked-password protection, backups, storage egress → R2)                                                                                                                                                                                                                                                                                                                                                     | cost of staying legal and safe; compare Cloudflare/Fly/Railway; fixed ≈ $45–65/mo                          | owner decision                          |
| F11 | ElevenLabs: confirm the plan vs voice-slot needs; compare Cartesia / OpenAI TTS / Kokoro for Standard voice                                                                                                                                                                                                                                                                                                                                                                                      | seat fee is a fixed cost that dominates until volume exists                                                | todo                                    |
| F12 | Stripe: Stripe Tax vs manual VAT; fee optimisation (local payment methods, Link); dunning/smart retries to cut involuntary churn                                                                                                                                                                                                                                                                                                                                                                 | 20% VAT and ~3–5% fees decide net revenue                                                                  | owner                                   |
| F13 | Affiliate payout design (30% recurring per TheMasterPlan §6) priced against the margin gate                                                                                                                                                                                                                                                                                                                                                                                                      | acquisition without ad spend; payout must fit under the margin                                             | todo                                    |

## 6. What the CFO needs from Tudor (any info it needs, it asks for here)

The routine cannot read these on its own. Put the answers in a PR comment on the latest finance PR or paste them into `docs/finance/inputs.md`; the CFO reads that file each run.

1. **Monthly provider spend** (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, domain, any other) for the last full month, plus each plan tier you pay for. _Unblocks F2, F10, F11 and the fixed-cost line of the report._
2. **Invoiced totals** for the three first renders (2026-10-08) from the fal.ai / ElevenLabs / Anthropic dashboards (open since TheMasterPlan §5).
3. **Stripe live-mode status:** is any real revenue flowing yet? Which account may the CFO read once live (Stripe connector → add the live account, read-only)?
4. **Risk appetite:** may the CFO propose a vendor swap for Premium video before it is measured? May Premium be repriced (down or up) without asking?
5. **Fixed-cost budget:** target monthly burn ceiling and a minimum cash runway you want to see.

Suggested access (all optional, read-only first):

| Connector / tool                | Gives the CFO                                                            | Status                                                                       |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| GitHub (repo)                   | PRs, CI                                                                  | connected                                                                    |
| Supabase connector              | read-only SQL on `render_jobs`, `subscriptions`, `credit_transactions`   | configured; failed to connect from this cloud session (proxy tunnel) — retry |
| Stripe connector                | MRR, churn, refunds, Sigma analytics                                     | **needs authorisation** in claude.ai connector settings (sandbox only today) |
| Vercel connector                | plan, usage, billing charges (`list_billing_charges`), function duration | connected                                                                    |
| Anthropic Admin / Usage API key | exact token usage and spend per workspace (read-only admin key)          | not set up                                                                   |
| fal.ai / ElevenLabs usage       | spend per model (fal usage API key; ElevenLabs `/v1/usage` read key)     | not set up — add as routine secrets                                          |
| PostHog (or Plausible)          | funnel: visit → signup → first video → paid; CAC by channel              | not set up                                                                   |
| Sentry                          | failed-render rate → wasted spend                                        | DSN only                                                                     |
| A cost web-search tool          | live provider price pages                                                | routine uses WebSearch/WebFetch                                              |

## 7. Cloud-session notes

- The routine runs in a cloud session without `.env.local`; it reads data through the **Supabase connector** (`execute_sql`, read-only `select`s). Equivalent SQL for the report: `select model_tier, status, count(*), sum(api_cost_usd), sum(charged_credits) from render_jobs where created_at > now() - interval '30 days' group by 1,2;` and `select plan_id, status, count(*) from subscriptions group by 1,2;`.
- If a connector fails to connect, the routine says so in its notification and continues with what it has; it never invents numbers.

## 8. Changelog (newest on top)

- **2026-10-20** — Track created: charter, DM-master operating model with four specialist agents, cost stack, backlog F0–F13, owner questions, `features/finance/unit-economics.ts` + `scripts/finance-report.mts` (+6 tests). (Finance CFO, interactive)
