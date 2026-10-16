# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`. The master plan wins on product and priority;
> this file wins on unit economics, vendor choice and pricing experiments. Every
> finance PR updates this file (ledger + changelog) in the same change.
>
> Last updated: 2026-10-16 (routine created; no measured data yet)

---

## 1. Charter (proposed 2026-10-16, owner confirms)

| Question   | Answer                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal       | **Maximise cash return.** Raise MRR, raise contribution margin per video, cut fixed + variable spend, shorten payback on every trial.                                               |
| Headline   | **Contribution margin = net revenue − (API + hosting + fees)**, per plan and per video. Revenue/cost multiple stays >= 3x (the margin gate) as the floor, never the target.         |
| Autonomy   | **Analyse freely, PR-gated code.** Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe, live providers or production data. Read-only connector use.   |
| Owner OK   | Required for: any price change, a provider swap in production, Stripe objects, migrations, paid vendor sign-ups, anything that spends money.                                        |
| Cadence    | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO 06:00 and Design CEO 09:00). Heavier vendor-price sweep on Mondays.                                       |
| Silence    | A run that finds nothing new sends **no notification**. Notify only for: margin gate at risk, spend spike, MRR drop, a savings idea worth >= 10% of monthly spend, or a blocked run. |

## 2. The numbers the routine must produce every run

1. **MRR and its movers:** active subscriptions x plan price, new / expansion / contraction / churned MRR, trial → paid, top-up revenue. (Stripe + `scripts/metrics-report.mts`.)
2. **Unit cost per video**, from `render_jobs.api_cost_usd` (column exists since `0001_init`): mean / p50 / p95 by length and tier, **measured vs the `costUsdPerUnit` assumptions** in `src/config/models.ts`.
3. **Token and usage economics:** Anthropic `usage` is already priced per script call (`costUsdFor` in `providers/live/anthropic-script.ts`). Report input/output tokens per script, $ per script, cache-hit share, retries. Same for fal.ai images/video seconds and ElevenLabs characters.
4. **Full cost stack, monthly:** fal.ai, ElevenLabs, Anthropic, Supabase, Vercel (incl. function GB-s for in-house ffmpeg + bandwidth), Resend, Sentry, Stripe fees, domain. Fixed vs variable.
5. **Margin by plan at full burn and at realistic burn:** `npx tsx scripts/margin-report.mts` (full burn) plus actual credits spent / credits granted ("breakage") per plan from `credit_transactions`.
6. **Trial burn:** cost of free credits per signup vs trial → paid conversion → CAC-equivalent payback.
7. **Runway view:** monthly spend, monthly net revenue, break-even number of paying users.

If a number can't be read (connector down, no data yet), say so in the report, notify once, and add the missing instrumentation to §6 instead of guessing.

## 3. How the routine runs (master agent + specialists)

The **Finance CEO (master)** reads this file, `TheMasterPlan.md` §7/§9 and the open + recently closed PR list (skip anything already in review), then fans out **in parallel** and merges the results. The master owns decisions; workers return facts and proposals only.

| #   | Worker                 | Job                                                                                                                                                                                                                                  | Reads                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1   | **Revenue analyst**    | MRR waterfall, churn, trial → paid, ARPU, top-up mix, failed payments / dunning leakage, refunds and disputes.                                                                                                                         | Stripe connector (read), `metrics-report`   |
| 2   | **Cost auditor**       | Measured $ per video vs assumed; spend by vendor; tokens / seconds / characters per video; Vercel and Supabase usage and plan headroom; idle or oversized resources.                                                                  | Supabase (read-only SQL), Vercel billing    |
| 3   | **Vendor scout**       | Cheaper / better image, video, voice and LLM options. Must cite a **current price page or measured call**, never a remembered price. Produces a ranked table with $/unit, quality risk, migration effort, and the adapter row to add. | Web (WebSearch/WebFetch), `providers/*`     |
| 4   | **Pricing strategist** | Credit scale, plan ladder, annual plan, top-up sizing, trial size, premium "hero shot" tier, usage-based overage, regional / EUR vs USD pricing. Each idea carries expected MRR and margin impact and the experiment that would prove it. | `config/plans.ts`, `margin.ts`, Stripe data |
| 5   | **Implementer**        | Takes the master's single chosen item and ships it as a small, tested PR: adapter, catalog row, cost instrumentation, margin-report extension, prompt / caching change. Runs format, lint, typecheck, tests.                           | repo                                        |
| 6   | **Skeptic**            | Tries to break the chosen proposal: does it keep the 3x gate, hurt quality, add vendor lock-in or legal risk (AI-content labelling, voice consent, licensing)? Vetoes anything unmeasured.                                             | all of the above                            |

Workers 1-4 run concurrently; 6 reviews before 5 opens a PR. One PR per run, smallest change that moves cash. Pure analysis runs (no PR) are fine and should append to §5.

## 4. Cost levers already visible in the code (start here)

Hypotheses, **unmeasured** — the routine must confirm each with real numbers before proposing a change.

| Lever                                  | Where                                                      | Why it may matter                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premium AI video is the dominant cost  | `video-premium` $0.12/s assumed, Kling 2.5 Turbo on fal.ai | A 15s premium video is ~$1.10-$1.80. **Hero-shot** (AI clip on scene 1 only) is ~$0.45. Compare Wan, Seedance, LTX-2, Hailuo and open-weight models on fal / Replicate / Runpod / self-hosted GPU. |
| Image model                            | `fal:flux-schnell` $0.003/MP                               | Already cheap; check batch / serverless GPU or an open model on a spot GPU only if volume justifies it.                                                         |
| Prompt caching + smaller script model  | `anthropic-script.ts` (Sonnet 5.5, `max_tokens` 16000)     | Cache the system prompt, lower `max_tokens`, try Haiku 5.5 for short scripts with a quality check; script is ~$0.04 per video, so only worth it at volume.       |
| Voice                                  | ElevenLabs Flash $0.05/1k chars + custom-voice slots       | Compare other TTS vendors and ElevenLabs plan tiers; slots cap sign-ups (see master plan §8).                                                                  |
| Free-trial burn                        | 3,000 credits, ~$0.25 per signup                           | Tune size against measured trial → paid conversion.                                                                                                            |
| Credit breakage                        | `credit_transactions`                                      | If most users never spend their grant, real margin is far above the full-burn gate — room to cut price or add value rather than guess.                         |
| Hosting                                | Vercel functions run ffmpeg                                | Check function duration / memory; move heavy renders to a cheaper worker only if the Vercel bill says so.                                                     |
| Revenue levers                         | `config/plans.ts`                                          | Annual plan (cash up front), premium add-on, overage packs, price tests, dunning recovery, win-back emails.                                                    |

## 5. Ledger (append newest on top; the routine fills this in)

| Date | Metric | Value | Source | Note |
| ---- | ------ | ----- | ------ | ---- |
| —    | —      | —     | —      | No measured data yet. First run must populate MRR, $/video measured vs assumed, vendor spend. |

## 6. Access and instrumentation gaps (what the routine needs)

Status of each as of 2026-10-16. The routine re-checks them every run and notifies the owner **once** per newly blocked item.

| Need                                | Status                                                                                                                | Action for owner                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo write (branches, PRs)   | In scope: `tudorfnsn/shortcraft`                                                                                      | None.                                                                                                                                             |
| Stripe (read)                       | Connector present; **sandbox account only** (`acct_1UKkSC0LHtTQ4zpU`, test mode)                                      | For real MRR, connect the **live** account with a restricted read-only key. Writes stay off.                                                       |
| Supabase (read-only SQL)            | Connector configured but **failed to connect** from the 2026-10-16 cloud session (`ERR_PROXY_TUNNEL`)                  | Re-authenticate the connector; allow `mcp.supabase.com` in the routine's environment network policy. Use a read-only DB role if possible.         |
| Vercel (billing, usage, logs)       | Connector present                                                                                                     | Confirm the project is linked; routine uses `list_billing_charges`, runtime logs, deployments (read).                                              |
| Network egress for price pages      | Earlier routine network blocked provider pages (master plan §7)                                                       | Set the routine environment's network policy to allow `fal.ai`, `elevenlabs.io`, `replicate.com`, `anthropic.com`, `openai.com`, `runpod.io`, `stripe.com`. |
| fal.ai spend                        | Not connected                                                                                                         | Provide a read-only/usage view (fal dashboard export or admin key in the routine env as `FAL_ADMIN_KEY`).                                          |
| ElevenLabs usage                    | Not connected                                                                                                         | Read-only usage via API key with usage scope (`ELEVENLABS_API_KEY`, already in `.env.local`, must be given to the routine env, not committed).     |
| Anthropic usage / cost              | Per-call `usage` priced in code; no org-level view                                                                    | Optional: Admin API key (`ANTHROPIC_ADMIN_KEY`) for the usage and cost report to reconcile against our own numbers.                                |
| Persisted per-step cost             | `render_jobs.api_cost_usd` is a total; **no per-step / per-vendor / per-token breakdown stored**                      | First implementer PR: add a `job_costs` table (job, step, vendor, units, tokens, usd) written by each adapter. Needs a migration → owner OK.      |
| Fixed-cost list                     | Unknown (domain, Supabase plan, Vercel plan, ElevenLabs plan, Resend, Sentry)                                         | Owner: paste the monthly plan costs into §5 once. The routine can't see invoices.                                                                  |
| Product analytics / funnel          | No PostHog yet                                                                                                        | Optional: PostHog connector for signup → first video → paid funnel.                                                                                |

**Suggested connectors / tools that would help most** (in order): live-mode read-only Stripe; a working Supabase read-only connection; fal.ai usage access; PostHog (funnel); a Google Sheets / Drive connector for the owner's invoices; the Claude `schedule`/routines UI for this routine; a vendor-pricing MCP or fetch tool with unrestricted egress to the pages listed above.

## 7. Guardrails (do not change without Tudor)

- The margin gate stays fail-closed. A proposal may raise it, never lower it, and may never switch `MOCK_PROVIDERS` off.
- **Prices cited must come from a page or call made in the same run** with the date. Remembered or aggregator prices are marked `unverified`. (History: 2026-10-04 figures disagreed by up to 2x.)
- No quality regression by stealth: any cheaper model gets a side-by-side sample set approved by the owner before it becomes default; keep the old adapter as the fallback.
- Respect legal rules from the master plan (AI-content labelling, no voice cloning of real people, licensing terms of each model, EU VAT).
- Never push to `main`, never merge, never run Stripe / Supabase / Vercel writes, never print secrets.
- One open `ceo-finance/*` PR at a time. Check open + closed PRs before picking work.

## 8. Changelog (newest on top)

- **2026-10-16** — Routine and charter created. No measured data yet; first run populates §5. (Claude Code, on owner request)
