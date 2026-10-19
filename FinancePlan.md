# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (prompt in `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`:
> the master plan wins on product and priority; this file wins on cost, pricing
> and cash. Every finance PR updates this file (ledger, backlog, changelog).
>
> Last updated: 2026-10-19 (created)

---

## 1. Charter (owner request 2026-10-19, do not change without Tudor)

**Goal:** maximise cash return. Grow MRR, cut cost per finished video, keep every
plan and top-up above the 3x margin gate, and shorten the time to cash break-even.

| Question   | Answer                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | Cash return first: net MRR, gross margin, then fixed-cost cuts. Growth that loses money per user is not growth.                           |
| Scope      | Anything that moves money: model/vendor choice, prompts and tokens, caching, pricing and packaging, billing flows, hosting plans, churn.  |
| Autonomy   | **PR-gated.** Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe/Supabase/Vercel. No live-secret changes, no vendor signups. |
| Cadence    | Daily cloud routine **"Shortcraft Finance CFO"**, 12:00 UTC (after CEO 06:00 and Design 09:00).                                           |
| Shape      | A master agent that measures, picks the best lever, and fans the work out to sub-agents (see the routine prompt).                         |
| Guardrails | The margin gate (`scripts/margin-report.mts`) must still pass. Quality regressions need a side-by-side sample before a swap ships.        |

## 2. KPIs (the master agent reads these every run)

| KPI                                    | Source                                                  | Target / rule                                  |
| -------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| MRR (gross EUR), net MRR (USD)         | `scripts/finance-report.mts`, Stripe (read-only)        | Up week over week; compare with last run       |
| Gross margin %, contribution           | `scripts/finance-report.mts` (`FIXED_MONTHLY_COST_USD`) | Gross margin >= 70%; contribution > 0          |
| API cost per finished video, per tier  | same (`byTier`)                                         | Standard <= $0.10 (15s), Premium trending down |
| Wasted API spend (failed / stuck jobs) | same (`wastedApiCostUsd`)                               | < 5% of API cost                               |
| Margin gate multiples                  | `scripts/margin-report.mts`                             | Every plan and top-up >= 3x                    |
| Trial burn per signup                  | margin report                                           | Track against trial -> paid                    |
| Trial -> paid, activation, churn       | `scripts/metrics-report.mts`                            | A pricing change must not hurt these           |
| Tokens per script / cost per script    | **not stored yet** (backlog F1)                         | Measure first, then cut                        |

## 3. Cost model today (list prices, not yet measured on real calls)

Per 15s **Standard** video (animated stills, ~$0.07): script ~$0.04, images
(FLUX schnell, ~$0.003 each), ElevenLabs Flash voice ~$0.01, in-house ffmpeg
~$0.01. **Premium** adds AI video clips on fal.ai (Kling 2.5 Turbo Pro, ~$0.07 per
second, ~$1.10 per 15s video, billed in fixed 5s clips). Authoritative numbers:
`src/config/models.ts` and `TheMasterPlan.md` §7. Replace them with measured
numbers as soon as F1 lands.

Biggest levers, in order (hypotheses to verify, not conclusions):

1. **Premium video clips** are ~15x the cost of everything else in a video. A
   cheaper video model, a hero-shot-only variant, or batching clips is the top lever.
2. **Script tokens.** Sonnet-class at ~2k in / 1.5k out is ~half of a Standard
   video's cost. Prompt caching of the fixed system prompt, a smaller model for the
   simple steps, and structured short outputs are the levers.
3. **Voice** (ElevenLabs): per-character cost and the custom-voice slot limit.
4. **Waste:** jobs that fail after paying for images/clips (the refund is ours to
   eat). Retry policy, early validation, cheaper failure paths.
5. **Fixed costs:** hosting, Supabase, ElevenLabs plan, Sentry, email. Verify each
   plan against what the app really needs.

## 4. Fixed-cost ledger (owner fills in; the routine asks if blank)

| Item           | Plan today                | USD / month | Notes                                                                        |
| -------------- | ------------------------- | ----------- | ---------------------------------------------------------------------------- |
| Vercel         | ?                         | ?           | **Check:** Hobby is non-commercial per Vercel's terms; paid launch needs Pro |
| Supabase       | ?                         | ?           |                                                                              |
| ElevenLabs     | ?                         | ?           | Custom-voice slot limit caps saved voices                                    |
| fal.ai         | pay as you go             | variable    | Prepaid credits                                                              |
| Anthropic      | pay as you go             | variable    | Key: `ANTHROPIC_API_KEY`                                                     |
| Resend (email) | ?                         | ?           |                                                                              |
| Sentry         | ?                         | ?           |                                                                              |
| Domain         | ?                         | ?           |                                                                              |
| Stripe fees    | 1.5% + €0.25 (EU) assumed | variable    | Real rate comes from Stripe balance transactions                             |

Set the total as `FIXED_MONTHLY_COST_USD` when running the report.

## 5. Vendor watchlist (bake-off candidates; verify prices and quality, do not trust this list)

| Slot       | Today                      | Candidates to test                                                                                                                       |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AI video   | fal.ai Kling 2.5 Turbo Pro | Kling direct API, Wan 2.x / LTX-2 / Hunyuan (fal, Replicate, WaveSpeed, Novita), Seedance, Hailuo, Veo Fast, self-hosted on Modal/RunPod |
| Image      | fal.ai FLUX schnell/dev    | Runware, Together/Fireworks FLUX, Replicate, DeepInfra, SDXL-Turbo-class self-hosted                                                     |
| Script LLM | Sonnet 5.5                 | Haiku 5.5 for planning + Sonnet only for quality passes, prompt caching, batch API, open-weight models                                   |
| Voice      | ElevenLabs Flash           | Cartesia, Deepgram Aura, OpenAI TTS, Kokoro / open-weight self-hosted; keep ElevenLabs for Voice Studio                                  |
| Compute    | Vercel functions (ffmpeg)  | Cost per render at scale; Fluid compute limits; a queue worker only if function-seconds dominate                                         |
| Payments   | Stripe                     | Stripe Tax vs. a merchant of record (Paddle, Lemon Squeezy, Polar) for EU VAT; compare fee + tax work                                    |

Rule: a swap needs (a) a price measured on real calls, (b) a side-by-side sample the
owner can see, (c) an adapter behind the existing registry, (d) the margin gate green.

## 6. Backlog (ordered by cash impact / effort; the routine works from the top)

- [ ] **F1. Measure real cost.** Persist per-step cost and token counts (script input/output, cache hits), clip seconds and voice characters per job (new additive migration `0013`, owner applies). Extend `finance-report.mts` with cost by step. _Blocks every other number._
- [ ] **F2. Fixed-cost ledger.** Owner fills §4; the report prints contribution and break-even in subscribers.
- [ ] **F3. Script cost.** Prompt caching on the system prompt, try Haiku-class for the plan, cap `max_tokens` (now 16000), log cache hit rate.
- [ ] **F4. Premium video bake-off.** Same 5 prompts through 3+ video models; price per finished second and a sample for the owner.
- [ ] **F5. Hero-shot premium tier.** AI clip on scene 1 only, priced near Standard (see §7 of the master plan).
- [ ] **F6. Waste.** Break down failed-job spend by step; add early checks before expensive steps.
- [ ] **F7. Pricing experiments.** Annual plans (cash up front), a lower-friction first paid step, top-up nudges when credits run low, price anchoring on `/pricing`. Each is a PR with an expected MRR effect.
- [ ] **F8. Churn and expansion.** Win-back and unused-credit emails (lifecycle cron exists), downgrade-instead-of-cancel in the portal flow.
- [ ] **F9. Payments cost.** Stripe fee reality check; EU VAT handling; evaluate a merchant of record.
- [ ] **F10. Vendor credits.** Startup/credit programs (fal.ai, Anthropic, Vercel, Supabase, ElevenLabs): owner applies, the routine drafts the applications.

## 7. Tools the routine needs (status 2026-10-19)

| Tool                                  | Status                                            | Why                                                                       |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| GitHub (repo)                         | Connected, scoped to `tudorfnsn/shortcraft`       | PRs, code, CI                                                             |
| Supabase connector                    | In `.mcp.json`; failed to connect from cloud once | Read-only cost/revenue queries                                            |
| Stripe connector                      | Needs owner authorisation (claude.ai connectors)  | Real MRR, fees, churn, refunds (Sigma)                                    |
| Vercel connector                      | Available in cloud sessions                       | Billing charges, usage, function duration, plan                           |
| fal.ai / Anthropic / ElevenLabs usage | No connector; keys are in `.env.local` only       | Ask the owner for a monthly usage/billing export (CSV) or a read-only key |
| Web search / fetch                    | Available                                         | Price research; direct vendor pages were blocked once, try again          |
| Sentry                                | Not connected                                     | Failure spend                                                             |

Details and the owner's to-do list: `docs/routines/finance-cfo.md` (Setup).

## 8. Changelog (newest on top)

- **2026-10-19** — Finance track created: charter, KPIs, backlog, `features/metrics/finance.ts` (pure MRR / margin / cost-per-video math), `scripts/finance-report.mts` (read-only), +4 tests, routine prompt in `docs/routines/finance-cfo.md`. No migration, no dependency, no runtime change. (Interactive)
