# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO**
> routine (prompt: `.claude/routines/finance-cfo.md`). It sits under
> `TheMasterPlan.md`: the master plan wins on product and priority; this file
> wins on costs, pricing evidence and cash. Every finance PR updates the KPI
> table and changelog here in the same change.
>
> Last updated: 2026-10-14 (created; no live numbers yet, see §2)

---

## 1. Charter

| Question  | Answer                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Maximum profit and **cash return first**. Then margin per video, then growth.                                                                           |
| Always    | Check the MRR ratio, compare AI/API spend with what it earns, hunt cheaper and better tech, propose or implement changes.                               |
| Structure | A DM-style master agent ("CFO") splits work across parallel sub-agents (Revenue, Unit economics, Vendor spend, Model scout, Pricing & growth, Builder). |
| Autonomy  | PR-gated like the other routines: branches `ceo-finance/<slug>`, never merges, never touches live secrets. Money-moving actions need Tudor's OK (§8).   |
| Cadence   | Daily cloud routine, suggested 07:00 UTC. Notifies only when something needs the owner.                                                                 |
| Guardrail | The 3x margin gate (`features/billing/margin.ts`) and fail-closed live mode stay. A provider swap needs a measured side-by-side first.                  |

---

## 2. KPIs (the CFO fills this every run; "unknown" is a valid value)

| KPI                                              | Definition                                                                                    | Latest            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------- |
| MRR                                              | Sum of normalised monthly price of active subscriptions (Stripe)                              | unknown           |
| **MRR ratio**                                    | MRR now ÷ MRR 30 days ago (growth), and MRR ÷ total monthly spend (coverage; <1 = burning)    | unknown           |
| Net MRR movement                                 | new + expansion − contraction − churned                                                       | unknown           |
| Net revenue retention / paid churn               | Stripe subscriptions, 30-day                                                                  | unknown           |
| Trial → paid                                     | `scripts/metrics-report.mts`                                                                  | unknown           |
| Cash in (30d) / cash out (30d)                   | Stripe payouts net of refunds and fees / sum of the ledger in §4                              | unknown           |
| API cost per finished video (standard / premium) | `scripts/finance-report.mts` (`render_jobs.api_cost_usd`)                                     | unknown           |
| Cost per 1k credits charged vs catalog           | measured ÷ `costUsdPerUnit` in `src/config/models.ts`                                         | unknown           |
| Failed-job burn                                  | API cost of jobs that ended `failed` (credits are refunded, the vendor bill is not)           | unknown           |
| Margin gate                                      | `npx tsx scripts/margin-report.mts` (last known: PASS, Pro exactly 3.00x, see Master Plan §7) | PASS (2026-10-05) |

Why "unknown" today: Stripe is a **test-mode sandbox** (Master Plan §9), so MRR
there is not revenue. The routine must say so instead of reporting test data as
real money, and flag the day live mode turns on.

---

## 3. Spend limits for experiments

Real-provider smoke tests the routine may run without asking: **none until the
owner sets a budget**. Proposed: US$5 per run, US$25 per month, only through
`scripts/live-providers-smoke.mts` with the owner's `FAL_KEY`. Pending (§8).

---

## 4. Cost ledger (every recurring and per-use cost; the Vendor spend agent keeps it current)

| Vendor        | What for                          | Billing model                         | Monthly (measured) | Source / how to read it                           |
| ------------- | --------------------------------- | ------------------------------------- | ------------------ | ------------------------------------------------- |
| fal.ai        | Images (FLUX), Premium video      | per image / per second of video       | unknown            | fal dashboard usage (no connector; needs export)  |
| Anthropic     | Script writer (Sonnet 5.5)        | tokens in/out                         | unknown            | Console usage/cost report (needs read access)     |
| ElevenLabs    | Voiceover, voice design, previews | characters, plan + custom-voice slots | unknown            | ElevenLabs usage page (needs read access)         |
| Supabase      | DB, auth, storage                 | plan + usage                          | unknown            | Supabase connector (failed to connect 2026-10-14) |
| Vercel        | Hosting, cron, bandwidth          | plan + usage                          | unknown            | Vercel connector `list_billing_charges`           |
| Stripe        | Payments                          | 1.5% + €0.25 (assumed), disputes      | unknown            | Stripe connector (sandbox only today)             |
| Resend        | Lifecycle email                   | plan                                  | unknown            | Resend dashboard                                  |
| Sentry        | Error tracking                    | plan                                  | unknown            | Sentry (no connector)                             |
| Domain / misc | —                                 | yearly                                | unknown            | owner                                             |

Token vs cost question (owner ask): script cost is `~2k in / 1.5k out` on
Sonnet 5.5 at US$0.04 per video (catalog). The live adapter should log real
input/output tokens per job so the routine can compare; see backlog **F2**.

---

## 5. Where the money goes per video (from the catalog, to be replaced by measured)

15s Standard ≈ US$0.07 (animated stills, in-house ffmpeg), sold at 2,024 credits.
Premium (AI video) is the expensive path: 15s ≈ US$1.10–1.80 depending on the
model, sold at ~26.5k credits. Pro plan sits at exactly 3.00x worst case, so any
measured cost increase fails the gate. Video generation on fal.ai is the one
line that can sink margin; images, script, voice and render are cents.

---

## 6. Backlog (ranked by € per month ÷ effort; CFO re-ranks each run)

Prices below are **not** verified. Each item needs a dated, sourced price and a
measured side-by-side before it goes live.

| #   | Item                                                                                                                                                                                                              | Why / expected effect                                           | Status    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| F1  | Wire real cost metering: store per-step cost and provider usage on each job (migration, owner-applied)                                                                                                            | Everything else needs measured numbers                          | proposed  |
| F2  | Log Anthropic input/output tokens and ElevenLabs characters per job; add cache hits (prompt caching) to the script adapter                                                                                        | Token cost vs video revenue; prompt caching cuts repeated input | proposed  |
| F3  | Premium "hero shot" (AI clip on scene 1 only) priced close to Standard                                                                                                                                            | Keeps AI-video appeal at a fraction of the cost                 | candidate |
| F4  | Model scout: compare current fal video model with cheaper image-to-video options (other fal models, Replicate, Runway, Luma, Pika, Hailuo/MiniMax, Seedance, Wan, LTX, self-hosted open models on serverless GPU) | fal.ai video is the biggest variable cost                       | candidate |
| F5  | Cheaper voice path for Standard (e.g. lower-cost TTS tier or provider for non-premium voices, keep ElevenLabs for designed voices)                                                                                | ElevenLabs characters are the second-largest per-video line     | candidate |
| F6  | Cache and reuse: deduplicate identical scene images, reuse theme stock clips and music beds, reuse voice previews                                                                                                 | Zero-marginal-cost videos                                       | candidate |
| F7  | Annual plans (2 months free) and credit expiry rules                                                                                                                                                              | Cash up front, lower churn; needs owner approval (Stripe write) | proposed  |
| F8  | Dunning and failed-payment recovery emails; Stripe smart retries                                                                                                                                                  | Recovers revenue already earned                                 | proposed  |
| F9  | Pay-per-video top-up bundles and upsell prompts at the moment credits run out                                                                                                                                     | Raises ARPU without new acquisition                             | proposed  |
| F10 | Watermark-removal and priority-render add-ons                                                                                                                                                                     | High-margin extras                                              | candidate |
| F11 | Affiliate economics model (30% recurring, Master Plan §6): break-even per referred subscriber                                                                                                                     | Keeps CAC below first-month revenue                             | candidate |
| F12 | Vercel/Supabase plan right-sizing (usage vs plan)                                                                                                                                                                 | Cuts fixed costs                                                | candidate |

---

## 7. Tooling the CFO uses or needs

Available now: GitHub, Stripe (sandbox), Supabase (cloud connector failed once;
retry), Vercel (billing, runtime logs, analytics), WebSearch/WebFetch, the repo
scripts (`margin-report`, `metrics-report`, `finance-report`).

Would help (owner to enable; each is optional):

1. **Read-only Stripe key / live-mode connector** once the shop is live: MRR, churn, payouts. Restricted key with read scopes only.
2. **fal.ai usage export** (dashboard CSV, or an API key restricted to usage) and **Anthropic Console cost report / Admin API key (usage read)**, **ElevenLabs usage**. Cheapest path: a monthly CSV dropped into a private `finance/` folder, or a read-only key in the routine's environment.
3. **Resend, Sentry, PostHog** connectors if they exist in your claude.ai directory (search "Resend", "Sentry", "PostHog"); PostHog would add funnel data for the pricing experiments.
4. **A Google Sheets or Notion connector** if you want the cost ledger kept outside the repo.
5. **Supabase**: re-authenticate the connector (it failed with ERR_PROXY_TUNNEL on 2026-10-14); the CFO needs read-only SQL on `render_jobs`, `credit_transactions`, `subscriptions`.
6. Claude tools: Workflow/Agent fan-out (already used), `xlsx` skill for the monthly P&L sheet, `dataviz` for the digest charts.

---

## 8. Questions for the owner (the CFO appends here instead of guessing)

1. Monthly fixed costs not visible from code (domain, tools, subscriptions)?
2. Is Stripe going live soon? Until then MRR cannot be real. Target date?
3. Smoke-test budget for real provider calls (proposed US$5/run, US$25/month)?
4. Can I use annual plans, a price change, or a coupon (needs Stripe writes)?
5. Share fal.ai, Anthropic and ElevenLabs usage (CSV or read-only key)?
6. Profit target (monthly € or margin %) so ideas can be ranked against it?

---

## 9. Changelog

- **2026-10-14** — Finance track created: charter, KPI table, cost ledger, backlog, routine prompt (`.claude/routines/finance-cfo.md`) and `scripts/finance-report.mts` (read-only cost vs credits per tier). No live data was reachable in this session (Supabase connector failed; Stripe is test mode), so all KPIs are "unknown". (Finance CFO, setup)
