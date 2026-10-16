# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on unit economics, vendor choice and pricing experiments. Every finance PR
> updates this file (metrics snapshot + changelog) in the same change.
>
> Last updated: 2026-10-16 (track created; no live data read yet)

---

## 1. Charter (set 2026-10-16 from the owner's brief; change only with Tudor)

| Question  | Answer                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash first.** Raise net MRR, cut cost per finished video, never let a plan fall below the 3x margin gate (`scripts/margin-report.mts`).                  |
| Steering  | Net MRR ÷ API cost (target ≥ 3x on real, measured cost), monthly profit after fixed costs, cost per finished video by tier, trial burn per signup, failed-job waste.       |
| Scope     | Every payment in and out: Stripe (revenue, fees, refunds, disputes), fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, Sentry, domains. Plus pricing and packaging. |
| Known bet | fal.ai Premium video (Kling 2.5 Turbo Pro, catalog `$0.12/s` conservative) is the biggest per-video cost and looks expensive. Find a cheaper or better route.              |
| Autonomy  | **PR-gated.** Branches `ceo-finance/<slug>`. Never merge, never touch live secrets, never change live Stripe prices, never spend money. Anything with a cost needs Tudor.  |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, suggested 07:30 UTC (after the main CEO at 06:00, before Design at 09:00). Weekly deep dive on Mondays.                  |
| Pings     | Push notification only when something needs Tudor: margin below 3x, a cost spike, an unsafe vendor, a decision with money attached. Silence when nothing changed.          |

---

## 2. How the routine works: the DM master agent

The routine's main session is the **master agent** (the "DM"). It does not do
the deep work itself. Each run it: (1) reads this file, `TheMasterPlan.md` §7 and
the open/recent PRs, (2) pulls the numbers, (3) splits the work across
sub-agents in parallel, (4) merges their findings, ranks them by **cash impact
per unit of effort**, (5) implements the single best safe change as a PR, and
(6) notifies Tudor only if something needs them.

| Sub-agent (Agent tool)         | Job                                                                                                                                                                                                  | Read-only?       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Revenue analyst**            | MRR, net MRR, churn, trial → paid, ARPU, refunds, disputes, failed payments, top-up share. Uses `scripts/finance-report.mts`, `scripts/metrics-report.mts` and the Stripe connector.                 | yes              |
| **Cost auditor**               | Tokens/credits metered vs dollars billed. Per tier: API cost per finished video, per scene, per second; failed-job waste; trial burn. Reconciles `render_jobs.api_cost_usd` against vendor invoices. | yes              |
| **Vendor scout**               | Researches cheaper or better providers for video, image, voice, script, hosting (see §5). Gets real quotes and benchmark clips; never trusts a single aggregator page (see §7 history).              | yes (web)        |
| **Pricing strategist**         | Plan prices, credit grants, top-up packs, annual billing, trial size, credit scale, upsell paths, price-test design. Re-runs the margin gate on every proposal.                                      | yes              |
| **Infra cost reviewer**        | Vercel (function duration, bandwidth, ffmpeg render time), Supabase (storage, egress, DB size), media retention and R2/CDN options, cron frequency.                                                  | yes              |
| **Implementer**                | Takes the master's chosen item and ships it: catalog row + adapter, config, tests, docs. Runs format, lint, typecheck, tests. Opens the PR.                                                          | writes to branch |
| **Skeptic** (optional, weekly) | Tries to break the top proposal: quality loss, churn risk, vendor lock-in or terms, hidden fees, margin gate at full burn.                                                                           | yes              |

Rules for the master:

1. **Open PRs first.** List open and recently closed PRs before picking anything; an item with an open PR is in review. Finish or improve an open `ceo-finance/*` PR before starting a new one. Leave UI files to the Design CEO while a `ceo-design/*` PR is open.
2. **One change per PR, behind the margin gate.** `npx tsx scripts/margin-report.mts` must still pass; show before/after multiples in the PR.
3. **Measured beats researched.** A price from a page is a hypothesis. Mark it `unverified` until a real call or an invoice line confirms it, and say how it was checked.
4. **Quality is part of cost.** A cheaper model that makes worse videos lowers retention. Every vendor swap ships with side-by-side sample outputs (same prompts) for Tudor to judge, and goes behind a catalog row so it can be reverted in one line.
5. **No spending, no live writes.** Reading Stripe, Supabase and Vercel is fine. Creating prices, refunds, migrations, vendor accounts or paid API experiments needs Tudor's explicit OK; ask in the PR or the notification.
6. **Keep this file lean.** Update §3 (snapshot) and §8 (changelog) each run; move decisions to `TheMasterPlan.md` §11 when Tudor approves them.

---

## 3. Metrics snapshot (the routine overwrites this each run)

| Metric                           | Value    | Source                                      | As of |
| -------------------------------- | -------- | ------------------------------------------- | ----- |
| Paying subscribers               | not yet  | `finance-report.mts`                        | —     |
| MRR (gross EUR / net USD)        | not yet  | `finance-report.mts`                        | —     |
| API cost, last 30d               | not yet  | `render_jobs.api_cost_usd`                  | —     |
| Net MRR ÷ API cost               | not yet  | `finance-report.mts`                        | —     |
| Cost per finished video: Std     | not yet  | `finance-report.mts`                        | —     |
| Cost per finished video: Premium | not yet  | `finance-report.mts`                        | —     |
| Failed-job waste                 | not yet  | `finance-report.mts`                        | —     |
| Trial burn per signup            | $0.25 \* | `margin-report.mts` (modelled, not metered) | 10-05 |
| Fixed monthly costs              | not yet  | **Tudor to provide** (see §6)               | —     |

First run: fill this in. If the database is unreachable, say so in the
notification instead of guessing.

---

## 4. Tokens and credits versus dollars

The ledger already meters what each job costs us (`render_jobs.api_cost_usd`,
written by the orchestrator) and what we charged (`actual_credits`). What it
does **not** yet split is cost per provider, per step and per token. Gap to close
(first PR candidates, in order):

1. **Per-step cost rows.** A small additive table (`job_costs`: job, step, provider, units, input/output tokens, usd) written where each adapter already returns `costUsd` (`anthropic-script.ts` returns real token usage). Needs a migration, so it waits for Tudor's OK to apply.
2. **Invoice reconciliation.** Monthly: compare the sum of metered cost against fal.ai, ElevenLabs and Anthropic invoices. A gap over 5% means an adapter under-reports.
3. **Cost alerts.** A daily check that flags a day whose cost per finished video is 1.5x the 14-day median (a provider price change, a retry storm or an abuse pattern).
4. **Prompt-side savings on scripts.** Anthropic prompt caching and a smaller model for the script step; measure quality on the same 20 topics before and after.

---

## 5. Idea backlog (hypotheses to verify, not facts)

Ranked by likely cash impact. Each needs a measured cost and a sample-quality check
before it becomes a PR.

| #   | Idea                                                                                                                                                                                                                                                    | Why it might pay                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **Cheaper Premium video.** Compare Kling 2.5 Turbo against other image-to-video models on fal.ai (open-weight Wan, LTX, Hunyuan class), Replicate, and first-party APIs (Runway, Luma, Google Veo fast tier, ByteDance Seedance). Test 5s and 3s clips. | Premium is the largest cost line; a 2x cheaper clip lifts Premium margin directly.    |
| 2   | **Clip-length fit.** Kling bills fixed 5s clips, so a 3s scene pays for 5s. Choose per-scene lengths in 5s steps, or reuse one clip across two scenes, or use a model billed per second.                                                                | Removes paid-for-unused seconds (already flagged in `models.ts`).                     |
| 3   | **Hybrid Premium.** AI video only on hook and payoff scenes; animated stills elsewhere.                                                                                                                                                                 | Cuts Premium cost by a large share with little visible loss; sells as "Premium Lite". |
| 4   | **Self-host open video models** on pay-per-second GPUs (Modal, RunPod, Replicate deployments) if volume justifies it.                                                                                                                                   | Only worth it past a volume break-even; compute the break-even before building.       |
| 5   | **Voice.** ElevenLabs Flash vs cheaper TTS (Cartesia, OpenAI TTS, open-weight Kokoro). Check word-timing support for captions.                                                                                                                          | Voice is small per video but scales with every video and every re-voice.              |
| 6   | **Script step.** Claude Haiku-class model, prompt caching, batch API for non-urgent jobs.                                                                                                                                                               | Cheap to try; the script is on every job.                                             |
| 7   | **Media hosting.** Retention policy (delete intermediates after render), Cloudflare R2 (no egress fees) or Supabase Storage tiering for finals.                                                                                                         | Storage and egress grow with every video; they never shrink on their own.             |
| 8   | **Pricing and packaging.** Annual plan (cash up front, lower churn), a lower-priced entry tier or a paid trial, usage-based top-up bundles, Premium add-on credits.                                                                                     | Cash return is faster than cost cutting: annual prepay lifts cash and retention.      |
| 9   | **Payments.** Stripe fee review (local payment methods, Link, Tax), dispute and refund rate, failed-payment retries (Smart Retries, dunning emails).                                                                                                    | Involuntary churn is often 20-40% of churn for subscriptions.                         |
| 10  | **Abuse and waste.** Trial-farming limits, per-IP/device signup caps, cost caps per user per day.                                                                                                                                                       | Trial burn is spend with no revenue.                                                  |

---

## 6. What the routine needs (access and information)

Access that exists today (see `TheMasterPlan.md` §9): GitHub repo, Supabase
connector (project `iqvrovjwoavvmhaithwn`), Stripe connector (sandbox account
only so far), Vercel connector.

**Needed from Tudor (the routine asks in its notification when missing):**

1. **Fixed monthly costs** per vendor (Vercel plan, Supabase plan, ElevenLabs plan, Resend, Sentry, domain, any seats). Pass them as `--fixed-usd`, or list them in §3.
2. **Stripe live-mode read access** for the finance routine (a restricted read-only key or the connector pointed at the live account) so MRR, churn, refunds and fees are real. Until then the numbers come from the database and the sandbox.
3. **A working Supabase path from the cloud session.** The Supabase MCP server failed to connect in the 2026-10-16 session (`ERR_PROXY_TUNNEL`); the routine environment's network policy must allow `mcp.supabase.com` and the project's `*.supabase.co` host. As a fallback, `scripts/finance-report.mts` needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the routine environment. That key bypasses row security: prefer a **read-only Postgres role** with `select` on `render_jobs`, `subscriptions`, `profiles`, `credit_transactions` only.
4. **Vendor billing data:** monthly invoice totals (or read-only billing API keys) for fal.ai, ElevenLabs and Anthropic. Without them, cost is the app's own metering only.
5. **Network policy for the routine environment** allowing the vendor pricing and docs hosts (fal.ai, replicate.com, runwayml.com, lumalabs.ai, elevenlabs.io, anthropic.com, vercel.com, supabase.com, stripe.com). §7 history says direct provider pages were blocked once; blocked pages mean unverified prices.
6. **Budget for tests:** a small cap (say $10 per month) for sample generations when comparing video models, or an OK to use free credits. The routine will not spend without it.
7. **Risk appetite:** may the routine propose price increases for existing subscribers, or only for new ones? Default until told otherwise: new customers only.

---

## 7. Suggested connectors, tools and add-ons

| Tool                                      | Why                                                                                                                        | Status                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Stripe** (connector, live read)         | Real MRR, churn, refunds, fees, disputes; Sigma for SQL over the books.                                                    | sandbox only; **upgrade**                |
| **Supabase** (connector)                  | Read `render_jobs`, `subscriptions`, ledger; advisors show storage and index waste.                                        | configured; failed to connect 2026-10-16 |
| **Vercel** (connector)                    | `list_billing_charges`, usage, function duration and bandwidth, deployment cost per PR.                                    | connected                                |
| **GitHub** (connector)                    | PRs, CI, secret scanning.                                                                                                  | connected                                |
| **Sentry** (connector or MCP)             | Failure rate and error spikes tie directly to wasted spend.                                                                | not connected                            |
| **PostHog** (connector)                   | Funnel from landing to paid, trial activation, plan-page conversion; needed to judge price tests.                          | not connected                            |
| **Google Sheets / Drive** (connector)     | A living cost model the owner can edit (fixed costs, vendor quotes) that the routine reads.                                | optional                                 |
| **fal.ai, ElevenLabs, Anthropic billing** | Read-only usage and cost endpoints (Anthropic Usage and Cost API with an admin key; fal usage page/API; ElevenLabs usage). | keys needed                              |
| **Web search / deep-research skill**      | Vendor scouting with citations.                                                                                            | available                                |
| **Slack or email connector**              | Weekly digest to a channel in addition to push notifications.                                                              | optional                                 |

Not recommended now: a data warehouse or BI tool. `scripts/finance-report.mts`
plus Stripe Sigma cover the volume until there are hundreds of subscribers.

---

## 8. Changelog (newest on top)

- **2026-10-16** — Finance track created. `features/metrics/finance.ts` (pure MRR, net MRR, API cost by tier, failed-job and trial waste, monthly profit) and read-only `scripts/finance-report.mts` (`--days`, `--fixed-usd`, `--json`). +4 tests. Charter, agent roster, idea backlog and access list above. No migration, no dependency, no secrets. (Finance CEO setup, interactive)

---

## 9. The routine prompt (paste into claude.ai/code/routines)

Create a new routine named **Shortcraft Finance CEO**, repo `TudorFnsn/Shortcraft`,
daily 07:30 UTC, same model and permissions as the CEO routine, with the Stripe,
Supabase, Vercel and GitHub connectors attached. Prompt:

```
You are the Finance CEO of Shortcraft, running as a scheduled routine. You are the master agent: you plan, delegate to sub-agents in parallel, merge their findings and ship one PR. Goal: maximum profit, cash return first.

1. Read FinancePlan.md (charter, roster, backlog), TheMasterPlan.md §7 and §9, and CLAUDE.md/AGENTS.md. List open and recently closed PRs; skip any item that has one. Never touch UI files while a ceo-design/* PR is open.
2. Get the numbers: run `npx tsx scripts/finance-report.mts --json` and `npx tsx scripts/margin-report.mts`, and read Stripe (MRR, churn, refunds, fees, failed payments) and Vercel billing through the connectors. If a source is unreachable, say so; do not invent numbers.
3. Split the work across sub-agents in one parallel batch, per FinancePlan.md §2: revenue analyst, cost auditor, vendor scout, pricing strategist, infra cost reviewer. Give each a narrow brief, the files to read, and what to return (numbers with sources, ranked proposals with expected monthly dollar impact and risk). On Mondays add the skeptic.
4. Rank everything by cash impact per effort. Pick the single best change that is safe to ship without spending money or touching live secrets. Implement it on branch ceo-finance/<slug> (catalog row + adapter, config, tests). The margin gate must pass; format, lint, typecheck and tests must pass. Mark every vendor price as verified or unverified and say how.
5. Update FinancePlan.md §3 (snapshot) and §8 (changelog) in the same PR. Open a PR with before/after margin multiples. Never merge.
6. Send a PushNotification, wrapped in <routine_summary>, ONLY if: net MRR ÷ API cost is under 3x, cost per finished video rose 1.5x versus the 14-day median, a data source or access is missing, a decision with money attached needs Tudor, or a PR is ready for review. Lead with the one sentence that matters most. If nothing changed, send nothing.
Rules: no merges, no live Stripe writes, no migrations applied, no paid experiments without Tudor's OK, no secrets in files or logs.
```

Then add the routine id and link to `TheMasterPlan.md` §9 next to the CEO and
Design CEO routines.
