# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (`docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`: the master plan
> wins on product and priority; this file wins on cost, pricing and cash.
> Every finance PR updates the dashboard (§3) and changelog (§8) in the same change.
>
> Last updated: 2026-10-20 (track created)

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question  | Owner's answer                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit and cash return.** Cash first, then margin, then growth.                                                        |
| Always    | Check MRR and cost-to-revenue first; propose or build changes that monetize better; hunt cheaper, better providers and new tech. |
| Autonomy  | **PR-gated.** Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe, Supabase, Vercel. No live-mode or spend changes.  |
| Guardrail | The 3x margin gate (`features/billing/margin.ts`) never gets weaker. A provider swap needs a measured cost and a quality check.  |
| Cadence   | Daily cloud routine "Shortcraft Finance CFO" (DM master agent that fans out to the agents in `.claude/agents/finance-*.md`).     |

## 2. How the routine works

The master agent (`finance-cfo`) reads this file, pulls the numbers, then delegates in
parallel: `finance-unit-economics` (what a video costs vs earns), `finance-vendor-scout`
(cheaper providers), `finance-pricing-strategist` (monetization), `finance-spend-auditor`
(hosting, SaaS, Stripe fees), then `finance-implementer` for the one change worth a PR.
It ranks everything by **cash impact per month ÷ effort**, ships one PR, and notifies
the owner only when something needs a decision or crosses a threshold (§6).

## 3. Dashboard (the routine rewrites this table each run)

Source: `npx tsx scripts/finance-report.mts` (needs `.env.local` or the Supabase connector) plus Stripe and Vercel.

| Metric                         | Value                | As of      |
| ------------------------------ | -------------------- | ---------- |
| MRR (gross EUR / net USD)      | not measured yet     | 2026-10-20 |
| Paying subscribers / ARPU      | not measured yet     |            |
| API cost 30d / cost-to-revenue | not measured yet     |            |
| Free-user share of API cost    | not measured yet     |            |
| Fixed monthly spend (§4)       | unknown, owner input |            |

## 4. Fixed costs ledger (owner input needed — the routine cannot see invoices)

| Item                         | Monthly cost  | Source / plan tier | Notes                                |
| ---------------------------- | ------------- | ------------------ | ------------------------------------ |
| Vercel                       | ?             | Vercel connector   | read `list_billing_charges`          |
| Supabase                     | ?             | owner              | tier + add-ons                       |
| ElevenLabs                   | ?             | owner              | plan, custom-voice slots in use      |
| Anthropic API                | variable      | console            | tokens in `render_jobs.api_cost_usd` |
| fal.ai                       | variable      | dashboard          | images + Premium video               |
| Resend, Sentry, domain, etc. | ?             | owner              |                                      |
| Stripe fees                  | ~1.5% + €0.25 | Stripe             | EEA cards; check real mix            |

## 5. Cost model today (from `config/models.ts`)

- Standard video = animated stills: FLUX schnell images ($0.003) + ElevenLabs Flash + in-house ffmpeg. About $0.07 per 15s.
- Premium video = Kling 2.5 Turbo Pro on fal.ai, list ~$0.07/s, catalog bound $0.12/s. **This is the cost driver** and the first target.
- Script = Claude Sonnet 5.5, ~$0.04 per video. Voice = ElevenLabs Flash, ~$50 per 1M chars.

### Vendor shortlist (researched 2026-10-20 from search snippets; **unverified, measure before switching**)

| Slot           | Today                        | Candidates to test                                                                                                   | Why                                                                                    |
| -------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Premium video  | Kling 2.5 Turbo Pro, $0.07/s | Seedance 2.0 (Fast tier ~$0.02–0.09/s direct, ~$0.07–0.16/s on Runware), Wan, LTX-2 (~$0.0018/MP on fal), Hailuo 2.3 | Reported 2-3x cheaper; Kling bills fixed 5s clips, short scenes waste money            |
| Provider route | fal.ai                       | Runware, direct vendor APIs, Replicate (reported pricier)                                                            | Same model is often cheaper off the aggregator                                         |
| Voice          | ElevenLabs Flash ~$50/1M     | Google/Polly ~$4/1M, Deepgram Aura-2 ~$30/1M, Speechify Simba 3.2 ~$6–10/1M, self-hosted Kokoro ~$0.7/1M             | Voice is small per video but scales with volume; keep ElevenLabs only for Voice Studio |
| Script         | Claude Sonnet 5.5            | Claude Haiku 5.5 for drafts, prompt caching on the system prompt                                                     | Cheap win if quality holds                                                             |

## 6. Notify the owner when

- cost-to-revenue > 0.33 or the margin gate fails; a vendor price change breaks 3x.
- MRR drops week over week, or a plan's subscribers go to zero after being non-zero.
- Free-user burn exceeds 25% of API cost (trial abuse).
- A provider swap saves more than $50/month or a decision/secret is needed from the owner.
- The routine could not read data (connector down, access denied).

## 7. Roadmap (ranked by cash impact; the routine re-ranks)

1. **F0 Measure** — `finance-report.mts` shipped. Owner: fill §4, authorize Stripe connector, put `.env.local` or a read-only DB path in the routine env.
2. **F1 Premium video cost** — benchmark 2-3 cheaper image-to-video models on the same 10 scenes; measure `$ / billed second` and quality; swap via `FAL_VIDEO_MODEL` or a new adapter.
3. **F2 Trial burn** — trial costs $0.25 per signup; check abuse (disposable emails, many signups per IP) and cap.
4. **F3 Monetization** — annual plan (cash up front, lower churn), top-up upsell at low balance, watermark-free export as an add-on, credit expiry rules, Stripe Tax/FX check.
5. **F4 Voice cost** — move default narration to a cheaper TTS, keep ElevenLabs for designed voices.
6. **F5 Prompt caching + Haiku for scripts**, tokens logged per call in `api_cost_usd` breakdown (needs a migration: owner OK).
7. **F6 Dunning/churn** — Stripe retries and failed-payment emails.

## 8. Changelog (newest on top)

- **2026-10-20** — Track created: charter, `scripts/finance-report.mts` + `features/finance/unit-economics.ts` (MRR, ARPU, 30d API cost by tier, free-user burn, cost-to-revenue; +5 tests), finance agents and routine prompt. (interactive)
