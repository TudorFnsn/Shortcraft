# FinancePlan — Shortcraft Business CEO

> Owned by the **Business CEO** routine (`Shortcraft Business CEO`): a DM-style master agent that
> watches money (MRR, unit economics, vendor costs, fixed costs) and proposes or implements changes
> that raise cash return. Sibling of the CEO routine (`TheMasterPlan.md`) and the Design CEO
> (`DesignPlan.md`). Rules: read-only on Supabase/Stripe/Vercel; code changes go in a PR on a
> `ceo-biz/*` branch; pricing/credit-scale changes need the owner's OK; never touches live secrets.
> Last updated: 2026-10-19 (first run).

## 1. How the routine runs (master agent + specialists)

Each run the master reads this file, pulls the numbers (§2), then fans out only what is stale:

| Specialist         | Question it answers                                                                              | Tools                                  |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Revenue analyst    | MRR, subscribers, churn, trial → paid, ARPU                                                      | Stripe connector, Supabase SQL         |
| Unit-economics     | measured `api_cost_usd` vs credits charged, per tier/length; failed-job cost; margin gate re-run | Supabase SQL, `scripts/margin-report`  |
| Vendor scout       | cheaper/better video, image, voice, LLM options; re-check list prices monthly                    | WebSearch, Firecrawl                   |
| Fixed-cost auditor | hosting/DB/email/monitoring bills and plan-tier triggers                                         | Vercel connector (billing), dashboards |
| Pricing/growth     | annual plans, top-up packs, upgrade nudges, referrals, trial burn                                | Stripe, code                           |
| Implementer        | turns an approved item into a small PR (adapter swap, model-catalog row, config) with tests      | repo                                   |

Spawn specialists in parallel; the master merges, ranks by **€ per month per hour of work**, and
sends one notification only when something needs the owner.

## 2. Snapshot — 2026-10-19 (Supabase read-only, live DB)

- Users 6 · subscriptions 2 (both **Pro**, active) · videos done 14, failed 3 (failed jobs cost $0).
- **MRR (if real): 2 × €29.99 = €59.98 gross ≈ €48.6 net of VAT, ≈ $52 net of VAT + Stripe fees.**
  Caveat: the Stripe connector shows **"Shortcraft sandbox", test mode, and needs reconnecting**, so these
  subscriptions are probably test-mode. Treat **real MRR as €0 until live Stripe is confirmed.**
- Measured API cost per finished video (`render_jobs.api_cost_usd`):

| Tier                   | n   | Measured cost                     | Charged             | Reading                                                                                                                                                  |
| ---------------------- | --- | --------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard 15s           | 9   | $0.036–0.066                      | 1,760–1,960 credits | Matches catalog (~$0.04). ≈ $0.46 of Pro-plan revenue per video → **~11x** margin.                                                                       |
| Premium 30s (AI video) | 3   | $1.92 each                        | 42,636 credits      | Identical to the cent on all three → looks like **catalog cost, not a measured fal bill** (fal was unreachable from the sandbox). Not real evidence yet. |
| Outlier                | 1   | $1.959 (15s standard, 2026-09-28) | 0                   | Pre-stills pipeline test; ignore.                                                                                                                        |

- Credit value on Pro: €29.99 → ≈ $26.2 net per 100k credits. A 30s Premium video is billed ≈ 42.6k credits
  ≈ $11.2 revenue vs ≈ $1.92 cost → ~5.8x. Healthy; the exposure is the unmeasured cost, not the price.
- Trial burn ≈ $0.14–0.25 per signup (3,000 credits). Cheap acquisition cost; fine.

**Data gaps (the routine cannot see these yet):** real Stripe revenue (connector needs reconnect + live mode),
actual vendor invoices (fal, ElevenLabs, Anthropic), Vercel/Supabase bills, Search Console traffic.

## 3. Where the money goes

Variable (per video, Standard 15s ≈ $0.04):

1. **Script (Claude Sonnet 5.5): ~$0.04 budgeted, the largest slice.** Images ~$0.003 × scenes, voice ~$0.01, render ~$0.01.
2. Premium: AI clips dominate (~$0.35 per 5s Kling clip, ≈ $1.1–2.1 per 15–30s video).

Fixed (monthly, estimates from public list prices; verify on invoices):

| Item            | Now                          | Trigger to pay                                                                  |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Vercel          | Hobby (free)                 | **Hobby is non-commercial.** Move to Pro (~$20/mo) before taking live payments. |
| Supabase        | Free? (project `ShortCraft`) | Pro ~$25/mo for backups/no pausing before real users                            |
| ElevenLabs      | plan unknown                 | Custom-voice slots (Voice Studio V4) need a paid tier (~$22+/mo)                |
| Resend / Sentry | free tiers                   | Resend 100/day cap; Sentry free quota                                           |
| Domain          | none yet                     | ~€10–15/yr                                                                      |

Rough break-even once fixed costs are live: **~$65–70/mo ÷ $26 net per Pro sub ≈ 3 paying Pro subscribers**
(variable cost at typical use is a few dollars per subscriber). Priority is therefore subscribers, not cost cutting.

## 4. Ranked proposals

1. **Go live on Stripe and confirm real MRR (owner, 1 hour).** Without it every number above is hypothetical. Reconnect the Stripe connector (claude.ai → connectors) so this routine can read MRR/churn, ideally with a **restricted read-only key**.
2. **Move Vercel to Pro before charging anyone** (ToS, not cost). ~$20/mo; also unlocks 1-min Vercel crons and longer functions.
3. **Measure Premium on real fal calls** (`npx tsx scripts/live-providers-smoke.mts --premium`), then lower `video-premium` `costUsdPerUnit` from 0.12 and re-run the margin gate. The $1.92/30s figure is the catalog, not an invoice.
4. **Cut the Premium bill with a hero-shot default** (AI clip on scene 1 only, stills elsewhere): ≈ $0.45 vs ≈ $1.1 per 15s. Highest lever on gross margin; also lets Starter/Pro sell Premium-lite.
5. **Script model:** try Claude Haiku 5.5 (or prompt caching of the static system prompt) for the script step; the script is ~the whole Standard cost. Needs a quality A/B on ~20 topics; potential −60–75% on that line (~$0.025/video). Small € today, large at scale.
6. **Video vendor (price check, 2026-10 search snippets, unverified):** Kling 2.5 Turbo Pro ≈ $0.07/s on fal; **LTX-2 Fast ≈ $0.04/s (1080p)** (−43%); Wan 2.6 reported ≈ $0.018/s on Atlas Cloud (non-fal host, −75%, quality/ToS unverified); Seedance 2.0 ≈ $0.30/s on fal (avoid). Adapter layer already allows `FAL_VIDEO_MODEL` swap: run a 10-prompt quality bake-off of LTX-2 Fast and Wan before changing the default.
7. **Voice:** ElevenLabs Flash ≈ $0.05/1k chars (≈ $0.01 per 15s video). Deepgram Aura-2 ≈ $0.03/1k, OpenAI gpt-4o-mini-tts ≈ $0.016/1k. Savings are < $0.01/video: **not worth quality risk now**; revisit above ~10k videos/mo.
8. **Pricing levers (owner decision):** (a) annual plans at ~2 months free (cash up front, lower churn; code has `stripePriceIdYearly` already); (b) Starter is 9.4x margin, so a €9.99 entry plan is affordable if CAC needs it; (c) keep Pro at ≥3x; (d) expiring/rolling-over credits policy to protect against unused-credit liability.
9. **Referrals and trial-spent email** (PRs #91, #88 open) directly lift conversion at ~$0.2 trial cost: review/merge them first among open PRs.

## 5. Connectors and tools that would help this routine

Present: Supabase (works, read-only SQL), Vercel (billing/usage via connector), GitHub, Firecrawl (installed, not enabled in this chat; enable it for price-page scraping since direct vendor pages were blocked before).
Missing / recommended, in order:

1. **Stripe, reconnect** (shows `needs_reconnect`) — MRR, churn, refunds, payouts. Restricted read-only key preferred.
2. **fal.ai usage/billing** (dashboard export or API key with read-only usage scope) and **ElevenLabs + Anthropic usage** — real unit costs instead of catalog costs.
3. **Google Search Console / PostHog-class analytics** — traffic → signup → paid funnel for the SEO pages.
4. A bookkeeping source (Google Sheets/Drive or accounting export) for the fixed-cost ledger — the Drive/Sheets connectors are installed but not connected.
5. Optional: Slack/email connector for the weekly digest.
6. Cheap code win to make the routine self-sufficient: a `scripts/finance-report.mts` (read-only, like `metrics-report.mts`) that prints measured cost vs credits charged by tier/length, failed-job cost, MRR from `subscriptions`, trial burn. Queued as the next implementation item (needs `npm install`, which this run did not have).

## 6. Questions for the owner

1. Is the Stripe account live or sandbox only? Are the 2 Pro subscriptions real customers?
2. Which ElevenLabs, Supabase and Vercel plans are you on today, and what did last month's invoices (fal, ElevenLabs, Anthropic) total?
3. Approve: hero-shot Premium as default? Haiku A/B for scripts? Annual plans?
4. Target: break-even MRR date, or maximum growth spend?

## 7. Changelog

- **2026-10-19** — First run: created this plan; pulled measured costs from the live DB; found Premium costs are catalog values not invoices, Stripe connector disconnected and sandbox-only, Vercel Hobby non-commercial limit; ranked proposals. Docs only; no pricing or code changes.
