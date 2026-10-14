# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt: `docs/routines/finance-cfo.md`). Product and pricing decisions still
> live in `TheMasterPlan.md` §7; this file holds the numbers, the cost-cutting
> backlog and the measurement gaps. If they disagree, fix both in the same change.
>
> Last updated: 2026-10-14

---

## 1. Charter

**Goal:** maximise cash returned per euro of revenue, then grow the revenue.
In order: (1) never sell a video below cost, (2) cut cost per video without
cutting quality users notice, (3) raise revenue per paying user, (4) raise
paid conversion and cut churn.

**The numbers it watches every run** (all read-only):

| Metric                                                                     | Source                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| MRR, ARR, net new MRR, new / expansion / contraction / churned MRR         | Stripe (subscriptions, invoices) — connector                    |
| Gross margin % and cost per finished video, by tier and by step            | `render_jobs.api_cost_usd` (+ F1 breakdown) — Supabase          |
| Credits sold vs credits burned, breakage (credits granted but unspent)     | `credit_transactions` — Supabase                                |
| Stripe fees, refunds, disputes, failed payments (involuntary churn)        | Stripe                                                          |
| Fixed costs: Vercel, Supabase, ElevenLabs plan, Sentry, Resend, domain     | Vercel billing connector; the rest from the owner (§5)          |
| **MRR ratio**: MRR ÷ (variable API cost + fixed cost) for the last 30 days | Computed; target ≥ 3x, red flag < 2x                            |
| Trial burn (cost of a signup that never pays) and CAC payback              | `margin.ts` trial burn, metrics report, ad spend from the owner |
| Margin gate (`npx tsx scripts/margin-report.mts`)                          | In repo; fails closed below 3x                                  |

"MRR ratio" is the owner's phrase; until they say otherwise it means the
revenue-to-total-cost multiple above. Confirm or correct it in §7.

---

## 2. Roadmap (top unchecked item that is not already in an open `finance/*` PR)

- [ ] **F1 — Measure every cost, per step.** Today only `render_jobs.api_cost_usd` (one total per job) exists, and **no token counts are stored**, so "tokens used vs money spent" cannot be answered. Add `render_job_costs` (job*id, step, provider_id, units, unit, cost_usd, input_tokens, output_tokens) written by the orchestrator, additive migration, read-only report `scripts/finance-report.mts`. Everything below depends on it. \_Needs the owner to apply the migration.*
- [ ] **F2 — Finance report.** `scripts/finance-report.mts` (+ `--json`): MRR waterfall, margin by tier, cost per video by step, credit breakage, fixed costs. Pure maths in `features/finance/`, tested.
- [ ] **F3 — Cheaper video model bake-off.** Run the same 10 prompts through the current model and 2–3 alternatives (§4) with `live-providers-smoke.mts`; record cost, latency, quality notes in `docs/finance/video-bakeoff.md`. Owner approves any spend and any default change.
- [ ] **F4 — Hero-shot premium tier.** AI clip on scene 1 only (~$0.45 per 15s vs ~$1.10), stills elsewhere; price it between Standard and Premium. Re-run the margin gate.
- [ ] **F5 — Cost levers in the pipeline.** Prompt caching and the cheapest adequate Claude model for scripting; ElevenLabs Flash only; image caching for repeated themes; drop retries that re-bill.
- [ ] **F6 — Revenue levers.** Annual plans (e.g. 2 months free) to cut churn and pull cash forward; top-up nudges when credits run low; failed-payment recovery (Stripe Smart Retries + dunning email); price test with owner approval; launch credit packs; affiliate payout cap so commissions never exceed margin.
- [ ] **F7 — Fixed-cost audit.** Keep Vercel/Supabase on the cheapest tier that carries the load; flag any plan upgrade before it is triggered by usage.

---

## 3. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` §1, §7, §8, §9, then this file, `git log -20`, and open + recently closed PRs. An item with an open PR is in review, not available.
- **Master agent + sub-agents.** The master agent does no analysis itself. It splits the run into the independent workstreams below, spawns one sub-agent per stream **in a single message** (parallel), gives each a narrow brief, and merges the results into one digest. A sub-agent never opens a PR; only the master does, for one item.
  1. **Revenue** — Stripe: MRR waterfall, churn, failed payments, refunds, fees, plan mix, LTV.
  2. **Unit cost** — Supabase: cost per video by tier/step, tokens vs spend, failure and retry waste, credit breakage, trial burn.
  3. **Vendor prices** — web: current list prices and new models for video, image, TTS, LLM, render (§4); compare to the catalog. Cite every price with a URL and date.
  4. **Fixed costs** — Vercel (billing charges, usage), Supabase (plan, advisors), other SaaS from the owner's list.
  5. **Growth/monetisation ideas** — pricing, packaging, upsells, annual plans, referral/affiliate economics, checked against the margin gate.
  6. **Tooling** — which connector, plugin or skill would make this routine better (§6). Report only new ones.
- **One change per run**, the highest cash impact that needs no owner secret. Branch `finance/*`. Prefer improving an open `finance/*` PR over a new one.
- **Never, without the owner's explicit OK:** change prices or credit scales, flip a default provider, touch live Stripe, apply a migration, spend on a paid provider call, or contact anyone. Propose them in the digest with numbers.
- **Files it may change:** `FinancePlan.md`, `docs/finance/**`, `docs/routines/**`, `scripts/finance-*.mts`, `src/features/finance/**`, `tests/finance/**`, new additive migrations (written, never applied), and its own lines in `TheMasterPlan.md`. It does not touch UI files (Design CEO) or webhooks.
- **Evidence standard:** a price from a search snippet is a lead, not a fact. Mark every number `measured`, `list price (URL, date)` or `estimate`. Savings claims must show the arithmetic against current per-video cost.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode; `npx tsx scripts/margin-report.mts` still passes.
- **Notify** (PushNotification, `<routine_summary>`) only when something needs the owner: MRR ratio under 2x, margin gate failing, a vendor price rise or a clearly cheaper model worth a bake-off, a failed-payment spike, a connector that can't be reached, or a decision only the owner can make. A quiet healthy run sends nothing.
- **Output:** a digest: MRR + ratio and the change since last run, cost per video, what moved, savings found (€/month, with confidence), the PR, what waits on the owner, next item.

---

## 4. Vendor watchlist (leads to verify, not facts)

Current stack: Claude Sonnet 5.5 (script), FLUX schnell/dev on fal.ai (images), Kling v2.5 turbo pro on fal.ai (Premium clips, ~$0.07/s list), ElevenLabs Flash (voice), in-house ffmpeg (render, ~$0.01), Ken Burns stills for Standard (~$0.07 per 15s video).

Where the money actually goes: Standard is already cheap. **Premium AI video is the expensive line** (≈ $1.10–2.30 per 15s). So the video model is where a better price matters most.

| Slot         | Alternatives to price and bake off                                                                                                                                    | Why                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Video        | Direct vendor APIs instead of the fal.ai markup (Kling, Seedance, Wan, Hailuo, Veo Fast); Replicate / WaveSpeed / Runware / Novita / Together-style hosts; LTX-2 Fast | fal.ai is a reseller; same open models often cost less elsewhere or self-hosted |
| Video        | Self-hosting open weights (Wan 2.x, LTX) on a serverless GPU (Modal, RunPod, Vast) with scale-to-zero                                                                 | Only worth it above a steady volume; compute the break-even in F3               |
| Image        | FLUX schnell is already ~$0.003; check Runware / Together / Replicate for the same model, and SDXL-class models for backgrounds                                       | Small line; low priority                                                        |
| Voice        | ElevenLabs Flash vs OpenAI TTS, Cartesia, Deepgram Aura, Google/Azure neural voices, Kokoro/Piper self-hosted                                                         | TTS is per character; cheaper vendors may be good enough for Standard           |
| Script       | Claude prompt caching + batch, Haiku-class model for drafts, Sonnet only for the final pass                                                                           | Token spend is small per video but easy to cut 50–90% on the cached prefix      |
| Stock/motion | Pexels/Pixabay/Coverr clips (licence check) instead of generated clips for some scenes                                                                                | Free, and often good enough for b-roll                                          |
| Reuse        | Cache scene images/clips by prompt hash; reuse the hook across re-voices (already done for re-voice)                                                                  | Zero marginal cost                                                              |

Quality decides, not price alone: every switch needs the same 10 prompts rated side by side by the owner.

---

## 5. What the routine needs from the owner (it asks once, then it's recorded here)

- [ ] **Stripe live account** read access (the connector today is test mode only; MRR needs the live account). Restricted read-only key is enough.
- [ ] **Vercel** connector authorised (billing charges, usage). **Supabase** connector re-authorised (it failed to connect from the cloud session on 2026-10-14 with a proxy tunnel error).
- [ ] **Fixed-cost list**: ElevenLabs plan + monthly price, Sentry plan, Resend plan, domain, any other subscription, and the monthly fal.ai / Anthropic spend if different from what the app logs.
- [ ] **Actual provider invoices** or dashboard exports (fal.ai, ElevenLabs, Anthropic) monthly, to reconcile `api_cost_usd` against real bills.
- [ ] **Marketing spend** (if any) to compute CAC.
- [ ] Definition of **"MRR ratio"** (§1) and the target.
- [ ] Apply the F1 migration once reviewed.

---

## 6. Connectors, plugins and tools that would help

Already wired: GitHub, Stripe (test), Supabase (reconnect), Vercel. Suggested, in order of value:

1. **Stripe live (read-only)** — without it MRR is a guess.
2. **Vercel** billing/usage — fixed-cost line.
3. **PostHog or Plausible** — visitor → signup → paid funnel, to tie spend to conversion.
4. **Sentry** (already in the app) — failure rate drives wasted spend (failed renders still cost API money).
5. **A bookkeeping source** (Google Sheets / Airtable / QuickBooks / Xero / Wise or bank export) — the owner's real P&L and VAT, so cash return is measured, not modelled.
6. **Google Drive / Sheets** — a living finance sheet the owner can edit (fixed costs, invoices).
7. **Web search / fetch** — already available; vendor price pages are often blocked from the routine's network, so keep citing URLs and mark snippet prices as leads.
8. Claude tools: the `xlsx` skill for monthly finance workbooks, `Artifact` for a live finance dashboard, and the `claude-api` skill for prompt-caching changes.

---

## 7. Decisions (owner)

- _None yet._ First entries expected: the MRR-ratio definition, the target margin multiple (today 3x), and approval to run the F3 bake-off budget (suggest ≤ $25).

---

## 8. Changelog (newest on top)

- **2026-10-14** — Finance track created (owner request): this plan, the routine prompt (`docs/routines/finance-cfo.md`), and the gap list. Finding recorded: only a per-job total `api_cost_usd` is stored, with no per-step cost and no token counts, so tokens-vs-spend can't be measured yet (F1). Supabase connector could not connect from the cloud session. No code changes. (Finance CFO setup, interactive)
