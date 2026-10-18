# FinancePlan — Shortcraft

> Owned by the **Finance CFO** routine (spec: `docs/routines/finance-cfo.md`). Single
> place for MRR, unit economics, vendor costs and monetization experiments.
> `TheMasterPlan.md` stays the source of truth for the product; this file is the
> source of truth for **money**. If they disagree, fix both in the same change.
>
> Last updated: 2026-10-18 (routine created; no live revenue data read yet)

---

## 1. Charter (owner request 2026-10-18, change only with Tudor)

| Question | Owner's answer                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal     | Maximise profit and **cash return**. Always check MRR; propose and implement changes that monetise the app better.                                                       |
| Costs    | Track tokens/credits used per video vs. what it cost us (every provider), plus hosting and **every other payment** (SaaS, domains, email, fees).                         |
| Vendors  | Keep looking for cheaper and better tech. fal.ai video looks expensive: find alternatives (models, hosts, in-house) and prove them on real calls first.                  |
| Autonomy | **PR-gated**, like the CEO routines: branches `ceo-finance/<slug>`, never merge. Read-only on Stripe, Supabase, Vercel. Any write or live price change needs Tudor's OK. |
| Cadence  | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the CEO at 06:00, before Design at 09:00). Mondays run the full vendor scout.                         |
| Priority | Cash first: (1) stop money leaks, (2) raise revenue per paying user, (3) cut cost per video, (4) lower fixed costs. Growth ideas go to the CEO routine.                  |

## 2. Metrics (what the CFO checks every run)

| Metric                          | Source                                                                             | Healthy                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| MRR (gross, net of VAT + fees)  | `npx tsx scripts/finance-report.mts`; cross-check Stripe (subscriptions, invoices) | Up week over week                             |
| Cost-to-MRR                     | same report (30-day API cost ÷ net MRR)                                            | < 33% (the 3x gate, in practice)              |
| API cost per video, per tier    | same report (`byTier`) vs. `src/config/models.ts` list prices                      | Measured ≤ catalog; drift = alert             |
| Waste (failed jobs we paid for) | same report (`wasteUsd`)                                                           | < 3% of API cost                              |
| Trial burn per signup           | same report (`trialBurnUsd` ÷ signups) vs. margin gate's trial cost                | ≤ the gate's figure ($0.25)                   |
| Real vendor spend               | provider usage/billing (see §4), Vercel `list_billing_charges`, Supabase, Stripe   | Within 10% of what the report computes        |
| Churn, refunds, failed payments | Stripe                                                                             | Churn < 8%/mo, refunds < 2%, dunning recovers |
| ARPU, trial → paid, top-up mix  | `scripts/metrics-report.mts` + Stripe                                              | Rising                                        |
| Margin gate                     | `npx tsx scripts/margin-report.mts`                                                | PASS (Pro sits at exactly 3.0x: no headroom)  |

Fixed costs (hosting, domain, email, seats) live in `docs/finance/fixed-costs.md`
(owner-maintained, see §4); the report cannot see them otherwise.

## 3. Known baseline (from TheMasterPlan §7, researched not measured)

- Plans EUR/mo: Starter 14.99 / 30k credits, Pro 29.99 / 100k, Ultra 79.99 / 250k. Top-ups 20k €12, 60k €29, 150k €59. Trial 3,000 credits.
- Standard (animated stills + voice + captions): ~$0.07 API for 15s, ~9x margin. Premium (AI video via fal.ai Kling 2.5 Turbo, ~$0.07/billed second): ~$1.10 per 15s, charged 26,504 credits; Pro margin exactly 3.0x.
- Render is in-house ffmpeg (~$0.01). Script: Claude Sonnet 5.5 (~$0.04). Voice: ElevenLabs (~$0.05/1k chars Flash).
- No real call has been measured yet for Premium. **First CFO job: measure.**

## 4. Access the CFO needs (set up once; the routine reports what is missing)

| Need                             | Status 2026-10-18                                                        | How to give it                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repo + PRs                       | GitHub connector, scope `tudorfnsn/shortcraft`                           | Done                                                                                                                                                                     |
| Supabase (read)                  | Connector failed to connect in the creating session (`ERR_PROXY_TUNNEL`) | Reconnect in claude.ai connectors; the routine falls back to `scripts/finance-report.mts` with `SUPABASE_SERVICE_ROLE_KEY` in the routine's environment                  |
| Stripe (read)                    | Connector present, **needs authorization**                               | claude.ai → Connectors → Stripe → Authorize. Sandbox only today; add live read-only (restricted key) at go-live                                                          |
| Vercel billing                   | Connector present (`list_billing_charges`, usage)                        | Done                                                                                                                                                                     |
| fal.ai spend                     | No connector                                                             | Routine env var `FAL_ADMIN_KEY` (usage/billing API, read-only) or paste the monthly invoice into `docs/finance/`                                                         |
| ElevenLabs spend                 | No connector                                                             | Routine env var with a key that has Usage read; slot count matters (TheMasterPlan §9)                                                                                    |
| Anthropic spend                  | No connector                                                             | Admin API key (Usage & Cost report), routine env var `ANTHROPIC_ADMIN_KEY`                                                                                               |
| Other payments (domain, Resend…) | Unknown                                                                  | Tudor fills `docs/finance/fixed-costs.md` (name, EUR/mo, billing date, renewal, can we cancel?)                                                                          |
| Funnel (visitor → paid)          | No analytics vendor                                                      | Optional: PostHog or Plausible connector; Vercel Web Analytics already exposes pageviews via the Vercel connector                                                        |
| Network                          | Provider pricing pages were blocked from the CEO routine's network       | Use the Vercel/Stripe connectors and WebSearch; if pages stay blocked, allow-list `fal.ai`, `replicate.com`, `elevenlabs.io`, `together.ai` in the routine's environment |

## 5. Idea backlog (hypotheses: every number must be measured before it is acted on)

Ordered by expected cash impact. `[ ]` open, `[~]` PR open, `[x]` shipped, `[✗]` rejected (reason in §7).

**Cut cost per video**

- [ ] F1 **Measure first.** Run `scripts/live-providers-smoke.mts --premium` on real calls; replace researched `costUsdPerUnit` with measured values; re-run the margin gate.
- [ ] F2 **Hero-shot Premium** (AI clip on scene 1 only, stills for the rest): ~$0.45 per 15s vs ~$1.10; price close to Standard (already modelled, TheMasterPlan §7).
- [ ] F3 **Cheaper image-to-video.** Compare per-second cost, quality and failure rate of Kling 2.5 Turbo (current), Wan 2.5/2.x, LTX-2 Fast, Seedance, Hailuo, Veo 3.1 Fast, on fal.ai and on direct vendor APIs or other hosts (Replicate, Together, Runware, WaveSpeed, Novita, DeepInfra). Keep the registry swap to one catalog row + one adapter.
- [ ] F4 **Self-host an open video model** (Wan / LTX on a rented GPU, per-second billing such as RunPod, Modal, Fal serverless) once Premium volume exceeds the break-even the CFO computes (GPU $/hr ÷ clips/hr vs. API $/clip). Not before volume exists.
- [ ] F5 **Lower-resolution generate + upscale** (generate 480p/720p, upscale in the render step) if quality allows.
- [ ] F6 **Cache and reuse**: identical or near-identical prompts/stock scenes, shared intro/outro clips, reuse the image when only the voice or captions change (re-voice already does).
- [ ] F7 **Cheaper voice**: compare ElevenLabs Flash vs. Turbo, Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural voices on cost per 1k characters and naturalness; keep ElevenLabs for premium voices only. Watch the custom-voice slot cap.
- [ ] F8 **Cheaper script**: prompt caching on the system prompt, a smaller Claude model (Haiku 5.5) for short scripts, batch API for non-urgent jobs. Likely cents, so low priority.
- [ ] F9 **Cut waste**: failed premium jobs are paid to the provider yet refunded; add a cheap pre-flight (image check before the clip) so the expensive call happens only on a good still; cap retries.
- [ ] F10 **Trial burn**: keep the free trial on Standard only; watermark stays; consider a signup friction step (email verification before the first render).

**Raise revenue per user**

- [ ] M1 **Annual plans** (2 months free): cash up front, lower churn. Stripe prices needed (owner approval; `stripePriceIdYearly` already exists in `plans.ts`).
- [ ] M2 **Top-up nudges** when balance < one video (in-app and the lifecycle email), one-click checkout.
- [ ] M3 **Premium add-on credits** priced by measured cost, not by the shared credit scale (option C, TheMasterPlan §7).
- [ ] M4 **Dunning**: Stripe Smart Retries + a "payment failed" lifecycle email; recover involuntary churn.
- [ ] M5 **Cancel-flow offer**: pause or downgrade instead of cancel (Stripe portal config).
- [ ] M6 **Pricing test**: Starter €14.99 vs €19.99 on new signups; read conversion and ARPU after enough traffic. Needs the owner and real traffic.
- [ ] M7 **Pay-as-you-go packs** for the trial → paid gap (a €4.99 starter pack) when trial → paid is low.
- [ ] M8 **Affiliate / referral** with credits as the reward (cost = API cost only, margin ~9x on Standard).

**Cut fixed costs**

- [ ] X1 Audit every recurring payment in `docs/finance/fixed-costs.md`: cancel unused, move to annual where cheaper, check free tiers (Vercel, Supabase, Resend, Sentry).
- [ ] X2 Supabase Storage: lifecycle-delete trial renders and intermediate assets after N days; egress watch.
- [ ] X3 Vercel function time: measure a 60s Standard render's wall time and memory; right-size `maxDuration`, avoid the container-render fallback unless needed.

## 6. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` §1, §5 (cost), §7, §9; this file; `docs/finance/fixed-costs.md`; `git log -20`; open and recently closed PRs (an item with an open PR is in review, not available, and `ceo-finance/*` must not collide with the other routines).
- **Measure before you decide:** run `npx tsx scripts/finance-report.mts --json`, `scripts/metrics-report.mts --json` and `scripts/margin-report.mts`, then the connectors. If a source is unreachable, say which and carry on with the rest.
- **Split the work** across sub-agents (see the spec): metrics analyst, cost auditor, vendor scout, monetization strategist, implementer. The master agent merges their findings into one ranked list by **expected monthly cash impact ÷ effort** and takes the top item that is not already in an open PR.
- **Evidence standard:** a vendor claim counts only with a source URL and date, or a real measured call. Mark every figure `measured`, `listed` or `estimated`. Never put an unmeasured price into `models.ts` as if it were measured.
- **Files it may change:** `FinancePlan.md`, `docs/finance/**`, `scripts/finance-*.mts` and `scripts/*-smoke.mts`, `src/features/metrics/finance*`, `src/features/billing/**`, `src/config/models.ts` and `src/config/plans.ts` (values only, with the margin gate passing), `src/features/providers/**` (new adapters behind the registry, off by default), tests, and the Finance lines of `TheMasterPlan.md`. UI copy only for pricing/credit wording, and not while a `ceo-design/*` PR is open on those files.
- **Never:** merge, run migrations, write to Stripe/Supabase/Vercel, change live prices or products, spend on a provider beyond the smoke-script budget (below), raise customer prices or cut included credits without Tudor's explicit OK in this file's decision log.
- **Smoke budget:** at most **$2 per run** of real provider calls, only with keys present, always through the smoke scripts, recorded in the changelog.
- **Gate:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and the margin gate passes after any catalog change.
- **Notify** (PushNotification) when: cost-to-MRR above 33%; a margin-gate FAIL; a provider price/behaviour drift above 20%; waste above 3%; a fully validated saving worth ≥ €50/month (or ≥ 10% of MRR) is ready for review; a data source or connector is broken or unauthorised; a payment is failing or about to renew unexpectedly. Quiet runs send nothing.
- **Output:** a digest: MRR and trend, cost-to-MRR, what moved, the PR/links, what is waiting on Tudor (decisions and access), and the next item.

## 7. Decision log

| Date       | Decision                                                  | By    |
| ---------- | --------------------------------------------------------- | ----- |
| 2026-10-18 | Finance CFO routine created, PR-gated, read-only on data. | Tudor |

## 8. Changelog (newest on top)

- **2026-10-18** — Finance track started: `FinancePlan.md`, `docs/routines/finance-cfo.md` (routine spec and prompt), `scripts/finance-report.mts` + `features/metrics/finance.ts` (MRR, 30-day API cost, waste, trial burn, cost-to-MRR, per-tier cost) with 4 tests. No live data read yet. (Finance CFO setup, interactive)
