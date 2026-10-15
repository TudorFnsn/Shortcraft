# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority;
> this file wins on cost, pricing and cash. Every finance PR updates this file
> (ledger, ideas, changelog) in the same change.
>
> Last updated: 2026-10-15 (charter created, no measurements yet)

---

## 1. Charter (owner-configured 2026-10-15, do not change without Tudor)

| Question        | Owner's answer                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal            | **Maximum profit and cash return.** Every run checks MRR and proposes or ships a change that monetizes better or costs less.                       |
| Always check    | **MRR**, MRR movement (new / expansion / contraction / churn), gross margin per video, cost per paying user, runway-style cash view.               |
| Cost lens       | Tokens and provider units per video **vs** the euros spent to make it, plus hosting and every other recurring payment. Cash return first.          |
| Open to         | New ideas and fresh tech: cheaper or better video, image, voice and LLM providers, caching, batching, model routing, pricing and packaging changes. |
| Known suspicion | **fal.ai looks expensive** for AI video. Find cheaper or better options and prove it with measured calls, not list prices.                         |
| Autonomy        | **PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`; never merge. Money-moving or live-secret actions need Tudor's explicit OK. |
| Cadence         | Daily cloud routine **"Shortcraft Finance CFO"**, 12:00 UTC (after the CEO at 06:00 and Design at 09:00).                                           |
| Shape           | A **master agent** (the CFO) that reads everything, then splits the work across sub-agents (§4) and merges their findings into one digest.         |

---

## 2. Spend map (every payment, owner fills the blanks)

The routine keeps this table current. `?` means unknown: **ask Tudor in the digest**, don't guess.

| Cost line            | Vendor / source           | Driver                      | Where to read it                        | Monthly € |
| -------------------- | ------------------------- | --------------------------- | --------------------------------------- | --------- |
| AI video clips       | fal.ai (Kling default)    | per 5s clip, Premium only   | `render_jobs.api_cost_usd`, fal billing | ?         |
| Images               | fal.ai FLUX schnell / dev | per megapixel               | `render_jobs`, fal billing              | ?         |
| Scripts (LLM)        | Anthropic API             | input + output tokens       | `scripts` token meter, Anthropic Console | ?         |
| Voice                | ElevenLabs                | characters + custom slots   | ElevenLabs usage page                   | ?         |
| Hosting              | Vercel                    | plan + usage, cron, bandwidth | Vercel connector `list_billing_charges` | ?         |
| Database + storage   | Supabase                  | plan, storage, egress       | Supabase dashboard                      | ?         |
| Payments             | Stripe                    | % + fixed fee, VAT, refunds | Stripe connector                        | ?         |
| Email                | Resend                    | emails sent                 | Resend dashboard                        | ?         |
| Errors               | Sentry                    | events                      | Sentry                                  | ?         |
| Domain / other tools | registrar, Claude/Cursor… | fixed                       | owner                                   | ?         |

---

## 3. Metrics the routine reports every run

1. **MRR** (active subscriptions × net plan price), **net new MRR**, churned MRR, expansion, paying subscribers, ARPU. Source: Stripe connector (read-only) once live mode exists; until then the `subscriptions` table, and say clearly that sandbox MRR is not real money.
2. **Gross margin per video** by shape (length × tier): `credits charged` converted to net revenue, minus measured `api_cost_usd`. Use `npx tsx scripts/margin-report.mts` for the gate and the DB for measured costs.
3. **Cost per signup** (trial burn), **cost per paying user**, **payback** per acquisition channel when ads exist.
4. **Token and unit ledger:** LLM input/output tokens, image megapixels, clip seconds, voice characters, per finished video vs the € each cost.
5. **Overhead:** fixed monthly spend vs MRR (break-even MRR).
6. **Leaks:** refunds, failed renders that still cost money, overruns where the bill was capped at the hold (`warn` logs), idle subscriptions burning slots (ElevenLabs voices).

If a number can't be measured yet, the first PR of the run is the smallest change that makes it measurable (a read-only script, a log field). Measuring beats guessing.

---

## 4. Master agent and sub-agents

The routine session is the **master (CFO)**. It does the reading, picks the item, spawns sub-agents **in parallel** with the Agent tool, gives each a narrow brief and the files to read, and merges the answers. Spawn only what the day needs.

| Sub-agent               | Job                                                                                                                                                                  | Reads / tools                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Revenue analyst**     | MRR, churn, ARPU, conversion, trial → paid. Pricing and packaging experiments (annual plan, price tiers, top-up sizes, credit expiry).                                | Stripe connector (read), Supabase (read-only SQL), `metrics-report` |
| **Cost auditor**        | Spend map §2, token/unit ledger §3.4, cost per video vs credits. Finds leaks and unmeasured lines.                                                                    | Supabase, Vercel billing tools, provider usage pages               |
| **Provider scout**      | Cheaper or better video / image / voice / LLM options. Compares price, quality, speed, licensing, rate limits, API shape. Never trusts one aggregator: cross-check two sources and note the date. | WebSearch, WebFetch, provider docs                                 |
| **Benchmark engineer**  | Turns a scout's shortlist into a measurement: adapter behind the registry, smoke script, same prompts across models, cost and quality notes. Runs only with owner-approved keys and a hard spend cap. | `src/features/providers`, `scripts/live-providers-smoke.mts`       |
| **Optimizer (dev)**     | Ships the code that saves money: model routing (cheap by default, premium on demand), caching, prompt trimming, hero-shot video, batch calls, retries that don't double-bill. | repo; tests + CI bar                                               |
| **Growth-monetization** | Upsell and retention levers that raise revenue per user: reminder emails for unused credits, annual discount, referral, watermark on trial, add-on packs.                | repo, lifecycle email code                                         |
| **Reviewer**            | Adversarially checks every proposed number and every PR: margin gate still passes, no live spend, no secrets, tests added.                                            | repo, `margin-report`                                              |

Order of a run: master reads → **Revenue analyst + Cost auditor + Provider scout in parallel** → master picks the single highest cash-impact item → **Benchmark engineer or Optimizer** builds it → **Reviewer** checks → master writes the digest.

---

## 5. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (§7 pricing, §8 risks, §9 ops), this file, `git log -20`, open and recent PRs, then the numbers (§3). Before picking an item, list open and recently closed PRs: an item with an open PR is in review, not available. Leave `ceo-design/*` UI files alone.
- **One item per run**, highest expected cash impact per unit of owner effort. Prefer improving an open finance PR over a new one.
- **Evidence bar:** a price claim needs two independent sources and a date; a switch of provider needs a **measured** run (same inputs, cost and quality compared). List prices are hypotheses.
- **The margin gate is law.** `scripts/margin-report.mts` must still pass (≥ 3x on every plan and top-up); never lower it to ship something. A change that raises measured margin is the best kind: pass the saving on only when it keeps the gate green.
- **Autonomy:** read-only everywhere by default. No live spend, no Stripe writes, no migrations, no env changes, no price changes on live products without Tudor's explicit OK. Pricing and provider swaps go to the owner as a PR plus a one-screen decision note (options, numbers, recommendation).
- **Files it may change:** `FinancePlan.md`, finance lines of `TheMasterPlan.md`, `scripts/**` (read-only reports), `src/config/models.ts` and `src/features/providers/**` (new adapters behind the registry, off by default), `src/features/billing/margin.ts` (reporting only), tests. Never `supabase/migrations` without a PR the owner applies, never webhook or credit-ledger logic.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Notify only when it matters:** the margin gate fails or measured margin drops, MRR falls week over week, a cost line spikes, a provider swap would save real money, or the routine can't reach a data source it needs. Otherwise stay quiet (no "all fine" pings).
- **Output:** a digest: MRR + trend, margin per video, biggest cost line, what shipped (PR link), what's waiting on Tudor, next item.

---

## 6. Access the routine needs (set up once, see `docs/routines/finance-cfo.md`)

| Need                          | Why                                              | Status                                  |
| ----------------------------- | ------------------------------------------------ | --------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft` | read code, open PRs                         | in routine scope                        |
| Stripe connector              | MRR, subscriptions, fees, refunds (read-only)    | connected, **sandbox only** until live   |
| Supabase connector            | `render_jobs.api_cost_usd`, ledger, subscriptions | connected; failed to connect in the 2026-10-15 cloud session (`ERR_PROXY_TUNNEL`), re-authorize |
| Vercel connector              | `list_billing_charges`, usage                    | connected                               |
| fal.ai / ElevenLabs / Anthropic / Resend usage | actual spend per vendor          | **not connected**: owner pastes monthly totals or adds a read-only key |
| Egress to provider pricing pages | verify prices                                 | blocked on 2026-10 for the CEO routine; check the environment's network policy allows the vendor domains |

---

## 7. Idea backlog (hypotheses, each needs a measurement before it ships)

Ranked by expected cash impact; the scout keeps this fresh.

1. **Hero-shot Premium:** AI clip on scene 1 only, stills for the rest (~$0.45 vs ~$1.10 per 15s). Biggest known saving.
2. **Video provider swap:** compare fal.ai Kling 2.5 Turbo against cheaper hosts for the same open models (Wan, LTX, Seedance, Hunyuan) on Replicate, Together, Runware, WaveSpeed, or direct vendor APIs, and against self-hosting on serverless GPUs (Modal, RunPod) once volume justifies it. Measure cost per accepted clip, not per attempt.
3. **Lower-resolution / shorter clips** (480p or 3s clips, upscale in ffmpeg), pre-rendered motion loops reused across jobs, **cache** images and clips by prompt hash.
4. **Image tier:** FLUX schnell everywhere by default; dev only for Premium; try cheaper image models.
5. **LLM:** prompt caching + a smaller model for the script step; measure quality on 20 fixed topics. Track tokens per video.
6. **Voice:** ElevenLabs Flash vs cheaper TTS (OpenAI, Cartesia, Azure, open models) for Standard; keep ElevenLabs for the voice studio. Watch custom-voice slot costs.
7. **Pricing:** annual plan (cash up front, lower churn), credit expiry or rollover caps, trial watermark, top-up bundle sizes, a price test once live mode exists. Keep the 3x gate.
8. **Overhead:** Vercel Hobby→Pro only when needed, Supabase plan right-sizing, storage lifecycle (delete renders after N days, keep the posted ones), CDN egress.
9. **Revenue add-ons:** affiliate 30% recurring (§6.2 master plan) vs CAC, referral credits, paid templates/themes.

---

## 8. Decisions waiting on Tudor

_None yet. The routine adds numbered questions here and in its digest._

Standing questions for the first run: monthly totals per vendor (§2), is Stripe live mode planned and when, target monthly profit, maximum monthly experiment spend for benchmarks (suggest €20), preferred risk on quality when swapping providers.

---

## 9. Changelog (newest on top)

- **2026-10-15** — Finance track created: charter, spend map, metrics, master/sub-agent split, rules, backlog. No code, no measurements yet. (Finance CFO, interactive)
