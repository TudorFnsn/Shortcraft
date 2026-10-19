# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on unit economics, vendor cost and monetisation. Every finance PR updates
> this file (ledger, ideas, changelog) in the same change.
>
> Last updated: 2026-10-19 (charter + baseline, no code yet)

---

## 1. Charter

| Question  | Answer                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximise cash return.** Cash in (MRR, top-ups, annual prepay) minus cash out (providers, hosting, fees, tools), kept ≥ the margin gate, without hurting activation. |
| Core KPI  | **MRR and MRR ratio** (§3), then gross margin per video and cash contribution per paying user.                                                                      |
| Autonomy  | **PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`. Never merges, never touches live secrets, never writes to Stripe/Supabase/vendor accounts. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after Main CEO 06:00 and Design CEO 09:00, so it sees their merged work).                               |
| Model     | Opus 5.5, as the other routines.                                                                                                                                     |
| Shape     | A **DM master agent** that reads this file, measures, and splits the work across subagents (§5). It does not do the analysis itself.                                  |

---

## 2. Baseline (from the repo, 2026-10-19, list prices, not invoices)

**Revenue.** Plans (EUR/mo): Starter 14.99 / 30k cr, Pro 29.99 / 100k, Ultra 79.99 / 250k. Top-ups: 20k €12, 60k €29, 150k €59. Stripe still in **test mode** (live go-live open). So real MRR today is **€0**; the first job is to make the model ready for the first real euro.

**Per-video cost** (`src/config/models.ts`, real renders 2026-10-08):

| Video                | API cost | Credits | Note                                                   |
| -------------------- | -------- | ------- | ------------------------------------------------------ |
| Standard 15s         | $0.037   | 1,768   | Claude script + FLUX schnell stills + ElevenLabs + ffmpeg |
| Standard 30s         | $0.049   | 3,096   |                                                        |
| Premium 30s (Kling)  | $1.92    | 42,636  | Catalog uses $0.12/s, Kling lists ~$0.07/s: likely lower |

**Margin gate.** Starter 9.4x, **Pro 3.0x (zero headroom)**, Ultra 3.2x, top-ups 4.0–5.9x. Premium AI video is the only line that threatens margin; Standard is ~$0.04–0.05 per video.

**Fixed and semi-fixed costs to confirm with the owner (§6):**

- **Vercel is on Hobby, which is non-commercial.** Charging customers on Hobby breaches Vercel's terms; Pro is ~$20/user/month. Budget it before go-live. (Billing API returns no charges, consistent with free Hobby.)
- **Supabase free plan:** no daily backups, and pausing after inactivity. Pro is ~$25/mo. A paying product should not run without backups.
- ElevenLabs plan (custom-voice slots, §8 of the master plan), Sentry, Resend, domain, Claude plan for the routines.
- Stripe fees: EU cards ~1.5% + €0.25 (UK/non-EEA more). On €14.99 that is ~3.3%, on €29.99 ~2.3%. The margin gate already models them.
- **Tax:** Stripe Tax (+0.5% per transaction) vs manual EU VAT is undecided; it moves net revenue by ~20%.

**Blind spots in today's data** (fix first, in this order):

1. `render_jobs.api_cost_usd` is usage × list price. **No per-step usage is stored**, so "tokens and units per video vs money spent" cannot be answered. Needs a `provider_usage` table (job, step, provider, model, input/output tokens, images, seconds, characters, est. USD, later invoiced USD).
2. No invoice reconciliation: est. cost vs fal / ElevenLabs / Anthropic bills (owner still owes the three 2026-10-08 totals).
3. Subscription history is not stored (the north-star report uses "paid by week end" as a proxy), so true MRR movement (new / expansion / contraction / churn) is not computable from the DB. Stripe is the source for that.
4. No unused-credit (breakage) metric.

---

## 3. Metrics the routine must compute every run

Source order: Stripe (revenue), Supabase (usage), vendor dashboards/APIs (cost), Vercel (hosting). Say which source each number came from; mark estimates.

- **MRR** = sum of active subscription monthly amounts (annual ÷ 12), net of discounts, in EUR. Plus **net new MRR** = new + expansion − contraction − churn.
- **MRR ratio** (the owner's term; compute and print all, keep the definition stable):
  - **MRR / total monthly cost** (revenue cover; ≥ 1 = break-even, target ≥ 3).
  - **Gross margin** = (MRR − variable cost) ÷ MRR.
  - **Quick ratio** = (new + expansion MRR) ÷ (contraction + churned MRR).
- **Cost per video** by tier and length, split by step: script tokens (in/out), images, AI-video seconds, voice characters, render. **Tokens/units per video vs USD per video vs credits charged vs EUR of credit value.**
- **Cash contribution per paying user** = ARPU − (avg variable cost + fees) − fixed cost ÷ payers.
- **Credit economics:** credits granted vs burned (breakage), effective EUR per credit by plan, trial burn per signup, trial → paid.
- **Fixed cost ledger:** every subscription/tool, amount, renewal date, and whether it is needed yet.
- **Alerts:** margin gate < 3x on any product; a vendor price change; est. vs invoiced cost off by > 20%; trial burn > $0.30; payment failure rate > 5%.

Write the result as one dated row in the **Ledger** (§7) and a digest.

---

## 4. Idea backlog (hypotheses; the routine verifies each with a live price/docs check before acting)

Prices below are **unverified recollection**: the first run must check provider pages, and cite the source and date.

**A. Cut provider cost (biggest lever is Premium video)**

1. **fal.ai alternatives for image-to-video:** compare per-second price, quality and clip length for Kling 2.5/3 direct API, Wan 2.5 / 2.2, LTX-2 (cheap/fast), Seedance, Hailuo, Veo 3.1 Fast, on aggregators (Replicate, WaveSpeed, Runware, Novita, Together, Atlas Cloud) and on first-party APIs. Run the same 3 hook shots through each, score cost, speed and look. The adapter layer (`FAL_VIDEO_MODEL`, one registry row) makes this a one-row swap.
2. **Hero-shot Premium** (AI clip on the hook scene only, stills elsewhere): ~1/3 cost, priced near Standard. Already modelled in master plan §7.
3. **Self-hosted open models** (Wan / LTX on rented GPU: Modal, RunPod, Vast, Together dedicated) only once monthly AI-video volume makes a reserved GPU cheaper than per-second pricing. Compute the break-even in videos/month; do nothing below it.
4. **Images:** FLUX schnell is already ~$0.003. Check Runware / Together / Fireworks for cheaper FLUX/SDXL-class and batch pricing; cache and reuse images for redo-scene and re-voice.
5. **Voice:** ElevenLabs Flash is ~$0.05/1k chars. Benchmark Cartesia Sonic, Deepgram Aura, OpenAI TTS, Inworld, and self-hosted Kokoro/Piper for a "Standard voice" tier; keep ElevenLabs for Premium and Voice Studio.
6. **Script:** Sonnet 5.5 is ~$0.04/script. Test Haiku 5.5 for the script step (quality gate on a fixed topic set), prompt caching for the system prompt, and the Batch API for non-interactive work (lifecycle, moderation classifier).
7. **Storage and egress:** move `media` to Cloudflare R2 (no egress fees), add a retention policy (delete failed-job assets, expire old renders to a cold tier). Already on the master plan.
8. **Hosting:** budget Vercel Pro and Supabase Pro honestly; look for the cheapest way to render (ffmpeg is already in-house; track function GB-seconds).
9. **Failed and wasted spend:** refunds on failed jobs still burn provider cost. Measure the failure cost, add cheap pre-checks (moderation before images), and cap retries.

**B. Raise revenue**

1. **Annual plans** (price ids already null in `plans.ts`): ~2 months free for cash up front and lower churn. Highest cash lever with the least risk.
2. **Credit breakage and top-up design:** measure unused credits; consider rollover caps; keep top-ups priced above plan credit value.
3. **Trial:** keep burn ≤ $0.15; test card-required trial vs credits-only trial; trial-spent email already in PR #88.
4. **Price tests:** Starter is 9.4x margin, so Starter can carry a better entry offer; Pro has no headroom until Kling is measured. Test price and credit grants via Stripe prices, one variable at a time.
5. **Premium as an add-on pack** priced per video, not hidden in credits.
6. **Dunning and recovery:** Stripe Smart Retries, card-updater, failed-payment emails, and cancel-flow offers (pause, downgrade) to cut involuntary churn.
7. **Referrals (PR #91) and affiliates:** model the real cost per acquired payer against the credits given.
8. **Annual + Stripe Tax + local currencies** (USD pricing, since most faceless creators are outside the EU).
9. **Agency / API tier** for bulk creators, once Ultra usage shows demand.

**C. Cut other costs**

Audit every SaaS line (Sentry, Resend, PostHog, domains, Claude/Anthropic subscriptions) against free tiers. Do not pay for a tool before it has a user.

---

## 5. How the routine runs (DM master agent + workers)

The master agent reads: `TheMasterPlan.md`, this file, `git log -20`, open and recently closed PRs (an item with an open PR is in review, not available), then **measures first** and only then picks work.

It fans out to subagents in parallel (one message, several `Agent` calls), each with a narrow brief, and merges their reports:

| Worker                  | Job                                                                                                              | Reads                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Revenue analyst**     | MRR, net new MRR, quick ratio, churn, failed payments, trial → paid, plan mix                                    | Stripe connector                         |
| **Cost analyst**        | Cost per video by step, tokens/units vs USD vs credits, est. vs invoiced, failure cost, trial burn               | Supabase (read-only), vendor dashboards  |
| **Fixed-cost auditor**  | Hosting/tool ledger, upcoming renewals, "needed yet?" per line, Vercel/Supabase plan limits                      | Vercel connector, owner-supplied list    |
| **Vendor scout**        | Fresh prices and new models/techs for video, image, voice, script, storage; benchmark plan                       | WebSearch, WebFetch, provider docs       |
| **Pricing strategist**  | Re-run `scripts/margin-report.mts` on measured costs; propose plan/top-up/annual/trial changes with the math     | repo, analysts' output                   |
| **Implementer**         | Builds the single chosen change in `ceo-finance/<slug>` with tests; runs the full bar                            | repo                                     |

Rules:

- **One shipped change per run**, ranked by expected EUR/month per hour of risk. Prefer improving an open `ceo-finance/*` PR.
- **Evidence over claims:** each number carries source + date. Estimates are labelled. A vendor swap needs a measured benchmark (cost, latency, a viewed sample), not a price table alone.
- **Files it may change:** `FinancePlan.md`, `scripts/finance-*.mts`, `src/features/finance/**`, `src/config/models.ts` and `plans.ts` **only with the margin gate green and the change explained in the PR as a money decision**, new provider adapters under `src/features/providers/live/**` (registered but **not made default** without the owner), `docs/finance/**`, and the finance lines of `TheMasterPlan.md`. Migrations are written but **applied only by the owner**. It never touches UI files (Design track), webhooks or auth.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode; the margin gate test stays ≥ 3x.
- **Never** spend money, subscribe to anything, create Stripe objects, change live prices, or switch the default production provider. Propose and wait for the owner's yes.
- **Notify** (PushNotification) when: the margin gate fails or is at risk, a vendor swap would save > 20% of a product's cost, MRR cover drops below 1, a payment-failure spike appears, or the run cannot read a source it needs. Stay silent otherwise.
- **Output:** a digest: MRR and ratios (with change vs last run), cost per video, what moved, PR link, what is waiting on Tudor, next item.

---

## 6. Access the routine needs (owner action; the routine must ask for anything missing)

Status as checked 2026-10-19 from a cloud routine session:

| Need                                   | Status                                                                                                                                              | Action for Tudor                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo                            | ✅ works (`TudorFnsn/Shortcraft`, PRs readable and writable)                                                                                          | none                                                                                                                        |
| Vercel connector                       | ✅ connected (team `tudorfnsns-projects`); billing charges return "not found" (Hobby, nothing billed)                                                  | none now; after upgrading to Pro the same call returns FOCUS cost lines                                                     |
| **Stripe connector**                   | ❌ **needs authorisation**; also the account seen is the **test-mode sandbox**                                                                       | Authorise Stripe in claude.ai connector settings; at go-live add the live account **read-only** (restricted key, or Sigma) |
| **Supabase connector**                 | ❌ failed to connect (`ERR_PROXY_TUNNEL`); MCP is configured in `.mcp.json`                                                                          | Re-authorise the claude.ai Supabase connector; allow `mcp.supabase.com` in the routine's network policy                      |
| Vendor spend (fal, ElevenLabs, Anthropic) | ❌ no API access                                                                                                                                  | Send the three 2026-10-08 totals now; then create **read-only/usage keys** (see below) and store them as routine env vars    |
| Fixed-cost list                        | ❌ unknown                                                                                                                                           | Paste every recurring bill (tool, EUR/mo, renewal date) into §7 "Fixed costs"                                               |
| Outbound web (prices, docs)            | ⚠️ the master plan notes provider pages were blocked from a routine network                                                                          | In the routine environment, set network access to **full/custom allowlist**: fal.ai, replicate.com, runware.ai, wavespeed.ai, together.ai, elevenlabs.io, cartesia.ai, deepgram.com, anthropic.com, cloudflare.com, supabase.com, vercel.com, stripe.com |

Read-only keys to create (all optional, each removes a blind spot): Stripe restricted key (read on Customers, Subscriptions, Invoices, Charges, Balance, Prices); Anthropic **Admin API** key (usage and cost report); ElevenLabs key with *usage read* only (`/v1/usage/character-stats`); fal.ai usage/billing page or API key limited to usage, if offered. Put them in the routine's environment variables, never in the repo.

A read-only database path is the one build item that unblocks everything else (queued as F1 below).

---

## 7. Roadmap, ledger and changelog

### Roadmap (take the top unchecked item with no open PR)

- [ ] **F1 Usage ledger (migration, owner applies):** `provider_usage` table written by the orchestrator per step (job, step, provider, model, input/output tokens, images, seconds, characters, est. USD; nullable `invoiced_usd`), RLS on, definer functions revoked. Without it the tokens-vs-cost question is unanswerable.
- [ ] **F2 `scripts/finance-report.mts` (read-only):** MRR/ratios from Stripe + cost per video and tokens/units from F1 + fixed-cost ledger; `--json` for the digest. Pure math in `features/finance/` with tests. Until F1 is applied it falls back to `render_jobs.api_cost_usd`.
- [ ] **F3 Measure Premium on real clips** (owner runs `live-providers-smoke.mts --premium`), then lower `video-premium` cost and give Pro its headroom back; re-run the margin report.
- [ ] **F4 Vendor benchmark, video:** same 3 hook shots through the 4–5 cheapest candidates (§4 A1); a registered adapter for the winner, not default.
- [ ] **F5 Annual plans** (prices in Stripe, checkout + webhook handling, tests; owner creates live prices).
- [ ] **F6 Cheaper script/voice benchmarks** (Haiku 5.5, prompt caching, alternative TTS).
- [ ] **F7 R2 + retention** (coordinate with the master plan item).
- [ ] **F8 Dunning/cancel-flow** (Smart Retries settings checklist; pause/downgrade offer).

### Ledger (one row per run; newest on top)

| Date       | MRR (EUR) | Fixed cost/mo | Variable cost/video (Std / Prem) | MRR cover | Gross margin | Source quality |
| ---------- | --------- | ------------- | -------------------------------- | --------- | ------------ | -------------- |
| 2026-10-19 | 0 (test mode) | unknown (Vercel Hobby $0, Supabase free $0, others unknown) | $0.04 / $1.92 (list prices) | n/a | gate: Pro 3.0x | repo only |

### Fixed costs (owner fills in)

| Item | EUR/mo | Renews | Needed before first customer? |
| ---- | ------ | ------ | ----------------------------- |
| Vercel (Hobby → Pro) | 0 → ~18 | n/a | **Yes** (commercial use) |
| Supabase (Free → Pro) | 0 → ~23 | n/a | **Yes** (backups) |
| ElevenLabs | ? | ? | ? |
| fal.ai | usage | n/a | usage |
| Anthropic API | usage | n/a | usage |
| Sentry / Resend / PostHog / domain | ? | ? | ? |
| Claude (routines) | ? | ? | n/a |

### Changelog (newest on top)

- **2026-10-19** — Finance track created: charter, baseline, metrics, idea backlog, worker split and access checklist. No code. (Finance CEO setup, routine)
