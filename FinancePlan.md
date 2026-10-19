# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on costs, pricing experiments and vendor choices. Every finance PR updates
> the scorecard (§2), the roadmap (§5) and the changelog (§7) in the same change.
>
> Last updated: 2026-10-19 (track created)

---

## 1. Charter

**Goal:** maximise cash return. Grow MRR, push the cost of a finished video down,
and never let a plan lose money. Order of priority: (1) stop cash leaks, (2) cut
per-video cost, (3) lift revenue per customer, (4) grow customers.

| Question      | Answer                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy      | **PR-gated.** Branches `cfo/<slug>`; never merge; never touch live secrets; no Stripe writes, migrations or live-mode changes without Tudor. |
| Measures with | `npx tsx scripts/finance-report.mts` (MRR, cost per video, margin, break-even) and `scripts/margin-report.mts` (the 3x gate).                |
| Money facts   | Fixed costs and cash live in `src/config/finance.ts`. Every `null` there is a question for Tudor; ask, never guess.                          |
| Cadence       | Daily cloud routine **"Shortcraft Finance CFO"**, 07:30 UTC (after the CEO at 06:00). Prompt: `docs/routines/finance-cfo.md`.                |
| Overlap rule  | Does not edit UI files while a `ceo-design/*` PR is open. Lists open + recently closed PRs before picking work.                              |

---

## 2. Scorecard (update every run)

State on 2026-10-19: **Stripe is in test mode, so real MRR is €0** and `render_jobs`
has no paying history to measure. Every figure below is a list-price model, not a
measurement. The first live month replaces them.

| Metric                      | Now                                   | Target            |
| --------------------------- | ------------------------------------- | ----------------- |
| MRR (EUR) / net MRR (USD)   | not live                              | tracked weekly    |
| Revenue ÷ API cost (gate)   | Pro 3.00x (modelled, fails if cost +) | ≥ 3x, aim ≥ 5x    |
| API cost, 15s Standard      | ~$0.07 modelled                       | measured, ≤ $0.05 |
| API cost, 15s Premium       | ~$1.10 modelled (Kling 2.5 Turbo)     | ≤ $0.60           |
| Fixed costs / month         | unknown (owner input)                 | known, trimmed    |
| Break-even subscribers      | unknown until fixed costs known       | < 30              |
| Wasted spend on failed jobs | not measured                          | < 3% of API spend |

---

## 3. What the code tells us about cost

From `src/config/models.ts` (list prices, not measured):

| Step (15s Standard video)  | Cost    | Share |
| -------------------------- | ------- | ----- |
| Script (Claude Sonnet 5.5) | ~$0.040 | ~57%  |
| 5 images (FLUX schnell)    | ~$0.015 | ~21%  |
| Voice (ElevenLabs Flash)   | ~$0.011 | ~16%  |
| Render (in-house ffmpeg)   | ~$0.010 | ~14%  |

(Shares are of the ~$0.07 catalog total; they don't sum exactly because the
catalog rounds.) **The script is the biggest Standard cost, not video.** Premium
is dominated by AI video clips (~$0.07/billed second, fixed 5s Kling clips).

**Measurement gap:** `render_jobs.api_cost_usd` stores one number per job. Tokens
and per-step cost are not stored, so "tokens used vs money spent" cannot be
answered per step or per provider. Roadmap item F1 closes that.

---

## 4. Vendor and tech scouting (web research, 2026-10-19)

Sources are vendor and affiliate blogs and disagree with each other and with the
catalog. **Treat every price as a lead to verify on the vendor's own page and on
our invoices, not a decision.**

| Area             | Today                               | Candidates to test                                                                                                                                                                                    | Why                                                                                                                           |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AI video (Prem.) | fal.ai Kling 2.5 Turbo Pro, $0.07/s | Kling 3.0 Turbo (one source: ~$0.029/s on fal), Seedance 1.5 Pro / 2.0 Fast, Wan 2.2/2.5/2.6 (≈$0.05–0.07/s), LTX-2.3 Fast ($0.06–0.24/s), Grok Imagine Video 1.0 ($0.05/s), Pruna P-Video (~$0.02/s) | Reported 2–3x spread; direct-from-vendor and aggregator (WaveSpeed, Replicate, Runware, Atlas Cloud) routes can undercut fal. |
| Hero-shot mix    | AI clip on every scene              | AI clip on scene 1 only, stills + Ken Burns elsewhere                                                                                                                                                 | ~$0.45 vs ~$1.10 per 15s; best margin lever already designed (§7 of the master plan).                                         |
| Script LLM       | Sonnet 5.5, $2/$10 per MTok         | Haiku 5.5 for drafts, prompt caching for the fixed system prompt, Batch API for non-urgent work                                                                                                       | Script is ~57% of Standard cost. Test quality first: scripts are the product's hook.                                          |
| Voice            | ElevenLabs Flash, $0.05/1k chars    | Deepgram Aura-2 (~$0.03/1k), Smallest.ai Lightning (~$0.025/1k), Cartesia; keep ElevenLabs for Voice Studio                                                                                           | Narration quality and word timestamps (needed for subtitles) must match before switching.                                     |
| Images           | FLUX schnell via fal, $0.003        | Already near the floor. Leave.                                                                                                                                                                        | Not worth effort.                                                                                                             |
| Hosting          | Vercel + Supabase                   | Check function duration and egress on the Vercel invoice; Supabase storage retention for rendered MP4s                                                                                                | Storage grows with every video; add a retention rule (e.g. free-plan videos expire).                                          |

### Revenue levers (no new tech needed)

1. **Annual plans** (2 months free): cash up front, lower churn. `stripePriceIdYearly` already exists in `config/plans.ts`.
2. **Credit expiry / no rollover**: unused monthly credits are margin; keep that explicit in the terms.
3. **Top-up upsell at 80% credit use** (lifecycle email already exists).
4. **Failed-payment recovery**: Stripe Smart Retries + dunning emails.
5. **Premium as the upsell**: hero-shot Premium priced close to Standard to lift Starter → Pro.
6. **Watermark + referral** on the free trial as a zero-cost acquisition channel.

---

## 5. Roadmap (CFO picks the highest cash impact that needs no owner secret)

- [ ] **F1 Usage ledger.** New table `provider_usage` (job_id, step, provider, model, units, input_tokens, output_tokens, cost_usd, created_at), written from the orchestrator's `charge()`. Enables cost per step, per provider and tokens-vs-spend. _Needs migration 0013: owner applies._
- [ ] **F2 Measured costs.** Run `scripts/live-providers-smoke.mts` with `FAL_KEY` (owner) for 3 video models; compare to the fal invoice; replace `costUsdPerUnit`.
- [ ] **F3 Script cost.** Add prompt caching + test Haiku 5.5 on 20 topics; ship only if blind quality ≥ Sonnet.
- [ ] **F4 Premium cost.** Evaluate Kling 3.0 / Seedance / Wan via an adapter behind `FAL_VIDEO_MODEL`; add measured price to `FAL_VIDEO_USD_PER_SEC`.
- [ ] **F5 Voice A/B.** Second TTS adapter (Aura-2 or Lightning) behind a flag; compare cost and subtitle timing.
- [ ] **F6 Annual plan + dunning.** Needs Stripe price ids (owner approves Stripe writes).
- [ ] **F7 Retention rule for stored videos.** Cap Supabase storage growth.
- [ ] **F8 Finance dashboard.** Weekly digest artifact from `finance-report --json`.

---

## 6. Owner inputs needed (the routine asks until these are answered)

1. Monthly bill for each vendor in `src/config/finance.ts`, and cash on hand.
2. Go-live date for Stripe live mode (until then MRR is zero by construction).
3. Read access: the **Stripe connector needs reconnecting** (it shows `needs_reconnect`), and a **read-only fal.ai usage/billing export** (CSV or an admin key kept only in the routine's secrets).
4. Permission to apply migration 0013 (F1).
5. Is the target markup 3x firm, or can promos/trials run below it?

---

## 7. Changelog (newest on top)

- **2026-10-19** — Finance track created: charter, scorecard, vendor scouting, roadmap, `finance-report` script (pure `computeFinance` + 5 tests) and the routine prompt. No runtime or schema change. (CFO, interactive)
