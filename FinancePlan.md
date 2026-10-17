# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on unit economics, vendor choice and pricing experiments. Every finance PR
> updates this file (metrics log + ideas status) in the same change.
>
> Last updated: 2026-10-17 (created; no measurements yet — see §4)

## 1. Charter (owner-configured 2026-10-17, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Maximise **cash return**: MRR up, cost per finished video down, every recurring payment justified.                                                    |
| Always    | Check the MRR and the revenue ÷ cost ratio first, every run. Then propose or implement what improves monetisation.                                   |
| Hunt      | Cheaper/better vendors and new techs (the owner finds fal.ai video expensive) and new revenue ideas (pricing, packaging, upsells, annual plans).    |
| Measure   | Tokens/units used per video vs what each video cost, hosting, SaaS plans and every other payment.                                                    |
| Autonomy  | **PR-gated**, like the other routines: branches `ceo-finance/<slug>`, never merge, never touch live secrets, Stripe live mode or paid plans.          |
| Cadence   | Daily cloud routine "Shortcraft Finance CEO" (suggest 07:00 UTC, between the main CEO and Design CEO).                                               |

## 2. How the routine works (DM master agent)

The routine's main session is the **master agent**. It does not do the research
itself; it measures first, picks the biggest money lever, and splits the work:

1. **Measure (master, ~5 min):** `npx tsx scripts/finance-report.mts --json` (MRR,
   30-day metered API cost, cost per finished video, failed-job waste, cost per
   1k credits per tier) and `npx tsx scripts/margin-report.mts` (worst-case gate).
   Pull Stripe revenue, Vercel billing, Supabase usage when connectors exist (§3).
2. **List open + recently closed PRs** (any author) before choosing work.
3. **Split** into parallel subagents, each with a narrow brief and a required
   output format (finding, evidence, € per month impact, effort, risk):
   - **Cost auditor:** per-step cost per video (script tokens, images, clips,
     voice chars, render) vs `config/models.ts` assumptions; flags drift.
   - **Vendor scout:** cheaper/better providers for the dominant cost (currently
     fal.ai video + images, ElevenLabs, Claude script), with a pricing source URL
     and a quality note per candidate. Prices from vendor pages, not snippets.
   - **Infra auditor:** Vercel, Supabase, Sentry, Resend, domain and every other
     recurring payment: tier vs actual use, overage risk, downgrade/cancel list.
   - **Revenue strategist:** pricing, packaging, annual plans, top-up pricing,
     trial economics, churn/upgrade nudges, referral, margin-safe promos.
   - **Implementer (only for the chosen lever):** builds the change on a
     `ceo-finance/*` branch with tests; the master reviews the diff adversarially.
4. **Decide (master):** rank by € impact per month ÷ effort, say what was rejected.
   Ship at most one PR per run. Prefer changes that need no secrets.
5. **Record + report:** update §4 and §5 here, add a line to `TheMasterPlan.md` §10,
   and send a push notification only when there is something to act on (a margin
   below 3x, a cost spike, a downgrade/cancel saving, a PR needing review).
   An uneventful run stays silent.

## 3. Data access (what the routine needs, and what exists)

| Source              | Status (2026-10-17)                | Use                                                    | Action for the owner                                        |
| ------------------- | ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| GitHub repo         | Connected                          | Code, PRs                                              | None                                                        |
| Supabase connector  | Connected (read SQL only)          | `render_jobs.api_cost_usd`, credits, subscriptions     | Cloud runs failed to reach the MCP once (proxy); re-test    |
| Stripe connector    | **Needs OAuth** (test mode only)   | Revenue, MRR, churn, refunds, fees (Sigma)             | Authorise in claude.ai connectors; later a **restricted read-only live key** at go-live |
| Vercel connector    | Available                          | Billing charges, usage, runtime errors, function time  | Allow the routine to use it (read-only)                     |
| Vendor billing      | **Not available**                  | fal.ai, ElevenLabs, Anthropic, Resend spend            | Add read-only usage/billing keys as env vars (see below) or paste a monthly export |
| Sentry / PostHog    | Not connected                      | Error cost, funnel (visit → signup → paid)             | Optional; PostHog is the biggest missing piece for conversion work |

Env vars to add to the routine's environment (all read-only; never commit):
`FAL_ADMIN_KEY` (usage API), `ELEVENLABS_API_KEY` (subscription/usage endpoints),
`ANTHROPIC_ADMIN_KEY` (usage and cost report API), `SUPABASE_SERVICE_ROLE_KEY` +
`NEXT_PUBLIC_SUPABASE_URL` (for `scripts/*-report.mts`).

**Known measurement gap:** only `render_jobs.api_cost_usd` (one total per job)
is stored. There is no per-step or per-token record, so "tokens used vs cost" per
video cannot be answered yet. First implementation item: a `job_cost_events`
table (job, step, provider, units, unit, cost_usd, input/output tokens), written
by the orchestrator metering path. Needs a migration the owner applies.

## 4. Metrics log (newest first; the routine appends one row per run)

| Date       | MRR (€) | 30d API cost ($) | Cost / finished video ($) | Gross margin | Note                                  |
| ---------- | ------- | ---------------- | ------------------------- | ------------ | ------------------------------------- |
| 2026-10-17 | n/a     | n/a              | n/a                       | n/a          | Routine created; no live traffic data |

## 5. Ideas backlog (unverified until a subagent confirms with a source)

Status: `new` → `researching` → `proposed` → `in PR` → `shipped` / `rejected (why)`.

| Idea                                                                                                    | Lever    | Status |
| ------------------------------------------------------------------------------------------------------- | -------- | ------ |
| Premium video: compare Kling vs Seedance, Wan, LTX-2, Hailuo, Veo Fast; also direct vendor APIs vs fal markup | Cost     | new    |
| Hero-shot premium (AI clip on scene 1 only, stills elsewhere): ~$0.45 vs ~$1.10 per 15s                 | Cost     | new    |
| Self-host image/video open models on a rented GPU (RunPod, Modal, Replicate) once volume justifies it   | Cost     | new    |
| Cheaper script model for drafts (Haiku) with Sonnet only for the final; prompt caching of the system prompt | Cost     | new    |
| ElevenLabs Flash vs cheaper TTS (e.g. OpenAI, Cartesia, Deepgram Aura) with a blind quality check       | Cost     | new    |
| Cache and reuse images/voices for repeated themes; skip regeneration on re-voice                         | Cost     | new    |
| Annual plans with ~2 months free (cash up front, lower churn); needs Stripe yearly prices                | Revenue  | new    |
| Trial: cap burn at $0.25, require card, or gate premium; measure trial → paid first                      | Revenue  | new    |
| Credit expiry / rollover policy; top-up upsell when balance is low                                       | Revenue  | new    |
| Failed-job waste: stop pipelines early on a failing step to avoid paying for later steps                 | Cost     | new    |
| Vercel: check function duration/memory of the ffmpeg render, Fluid compute settings, cron frequency     | Infra    | new    |
| Supabase: storage retention (delete old intermediates), egress, plan tier vs use                         | Infra    | new    |

## 6. Guardrails

- Never switch a vendor in production on price alone: run a blind quality
  comparison (same 5 prompts) and record it in the PR.
- Never lower a price or add a discount without showing the margin stays >= 3x
  (`margin-report.mts`) and the effect on MRR.
- Money moves (Stripe live mode, buying plans, cancelling services) are the
  owner's: the routine proposes them with the exact steps and the € saved.
- Figures must carry their source and date; mark anything from a search snippet
  "unverified".
