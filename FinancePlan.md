# FinancePlan — Shortcraft profit track

> **Source of truth for money.** Owned by the **Finance CFO** routine (spec:
> `docs/routines/finance-cfo.md`). `TheMasterPlan.md` wins on product and
> priority; this file wins on costs, vendors, pricing experiments and cash.
> Every finance PR updates the baseline (§2) and changelog (§7) in the same change.
>
> Last updated: 2026-10-17 (created)

---

## 1. Charter

**Goal:** maximise cash return. Order of priority: (1) never sell a video below
3x its API cost, (2) cut cost per finished video, (3) raise net revenue per
paying subscriber and conversion, (4) trim fixed costs, (5) only then spend on growth.

**Metrics the CFO reads every run** (all from our own DB, no vendor):

| Metric                            | Source                                            |
| --------------------------------- | ------------------------------------------------- |
| MRR (list EUR and net USD)        | `npx tsx scripts/finance-report.mts`              |
| Net revenue ÷ API spend (30d)     | same                                              |
| API cost per finished video, tier | same (`render_jobs.api_cost_usd`)                 |
| Failed-job spend (leakage)        | same                                              |
| Break-even subscribers            | same, needs `--fixed-usd`                         |
| Margin gate per product           | `npx tsx scripts/margin-report.mts`               |
| Weekly paying-retained creators   | `npx tsx scripts/metrics-report.mts` (north star) |

**Limits:** PR-gated. Never merge, never touch live secrets, never write to Stripe,
Supabase or Vercel without the owner's explicit OK (same rule as TheMasterPlan §9).
Changing customer prices or credit scales is a proposal until the owner approves.

---

## 2. Baseline (2026-10-17)

**Revenue data: not yet readable from the cloud.** The Supabase connector failed
to connect (`ERR_PROXY_TUNNEL`) and the Stripe connector needs authorisation, so
this run has no MRR number. Vercel is connected: billing charges return
`costs_not_found` for the last 30 days, i.e. **Vercel costs $0 (Hobby)**.

**Unit costs (from the catalog and the three live renders of 2026-10-08):**

| Video                 | API cost (measured × list prices) | Credits charged | Note                            |
| --------------------- | --------------------------------- | --------------- | ------------------------------- |
| Standard 15s, 3 scene | $0.037                            | 1,768           | ~9x margin on Starter           |
| Standard 30s, 5 scene | $0.049                            | 3,096           |                                 |
| Premium 30s, 5 scene  | $1.92 (priced at $0.12/s)         | 42,636          | likely ~$1.2 at Kling's $0.07/s |

**Where the money goes (ranked):**

1. **Premium AI video (fal.ai Kling 2.5 Turbo Pro).** 50x a Standard video. Pro is at exactly 3.0x, so this is the only line that can sink margin.
2. **Free trial burn** (3,000 credits per signup): $0.14 per signup today. Cheap, but unbounded without abuse limits (§4, F4).
3. **Failed jobs** that already paid for images/clips before failing (refunded to the user, not to us).
4. **Fixed costs the DB cannot see:** ElevenLabs plan (custom-voice slots), Supabase (free plan; Pro needed for leaked-password protection and backups), domain, Sentry, Resend. Owner to supply (§6).

**Tokens vs spend (asked for):** only the script step uses LLM tokens (Claude
Sonnet 5.5, $2/$10 per MTok, ~2k in / 1.5k out ≈ $0.02–0.04 per video). Tokens
are **not stored per job**: only the dollar total in `render_jobs.api_cost_usd`.
Proposed migration F1 adds per-step usage so cost per step is auditable.

---

## 3. Vendor scouting (prices from search snippets of 2026-09/10 aggregator posts, **to be verified on each vendor's page and on a real call**)

| Slot                   | Today                           | Candidate                                                                                       | Reported price         | Verdict                                                                                                                                     |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Premium image-to-video | fal Kling 2.5 Turbo ~$0.07/s    | Kling 3 direct ~$0.084/s silent; Wan 2.7 ~$0.10/s; Seedance 2.x $0.15 (BytePlus) to $0.30 (fal) | see left               | fal is not the worst; direct Kling and Wan are near parity. No big win in swapping like for like.                                           |
| Premium image-to-video | same                            | **LTX-2 on WaveSpeed ~$0.016/s (720p)**                                                         | ~4x cheaper than Kling | Biggest candidate. Quality unproven for our themes: A/B 10 clips before any switch.                                                         |
| Premium shape          | AI clip on every scene          | **Hero-shot**: AI on scene 1 only, stills elsewhere (already in §7 of the master plan)          | ~1/3 of cost           | Cheapest win and needs no new vendor.                                                                                                       |
| Voiceover              | ElevenLabs Flash $0.05/1k chars | Deepgram Aura-1 $0.015/1k; Smallest.ai Lightning ~$0.025/1k                                     | 2–3x cheaper           | Voice is ~$0.0007/s, already <2% of a video. **Not worth the risk**: captions need word timestamps and Voice Studio is built on ElevenLabs. |
| Images                 | FLUX schnell $0.003             | —                                                                                               | already ~free          | Leave.                                                                                                                                      |
| Script                 | Sonnet 5.5                      | Haiku 5.5 for the script                                                                        | cents → sub-cent       | Savings ≈ $0.02/video. Only if quality holds; low priority.                                                                                 |
| Hosting                | Vercel Hobby + Supabase free    | —                                                                                               | $0                     | Fine until traffic or terms (Hobby is non-commercial per Vercel's terms: check before Stripe live).                                         |
| Media storage          | Supabase Storage                | Cloudflare R2 (no egress fees)                                                                  | egress $0              | Already on the roadmap; matters once videos are watched/downloaded a lot.                                                                   |

Aggregator sources (disagree by up to 2x; none is a primary vendor page):
[apiframe](https://apiframe.ai/blog/ai-video-api-pricing-2026),
[teamday](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026),
[ofox](https://ofox.ai/blog/fal-ai-alternatives-video-generation-api-2026/),
[genrates](https://www.genrates.com/),
[gradium TTS guide](https://gradium.ai/content/best-text-to-speech-apis-2026).

**Honest reading:** the fal.ai bill is not what hurts. Standard videos use no
video model at all ($0.04 each); only Premium calls fal, and per-second prices
are within ~20% across Kling, Wan and direct APIs. The levers that move cash are
(a) Premium shape and price, (b) conversion and churn, (c) not paying for
failures and abuse. The one real vendor lever is LTX-2.

---

## 4. Roadmap (priority order, one item per CFO run)

- [ ] **F0. Get read access** (owner, ~10 min): authorise the Stripe connector; make Supabase connect from cloud sessions; paste fixed monthly costs into §6. Unlocks real MRR, churn and refunds.
- [ ] **F1. Per-step usage in the DB** (migration, owner applies): `job_steps(job_id, step, provider, units, cost_usd, tokens_in, tokens_out)` written by the orchestrator, so cost per step, per provider and per tier is measured, not inferred. Then replace list prices in `models.ts` with measured ones.
- [ ] **F2. Reconcile invoices**: compare `sum(api_cost_usd)` with the fal.ai / ElevenLabs / Anthropic dashboards for the same days; the gap is the real pricing error (e.g. Kling 5s minimum billing).
- [ ] **F3. Hero-shot Premium** tier: AI clip on the hook scene only, priced between Standard and Premium. Expected to open a mid-priced plan upsell at >5x margin.
- [ ] **F4. Trial abuse cap**: one trial per email domain/device fingerprint, rate limit signups per IP. Bounds the only unbounded cost.
- [ ] **F5. LTX-2 A/B**: add `FAL_VIDEO_MODEL`-style switch for a WaveSpeed adapter, render the same 10 prompts on Kling and LTX-2, compare cost and a blind quality score; switch only if quality is acceptable.
- [ ] **F6. Annual plans** (stripePriceIdYearly is already in the catalog): 2 months free pulls cash forward and cuts churn.
- [ ] **F7. Pricing experiments** (owner approves each): Pro €29.99 vs €34.99, a €9.99 entry tier, credit-pack bonuses, top-up upsell at the paywall.
- [ ] **F8. Churn and dunning**: Stripe smart retries, cancel-flow offer (pause / downgrade), win-back email through the existing lifecycle cron.
- [ ] **F9. Affiliate economics**: 30% recurring is in the master plan; model the break-even before launching it.

## 5. Rules for the CFO routine

See `docs/routines/finance-cfo.md`. In short: read this file, TheMasterPlan, open and recent PRs; run the three reports; fan out to sub-agents; one PR per run in `ceo-finance/*`; notify only when a number crossed a threshold (§ in the spec).

## 6. Inputs the owner must supply (CFO asks again until filled)

| Input                                                                                       | Why                                       | Value                        |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| Fixed monthly costs (ElevenLabs plan, Supabase, domain, Sentry, Resend, Claude/other tools) | break-even and profit                     | _unknown_                    |
| fal.ai, ElevenLabs, Anthropic spend totals for any 7-day window                             | calibrate `api_cost_usd` against invoices | _unknown_                    |
| Stripe connector authorised (live account when ready)                                       | MRR, churn, refunds, disputes, fees       | not authorised               |
| Supabase connector reachable from cloud sessions                                            | read-only revenue/cost queries            | failing (`ERR_PROXY_TUNNEL`) |
| Ad spend, if any                                                                            | CAC and payback                           | _unknown_                    |
| Target: monthly profit or MRR goal and runway                                               | decides growth vs margin trade-offs       | _unknown_                    |

## 7. Changelog (newest first)

- **2026-10-17** — Track created. Added `features/metrics/finance.ts` + `scripts/finance-report.mts` (MRR, net revenue, API spend per tier, failed-job leakage, profit, break-even; +4 tests), this plan and the routine spec. No runtime change, no migration, no dependency. (Finance CFO, interactive setup)
