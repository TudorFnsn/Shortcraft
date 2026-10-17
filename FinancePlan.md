# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on pricing, vendor cost and cash. Every finance PR updates this
> file (KPI snapshot, backlog, changelog) in the same change.
>
> Last updated: 2026-10-17 (track created; no measured data yet)

---

## 1. Charter

| Question               | Answer                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                   | **Maximise cash return.** More net MRR, lower cost per finished video, higher margin, faster payback on every euro spent.                                                                                                                         |
| First check, every run | The **MRR block** (§2). If MRR fell, the revenue multiple dropped below target, or a cost line grew faster than revenue, that outranks every other idea.                                                                                          |
| Scope                  | Pricing and plans, credit scale, vendor and model choice (video, image, voice, script, render, hosting), Stripe setup (annual plans, dunning, tax, fees), top-up and upsell mechanics, trial burn, waste (failed jobs, retries, unused services). |
| Out of scope           | UI look (Design CEO), distribution and SEO (CEO routine) unless a change is a direct revenue lever, in which case the CFO proposes and the CEO routine builds.                                                                                    |
| Autonomy               | **PR-gated.** Branches `cfo/<slug>`. Never merge. Never touch live secrets, live Stripe, or run a write against Supabase or a vendor without the owner's explicit OK. Read-only checks are fine.                                                  |
| Cadence                | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the CEO routine, before Design). Prompt: `docs/routines/finance-cfo.md`.                                                                                                       |
| Notifications          | Only when something needs the owner (see the routine prompt). A quiet, healthy run sends nothing.                                                                                                                                                 |

### Rules the CFO follows

1. **Measure before you cut.** A price from a web page is a hypothesis. A saving counts only after a real call measured it (`api_cost_usd`, vendor invoice, Stripe, Vercel billing).
2. **Quality gate.** A cheaper vendor ships only if the owner approves sample outputs side by side. Cost never silently lowers quality.
3. **The margin gate stays.** `scripts/margin-report.mts` must pass (3x worst case) after every pricing or catalog change. The CFO never lowers the target without the owner.
4. **Prefer reversible moves.** Config and catalog swaps behind an env var beat schema changes; schema changes beat vendor lock-in.
5. **Cash first.** Between two equal ideas, take the one that returns cash sooner (annual prepay, fewer failed renders, dunning) over the one that pays off later.
6. **One PR per idea**, with the before/after number in the description.

---

## 2. KPI snapshot (the MRR block)

Filled by the routine from `npx tsx scripts/finance-report.mts --json` plus
`npx tsx scripts/metrics-report.mts --json`. Newest first; keep the last 8 rows.

| Date       | Net MRR | Subs | ARPU | Net rev (30d) | API spend (30d) | Revenue multiple | Gross margin | Cost / done video (std / premium) | Failed-job spend | Fixed costs | Monthly profit |
| ---------- | ------- | ---- | ---- | ------------- | --------------- | ---------------- | ------------ | --------------------------------- | ---------------- | ----------- | -------------- |
| _none yet_ |         |      |      |               |                 |                  |              |                                   |                  |             |                |

**Targets (owner may change):** revenue multiple ≥ 3x on real data, gross margin ≥ 66%, failed-job spend < 3% of API spend, net MRR growth week over week, monthly profit > 0.

Definitions are in `src/features/metrics/finance.ts` (MRR gross/net, window, break-even).

---

## 3. Data access (what the routine needs, and where it stands)

| Source                         | Gives                                                                             | Status 2026-10-17                                                                                             | Action                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo (GitHub MCP)              | Code, plan, catalog, PRs                                                          | Connected                                                                                                     | none                                                                                                                                                     |
| Supabase (claude.ai connector) | `render_jobs.api_cost_usd`, `subscriptions`, `credit_transactions` for the report | Connector failed to connect in the first session (proxy tunnel error); `.mcp.json` server is the same project | Owner: reconnect it in claude.ai connector settings. Until then the routine can only run the report if `.env.local` exists in the routine's environment. |
| Stripe (claude.ai connector)   | Real revenue, fees, refunds, disputes, churn, failed payments, Sigma              | Needs the owner to authorize; account is sandbox only                                                         | Owner: authorize the connector. Go live before the numbers mean anything.                                                                                |
| Vercel (claude.ai connector)   | Hosting spend (`list_billing_charges`), runtime logs, function duration           | Connected                                                                                                     | Routine reads billing charges monthly.                                                                                                                   |
| Anthropic Console              | Token usage and spend by workspace                                                | Not connected                                                                                                 | Owner: add a read-only Admin/usage key to the routine environment as `ANTHROPIC_ADMIN_KEY`, or export monthly CSV.                                       |
| fal.ai dashboard               | Spend per model and per request                                                   | Not connected                                                                                                 | Owner: paste monthly usage, or add a fal usage export.                                                                                                   |
| ElevenLabs                     | Characters used, slot count, plan cost                                            | Not connected                                                                                                 | Owner: paste monthly usage until an API key with `user_read` is available.                                                                               |
| Resend, Sentry                 | Plan cost, volume                                                                 | Not connected                                                                                                 | Owner: state the plan price once (fixed-cost list below).                                                                                                |

### Fixed monthly costs (owner to fill; the report takes the total via `--fixed=`)

| Item                          | Plan | USD / month |
| ----------------------------- | ---- | ----------- |
| Vercel                        | _?_  | _?_         |
| Supabase                      | _?_  | _?_         |
| ElevenLabs plan (voice slots) | _?_  | _?_         |
| Resend                        | _?_  | _?_         |
| Sentry                        | _?_  | _?_         |
| Domain                        | _?_  | _?_         |
| **Total**                     |      | _?_         |

### Suggested additions that would make the CFO better

- **Stripe connector (authorize)** – real MRR, churn, refunds, fees, Sigma SQL. Highest value.
- **Supabase connector (reconnect)** – lets the routine read the report data without `.env.local`.
- **Anthropic usage/cost API (Admin key)** – exact token spend per workspace and model; cross-checks the job-level cost we compute.
- **Cost events table (F1 below)** – the app cannot yet say how many tokens, seconds or images each step used.
- **A spend alert** – Vercel spend management and a fal.ai monthly cap, so a bug cannot burn cash while nobody watches.
- **PostHog or Stripe Checkout analytics** – visitor → checkout → paid funnel (the CEO routine owns distribution; the CFO needs the conversion numbers).

---

## 4. Cost model today (from `config/models.ts`, researched not measured)

| Slot          | Vendor / model                                  | Cost basis                           | Credits charged |
| ------------- | ----------------------------------------------- | ------------------------------------ | --------------- |
| Script        | Anthropic, Sonnet 5.5                           | ~$0.04 per script (2k in / 1.5k out) | 100 flat        |
| Image std     | fal.ai FLUX.1 [schnell]                         | $0.003 / MP                          | 80 / image      |
| Image premium | fal.ai FLUX.1 [dev]                             | $0.025 / MP                          | 200 / image     |
| Video std     | In-house Ken Burns (ffmpeg)                     | $0                                   | 80 / s          |
| Video premium | fal.ai, Kling 2.5 Turbo Pro (`FAL_VIDEO_MODEL`) | ~$0.07 / s                           | 1,420 / s       |
| Voice         | ElevenLabs                                      | per character                        | per second      |
| Render        | In-house ffmpeg                                 | ~$0.01                               | flat            |

**Known gaps:** the app stores one `api_cost_usd` per job. It does not store tokens, seconds, images or characters per step, so "tokens used vs money spent" cannot be answered per step or per vendor yet. Fixing that is F1.

---

## 5. Backlog (ordered; the routine takes the top open item with no open PR)

Status: `[ ]` open · `[~]` in review (PR number) · `[x]` done. Before picking, list open and recently closed PRs; an item with an open PR is not available.

- [ ] **F1. Cost events.** Migration `0013_cost_events.sql`: `render_cost_events(job_id, step, provider_id, unit, units, cost_usd, created_at)`, written by the orchestrator when a step is metered; RLS on, service role only, no `anon`/`authenticated` grants. Extend `finance-report.mts` with spend and units per vendor and step, and tokens in/out for the script step. Needs the owner to apply the migration.
- [ ] **F2. Measure real costs.** Run `scripts/live-providers-smoke.mts` (owner supplies keys) for one video per tier; compare measured `api_cost_usd` with the catalog; update `costUsdPerUnit`; re-run the margin gate. Replaces every "researched" price in §4.
- [ ] **F3. Premium video vendor bake-off.** Price table for image-to-video (per second, 720p/1080p, 5s and 10s) across: fal.ai, Replicate, Runware, WaveSpeed, Novita, Together, direct vendor APIs (Kling, Seedance, Hailuo, Wan, LTX, Veo Fast), and self-hosted open weights on serverless GPUs (Modal, RunPod, Baseten). Output: a table in `docs/finance/vendors.md`, 3 sample clips for the owner, a recommendation with the saving per 15s premium video. Adapter swap behind `FAL_VIDEO_MODEL`-style env var.
- [ ] **F4. Hero-shot premium tier.** AI clip on scene 1 only, stills for the rest (TheMasterPlan §7: ~$0.45 per 15s vs ~$1.10). New tier or option priced near Standard; the highest-margin way to sell "AI video" to Starter users.
- [ ] **F5. Voice cost.** Compare ElevenLabs Flash against Cartesia, Deepgram Aura, OpenAI TTS and self-hosted open voices on cost per minute and quality; check that custom-voice slots do not cap sign-ups. Cache identical narration.
- [ ] **F6. Script cost.** Prompt caching on the system prompt, a cheaper model (Haiku 5.5) for the first draft with Sonnet only on retry, batch where latency allows. Measure tokens in/out first (needs F1).
- [ ] **F7. Waste.** Failed-job spend, retried provider calls, jobs that reach `clips` and then fail, trial users who burn credits and leave. Fix the top leak; add an alert when failed spend passes the target.
- [ ] **F8. Billing levers.** Annual plans (prepay, cash now) with a discount that still passes the gate; Stripe Smart Retries and dunning emails for failed renewals; Stripe Tax; cheaper payment methods in the EEA (SEPA debit, iDEAL, Bancontact) against the 1.5% + €0.25 card fee; refund and dispute rate.
- [ ] **F9. Pricing experiments.** Credit expiry or rollover rules (breakage), top-up nudges at 80% burn, a cheaper entry plan, a higher Ultra, a "pay as you go" bundle. Each as a proposal with expected MRR effect and the gate result; the owner picks.
- [ ] **F10. Trial economics.** Trial burn is $0.25 per signup on the old numbers. Measure real burn, compare with trial → paid from `metrics-report`, and set the trial grant where cost per paying customer is lowest.
- [ ] **F11. Fixed cost review.** Every recurring bill: needed, right-sized, annual discount available, cheaper equivalent.
- [ ] **F12. Spend guardrails.** Daily API budget per user and global; the orchestrator refuses new live jobs past a configurable daily spend; an alert at 80%.

New ideas the routine finds go at the bottom with a one-line expected effect.

---

## 6. Vendor watch (hypotheses only until F2/F3 measure them)

Update with date and source on every scouting run. Do not copy a price without the page it came from.

| Date       | Slot | Candidate | Quoted price | Source | Verdict |
| ---------- | ---- | --------- | ------------ | ------ | ------- |
| _none yet_ |      |           |              |        |         |

---

## 7. Decisions log (owner-only changes to money rules)

| Date       | Decision                                                              | By              |
| ---------- | --------------------------------------------------------------------- | --------------- |
| 2026-10-17 | Finance track created: PR-gated CFO routine, margin gate stays at 3x. | Tudor (request) |

---

## 8. Changelog (newest on top)

- **2026-10-17** — Track created. `features/metrics/finance.ts` (pure: net/gross MRR, ARR, ARPU, top-up revenue, API spend, failed-job spend, revenue multiple, gross margin, cost per finished video by tier, cost per 1k credits, monthly profit, break-even subscribers) + `scripts/finance-report.mts` (read-only, `--fixed=` for fixed costs, `--json`). +6 tests. No migration, no dependency, no runtime change. (Interactive, from the routine request)
