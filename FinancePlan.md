# FinancePlan.md — Shortcraft FinOps

Owned by the **FinOps CEO** routine (`docs/routines/finops-ceo.md`). It reads this file first and updates it every
run. Goal: **maximum cash return** — higher MRR, lower cost per video, no unit that loses money.
Every number carries a date and a source. Numbers marked _(code)_ come from the repo's catalog (worst-case upper
bounds), not from real invoices. Replace them with measured values as soon as a source exists.

## 1. Baseline (2026-10-16, from code; no live revenue data was reachable)

**State of the data:** Stripe is a test-mode sandbox, the Supabase connector failed to connect (proxy tunnel) in
the setup session, and no provider invoices are in the repo. So **MRR is unknown**; run
`npx tsx scripts/finops-report.mts` with `.env.local` to get it (see §6).

Margin gate _(code, `npx tsx scripts/margin-report.mts`)_ — net revenue after 20% VAT, Stripe 1.5% + €0.25, 1.08 USD/EUR:

| Product         | Net revenue | Worst-case API cost | Multiple  | Worst shape  |
| --------------- | ----------- | ------------------- | --------- | ------------ |
| Starter €14.99  | $12.98      | $2.31               | 5.62x     | voice design |
| Pro €29.99      | $26.24      | $8.73               | **3.00x** | 6s premium   |
| Ultra €79.99    | $70.43      | $21.83              | 3.23x     | 6s premium   |
| 20K top-up €12  | $10.34      | $1.75               | 5.92x     | 6s premium   |
| 60K top-up €29  | $25.36      | $5.24               | 4.84x     | 6s premium   |
| 150K top-up €59 | $51.87      | $13.10              | 3.96x     | 6s premium   |

Trial burn (acquisition cost per signup): **$0.23**.

Cost of one video _(code, upper bound)_:

| Video | Standard (Ken Burns) | Premium (fal AI video) |
| ----- | -------------------- | ---------------------- |
| 15 s  | $0.07                | $2.30                  |
| 30 s  | $0.09                | $3.80                  |
| 60 s  | $0.13                | $7.55                  |
| 90 s  | $0.16                | $11.29                 |

**Reading:** the standard tier is almost free to produce (about $0.09 for 30 s). **Almost all spend is the
premium AI-video model on fal.ai** (`fal:video`, default Kling 2.5 Turbo Pro, budgeted at $0.12 per scene-second;
list price about $0.07 per billed second, 5 s minimum clip). That single line is the first thing to attack, and the
Pro plan has no slack (3.00x exactly) so any premium-cost increase breaks the gate.

## 2. Revenue and MRR (fill from Stripe / `finops-report.mts`)

| Date               | Gross MRR (€) | Net MRR ($) | Subscribers (S/P/U) | New | Churned | Top-ups | ARPU | Source |
| ------------------ | ------------- | ----------- | ------------------- | --- | ------- | ------- | ---- | ------ |
| _no live data yet_ |               |             |                     |     |         |         |      |        |

## 3. Cost ledger (monthly, real invoices)

| Line                       | Vendor        | Monthly $ | Driver                   | Source / date                                             |
| -------------------------- | ------------- | --------- | ------------------------ | --------------------------------------------------------- |
| AI video (premium)         | fal.ai        | ?         | seconds of clip          | needs fal usage export                                    |
| Images                     | fal.ai (FLUX) | ?         | MP generated             | needs fal usage export                                    |
| Voice                      | ElevenLabs    | ?         | characters               | needs ElevenLabs usage                                    |
| Script LLM                 | Anthropic     | ?         | input/output tokens      | needs Anthropic usage (tokens not stored per job, see G1) |
| Hosting + cron + functions | Vercel        | ?         | function time, bandwidth | Vercel connector `list_billing_charges`                   |
| DB + storage + auth        | Supabase      | ?         | plan + egress            | Supabase dashboard                                        |
| Payments                   | Stripe        | ?         | 1.5% + €0.25 (EEA cards) | Stripe                                                    |
| Email, domain, monitoring  | ?             | ?         |                          |                                                           |

## 4. Vendor candidates to evaluate (unverified; the routine must confirm price, quality and licence with sources)

Prices change monthly and aggregator figures can differ 2x, so none of these is a decision yet.

| Slot           | Today                                 | Candidates to scout                                                                                                                                                                        | Why                                                                                                  |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Image-to-video | Kling 2.5 Turbo Pro on fal (~$0.07/s) | cheaper fal-hosted I2V models (LTX-Video, Wan 2.x, Hunyuan, Seedance Lite/Pro), Replicate, Together, Runware, WaveSpeed, Novita; self-hosted Wan/LTX on Modal, RunPod or Vast.ai spot GPUs | the whole premium cost. Even 40% off lifts Pro from 3.0x to about 4.5x or funds a lower credit price |
| Clip length    | fixed 5 s billing                     | generate only 5 s clips and reuse/loop/slow-mo with ffmpeg, or mix 1 AI clip + Ken Burns scenes                                                                                            | fewer billed seconds per video                                                                       |
| Images         | FLUX schnell $0.003/MP                | already cheap; check Runware / Together price per image                                                                                                                                    | marginal                                                                                             |
| Voice          | ElevenLabs Flash ($0.00075/s)         | already cheap; compare Cartesia, Deepgram Aura, OpenAI TTS                                                                                                                                 | marginal; quality matters more                                                                       |
| Script LLM     | Sonnet 5.5, about $0.04/job           | Haiku 5.5 for the script step, prompt caching, shorter prompts                                                                                                                             | small but free to try; keep quality                                                                  |
| Hosting        | Vercel + Supabase                     | check function-duration and bandwidth lines, cache the Ken Burns render                                                                                                                    | only if the bill shows it                                                                            |

## 5. Monetisation ideas (rank by cash impact; each needs a measured baseline first)

1. **Annual plans** (Stripe price ids exist as `stripePriceIdYearly`, currently null): cash up front, lower churn. Typical 2 months free.
2. **Premium as a metered add-on**: premium video is about 40x the cost of a standard video. Price it so it never
   subsidises itself (the 1,420 credits/s already encodes this; check usage mix and whether Starter users want a premium trial pack).
3. **Top-up ladder and auto top-up** when credits run low (cash at the moment of intent).
4. **Failed-payment recovery** (Stripe Smart Retries, dunning emails) — typically recovers a few % of MRR for free.
5. **Credit expiry / rollover rule**: unused monthly credits are pure margin; decide policy with the owner.
6. **Trial burn** is $0.23 per signup; track cost per paying customer (CAC from trial) once trial to paid is known.
7. **Refund/failed-job leakage**: failed jobs refund the user but the provider cost is already spent. Measure it
   (`failedJobCostUsd` in the report) and add a pre-flight check before the expensive step.
8. **Stripe Tax** to make VAT correct (the margin math assumes 20% VAT on every sale).

## 6. Gaps to close (owner / routine)

- **G1 Tokens are not stored.** Only `api_cost_usd` per job is persisted, so tokens vs dollars cannot be analysed.
  Proposed: migration adding `usage jsonb` to `render_jobs` (anthropic in/out tokens, fal seconds and MP, ElevenLabs
  chars) written by the orchestrator. Needs owner OK for the migration.
- **G2 No real revenue data.** Authorise the Stripe connector and move to live mode reads when launched.
- **G3 No provider invoices.** Add monthly usage exports (fal.ai, ElevenLabs, Anthropic) to §3 or create read-only access.
- **G4 Supabase connector** failed to connect in the setup session; retry/re-authorise.
- **G5 Costs are researched, not measured** (see TheMasterPlan §7): compare `api_cost_usd` sums with invoices monthly and re-tune `models.ts`.

## 7. Experiment and decision log (newest on top)

- **2026-10-16**: routine and tooling created: `docs/routines/finops-ceo.md`, `scripts/finops-report.mts`, this file.
  No live data reachable; baseline from the code catalog only.

## 8. Questions for the owner

1. Authorise the Stripe connector (and say when live mode starts).
2. Can the routine see fal.ai, ElevenLabs and Anthropic usage (exports or read-only keys)?
3. Approve migration for per-job usage (G1)?
4. Is switching the premium video model allowed behind a flag if a cheaper one passes a quality check?
