# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`. The master plan wins on product and priority;
> this file wins on pricing, unit economics, vendor choice and cash. Every finance
> PR updates this file (metrics snapshot, vendor watchlist, changelog) in the same
> change.
>
> Last updated: 2026-10-18 (routine created)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question       | Owner's answer                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal           | **Maximum profit and cash return.** Monetise the app better: more revenue per creator, lower cost per video, faster payback on signups.     |
| Standing check | **Every run starts with the MRR picture** (§3) and the cost-per-video picture (§4). Nothing is proposed without the numbers next to it.    |
| Scope          | Pricing and plans, credit scale, vendor and model choice (fal.ai video is the first suspect: "seems expensive"), hosting cost, every payment. |
| Autonomy       | **Analyse + PR-gated code.** Branches `ceo-finance/<slug>`; never merge. Price or plan changes that touch live Stripe need the owner's OK.   |
| Cadence        | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design CEO at 09:00). Weekly deep report on Mondays. |
| Style          | A **DM master agent** splits the work across specialist agents in parallel (§2), merges their findings, and ships at most one PR a day.     |

### Rules

1. **Cash first.** Rank every idea by `(extra profit per month) / (effort + risk)`. Ties go to the one that pays back sooner.
2. **Margin gate stays green.** `npx tsx scripts/margin-report.mts` must pass (≥ 3x worst case on every plan and top-up) before and after any change.
3. **Measured beats researched.** A list price is a hypothesis. Replace `costUsdPerUnit` guesses with realised `render_jobs.api_cost_usd` as soon as a live sample exists, and say which numbers are still unmeasured.
4. **A cheaper vendor must pass a quality check** (§5) before it replaces anything. Never swap the provider on price alone.
5. **Owner-only:** live-mode Stripe changes, changing customer-facing prices or plan grants, new vendor contracts or API keys, anything that spends money. Propose with numbers, wait for a yes.
6. **No secrets in the repo, no live writes.** Read-only on Supabase and Stripe unless the owner has said otherwise for that action.
7. **Before picking work, list open and recently closed PRs** (a topic with an open PR is in review, not available). Leave UI files alone while a `ceo-design/*` PR is open.

---

## 2. The DM master agent and its crew

The routine's main session is the **DM** (decision maker). It does not do the analysis itself: it reads this file, launches the specialists below **in parallel** with a tight brief each (goal, files, what is already ruled out), then merges their answers into one ranked list and implements the top item.

| Agent                 | Question it answers                                                                                       | Reads                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Revenue analyst**   | What is MRR, net new MRR, churn, ARPU, trial → paid, top-up share, refunds/disputes this week vs last?    | Stripe (subscriptions, invoices, balance transactions, Sigma), `scripts/metrics-report.mts`            |
| **Unit-economics**    | What did a finished video really cost, per step and per tier, vs the catalog? Tokens in/out vs dollars?   | `render_jobs.api_cost_usd`, `credit_transactions`, `src/config/models.ts`, `scripts/margin-report.mts` |
| **Vendor scout**      | Is there a cheaper or better model for each slot (§5)? What shipped or changed price this month?          | Web search, vendor pricing pages and changelogs, `FinancePlan.md` §5                                   |
| **Infra cost**        | What do Vercel, Supabase, Sentry, Resend, ElevenLabs and the domain cost per month, and per video?        | Vercel billing/usage, Supabase usage, vendor invoices (owner pastes if no connector)                   |
| **Pricing & growth**  | Do plan prices, grants, trial size and top-ups fit what creators actually use? What would lift ARPU?      | Plans in `src/config/plans.ts`, usage distribution, competitor pricing                                 |
| **Implementer**       | Build the DM's chosen item as a small, tested PR (model row + adapter, pricing constants, report script). | Repo, tests, CI                                                                                        |

Rules for the crew: each agent returns numbers with their source and a confidence tag (**measured / list price / guess**). Agents never write to production systems. The DM drops any finding that lacks a number.

---

## 3. MRR dashboard (every run fills this in)

Source: Stripe subscriptions (live mode when it exists, sandbox until then) plus `scripts/metrics-report.mts`. Until live Stripe is connected, report the sandbox figures labelled **SANDBOX** and say real MRR is €0 / not yet live.

| Metric                         | Definition                                                         | Last run | Trend |
| ------------------------------ | ------------------------------------------------------------------ | -------- | ----- |
| MRR (€)                        | Sum of active subscriptions' monthly price, after coupons          | n/a      |       |
| Net new MRR                    | New + expansion − contraction − churned                            | n/a      |       |
| Paying subscribers / ARPU      | Count; MRR ÷ count                                                 | n/a      |       |
| Trial → paid                   | 7–35-day signup cohort that bought a plan or top-up                | n/a      |       |
| Monthly logo churn             | Subscribers lost ÷ subscribers at start of month                   | n/a      |       |
| Top-up revenue share           | Top-up € ÷ total €                                                 | n/a      |       |
| Gross margin %                 | (Net revenue − API cost − infra) ÷ net revenue                     | n/a      |       |
| Cost per finished video        | Mean `api_cost_usd` for done jobs, by tier and length             | n/a      |       |
| Trial burn per signup          | API cost of a trial user's videos (catalog says $0.23)             | n/a      |       |
| Payback on a signup            | Trial burn ÷ (ARPU × gross margin)                                 | n/a      |       |

The DM appends one dated row of these numbers to §8 each run, so trends are visible without Stripe.

---

## 4. Unit economics baseline (2026-10-18, catalog values, not yet measured)

From `npx tsx scripts/margin-report.mts` on `main`: **gate PASS**.

| Product | Credits | Net revenue | Worst-case cost | Multiple |
| ------- | ------- | ----------- | --------------- | -------- |
| Starter €14.99 | 30,000  | $12.98 | $2.31 (voice design) | 5.62x |
| Pro €29.99     | 100,000 | $26.24 | $8.73 (6s premium)   | 3.00x |
| Ultra €79.99   | 250,000 | $70.43 | $21.83 (6s premium)  | 3.23x |
| 20K top-up €12 | 20,000  | $10.34 | $1.75                | 5.92x |
| 60K top-up €29 | 60,000  | $25.36 | $5.24                | 4.84x |
| 150K top-up €59| 150,000 | $51.87 | $13.10               | 3.96x |

Trial burn: **$0.23** per signup. Standard (animated stills) costs about $0.07 per 15s video; Premium (fal.ai Kling 2.5 Turbo Pro) is the only expensive path at a conservative **$0.12 per scene-second** in the catalog. Pro and Ultra sit exactly at the 3x floor *because of Premium*, so Premium cost is the lever that frees margin for everyone.

**Known gaps the routine should close first:**

1. **Token/cost telemetry is thin.** `render_jobs.api_cost_usd` stores one dollar total per job. Anthropic input/output tokens, fal billed seconds/megapixels and ElevenLabs characters are not stored per step, so "tokens used vs dollars spent" cannot be answered from the DB. First PR candidate: a per-step usage ledger (`job_usage`: job, step, vendor, model, units, unit type, cost_usd, measured/estimated) fed by the adapters' real responses, plus `scripts/finance-report.mts` (read-only) that prints cost per video, per step, per tier, and tokens → dollars. Needs a migration, so the owner applies it.
2. **All vendor prices are list prices from search snippets** (TheMasterPlan §7). Measure on real calls via `scripts/live-providers-smoke.mts` and replace.
3. **Fixed costs are unknown to the repo** (Vercel, Supabase, Sentry, Resend, ElevenLabs plan, domain, Stripe fees beyond the percentage). Add them to §6 once the owner supplies them or a connector reads them.

---

## 5. Vendor watchlist (re-check monthly, or when a vendor ships)

The catalog is built so a model swap is one row in `src/config/models.ts` plus one adapter. Candidates per slot (prices are hypotheses until measured; the scout refreshes them):

| Slot                   | Today                                  | Candidates to price and test                                                                                                   |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Premium image-to-video | fal.ai Kling 2.5 Turbo Pro (~$0.07/s)  | Wan 2.x / Seedance / LTX-2 Fast on fal (cheaper per second); same models via Replicate, Runway, Together, WaveSpeed, Novita, or direct vendor APIs; self-hosted open weights on a GPU pay-per-second host (Modal, RunPod, Vast) if volume justifies it. |
| Hero-shot variant      | not built                              | AI clip on the hook scene only, stills elsewhere: about $0.45 per 15s video vs about $1.10. Biggest cost lever with no vendor change. |
| Images                 | FLUX schnell / dev on fal              | Cheaper image endpoints (Together, Replicate, Runware, self-host), image caching/re-use across scenes, smaller resolutions.     |
| Voice                  | ElevenLabs Flash v2.5                  | Cheaper TTS (OpenAI, Cartesia, Deepgram, Azure/Google neural), or ElevenLabs volume tier; keep ElevenLabs for designed voices.  |
| Script                 | Claude Sonnet 5.5                      | Haiku 5.5 for the script step (a fraction of the price), prompt caching, shorter prompts; measure quality on a fixed prompt set. |
| Render                 | in-house ffmpeg (about $0.01)          | Already near the floor; watch function duration/memory.                                                                         |
| Hosting                | Vercel + Supabase                      | Plan right-sizing, fluid compute settings, image/bandwidth optimisation, storage lifecycle (delete old renders), egress costs.   |
| Payments               | Stripe                                 | Fee structure (EU cards 1.5% + €0.25), annual plans for cash up front, Stripe Tax vs manual VAT, failed-payment recovery.        |

**Quality gate for a swap:** render the same 10 fixed prompts on old and new, compare side by side (the owner or a rubric agent scores them), and only then propose the swap with measured $ per second and the margin-report diff.

---

## 6. Cost ledger (fixed and semi-fixed, € per month)

| Item               | Plan / basis      | € per month | Source                  |
| ------------------ | ----------------- | ----------- | ----------------------- |
| Vercel             | unknown           | ?           | needs owner or connector |
| Supabase           | unknown           | ?           | needs owner or connector |
| ElevenLabs plan    | unknown           | ?           | needs owner             |
| fal.ai             | pay-as-you-go     | usage       | fal dashboard           |
| Anthropic API      | pay-as-you-go     | usage       | Anthropic console       |
| Sentry / Resend    | unknown           | ?           | needs owner             |
| Domain             | unknown           | ?           | needs owner             |
| Stripe fees        | 1.5% + €0.25      | per charge  | Stripe                  |

---

## 7. Roadmap (priority order, edited by the DM each run)

- [ ] **F1. Usage ledger + `scripts/finance-report.mts`**: answers tokens vs dollars, cost per video and per step (needs migration; owner applies).
- [ ] **F2. Measure real costs** with the live smoke script and fix `costUsdPerUnit` in `models.ts`; re-run the margin gate.
- [ ] **F3. Premium video cost cut**: scout alternatives to Kling on fal, build one cheaper adapter behind the catalog, A/B on the fixed prompt set.
- [ ] **F4. Hero-shot Premium variant** priced close to Standard (new tier or option).
- [ ] **F5. Script step on a cheaper Claude model** if quality holds; prompt caching.
- [ ] **F6. Annual plans** (cash up front, lower churn) and a revisit of trial size from measured trial burn and conversion.
- [ ] **F7. Failed-payment recovery and dunning** (Stripe smart retries, emails via Resend).
- [ ] **F8. Infra right-sizing** once §6 has real numbers.

---

## 8. Metrics log (append newest on top)

| Date       | MRR | Subs | Trial → paid | Cost / 15s std | Cost / 15s premium | Gate | Note                    |
| ---------- | --- | ---- | ------------ | -------------- | ------------------ | ---- | ----------------------- |
| 2026-10-18 | n/a | n/a  | n/a          | $0.07 (catalog) | $1.10 (list)      | PASS | Baseline, routine setup |

---

## 9. Tools, connectors and access this routine needs

**Already connected (per TheMasterPlan §9):** GitHub (repo), Supabase (read-only SQL for `render_jobs`, `credit_transactions`, `subscriptions`; its connector fails from some cloud sessions: the routine reports it instead of guessing), Stripe sandbox, Vercel.

**To add so the routine can do its job properly:**

| Need                                     | Why                                                            | How                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Stripe connector (authorize it)**      | MRR, churn, refunds, fees. It currently needs OAuth.           | claude.ai → Settings → Connectors → Stripe → Connect. Restricted key, read-only, live mode when live. |
| **Supabase connector (reconnect)**       | Realised cost per job, trial burn, usage distribution.         | Connector fails with a proxy error in cloud sessions; retry or allow `mcp.supabase.com` on the environment. |
| **Vercel connector**                     | `list_billing_charges`, usage and runtime cost per deployment. | Already offered; confirm the team and project are selected.                                          |
| **fal.ai usage + billing**               | Real $ per model; the Kling price is the biggest unknown.      | Owner exports usage CSV monthly, or sets an admin key as an environment secret named `FAL_ADMIN_KEY`. |
| **Anthropic usage**                      | Tokens in/out and cost per workspace.                          | Admin API key as secret `ANTHROPIC_ADMIN_KEY` (usage and cost reports), or monthly CSV from the console. |
| **ElevenLabs usage**                     | Characters used vs plan, custom-voice slots.                   | Read-only API key with usage scope, or a monthly export.                                             |
| Network allow-list on the routine's environment | Vendor pricing pages were blocked before (TheMasterPlan §7). | Allow fal.ai, replicate.com, together.ai, runwayml.com, elevenlabs.io, anthropic.com, vercel.com/pricing, supabase.com/pricing, stripe.com/pricing. |
| Optional: PostHog or Plausible           | Funnel from visit → signup → paid to size acquisition spend.   | Connector when it exists.                                                                            |
| Optional: Sentry connector               | Failed renders are pure wasted API cost; ties errors to dollars. | Connector when it exists.                                                                          |

Claude Code tools worth using in the routine: parallel subagents (the crew), WebSearch in `extended` mode for vendor prices, the Supabase/Stripe/Vercel connectors, `/security-review` before any billing PR, and `/code-review` on its own diff.

---

## 10. Routine prompt (paste into a new cloud routine)

Name: **Shortcraft Finance CEO**. Model: Opus 5.5. Schedule: daily 12:00 UTC. Repo: `TudorFnsn/Shortcraft`. Connectors: GitHub, Supabase, Stripe, Vercel.

```
You are the DM (decision maker) of the Shortcraft Finance track. Goal: maximum profit and cash return for the app. Read FinancePlan.md, TheMasterPlan.md §7 and §9, then follow FinancePlan.md exactly.

1. List open and recently closed PRs. Skip any topic that already has an open PR. Leave UI files alone while a ceo-design/* PR is open.
2. Always check the MRR picture first (FinancePlan §3): MRR, net new MRR, subscribers, ARPU, churn, trial to paid, gross margin, cost per finished video. Use Stripe and Supabase read-only. If a connector fails, say which one and carry on with the repo data; never invent numbers.
3. Launch the crew in parallel (Revenue analyst, Unit-economics, Vendor scout, Infra cost, Pricing and growth), each with a tight brief and a request for numbers tagged measured / list price / guess. Compare tokens and API dollars per video with what we charge and what hosting costs.
4. Merge their findings into one list ranked by extra profit per month over effort and risk. Hunt for cheaper or better vendors and fresh techniques (fal.ai video is the first suspect), always behind the quality gate in FinancePlan §5.
5. Implement the single best item that is safe without the owner: on a branch ceo-finance/<slug>, small, tested, margin-report still PASS, then open a PR. Never merge, never change live prices or Stripe live mode, never touch live secrets. Anything that needs the owner is written up with the numbers as a proposal.
6. Update FinancePlan.md (§3 dashboard, §6 costs, §7 roadmap, §8 log) and add a line to the changelog in TheMasterPlan.md §10.
7. Notify the owner with PushNotification only when something needs them: MRR dropped or churn spiked, margin gate fails, a vendor is clearly cheaper and needs a decision, a connector or key is missing, or a PR is ready. A quiet day with no change gets no notification.
Ask for any information you need by listing it in the notification; configure yourself with connectors and tools wherever you can.
```

Setup note: Claude Code can't create cloud routines from inside a session. Create it at https://claude.ai/code/routines with the settings above, then paste its trigger id into TheMasterPlan §9 next to the other two routines.
