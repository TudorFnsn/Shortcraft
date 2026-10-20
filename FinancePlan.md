# FinancePlan — Shortcraft unit economics & monetization

> **Source of truth for the money track.** Owned by the **Finance CEO** routine. It sits under `TheMasterPlan.md` (the master plan wins on product and priority; this file wins on cost, pricing and cash). Every finance PR updates the dashboard (§4) and changelog (§7) in the same change.
>
> Last updated: 2026-10-20 (created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-20)

| Question  | Owner's answer                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Cash return first.** Maximise MRR and gross margin; every euro spent must be justified by a euro back.                                                                                  |
| Watch     | **MRR, MRR ratio** (new / expansion / churned / net), gross margin per plan, API cost per finished video, cost per signup (trial burn), payback on any spend, infra + vendor bills.      |
| Hunt      | Cheaper or better vendors (video generation is on fal.ai and looks expensive), new techniques and models, pricing and packaging changes, conversion and retention levers that raise revenue. |
| Autonomy  | **Analyse freely, PR-gated code.** Branches `ceo-finance/<slug>`; never merge. Read-only on Supabase, Stripe, Vercel; any write (migration, price object, live mode, vendor signup) needs the owner's explicit OK. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 07:30 UTC (after the main CEO at 06:00, before Design at 09:00).                                                                        |
| Guardrail | The **margin gate** (`features/billing/margin.ts`, target ≥ 3x worst case) stays fail-closed. A change that lowers a multiple below 3x does not ship. Never trade away moderation or safety for cost. |

---

## 2. Operating model: DM master agent + specialist agents

The routine's top-level session is the **DM (master agent)**. It does not do deep work itself. It reads this file, `TheMasterPlan.md` §7/§8 and the open + recently closed PRs (an item with an open PR is in review, not available), then splits the day's work across parallel specialist subagents (Agent tool, one message, independent tasks) and merges their reports.

| Agent                | Job                                                                                                                                                                                  | Reads                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Revenue analyst**  | MRR, MRR ratio (new / expansion / contraction / churn), ARPU, trial → paid, plan mix, refunds, failed payments, Stripe fees.                                                          | Stripe connector (Sigma, read-only), `scripts/metrics-report.mts`            |
| **Cost analyst**     | Tokens and API spend per video: `render_jobs.api_cost_usd`, per-step cost vs credits charged, cost per finished video by tier, failed-job waste, trial burn, ElevenLabs slot usage.    | Supabase connector (read-only SQL), `scripts/margin-report.mts`              |
| **Infra auditor**    | Hosting and platform bills: Vercel usage and plan, Supabase plan / egress / storage growth, Resend, Sentry, domain, ElevenLabs plan. Flags anything idle or over-provisioned.         | Vercel connector (`list_billing_charges`, usage), Supabase advisors / usage  |
| **Vendor scout**     | Researches cheaper or better providers per slot (video, image, voice, LLM script). Produces a comparison with price, quality, licence/commercial terms, latency and swap effort.       | Web search / fetch; `src/features/providers/live/*`, `src/config/models.ts`  |
| **Pricing strategist** | Proposes plan/top-up/credit changes, annual plans, upsells, trial tuning, win-back and dunning flows. Checks every proposal against the margin gate.                                  | Margin gate, competitor pages, Stripe prices                                 |
| **Implementer**      | Turns one approved-in-principle win into a PR: adapter behind the registry, catalog cost update, report script, tests. Runs format, lint, typecheck, tests, build before pushing.       | Repo                                                                         |

DM rules: pick **one** implementation win per day (highest cash impact per effort); everything else lands as a ranked proposal in §5. Prefer measured numbers over list prices and say which one each figure is. Never print secrets.

---

## 3. Data access (what the routine needs)

| Source                                   | Status 2026-10-20                                                   | Needed for                                    |
| ---------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft`       | Connected                                                           | Code, PRs                                     |
| Supabase connector (project `iqvrovjwoavvmhaithwn`) | **Failed to connect in this session** (proxy tunnel error); `.mcp.json` entry exists | `api_cost_usd`, jobs, credits, subscriptions |
| Stripe connector                         | **Needs OAuth authorization** in claude.ai connector settings; test mode only so far | Real MRR, churn, fees, refunds                |
| Vercel connector                         | Connected (billing charges, usage, runtime logs)                    | Hosting spend, function duration              |
| fal.ai spend                             | **No connector.** Owner: export usage CSV monthly, or add a read-only key as `FAL_ADMIN_KEY` in the routine environment | Video / image bill vs `api_cost_usd`          |
| ElevenLabs, Anthropic, Resend, Sentry bills | **No connector.** Owner: paste monthly totals into §4, or provide read-only usage keys | Complete cost picture                         |

Until a source is connected, the routine marks that line "unmeasured" in §4 and does not invent numbers.

**Suggested connectors / tools (owner to enable):** Stripe (authorize now; the highest-value one), Supabase (fix the cloud connection), PostHog or Vercel Web Analytics (funnel: visit → signup → first video → paid), Sentry (render failures = wasted spend), a Google Sheets / Drive connector for the owner's vendor invoices, and a read-only fal.ai usage key. Claude-side: the `dataviz` skill for the weekly chart, an Artifact dashboard (pinned) for the §4 numbers, and Supabase `pg_cron` for a nightly cost snapshot table so history exists without ad-hoc queries.

---

## 4. Dashboard (the routine overwrites this table each run)

| Metric                                | Value       | Source / confidence              | Target                |
| ------------------------------------- | ----------- | -------------------------------- | --------------------- |
| MRR (EUR)                             | unmeasured  | Stripe (test mode, no live yet)  | grow                  |
| MRR ratio (new : churned)             | unmeasured  | Stripe                           | > 1, then > 3         |
| Gross margin, Standard 15s            | ~9x list    | gate, list prices                | ≥ 3x                  |
| Gross margin, Pro (worst case)        | 3.00x       | gate, list prices                | ≥ 3x with headroom    |
| API cost per finished video (Std)     | ~$0.07      | catalog, **not measured**        | measured within 20%   |
| API cost per finished video (Premium) | ~$1.10–2.30 | catalog, **not measured**        | measured within 20%   |
| Trial burn per signup                 | $0.14       | gate                             | < $0.25               |
| Failed-job waste (cost of failed jobs)| unmeasured  | `render_jobs`                    | < 3% of API spend     |
| Fixed monthly infra (EUR)             | unmeasured  | Vercel / Supabase / vendors      | listed below          |

---

## 5. Backlog of savings and revenue ideas (ranked; the routine keeps this current)

1. **Measure before optimising.** Add a nightly cost snapshot (per tier: jobs, API cost, credits charged, margin) and a `scripts/finance-report.mts` (read-only, same pattern as `metrics-report.mts`). Gate numbers are list prices; Pro sits at exactly 3.0x, so a 10% real-cost overrun fails it.
2. **Premium video vendor scouting.** Today: fal.ai Kling 2.5 Turbo Pro image-to-video, ~$0.07/s. Candidates to price on real clips: Wan 2.5/2.6 and LTX-2 Fast (fal, often $0.04/s or less), Seedance, Veo 3.1 Fast, Hailuo; self-hosting open models (Wan, LTX) on a GPU marketplace (RunPod, Modal, Replicate, Together) once volume justifies it; fal's batch / lower-resolution tiers. Decide per slot with a quality sample, not price alone.
3. **Hero-shot Premium** (AI clip on scene 1, Ken Burns on the rest): ~$0.45 per 15s versus ~$1.10, priced close to Standard. Biggest margin lever already modelled in the master plan.
4. **Cache and reuse.** Cache scripts and images for repeated topic/theme requests; reuse stock stills across a user's regenerations; drop image resolution to what the 720p output needs.
5. **LLM script cost.** Prompt caching on the fixed system prompt and a smaller model (Haiku-class) for first drafts with Sonnet only for rewrites; measure token use per script before changing.
6. **Voice.** ElevenLabs Flash is ~$0.05/1k chars; compare Cartesia, Deepgram Aura, Google/Azure neural voices for the default voice, keep ElevenLabs for Voice Studio. Watch custom-voice slot limits.
7. **Revenue levers.** Annual plans (cash up front, ~2 months free), top-up nudges at low balance, trial → paid email sequence tuning, dunning for failed payments, win-back for churned subscribers, a Premium add-on pack, affiliate payout at 30% recurring only once margin per paying user is measured.
8. **Infra.** Check Vercel function duration for the render step (ffmpeg on serverless) against a cheaper worker; Supabase storage lifecycle (delete renders older than N days for free users); Sentry sampling.

---

## 6. Routine prompt (paste into claude.ai/code/routines → New routine)

Name: **Shortcraft Finance CEO** · Model: Opus 5.5 · Schedule: daily 07:30 UTC · Repo: `TudorFnsn/Shortcraft` · Connectors: GitHub, Supabase, Stripe, Vercel · Network: allow vendor pricing pages (fal.ai, replicate.com, together.ai, runpod.io, modal.com, elevenlabs.io, anthropic.com).

```
You are the DM (master agent) of the Shortcraft Finance CEO routine. Goal: maximise cash return. Watch MRR and the MRR ratio, gross margin, cost per finished video, and every other bill; find cheaper or better vendors and fresh techniques; propose or implement changes that monetise the app better.

1. Read AGENTS.md, FinancePlan.md and TheMasterPlan.md (§7 pricing, §8 risks, §9 runbook). List open and recently closed PRs; skip any item that already has a PR.
2. Split the day across parallel subagents (one message): Revenue analyst, Cost analyst, Infra auditor, Vendor scout, Pricing strategist, as defined in FinancePlan.md §2. Give each a narrow brief, the files to read and what you have already ruled out. Connectors are read-only: no migrations, no Stripe objects, no live mode, no vendor signups without the owner's OK.
3. Merge the reports. Overwrite the FinancePlan.md §4 dashboard with measured numbers (label unmeasured lines, never invent), re-rank §5, and compute the margin gate (npx tsx scripts/margin-report.mts) for any proposed cost or price change. Nothing may drop a product below 3x.
4. Pick ONE implementation win with the best cash impact per effort. Implement it on a branch ceo-finance/<slug>: run format:check, lint, typecheck, test and build; open a PR (mirror the PR template if present); append a line to FinancePlan.md §7 and TheMasterPlan.md §10. Never merge. Leave files under a ceo-design/* PR alone.
5. Notify the owner (PushNotification) only when something needs them: margin gate failing or about to fail, a measured cost far above the catalog, MRR drop or churn spike, failed payments, a connector or data source that is broken or missing, a vendor switch worth more than 10% of monthly spend, or a decision only they can make. Otherwise stay silent. Put the single most important sentence first.
6. End with a digest: numbers, what shipped, ranked proposals, data you still need and which connector or key would provide it.
```

---

## 7. Changelog (newest on top)

- **2026-10-20** — Finance track created: charter, agent split, data-access gaps, savings backlog and the routine prompt. No code changes. (Interactive setup)
