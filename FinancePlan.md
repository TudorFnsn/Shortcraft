# Shortcraft — FinancePlan

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine (a master agent that splits the work across sub-agents). `TheMasterPlan.md` §7 holds pricing history; this file holds the money loop: MRR, unit economics, vendor costs and the cash-first backlog.

---

## 1. Charter

- **Goal:** maximize profit and cash return. Raise MRR, cut cost per finished video, shorten time to cash.
- **Every run starts with the numbers**, never with ideas: MRR, net MRR, ARPU, API spend, cost per finished video, coverage (net MRR ÷ monthly API spend), spend on failed jobs, spend by non-subscribers (trial burn).
- **Priority order:** (1) stop money leaking (failed-job spend, trial abuse, idle infra), (2) cut unit cost without hurting quality, (3) raise revenue per user (pricing, annual plans, top-ups, upgrade nudges), (4) acquisition cost, last.
- **Autonomy:** PR-gated, like the other routines. It never merges, never changes live secrets, never changes a live Stripe price or a live provider on its own. Price or vendor switches are proposals that Tudor approves in the PR.
- **Files it may change:** `src/features/finance/**`, `scripts/finance-report.mts`, `src/config/models.ts` and `src/config/plans.ts` (only in a PR that shows the margin report before/after), provider adapters under `src/features/providers/live/**` (new adapters behind env flags, off by default), `tests/**` for those, `docs/**`, this file, and the finance lines of `TheMasterPlan.md`. Branches: `ceo-finance/*`. UI files belong to the Design CEO.
- **Bar for code:** `npm run format:check && npm run lint && npm run typecheck && npm test` pass in mock mode, and `npx tsx scripts/margin-report.mts` still passes the 3x gate.

## 2. Data the routine can read

| Source                                                 | What it gives                                                | Status                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `scripts/finance-report.mts` (service role, read-only) | MRR, spend, cost per video, coverage, non-subscriber spend   | Built. Needs `.env.local` with the Supabase service role in the routine's environment.                  |
| `scripts/margin-report.mts`                            | Worst-case margin per plan and top-up                        | Built, no secrets.                                                                                      |
| `scripts/metrics-report.mts`                           | Paying-retained creators, activation, trial → paid, failures | Built.                                                                                                  |
| Stripe connector (MCP)                                 | Real MRR, churn, refunds, fees, disputes, payouts            | **Needs Tudor to authorize it** (claude.ai connector settings).                                         |
| Supabase connector (MCP)                               | SQL, logs, advisors, plan/usage of the database              | Configured in `.mcp.json`; failed to connect from the cloud sandbox on 2026-10-17 (`ERR_PROXY_TUNNEL`). |
| Vercel connector (MCP)                                 | `list_billing_charges`, usage, contract commitments          | Connected. Used for hosting spend.                                                                      |
| fal.ai / ElevenLabs / Anthropic usage                  | Real vendor invoices                                         | **No connector.** Tudor pastes monthly totals into §6 (see §7 asks).                                    |

**Known gap:** `render_jobs.api_cost_usd` is our own meter from the model catalog, not the vendor invoice. Compare the two monthly and record the gap in §6; a gap above 15% means the catalog prices (`costUsdPerUnit`) are wrong and the margin gate is lying.

## 3. Routine design: master agent + workers

The master agent (Opus) reads this file, `TheMasterPlan.md` §7, open and recent PRs, then runs the report scripts. It spawns the workers below in parallel (one `Agent` call each, briefed with the numbers and what is already ruled out), merges their findings, ranks them by **cash impact per effort**, and ships **one** item per run as a PR (or improves an open `ceo-finance/*` PR first).

| Worker           | Job                                                                                                                                                                                                         | Output                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Metrics**      | Run `finance-report`, `margin-report`, `metrics-report`; pull Stripe (MRR, churn, refunds, fees) and Vercel billing when connected.                                                                         | A numbers table + week-over-week deltas.                                                                          |
| **Cost audit**   | Token and unit cost per job: Claude tokens in/out per script (read `anthropic-script.ts`), images, AI clip seconds, voice characters, render. Compare to `costUsdPerUnit`. Find failed-job and retry spend. | Cost per finished video by tier; the top 3 leaks.                                                                 |
| **Vendor scout** | Web search for cheaper or better models and services for each slot (video, image, voice, script, hosting). Check real price pages, dates and licenses. Never trust one snippet.                             | A table: candidate, price per unit, quality notes, license (commercial use?), migration effort, saving per month. |
| **Pricing**      | Plan and top-up pricing, annual plan discount, credit scale, trial size, upgrade triggers, abandoned checkout, dunning; reruns the margin gate on any proposal.                                             | Proposals with margin before/after.                                                                               |
| **Builder**      | Implements the single chosen item (adapter behind a flag, catalog row, script, test) and opens the PR.                                                                                                      | PR with tests and the margin report attached.                                                                     |
| **Reviewer**     | Reads the diff cold (not the Builder's reasoning) for cost bugs: missing meter, double billing, a flag that defaults on.                                                                                    | Findings or "clean".                                                                                              |

**Rules for vendor proposals:** keep the `RenderProvider`/adapter ports, so a swap is one adapter and one catalog row. A new model ships behind an env flag, is measured on a small real run (cost, latency, failure rate, subjective quality) and only then replaces the default. Check the license allows commercial use and the generated content terms. Check data retention. Report prices with the source URL and date.

**Output of every run:** a digest with the numbers table (with deltas), what moved, the PR link, what is waiting on Tudor, and the next item. **Notify Tudor** when: coverage drops below 3.0 or fell more than 20% week over week, failed-job spend exceeds 10% of spend, MRR fell, a vendor price changed, or a saving above $50/month is available. Silence otherwise.

## 4. Roadmap (cash first)

Status: `[ ]` open · `[~]` in progress / in review · `[x]` shipped · `[?]` needs Tudor.

### F0 — See the money

- [x] Finance report script and pure unit-economics module (this PR).
- [?] **Authorize the Stripe connector** so the routine reads real MRR, churn, fees, refunds.
- [?] Fix the Supabase connector in the routine environment (service role in env, or the MCP connection), so reports run unattended.
- [ ] Persist **per-step cost** (script tokens in/out, image count, clip seconds, voice characters, render seconds) on each job, not only the total `api_cost_usd`. Without it, "tokens used vs. money spent" can only be estimated. Needs a migration (additive).
- [ ] Add a `vendor_invoices` table (or §6 rows) for monthly real totals; compute meter-vs-invoice gap.

### F1 — Stop leaks

- [ ] Measure spend on failed or moderated jobs; make sure a failed premium clip is not paid twice (retries, cron sweep, lease expiry).
- [ ] Trial burn: cap per-signup spend (disposable-email and repeat-signup checks, one trial per payment method or device) — trial burn is acquisition cost with no revenue.
- [ ] Cache and reuse: script and image reuse for identical prompts, Anthropic prompt caching on the script system prompt, batch API for non-urgent work.
- [ ] Idle hosting: check Vercel function duration and egress, Supabase plan vs. need, storage lifecycle (delete renders of inactive free users after N days).

### F2 — Cut unit cost

- [ ] **Premium AI video (the biggest line):** benchmark fal.ai's current default (Kling 2.5 Turbo Pro, ~$0.07/s) against alternatives — hosted open-weight image-to-video models (e.g. LTX, Wan family) on fal.ai or cheaper GPU hosts (Replicate, Runpod, Modal, Together, DeepInfra, Novita and similar), and other video APIs. Measure cost per usable second, not list price: failed or unusable clips count.
- [ ] **Hero-shot premium:** animate only the hook scene and use animated stills for the rest. Expected 60–80% cut of premium cost; needs a catalog row and a UI label (hand to Design CEO).
- [ ] Shorter AI clips (3–5s loops with the Ken Burns pass) and lower resolution (480p → upscale in ffmpeg) for the premium tier.
- [ ] Voice: compare ElevenLabs per-character cost with cheaper TTS (e.g. Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural, self-hosted open-weight TTS) at equal quality for the supported languages.
- [ ] Script: Sonnet 5.5 → Haiku 5.5 for the script step if quality holds on an eval set; use prompt caching.
- [ ] Images: FLUX schnell is already ~$0.003; check whether a cheaper hosted FLUX/SDXL variant beats it.

### F3 — Raise revenue per user

- [ ] Annual plans (2 months free) to pull cash forward; `stripePriceIdYearly` already exists in `plans.ts`.
- [ ] Premium as a top-up or per-video pay-as-you-go instead of a plan perk, so heavy AI-video users pay their own cost.
- [ ] Upgrade nudges where credits run out; dunning and card-update emails for `past_due`; abandoned-checkout email.
- [ ] Price test: Starter €14.99 vs. €19.99; measure conversion before keeping.
- [ ] Margin gate target: keep 3x worst-case; move to 4x for premium once costs are measured.

### F4 — Cheap acquisition

- [ ] Referral credit (costs credits, not cash), affiliate 30% recurring tracked via Stripe metadata, SEO pages already shipping (Master Plan §6.3).

## 5. Rules

- **Read first:** `TheMasterPlan.md` §7 and §10, this file, `git log -20`, open and recently closed PRs. An item with an open PR is in review, not available.
- **One item per run.** Prefer improving an open `ceo-finance/*` PR.
- **Numbers before claims.** Every PR states the metric it moves, how it was measured and the margin report before/after. If a figure came from a search snippet, say so.
- **Never** change live Stripe prices, rotate secrets, switch the default live provider, or enable a flag in production without Tudor's approval in the PR.
- **Record the run** in §6 and add a changelog line to `TheMasterPlan.md` §10.

## 6. Ledger (append newest on top)

| Date       | MRR (EUR) | Net MRR (USD) | API spend (30d) | Cost / finished video | Coverage | Vendor invoice total | Meter gap | Notes                                          |
| ---------- | --------- | ------------- | --------------- | --------------------- | -------- | -------------------- | --------- | ---------------------------------------------- |
| 2026-10-17 | n/a       | n/a           | n/a             | n/a                   | n/a      | n/a                  | n/a       | Track created. No live data read yet (see §2). |

## 7. What the routine needs from Tudor

1. **Authorize the Stripe connector** in claude.ai connector settings (it shows as "needs authentication").
2. **Reconnect Supabase** for the routine (the MCP server failed to connect on 2026-10-17), or give the routine's environment `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so `finance-report` can run. Prefer a read-only Postgres role for this over the service role.
3. **Paste monthly vendor totals** (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, domain, email) into §6, until a usage API or connector is wired.
4. **Network access:** set the routine environment to allow outbound HTTPS to vendor pricing pages (fal.ai, replicate.com, elevenlabs.io, anthropic.com, vercel.com, supabase.com). On 2026-10-04 a routine was blocked from provider pages and had to use search snippets.
5. **Approve the cadence:** suggested daily 07:00 UTC (after the 06:00 CEO, before the 09:00 Design CEO), or weekly if daily is too chatty.

### Connectors, plugins and tools that would help

- **Stripe** (MCP): MRR, churn, refunds, disputes, fees, payouts, price changes. Highest value.
- **Vercel** (MCP, connected): billing charges, usage, runtime errors.
- **Supabase** (MCP): SQL, advisors, logs. Needs fixing, see above.
- **GitHub** (connected): PRs and CI.
- **Google Sheets / Drive connector** (optional): a living cost model Tudor can edit.
- **Slack or email connector** (optional): digest delivery beyond the push notification.
- **Sentry** (already a dependency): failed-job rates tied to spend.
- **Claude skills:** `xlsx` for a cost-model workbook, `deep-research` for vendor scans, `dataviz` for the MRR/cost charts in the digest, `claude-api` for token and caching questions.
- **Prompt caching and the Batch API** on the Anthropic side: a built-in saving for the script step.
