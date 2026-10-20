# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (brief: `docs/routines/finance-cfo.md`). Product and pricing _decisions_ stay in
> `TheMasterPlan.md` §7/§11; this file holds the numbers, the cost ledger, the
> experiment backlog and what the routine still needs from the owner.
>
> Last updated: 2026-10-20 (routine created; no live data read yet)

## 1. Charter

Goal: **maximise cash return**. Steer by the **MRR ratio** = net MRR ÷ total
monthly cost (variable API spend + fixed vendor bills). Target ≥ 3, floor 1.
Then, in order: (1) cut cost per finished video without hurting quality,
(2) raise revenue per paying user, (3) cut waste (failed jobs, trial burn,
idle plans), (4) cut fixed bills.

Measured by `npx tsx scripts/finance-report.mts` (MRR, net MRR, cost per done
video by tier, failed-job share of spend, MRR ratio) and the existing margin
gate (`scripts/margin-report.mts`). Fixed bills live in `src/config/finance.ts`.

## 2. Cost ledger (where every dollar goes)

| Vendor     | Used for                                 | Billing shape              | Measured?                        |
| ---------- | ---------------------------------------- | -------------------------- | -------------------------------- |
| Anthropic  | script writer (Sonnet 5.5)               | per token, metered per job | cost yes, **token counts no**    |
| fal.ai     | stills (FLUX schnell/dev), premium video | per MP / per billed second | cost in `api_cost_usd` (per job) |
| ElevenLabs | voiceover, voice design, saved voices    | per char + plan with slots | list price only                  |
| Vercel     | hosting, cron, ffmpeg render compute     | plan + usage               | **no** (connector available)     |
| Supabase   | Postgres, auth, media storage            | plan + usage               | **no** (connector available)     |
| Stripe     | payments                                 | % + fixed per charge       | assumed 1.5% + €0.25             |
| Resend     | lifecycle email                          | free tier                  | no                               |
| Sentry     | errors                                   | free tier                  | no                               |

## 3. Data gaps (fix these first, they block good decisions)

1. **No per-step cost or token log.** `render_jobs.api_cost_usd` is one number per job. Cannot answer "tokens vs cost per video" or "which step is expensive" exactly. Proposal: additive migration `job_cost_events (job_id, step, provider, units, unit, cost_usd, input_tokens, output_tokens, created_at)` written by the orchestrator. Owner applies the migration.
2. **Fixed costs are `null`** in `src/config/finance.ts`. The MRR ratio is overstated until filled.
3. **Subscriptions store no billing interval**, so yearly plans would overstate MRR. Stripe is the exact source once the connector is authorised.
4. **Top-up revenue** is not derivable from the ledger; read it from Stripe.
5. **Stripe connector needs authorising** (claude.ai connector settings); the sandbox is test mode only, so live revenue stays unknown until the account is live.

## 4. Experiment backlog (hypotheses, not facts: verify price, quality and terms before building)

Ranked by expected cash per unit of effort. Prices must be re-checked on the vendor's page at run time.

| #   | Idea                                                                                                                                                | Why it may pay                                              | Check first                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| F1  | Script step on Haiku-class model + prompt caching (+ Batch API where latency allows)                                                                | script is the only token-billed step                        | script quality on 20 topics, side by side                  |
| F2  | Premium video: compare Kling vs Seedance, Wan, LTX, Hailuo on fal **and** direct vendor APIs / other hosts (Replicate, WaveSpeed, Runware)          | fal is a reseller; direct or alternate hosts can be cheaper | cost per 5s clip, 9:16, queue time, ToS for commercial use |
| F3  | Hero-shot premium (AI clip on scene 1, stills elsewhere), priced near Standard                                                                      | ~75% less video spend per premium video                     | retention vs full-AI video                                 |
| F4  | Image step: cheaper hosts for FLUX schnell (Runware, Together, WaveSpeed) or self-host on a GPU marketplace if volume justifies                     | images are tiny cost today; only worth it at volume         | volume > break-even of a GPU box                           |
| F5  | Voice: compare Cartesia, Deepgram, OpenAI TTS, open-source (Kokoro etc.) with ElevenLabs for the default voice; keep ElevenLabs for designed voices | ElevenLabs plan + slots is a fixed floor                    | word timestamps (captions need them)                       |
| F6  | Cache and reuse: dedupe identical scene images / voice lines across re-voice and remake                                                             | pure savings, no quality risk                               | hit-rate from real jobs                                    |
| F7  | Stop spend on doomed jobs: fail fast before paid steps, retry only idempotent steps                                                                 | failed-job share of cost is reported by the script          | `failedShareOfCost` > 5%                                   |
| F8  | Trial burn: cap trial to Standard, add card-on-file or lower trial credits                                                                          | acquisition cost per signup                                 | trial → paid rate from `metrics-report`                    |
| F9  | Annual plans (pay 10, get 12) for upfront cash; add interval to `subscriptions`                                                                     | cash now, lower churn, fewer Stripe fees                    | Stripe price objects (owner approves)                      |
| F10 | Price tests: Starter/Pro price and credit grants, top-up ladder, premium credits/s                                                                  | revenue per user                                            | margin gate stays ≥ 3x on measured cost                    |
| F11 | Stripe fees: SEPA / bank debit and Link where legal, Stripe Tax needs                                                                               | fee % on every charge                                       | share of EU buyers                                         |
| F12 | Hosting right-sizing: Vercel/Supabase plan vs real usage, media retention TTL on storage                                                            | idle plan = pure waste                                      | usage via Vercel + Supabase connectors                     |
| F13 | Distribution cost: affiliates (30% recurring) vs paid ads, by cohort CAC vs first-month revenue                                                     | growth that pays back                                       | cohort data                                                |

## 5. Rules for the Finance CFO routine

See `docs/routines/finance-cfo.md`. Short version: PR-gated like the other
routines; read-only on Stripe, Supabase and Vercel; never changes live prices,
Stripe objects, plans or secrets; every provider swap ships behind the margin
gate and the adapter interface, with measured numbers in the PR.

## 6. Open questions for the owner

1. Monthly bill for each vendor in `src/config/finance.ts` (or authorise the Vercel and Supabase connectors so the routine reads them).
2. Which Vercel and Supabase plan are you on?
3. Authorise the Stripe connector in claude.ai (and say when live mode starts).
4. Is the app live with real paying users yet? Current MRR, signups per week.
5. Quality bar for swapping models: may the routine ship a cheaper model for Standard without your canvas review if side-by-side outputs are posted in the PR?
6. Budget guard: a monthly API spend ceiling that should page you?

## 7. Changelog (newest on top)

- **2026-10-20** — Routine and plan created. Added `features/metrics/finance.ts` (pure MRR, net MRR, cost per done video by tier, failed-spend share, MRR ratio), `scripts/finance-report.mts` (read-only), `config/finance.ts` (fixed bills, all unknown), +4 tests. No runtime change, no migration, no dependency. (Finance CFO, interactive)
