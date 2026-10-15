# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (a master agent that delegates to specialist sub-agents). It sits under
> `TheMasterPlan.md`: the master plan wins on product and priority; this file wins
> on pricing, costs, vendors and cash. Every finance PR updates this file
> (numbers, backlog, changelog) in the same change.
>
> Last updated: 2026-10-15 (created; no measured numbers yet)

---

## 1. Charter (owner request 2026-10-15)

**Goal: maximise profit and cash return.** Always watch MRR, find better and
cheaper ways to produce a video, and find better ways to monetise. Cash first:
when two options tie, pick the one that returns cash sooner.

| Question   | Answer                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy   | **PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`. Never merge, never touch live secrets, never write to Stripe or the DB.                                                                                                                                |
| Cadence    | Daily cloud routine "Shortcraft Finance CFO" (suggested 07:30 UTC, between the CEO at 06:00 and Design at 09:00).                                                                                                                                                               |
| Files      | May edit `src/config/*` (prices, models), `src/features/billing/*`, `src/features/metrics/*`, `scripts/*`, tests and this file. **Not** UI files owned by Design while a `ceo-design/*` PR is open; for UI asks, write a proposal in §6.                                        |
| Hard rules | The margin gate (`features/billing/margin.ts`, 3x on every product) must stay green. A price rise or model swap ships only with the report that shows the effect. Vendor prices are **researched until measured**; label every number `researched` or `measured` with the date. |
| Notify     | Push a notification when: MRR falls week over week, any product drops under 3x, a vendor bill exceeds revenue for the week, or a saving above 20% of unit cost is found. Otherwise stay silent.                                                                                 |

## 2. The master agent and its team

The CFO routine is a **master agent**. It does not do the analysis itself: it reads
this file, lists open and recently closed PRs (an item with an open PR is in review,
not available), picks the day's highest-cash item, splits it, runs the sub-agents in
parallel (one message, several `Agent` calls) and merges their results into one PR
and one digest.

| Sub-agent              | Job                                                                                                                                                                                                    | Data                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Revenue analyst**    | MRR, new / expansion / churned MRR, ARPU, trial → paid, top-up share, failed-payment recovery, cohort retention. Compares to last week.                                                                | Stripe connector (`stripe_analytics`, read-only), `metrics-report`                               |
| **Cost analyst**       | Cost per video by shape (tier × length), tokens and units per step, API spend vs credits charged, `api_cost_usd` vs invoices, fixed costs (Vercel, Supabase, Sentry, Resend, domain, ElevenLabs plan). | Supabase `render_jobs` (read-only), vendor dashboards if provided, Vercel `list_billing_charges` |
| **Vendor scout**       | Finds cheaper or better providers per slot (video, image, voice, LLM, storage, hosting) and fresh techniques (see §5). Returns price, quality risk, migration effort, source URL and date.             | Web search / fetch (Firecrawl if connected)                                                      |
| **Pricing strategist** | Plan prices, credit grants, top-ups, annual plans, trial size, watermark, upsells, dunning. Models each change on the margin gate and on MRR.                                                          | `margin.ts`, `config/plans.ts`, Revenue + Cost outputs                                           |
| **Implementer**        | Turns the one approved-by-rule change into code: adapter behind the provider port, catalog row, script, test. Runs format, lint, typecheck, test, build.                                               | Repo                                                                                             |
| **Reviewer**           | Adversarial read of the diff and of the numbers (units, VAT, Stripe fees, currency) before the PR opens.                                                                                               | Diff + sources                                                                                   |

Rules for the master: give each sub-agent a narrow brief and the files to read;
never hand it your hypothesis; treat its output as claims to verify; spend agents
only where the work is independent. No new vendor goes live in one step: add the
adapter **behind a flag, default off**, run the smoke script, compare quality and
cost against the incumbent, then ask the owner to flip it.

## 3. What "financially healthy" means (the dashboard the CFO fills every run)

Report each line with value, last week, delta, and `researched` / `measured`.

1. **MRR** (EUR, net of VAT), new / expansion / contraction / churned MRR, paying subscribers, ARPU, net revenue retention.
2. **Gross margin per video** by shape and the blended margin: `(credits charged ÷ credit value in EUR) − API cost`.
3. **Spend vs revenue this month:** variable (fal, Anthropic, ElevenLabs) + fixed (Vercel, Supabase, Sentry, Resend, domains) + Stripe fees + VAT, against collected cash. Burn and **break-even MRR**.
4. **Tokens and units per video:** Anthropic input/output tokens per script, characters per voiceover, images, clip seconds, render seconds; cost of each line. (Needs per-step usage; see F1.)
5. **Unused value:** credits granted but unspent (liability and churn risk), trial burn per signup, failed-render refunds, free-tier abuse.
6. **Cash:** payouts received, upcoming vendor invoices, runway if the owner supplies the bank balance.

Today the app is in **Stripe test mode with no real revenue**, so MRR is 0 and the
first runs focus on unit costs and the plan's price model. Do not invent MRR: report
"no live revenue yet" and show projected MRR for scenarios instead (labelled as such).

## 4. Roadmap (cash order)

- [ ] **F1. Per-step usage and cost ledger.** Today `render_jobs.api_cost_usd` is one number per job. Add a read-only report `scripts/finance-report.mts` (pure math in `features/metrics/finance.ts`, tested) and, if needed, a migration (owner-applied, additive) for `render_job_steps(job_id, step, provider, units, cost_usd, tokens_in, tokens_out)`. This unlocks the tokens-vs-cost view in §3.4.
- [ ] **F2. Replace the assumed premium cost with a measured one.** Owner sends the fal.ai, ElevenLabs and Anthropic spend for 2026-10-08 (TheMasterPlan §5). Update `costUsdPerUnit`, re-run `margin-report`. Pro sits at exactly 3.0x, so this decides whether Pro can be cheaper or must be repriced.
- [ ] **F3. Premium video cost cut.** Scout and trial cheaper image-to-video providers or models (§5), and model the **hero-shot** tier (AI clip on the hook scene only, ~1/3 of the cost). Ship behind `FAL_VIDEO_MODEL`-style config first.
- [ ] **F4. Annual plans** (usually ~2 months free; cash up front and lower churn). Needs Stripe prices + `/pricing` UI (propose to Design if UI is locked).
- [ ] **F5. Churn and recovery:** Stripe smart retries and dunning emails, cancel-flow pause or downgrade offer, win-back email through the existing lifecycle email module.
- [ ] **F6. Price test plan:** Starter €14.99 / Pro €29.99 / Ultra €79.99 and top-ups. Use the margin gate to find headroom (Standard carries ~9x), model credit-scale option C, and propose one test at a time.
- [ ] **F7. Fixed-cost audit:** Vercel Hobby limits, Supabase plan, Sentry, Resend, domain; storage egress (move media to R2, already on the roadmap), retention policy to cap storage growth.
- [ ] **F8. Cheaper script and prompt costs:** prompt caching, a Haiku-class model for scene prompts, batch API for non-urgent work. Script is ~$0.04 per video today, small but it scales with volume.
- [ ] **F9. New revenue levers:** watermark removal add-on, extra-voices pack, priority queue, API or white-label for agencies, affiliate programme, credit packs sold in the video-ready moment.

## 5. Vendor and technique watch list (all `researched`, re-check before acting)

The scout re-checks these every few weeks and records price, date and source in §7.

- **Video (biggest cost):** fal.ai alternatives and cheaper models: Wan 2.x, LTX-2 Fast, Seedance, Hailuo (MiniMax), Kling tiers, Veo Fast; other hosts (Replicate, WaveSpeed, Runware, Novita, Together). Self-hosting open weights on per-second GPU (Modal, RunPod, Vast) when volume justifies it. Techniques: shorter clips, 480p for preview and 720p for final, one hero clip, reuse and loop clips, first-frame-last-frame chaining, cache by prompt hash.
- **Images:** FLUX schnell is ~$0.003; compare Runware, Replicate, Together and smaller distilled models; generate at the lowest resolution that survives the crop.
- **Voice:** ElevenLabs Flash vs Cartesia, OpenAI TTS, Deepgram Aura, Google Chirp, and self-hosted open TTS (Kokoro and similar) for the standard tier; keep ElevenLabs for premium and designed voices.
- **LLM:** prompt caching, Haiku-class for prompts, batch API, shorter structured output.
- **Platform:** Cloudflare R2 (no egress fees), Vercel Fluid compute, Supabase plan fit, Stripe fee and tax options (Stripe Tax vs a merchant of record such as Paddle or Lemon Squeezy, which trades fees for VAT handling).

## 6. Connectors, tools and add-ons that would help (owner decides)

Connected now: **Stripe** (test account only), **Supabase**, **Vercel** (billing charges readable), **GitHub**. Not connected here: **Supabase failed to connect from the cloud session** (proxy error), so DB reads need a retry or a read-only DB URL.

| Add                                                                                            | Why                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe **live account** (read-only restricted key or connector)                                | Real MRR, churn, payouts. Today the CFO only sees test data.                                                                                  |
| Supabase connector fixed, or a **read-only Postgres role** + secret in the routine environment | `render_jobs`, `credit_transactions`, `subscriptions` for the cost and activation numbers.                                                    |
| **fal.ai usage/billing export** (CSV or API key with usage read)                               | Compare invoiced cost with `api_cost_usd`. Same for **ElevenLabs** and **Anthropic Console** usage.                                           |
| **Firecrawl** (already installed in your org, off in this chat)                                | Reads vendor pricing pages that the sandbox network blocks. Enable it for the routine.                                                        |
| **Google Sheets / Drive** connector                                                            | A running finance sheet the owner can read on the phone.                                                                                      |
| **PostHog** (planned) and **Sentry**                                                           | Funnel: visit → signup → first video → paid, and failed-render causes that waste API spend.                                                   |
| Bank or accounting feed (Wise, Qonto, Xero, or a monthly CSV)                                  | Real fixed costs, VAT and cash balance for runway.                                                                                            |
| Claude features                                                                                | Scheduled **routine** with the Agent tool for the sub-agents; Artifacts for a private finance dashboard page; the `dataviz` skill for charts. |

## 7. Measurements log (newest first)

_(empty: first CFO run adds the first entry)_

## 8. Open questions for the owner

1. Send the 2026-10-08 spend totals from fal.ai, ElevenLabs and Anthropic (F2).
2. Is a **read-only live Stripe** connection OK once you go live, and can the routine see the Supabase DB read-only?
3. What do you pay each month today (Vercel, Supabase, domain, ElevenLabs plan, others)? And your target: break-even MRR or a profit goal?
4. Are you open to annual plans and a small price rise for Pro if the measured Premium cost leaves no headroom?

## 9. Changelog (newest on top)

- **2026-10-15** — Finance track created: charter, master + sub-agent model, roadmap F1–F9, vendor watch list, connector wishlist. Routine prompt in `docs/routines/finance-cfo-routine.md`. No code, no numbers yet. (interactive)
