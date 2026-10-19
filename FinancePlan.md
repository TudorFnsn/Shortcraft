# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt in `docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`:
> the master plan wins on product and priority; this file wins on cost, price and
> vendor choices. Every finance PR updates this file (§5 numbers, §6 backlog,
> §7 changelog) in the same change.
>
> Last updated: 2026-10-19 (created)

---

## 1. Charter (owner-configured 2026-10-19, do not change without Tudor)

| Question         | Owner's answer                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal             | **Maximum profit, cash return first.** Raise net MRR, cut cost per finished video, never let a product fall under the 3x margin gate.                                                                |
| Every run checks | MRR, plan mix, API cost per finished video by tier, wasted spend on failed jobs, revenue ÷ API cost, revenue ÷ all costs.                                                                            |
| Known pain       | The premium AI-video model on fal.ai (Kling 2.5 Turbo Pro, ~$0.07/s) looks expensive. Find cheaper or better video, image, voice and script options.                                                 |
| Scope            | Pricing, plans, credits, provider/model choice, hosting and SaaS bills, conversion and retention levers that move revenue. Not UI design (Design CEO) or SEO copy (CEO).                             |
| Autonomy         | **PR-gated.** Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe or production data. Read-only checks on Supabase/Stripe/Vercel are fine; any write needs Tudor's OK. |
| Cadence          | Weekly cloud routine **"Shortcraft Finance CFO"**, Mondays 07:00 UTC (after the 06:00 CEO). Notifies Tudor only when something needs a decision.                                                     |
| Collisions       | Leaves `ceo-design/*` UI files alone. Checks open + recently closed PRs before picking work. Pricing/plan changes always go to Tudor as a recommendation first.                                      |

---

## 2. What the CFO reads (data sources)

| Need                                   | Source                                                                                              | Status                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| MRR, plan mix, API cost/video, margin  | `npx tsx scripts/finance-report.mts` (needs `.env.local`) or Supabase connector read-only `select`s | Script built 2026-10-19; cloud routine needs a read-only DB path (see §3)                                    |
| Real revenue, churn, refunds, fees     | Stripe connector (read-only; Sigma if enabled)                                                      | Connector exists, **needs re-authorization** (2026-10-19). Sandbox account only until live mode              |
| Hosting bill, function time, bandwidth | Vercel connector (`list_billing_charges`, usage tools)                                              | Connector listed 2026-10-19; confirm the CFO can see the team                                                |
| DB size, egress, compute               | Supabase connector (`get_advisors`, logs, `execute_sql`)                                            | **Failed to connect from the cloud session 2026-10-19** (proxy tunnel); retry                                |
| Model prices and new models            | Web search + fal.ai/Replicate/Together/OpenRouter pricing pages                                     | Provider pages were blocked from routine networks before; rely on search snippets and flag them "unmeasured" |
| Real per-call cost                     | `render_jobs.api_cost_usd`                                                                          | Total per job only. **Gap:** no per-provider/per-step breakdown and no token counts stored (§6, F1)          |
| Fixed monthly bills                    | Owner list in §4                                                                                    | Empty: Tudor to fill in                                                                                      |

---

## 3. What the CFO needs from Tudor (ask once, then it is in this file)

1. **Fixed monthly bills** (fill §4): Vercel plan, Supabase plan, ElevenLabs plan, Anthropic, fal.ai top-up habit, Resend, domain, Sentry, anything else.
2. **Read-only database access for the cloud routine.** Cheapest safe path: create a Postgres role `finance_ro` with `select` on `render_jobs`, `subscriptions`, `credit_transactions`, `profiles` only, store it as a routine secret, and have the routine use it. Or keep using the Supabase connector once it connects.
3. **Re-authorize the Stripe connector** (claude.ai → Settings → Connectors), and later create a **restricted read-only live key** when live mode starts.
4. **Spend caps / budgets**: monthly API budget per vendor, and the profit target (e.g. "net margin ≥ 60%").
5. **Permission to A/B test prices** (Stripe test prices first) and to run provider trials with a small fal.ai / Replicate credit.

---

## 4. Fixed monthly costs (owner to fill in)

| Item                                    | Plan  | USD / month        |
| --------------------------------------- | ----- | ------------------ |
| Vercel                                  |       |                    |
| Supabase                                |       |                    |
| ElevenLabs                              |       |                    |
| Anthropic API                           | usage | per `api_cost_usd` |
| fal.ai                                  | usage | per `api_cost_usd` |
| Resend                                  |       |                    |
| Sentry                                  |       |                    |
| Domain                                  |       |                    |
| **Total (feed to `FIXED_MONTHLY_USD`)** |       |                    |

---

## 5. Latest numbers (the CFO overwrites this block each run)

_No run yet. First run fills: net MRR, subscribers by plan, API cost per finished video (standard / premium), failed-job waste, revenue ÷ API cost, revenue ÷ all costs, cash margin._

---

## 6. Backlog (ordered by cash impact; the CFO works the top open item)

- **F1. Cost telemetry.** Store per-step provider cost and Anthropic token counts per job (new `render_job_costs` table or a `cost_breakdown jsonb` column; additive migration, owner applies). Without it "tokens used vs money spent" cannot be answered per video. `anthropic-script.ts` already computes cost from `usage`; it just discards the tokens.
- **F2. Premium video cost.** Benchmark fal.ai Kling 2.5 Turbo Pro against: LTX-2 Fast/Distilled, Wan 2.5/2.2, Seedance Lite/Pro, Hailuo 02/2.3, Veo 3.1 Fast (audio included), and self-hosted Wan on Replicate/Modal/RunPod. Compare $ per delivered second at 5s billing granularity, quality on our 9:16 themes, and failure rate. Ship the winner behind `FAL_VIDEO_MODEL` or a new adapter, then lower `costUsdPerUnit` once measured. The hero-shot variant (AI clip on scene 1 only) is the biggest lever (~$0.45 vs ~$1.10 per 15s).
- **F3. Images.** FLUX schnell is $0.003: already near the floor. Check premium (FLUX dev $0.025) against cheaper equal-quality options (Qwen-Image, SDXL-Lightning, Z-Image-Turbo) and cache/reuse images across re-voice jobs.
- **F4. Voice.** ElevenLabs Flash is the largest per-video line after video. Benchmark Cartesia Sonic, Deepgram Aura-2, OpenAI gpt-4o-mini-tts, Kokoro self-hosted; watch the custom-voice slot cap. Keep ElevenLabs only where voice design needs it.
- **F5. Script.** Sonnet 5.5 at ~$0.04 per script. Try Haiku 5.5 for short scripts with prompt caching of the theme prompt; measure rejection/regeneration rate before switching.
- **F6. Failed-job waste.** Fail early (moderation, validation) before paid steps; never re-run paid steps on retry (idempotency keys already exist; verify). Track `failedCostUsd30d`.
- **F7. Pricing and packaging.** Annual plans (2 months free) for cash up front; raise Starter price or trim credits if margin allows; credit expiry/rollover rules; top-up upsell at low balance; trial burn cap; EU price localisation; Stripe Tax vs assumed 20% VAT; Stripe fee optimisation (local payment methods).
- **F8. Retention and expansion.** Dunning (Stripe Smart Retries), cancel-flow offer, plan-upgrade nudges when a user hits a limit, win-back emails for unused credits (lifecycle email exists).
- **F9. Infra bill.** Vercel function duration for the ffmpeg render, Supabase egress/storage lifecycle (delete intermediate images/clips after N days), image/video CDN caching, cron frequency (every-minute sweep).
- **F10. Tools that would help.** See `docs/routines/finance-cfo.md` "Suggested connectors".

---

## 7. Changelog (append newest on top)

- **2026-10-19** — Finance track created: charter, `features/metrics/finance.ts` (net MRR, plan mix, API cost per finished video by tier, failed-job waste, cash margin) with tests, `scripts/finance-report.mts`, and the routine prompt in `docs/routines/finance-cfo.md`. (Finance CFO, interactive)
