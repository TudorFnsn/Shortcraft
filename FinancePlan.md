# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on money (MRR, unit economics, vendor choice, pricing experiments).
> Every finance PR updates this file (ledger, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-16 (track created; no measured numbers yet)

---

## 1. Charter (owner-configured 2026-10-16, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit and cash return.** Cash in minus cash out, per month, then per video. MRR growth only counts when its margin holds.                          |
| Always    | Check the **MRR ratio** (MRR vs total monthly spend, and MRR vs last month) on every run, before anything else.                                               |
| Scope     | Every euro in and out: Stripe revenue and fees, fal.ai, Anthropic (tokens), ElevenLabs, Vercel, Supabase, Resend, Sentry, domains, ads, anything else paid.   |
| Mandate   | Find cheaper or better providers and fresher techs, price and package the app to monetise better, and ship what is safe as PRs.                               |
| Autonomy  | **PR-gated**, like the CEO routines. Branches `cfo/<slug>`; never merge; never touch live secrets; no writes to Stripe, Supabase or Vercel without the owner. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO at 06:00, before the Design CEO at 09:00).                                    |
| Structure | One **master agent** (the "DM") that reads state, then splits the work across specialist subagents in parallel. Spec in `docs/routines/finance-cfo.md`.       |
| Decisions | Customer-visible prices, plan contents, credit scale and anything that raises a price need **Tudor's explicit OK** (a note here or a PR approval).            |

### Principles

1. **Measure before you decide.** Public list prices are hypotheses (they disagree by 2x). A cost is real only when it comes from `render_jobs.api_cost_usd`, an invoice, or a usage page.
2. **Cash beats margin beats revenue.** Rank every idea by euros per month kept, then by effort, then by risk.
3. **Never trade the product away.** A cheaper model ships only after a side-by-side sample set (same 5 topics) is judged at least as good, and stays behind a flag until the owner sees it.
4. **The margin gate stays fail-closed.** `scripts/margin-report.mts` must pass (>= 3x on every plan and top-up) after every change that touches costs or prices.
5. **Say "no data" out loud.** If a number is not reachable, record it as unknown and list what unlocks it (section 6). Never invent one.

---

## 2. The MRR check (run first, every time)

| Metric                   | Definition                                                                   | Source                                |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------- |
| MRR                      | Sum of active subscription prices, monthly-normalised, net of discounts, EUR | Stripe (subscriptions) or Sigma       |
| MRR movement             | New + expansion - contraction - churned = net new MRR                        | Stripe                                |
| Burn (monthly spend)     | Sum of the vendor ledger (section 4), EUR                                    | Invoices, usage pages, `api_cost_usd` |
| **MRR ratio**            | MRR / burn. Below 1.0 the app loses money; target >= 3.0                     | Computed                              |
| Gross margin             | (Net revenue - API cost of delivered videos) / net revenue                   | Stripe + `render_jobs`                |
| Cost per delivered video | Sum of `api_cost_usd` for `done` jobs / count, by tier                       | Supabase                              |
| Credits breakage         | Credits granted but never spent (free margin), per cycle                     | `credit_transactions`                 |
| Trial burn per signup    | API cost of the 3,000 trial credits actually spent                           | `render_jobs` of trial users          |
| Payback                  | Months of gross profit to repay acquisition spend                            | Ads + SEO + Stripe                    |

Alert thresholds (these trigger a push notification): MRR ratio under 1.0 or
down more than 20% week on week; gross margin under 66% (the 3x gate); a vendor
bill up more than 30% month on month; a provider outage or price rise that
breaks the gate; any cost in `api_cost_usd` above its catalog `costUsdPerUnit`.

Until Stripe is in live mode there is no real MRR: report **test-mode MRR as
"sandbox"** and base the plan on the margin gate and projected scenarios.

---

## 3. Where the money goes (architecture facts, from the code)

Per video the pipeline calls, in order: **Claude script** (Anthropic, tokens) ->
**image per scene** (fal.ai FLUX schnell/dev) -> **video**: Standard = in-house
Ken Burns (free), Premium = **fal.ai image-to-video (Kling 2.5 Turbo Pro default)**
-> **voiceover** (ElevenLabs Flash) -> **render** (in-house ffmpeg on Vercel).
Catalog costs live in `src/config/models.ts` (`costUsdPerUnit`); real per-job cost
lands in `render_jobs.api_cost_usd`; token counts come from `costUsdFor()` in
`src/features/providers/live/anthropic-script.ts` but **tokens are not stored**,
only the dollar cost.

The one expensive line is **Premium AI video**: ~$1.10-$2.30 per 15s video against
$0.07 for a Standard one. fal.ai charges a fixed 5s clip, so short scenes pay for
unused seconds. This is the main lever (section 5, F2).

---

## 4. Vendor ledger (update from invoices, never from guesses)

Status key: **M** measured (invoice/usage page/DB), **L** list price only, **?** unknown.

| Vendor / line    | What for                         | Monthly EUR | Status | Notes / next step                                                                                                                              |
| ---------------- | -------------------------------- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| fal.ai           | FLUX images, Premium video       | ?           | ?      | Owner: export last 30 days of usage. Compare with `api_cost_usd`.                                                                              |
| Anthropic        | Script (Sonnet 5.5, $2/$10 MTok) | ?           | ?      | Store tokens per job (F1); test Haiku 5.5 + prompt caching for scripts.                                                                        |
| ElevenLabs       | Voiceover (Flash) + Voice Studio | ?           | ?      | Plan fee plus per-character; custom-voice slots cap sign-ups. Check plan tier.                                                                 |
| Vercel           | Hosting, cron, ffmpeg render     | ?           | ?      | **Hobby is non-commercial**: Pro (~$20/seat) is likely required once charging live. Verify in the Vercel terms and budget it.                  |
| Supabase         | DB, auth, storage                | ?           | ?      | Free tier limits (storage, egress, 500 MB DB): watch media bucket growth.                                                                      |
| Stripe           | Payment fees                     | ?           | L      | EU cards ~1.5% + EUR 0.25 (UK/EEA standard) to ~3.25% + EUR 0.25 for others; verify in the dashboard. Margin model already assumes fees + VAT. |
| Resend           | Lifecycle email                  | ?           | ?      | Free tier until volume.                                                                                                                        |
| Sentry           | Error tracking                   | ?           | ?      | Free tier; keep event volume in check.                                                                                                         |
| Domain / DNS     | lil-boxes-style brand domain     | ?           | ?      | Owner to confirm.                                                                                                                              |
| Ads / affiliates | Acquisition                      | ?           | ?      | None yet. Kill any cohort where CAC > first-month revenue (master plan 6.4).                                                                   |

---

## 5. Roadmap (top unchecked item that is not already in an open `cfo/*` PR)

Order is by expected cash impact. Each item says what unblocks it.

### F0 — Baseline (first run)

- [ ] **F0.1** Read-only snapshot: MRR (sandbox), `render_jobs` cost per tier, trial burn, `margin-report`, `metrics-report`. Fill section 2 and 4 with what is reachable; list the rest as unknown in section 6. Needs: Supabase + Stripe connectors, or `.env.local` for the scripts.

### F1 — See the money (instrument before optimising)

- [ ] **F1.1** `scripts/finance-report.mts` (read-only): per-tier cost per delivered video, cost by step, credits charged vs `api_cost_usd` (realised multiple vs the 3x gate), trial burn, breakage, MRR/ARR and MRR ratio from Stripe when `STRIPE_SECRET_KEY` is present. Pure math in `src/features/finance/` with tests. `--json` for the digest.
- [ ] **F1.2** Persist usage per job step (tokens in/out, billed seconds, characters, model id) in a new additive table `job_cost_lines` (migration owner-applied). This is what answers "how many tokens vs how much spent".
- [ ] **F1.3** Cost drift alarm: when a step's measured cost exceeds its catalog `costUsdPerUnit` by more than 20%, log a stable `alert` tag (Sentry picks it up) and show it in the report.

### F2 — Cut the biggest cost: Premium video

- [ ] **F2.1** **Hero-shot Premium**: AI clip on scene 1 only, Ken Burns on the rest. About $0.45 vs $1.10 per 15s (master plan section 7). Behind a flag; credits repriced only with owner OK.
- [ ] **F2.2** **Provider bake-off** (WebSearch + sample set, flag-gated adapter per candidate). Candidates to price on real calls, all via the existing adapter layer: LTX-2 Fast ($0.04/s list), Wan 2.5, Seedance 2.x, Hailuo, Kling 3.0, Veo 3.1 Fast; and other hosts for the same models (Replicate, Runware, Together, WaveSpeed, direct vendor APIs) which are often cheaper than fal.ai. Decision rule: >= 30% cheaper at equal judged quality, or equal cost at clearly better quality.
- [ ] **F2.3** Clip economics: match scene length to the provider's billing unit (5s clips: plan 5s scenes, no waste), cache and reuse clips for retries, never re-bill a failed clip twice.
- [ ] **F2.4** Self-host or serverless-GPU open weights (Wan, LTX) on a pay-per-second GPU host if volume ever justifies it. Not before there is steady Premium demand.

### F3 — Cheaper everything else

- [ ] **F3.1** Scripts: test Haiku 5.5 with prompt caching and a tighter output schema; keep Sonnet 5.5 only if quality drops. Measure tokens per script (needs F1.2).
- [ ] **F3.2** Images: price FLUX schnell elsewhere (Runware, Together, Fireworks) and cheaper image models; reuse images across A/B hooks; cache identical prompts.
- [ ] **F3.3** Voice: bake-off of ElevenLabs Flash against Cartesia, Deepgram Aura-2, OpenAI TTS and open Kokoro for the default voice; keep ElevenLabs for Voice Studio only if its slots stay cheap.
- [ ] **F3.4** Infra: right-size Vercel (function duration/memory for ffmpeg), media retention (delete renders and intermediates after N days), storage egress via signed URLs only.
- [ ] **F3.5** Payment fees: annual plans cut fee count; check Stripe local payment methods (SEPA, iDEAL) for EU price and fee trade-offs.

### F4 — Earn more per customer (needs owner OK to change prices or plans)

- [ ] **F4.1** **Annual plans** (2 months free) for cash up front and lower churn; Stripe prices + `/pricing` toggle.
- [ ] **F4.2** Trial-to-paid: shrink trial burn (trial uses Standard only, watermark or lower res), pay-wall on the second video, card-on-file trial test.
- [ ] **F4.3** Top-up and upgrade nudges at the moment credits run low (in-app, lifecycle email); expansion MRR is the cheapest MRR.
- [ ] **F4.4** Packaging: priced add-ons (extra saved voices, 1080p, series/auto-posting, team seats), a pay-as-you-go tier, regional pricing, a referral/affiliate payout model with a cap that keeps margin >= 3x.
- [ ] **F4.5** Pricing experiments with a real sample: price page A/B, credit-scale option C from section 7 of the master plan (decide after measured costs).
- [ ] **F4.6** Sponsorships / marketplace ideas: sell theme packs, template packs, white-label API for agencies.

### F5 — Hygiene

- [ ] **F5.1** Subscription health: failed-payment recovery (Stripe smart retries + dunning email), cancellation survey, win-back email.
- [ ] **F5.2** Chargebacks and refunds tracking; refund rate by cause.
- [ ] **F5.3** Monthly cash summary for the owner (CSV or sheet) when a Sheets/Drive connector exists.

---

## 6. Open questions for the owner (the routine asks; answers go here)

These are access or data the routine cannot reach alone. Answer in this file or in the routine digest.

1. **Stripe connector** needs authorising (claude.ai connector settings) so the routine can read subscriptions, balance, fees and Sigma. Read-only is enough.
2. **Supabase connector** failed to connect from the last cloud session (proxy tunnel error). Re-authorise or retry; read-only SQL on `render_jobs`, `credit_transactions`, `subscriptions` is what the routine needs.
3. **fal.ai, Anthropic, ElevenLabs usage**: no connector exists. Either paste a monthly usage export here, or add the optional read-only keys listed in `docs/routines/finance-cfo.md` section 5 as routine environment variables.
4. **Vercel connector** is available (billing charges and usage); confirm the routine may read it.
5. Is the app live with real payments yet, or sandbox only? What is the current real MRR, if any?
6. Budget guardrails: max monthly burn you accept before the routine should push an alert, and the target MRR / profit for the next 3 months.
7. Ad spend or influencer costs to include in the ledger?
8. Do you accept Premium AI video being offered only on Pro/Ultra with a hero-shot default?

---

## 7. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (sections 7 and 9), this file, `git log -20`, open and recent PRs (list through the GitHub connector), then the digest of the last run (section 8).
- **MRR check first** (section 2). Notify on a threshold hit; stay silent otherwise.
- **One shipped item per run**, the top unchecked item in section 5 that is not in an open `cfo/*` PR. Prefer improving an open `cfo/*` PR to starting a new one. Research-only runs (a vendor report) are allowed when no code item is unblocked.
- **Files it may change:** `FinancePlan.md`, `docs/finance/**`, `scripts/finance-*.mts`, `src/features/finance/**`, `tests/finance/**`, new provider adapters under `src/features/providers/live/**` registered **behind a flag and off by default**, `src/config/models.ts` for cost fields (`costUsdPerUnit`) and new candidate rows, `.env.example`, the finance lines of `TheMasterPlan.md`. It may add one additive migration file for F1.2; **the owner applies it**.
- **Files it must not change:** customer-visible prices and credits (`src/config/plans.ts`, `creditsPerUnit`, Stripe prices) without a recorded owner OK in section 6 or on the PR; `src/features/billing/webhook.ts` and ledger functions except through a reviewed fix; UI files owned by the Design CEO (`src/components/**`, `src/app/**` view files) unless the item is a pricing-page copy change the owner approved.
- **Never:** merge, push to `main`, read or print secrets, write to Stripe/Supabase/Vercel, enable live providers, or turn a candidate provider on for real users.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `npx tsx scripts/margin-report.mts` still passes (>= 3x). Report the before/after multiple in the PR.
- **Evidence in every PR:** the number it moves (EUR/month or points of margin), how it was measured or why it is only a list-price estimate, the quality check for any provider swap, and the rollback.
- **Output:** a digest (what moved, MRR ratio, top three cash levers with EUR estimates, PR links, what waits on Tudor, next item). A push notification only when a threshold in section 2 trips, a PR is ready for review, or the routine could not run.

---

## 8. Digest log (newest first; the routine pastes its short summary here)

_No runs yet._

---

## 9. Changelog

- **2026-10-16** — Finance track created: charter, MRR check, vendor ledger, roadmap F0-F5, routine rules, and the routine prompt in `docs/routines/finance-cfo.md`. No code changes. (Interactive, owner-requested)
