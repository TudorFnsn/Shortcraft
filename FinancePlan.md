# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (`docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`: the master
> plan wins on product and priority, this file wins on cost, pricing and cash.
> Every finance PR updates this file (baseline, experiments, changelog).
>
> Last updated: 2026-10-20 (routine created; first baseline below)

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question        | Owner's answer                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal            | Maximise profit and **cash return**: raise MRR, cut cost per video, never sell below the 3x margin gate.                                                                                                                           |
| Watch every run | MRR, subscribers by plan, net revenue vs API cost, **cost per finished video per tier**, credits charged vs dollars spent, failed-job burn, every fixed bill (hosting, ElevenLabs plan, domain, Sentry, Resend, Supabase, Vercel). |
| Hunt for        | Cheaper or better providers and new techniques (fal.ai video is the known expensive one), pricing and packaging changes, conversion and retention levers that move MRR.                                                            |
| Autonomy        | **PR-gated.** Opens PRs on `ceo-finance/<slug>`; never merges, never touches live secrets, never writes to Stripe or the production DB. Any write (migration, Stripe object, live-mode flip) needs Tudor's explicit OK.            |
| Cadence         | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Weekly deep dive on Mondays.                                                                                    |
| Notifies        | Only on a finding that needs Tudor: margin gate failing, measured cost above the catalog, MRR drop, a bill spiking, or access lost. A clean run is silent.                                                                         |
| File scope      | `config/models.ts`, `config/plans.ts`, `features/billing/**`, `features/providers/**`, `features/metrics/**`, `scripts/*report*`, `FinancePlan.md`, `TheMasterPlan.md` §7. UI files stay with the Design routine.                  |

## 2. How the routine works (DM master agent + specialists)

The master agent never does the heavy reading itself. It gathers the shared
snapshot, then fans out **in one parallel batch**, and merges.

| Step | Who                      | Does                                                                                                                                                                                                                                                   |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Master                   | `git fetch`, list open + recently closed PRs (skip anything already in review), read `FinancePlan.md`, `TheMasterPlan.md` §7, run `npx tsx scripts/finance-report.mts --json` (or the Supabase connector's `execute_sql` if no `.env.local`).          |
| 1    | **Revenue agent**        | Stripe (read-only) MRR, new/churned subs, refunds, disputes, trial→paid, ARPU; compares with the report.                                                                                                                                               |
| 2    | **Cost agent**           | Per-provider spend: measured `api_cost_usd` per tier vs catalog `costUsdPerUnit`; Anthropic tokens in/out per script; fal.ai, ElevenLabs, Vercel, Supabase invoices. Flags any gap over 25%.                                                           |
| 3    | **Provider scout**       | Web research (Firecrawl / WebSearch) for cheaper or better models and hosts per slot: image, video, voice, script, render. Returns a ranked table with price, quality, licence, latency and switch effort. Marks every price as _list_ until measured. |
| 4    | **Pricing agent**        | Re-runs `scripts/margin-report.mts` with proposed catalog changes; tests plan/top-up/credit-scale options, annual plans, trial size, overage, upsell paths against the 3x gate.                                                                        |
| 5    | **Growth-to-cash agent** | Funnel leaks that cost MRR: trial burn per signup, activation, paywall, churn, lifecycle emails; proposes the cheapest lever.                                                                                                                          |
| 6    | Master                   | Picks the single highest cash-return change, implements it behind a PR (tests + `margin-report` green), updates this file and `TheMasterPlan.md`, sends a notification if something needs Tudor.                                                       |

Rules: measured beats researched; a provider swap lands as a catalog row plus an
adapter (the provider layer exists for this); never lower a price or raise a
cost without the margin gate passing in the same PR.

## 3. Baseline (live Supabase read, 2026-10-20)

All Stripe data is **sandbox** (test mode), so MRR is hypothetical until go-live.

| Metric                             | Value                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Jobs                               | 15 done, 3 failed (failed ones cost $0.00 and were refunded)                 |
| Total metered API cost, all time   | **$8.19**                                                                    |
| Standard video (12 done, avg 18 s) | **$0.20** measured, 1,932 credits → $0.105 per 1k credits                    |
| Premium video (3 done, avg 30 s)   | **$1.92** measured, 42,620 credits → $0.045 per 1k credits                   |
| Subscribers                        | 2 × Pro active (sandbox) → net ≈ $26 each after VAT + Stripe fees, MRR ≈ $52 |
| Vercel                             | Hobby, no billing charges (Vercel API: `costs_not_found`)                    |

**Findings**

1. **Standard costs ~3x what the catalog assumes.** The gate prices a 15 s Standard at ~$0.07; measured is $0.20 for 18 s. Where it goes is not in the DB (only the total is stored). First task: store cost per step so the Cost agent can see it (see §5, F1).
2. **Premium is cheaper than assumed** ($1.92 for 30 s vs $3.80 in the gate) — Pro's 3.00x has real headroom once confirmed, which could fund more premium seconds per plan or a lower price.
3. **Token usage is invisible.** The script step computes `costUsd` from `usage.input_tokens/output_tokens` but only the dollar figure is persisted. Persist tokens (F1) to tune prompts, caching and model choice.
4. **Fixed costs are unknown to the repo.** Set `FINANCE_FIXED_COSTS_USD` (e.g. `ElevenLabs=5,Domain=1.2,Resend=0`) so break-even is computed. Needs Tudor (§6).

## 4. Provider watchlist (hypotheses, verify with the Provider scout)

| Slot          | Today                                                     | Candidates to price and test                                                                                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premium video | fal.ai Kling 2.5 Turbo Pro (~$0.07/s billed in 5 s clips) | Other models on fal (Wan, LTX, Seedance, Hailuo, Veo Fast), direct provider APIs, aggregators (Replicate, Together), self-hosting an open model on a GPU marketplace (Modal, RunPod, Vast) for volume; **hero-shot** (AI clip on scene 1 only, rest Ken Burns) already modelled at ~$0.45 per 15 s. |
| Images        | FLUX schnell $0.003 / FLUX dev $0.025 per MP              | Cheaper or faster open image models, batch pricing, smaller render size then upscale.                                                                                                                                                                                                               |
| Voice         | ElevenLabs Flash                                          | Cartesia, Deepgram Aura, OpenAI TTS, open TTS self-hosted for the cheap tier; keep ElevenLabs for Premium and designed voices.                                                                                                                                                                      |
| Script        | Claude Sonnet 5.5 (~$0.04)                                | Haiku 5.5 for drafts with Sonnet only on retry; prompt caching of the system prompt; token budget trim (`max_tokens` 16000 is a ceiling, check real usage).                                                                                                                                         |
| Hosting       | Vercel Hobby + Supabase free                              | Watch limits (function duration, bandwidth, storage of MP4s); retention policy to delete old media.                                                                                                                                                                                                 |

## 5. Backlog (highest cash return first)

- [ ] **F1. Per-step cost and token ledger.** Store `{step, provider, usd, input_tokens, output_tokens}` per job (new table, expand-only migration, owner applies). Unlocks every other item. _Needs migration approval._
- [ ] **F2. Reconcile catalog with measurements.** Standard measured $0.20 vs $0.07; premium $1.92/30 s vs $3.80. Update `costUsdPerUnit` from F1 data, re-run the gate, then decide the price move.
- [ ] **F3. Premium video provider bake-off** with `scripts/live-providers-smoke.mts` on the Provider scout's top 3.
- [ ] **F4. Script cost:** prompt caching + Haiku-first.
- [ ] **F5. Annual plans** (cash up front, lower churn) once Stripe live mode is on.
- [ ] **F6. Trial burn guard:** cap trial spend per signup; watermark already on.
- [ ] **F7. Failed-job spend alert** (failed jobs that paid a provider before failing).

## 6. Access and what the routine still needs from Tudor

| Need                                                               | Status                                                                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo (`TudorFnsn/Shortcraft`)                               | OK                                                                                                                                                                           |
| Supabase connector (read-only SQL, project `iqvrovjwoavvmhaithwn`) | **OK**, used for the baseline above                                                                                                                                          |
| Vercel connector (usage, billing, runtime errors)                  | **OK**; Hobby has no charges to read                                                                                                                                         |
| Stripe connector                                                   | **Needs reconnect** in claude.ai connector settings (it reports `needs_reconnect`). Required for real MRR, refunds, churn                                                    |
| Firecrawl connector                                                | Connected but off in chat: enable it for the Provider scout (price pages the cloud network blocks)                                                                           |
| fal.ai spend                                                       | No connector. Give the routine a **read-only usage export** (fal dashboard → Usage CSV, or an admin key in the routine's secrets); until then costs come from `api_cost_usd` |
| Anthropic spend                                                    | Needs an **Admin API key** (usage/cost report endpoint) in the routine's secrets, or paste the monthly Console figure                                                        |
| ElevenLabs spend                                                   | Plan price + characters used; read-only key shows usage                                                                                                                      |
| Fixed bills                                                        | Set `FINANCE_FIXED_COSTS_USD` in the routine's environment                                                                                                                   |
| Real traffic and signups                                           | Needs live mode (Stripe live keys) — owner decision                                                                                                                          |

**Suggested add-ons:** a PostHog or Plausible connector (visitor→signup→paid funnel, needed for CAC), a Resend connector (email cost and send volume), Sentry (failure cost), and a Google Sheets/Drive connector if you want the weekly P&L mirrored for your accountant.

## 7. Changelog (newest on top)

- **2026-10-20** — Finance track created: charter, agent roster, live baseline (standard $0.20 / premium $1.92 measured vs catalog), `features/metrics/unit-economics.ts` + `scripts/finance-report.mts` (MRR, cost per video per tier, burn, break-even; read-only), +3 tests. (Finance CFO, interactive setup)
