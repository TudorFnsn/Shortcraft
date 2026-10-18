# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on unit economics, vendor choice, pricing experiments and cash. Every
> finance PR updates this file (§3 scoreboard, §5 backlog, §8 changelog) in the same change.
>
> Last updated: 2026-10-18 (track created)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit and fastest cash return.** Grow MRR, cut cost per video, and shorten the time until the app has paid for itself.                      |
| Method    | Watch the MRR ratio (§3), find cheaper or better vendors and fresh tech, price better, and implement what is safe. Cash return beats elegance.        |
| Known pain| **fal.ai looks expensive** for AI video. Find cheaper or better video, image and voice options and prove them on real calls before any switch.       |
| Autonomy  | **Analyse freely, change code PR-gated.** Branches `ceo-finance/<slug>`; never merge. No live-secret use, no Stripe writes, no vendor sign-ups without Tudor. |
| Structure | Same as the other routines: one **master agent** (DM) that splits the day's work across sub-agents (§4), then merges their results into one PR and one digest. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CFO"**, 12:00 UTC (after CEO 06:00 and Design 09:00). Weekly deep audit on Mondays.                          |

### Principles

1. **Measured beats researched.** A list price is a hypothesis. Only invoices, dashboards and `render_jobs.api_cost_usd` on real calls count as numbers. Label every figure `measured`, `list price` or `estimate`.
2. **Never trade away the margin gate.** `npx tsx scripts/margin-report.mts` must stay at or above 3x on every product. A vendor swap that fails it does not ship.
3. **Cash first.** Rank ideas by (monthly dollars saved or earned) ÷ (effort and risk). Report the payback time.
4. **Quality is a cost too.** A cheaper model that raises render failures or hurts retention loses money. Compare on the same prompts, same scenes, side by side.
5. **No hidden spend.** The routine never makes a paid call over a cap Tudor set (§6) and logs the dollars of every test it runs.
6. **Money state stays reversible.** Price and plan changes ship behind config, not migrations, and say how to roll back.

---

## 2. Cost map (what we pay for)

| Line               | Vendor today                     | Variable or fixed | Where it shows up                                 | Status of the number |
| ------------------ | -------------------------------- | ----------------- | ------------------------------------------------- | -------------------- |
| AI video (Premium) | fal.ai, Kling 2.5 Turbo Pro      | per clip second   | `render_jobs.api_cost_usd`, `models.ts` `video-premium` | catalog $0.12/s is conservative, list ~$0.07/s, **unmeasured** |
| Images             | fal.ai FLUX schnell / dev        | per image         | same                                              | list price           |
| Script             | Anthropic Sonnet 5.5             | per token         | same, flat $0.04/job in the catalog               | **tokens not stored** (gap G1) |
| Voice              | ElevenLabs Flash v2.5            | per character     | same, $0.00075/s                                  | list price; plan slots for saved voices |
| Render             | in-house ffmpeg on Vercel        | per function-second | not metered, $0.01/video flat                   | estimate             |
| Hosting            | Vercel (Hobby)                   | fixed or usage    | Vercel billing                                    | **verify plan terms** (gap G4) |
| Database + storage | Supabase (free plan)             | fixed or usage    | Supabase billing, `media` bucket egress           | owner to confirm     |
| Payments           | Stripe                           | % + fixed per charge | Stripe balance transactions                    | list: see margin gate |
| Email              | Resend                           | per email         | Resend dashboard                                  | owner to confirm     |
| Errors / analytics | Sentry, Vercel Speed Insights    | fixed or usage    | their dashboards                                  | owner to confirm     |
| Domain, tax, legal | owner                            | fixed             | owner                                             | owner to confirm     |

The CFO keeps this table current. A line without a measured number is a gap and goes into §5.

---

## 3. Scoreboard (the CFO refreshes this every run)

Fill from Stripe (MRR), `scripts/metrics-report.mts`, `scripts/margin-report.mts` and vendor dashboards. `n/a` is allowed, a guess is not.

| Metric                                              | Latest | Date | Source | Target |
| --------------------------------------------------- | ------ | ---- | ------ | ------ |
| MRR (EUR, active subscriptions, normalised monthly) | n/a    |      | Stripe | grow   |
| Paying subscribers                                  | n/a    |      | Stripe / metrics-report |  |
| ARPU (MRR ÷ paying subscribers)                     | n/a    |      | derived |       |
| Net new MRR, churned MRR, expansion MRR (30 days)   | n/a    |      | Stripe |        |
| Trial → paid                                        | n/a    |      | metrics-report |  |
| Gross margin per video: Standard / Premium          | n/a    |      | `render_jobs` + invoices | ≥ 3x revenue ÷ API cost |
| API cost per finished video, by step (measured)     | n/a    |      | `render_jobs`, vendor dashboards | down |
| **MRR ratio** = MRR ÷ total monthly spend (all vendors, fixed + variable) | n/a | | Stripe + invoices | **> 1 to break even, > 3 healthy** |
| Cash runway / payback of build costs                | n/a    |      | owner  |        |
| Render failure rate and refunded credits            | n/a    |      | metrics-report |  |

---

## 4. Agent structure (master agent + sub-agents)

The routine's first message runs as the **master agent (DM)**. It never does the deep work itself. It reads this file, `TheMasterPlan.md`, open and recent PRs, then spawns the sub-agents below **in parallel** with the Agent tool, each with a narrow brief (goal, files to read, what is ruled out, dollar cap), and merges their answers.

| Sub-agent            | Question it owns                                                                                          | Reads                                                              | May write                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| **Revenue analyst**  | What is MRR, churn, ARPU, trial → paid? Which plan or top-up converts? Where is cash leaking (failed payments, refunds)? | Stripe connector (read-only), `metrics-report.mts`          | scoreboard rows                            |
| **Cost auditor**     | What did each finished video really cost, by step? Tokens and characters per video vs dollars. Invoice vs `api_cost_usd` drift. | Supabase read-only SQL, vendor dashboards, `models.ts`, `margin-report.mts` | §2 cost map, scoreboard rows |
| **Vendor scout**     | Cheaper or better AI video, image, voice, script, storage, hosting? Fresh models and techs worth testing. | Web search, vendor pricing pages and docs                          | §5 candidate table (with sources and dates) |
| **Benchmark runner** | Does candidate X match current quality at lower cost, on the same prompts? (Only within the §6 dollar cap and only with keys Tudor provided.) | `scripts/live-providers-smoke.mts`, new bench scripts | bench scripts, §5 results                  |
| **Pricing strategist** | Plan prices, credit scale, annual plan, top-up sizes, trial size, hero-shot Premium, upsell and win-back, referral and affiliate economics. | Scoreboard, `config/plans`, margin gate, Stripe prices        | pricing config PRs (behind the margin gate) |
| **Cost engineer**    | Implement the savings that need code: prompt caching and a smaller model for scripts, scene-count and clip-length limits, caching and reuse of images, storage retention, R2 egress, token and cost metering. | `src/features/**`, tests                                  | code PR on `ceo-finance/*`                 |

Rules for the master agent:

1. **Split by independence.** Start the analyst, auditor and scout together. Start the benchmark runner only after the scout has a shortlist and Tudor's cap allows it. Start the cost engineer only for a change the numbers already justify.
2. **One code PR per run**, unless a second is trivially separate. Check `gh pr list --state all --limit 20` for open `ceo-finance/*`, `ceo/*` and `ceo-design/*` PRs first. An item with an open PR is in review, not available.
3. **Ask for what is missing.** If a figure needs access the routine lacks, put the exact request in the digest under "Needs Tudor" with the fastest way to supply it (§6). Do not guess around a gap.
4. **Verify sub-agent claims** before they enter the plan: a price needs a source and a date; a saving needs the arithmetic.

---

## 5. Backlog (priority order, top unchecked item is next)

### Measure first (nothing else is trustworthy without it)

- [ ] **G1: store usage, not only dollars.** `render_jobs.api_cost_usd` is one number. Add per-step usage (script input and output tokens, image count and megapixels, clip seconds billed, voice characters, render seconds) so tokens per video, cost per token and cost per step can be reported. Proposal: a `usage jsonb` column on `render_jobs` (expand-only migration, owner applies) plus the adapters returning their usage. Then `scripts/finance-report.mts` (read-only, like `metrics-report.mts`) prints cost per video by step and tokens per video.
- [ ] **G2: invoices vs catalog.** Owner sends the fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend and Stripe totals for a month. The auditor reconciles them against `api_cost_usd` and fixes the catalog.
- [ ] **G3: MRR from Stripe.** Needs the Stripe connector authorised and live mode connected (§6). Until then MRR is `n/a`.
- [ ] **G4: confirm hosting terms.** Vercel Hobby is for non-commercial use under Vercel's terms, and the free Supabase plan has limits (pausing, egress, no leaked-password protection). Before charging real money, decide the paid plan for each and add it to §2. This is a compliance and uptime cost, not optional.

### Cut cost per video

- [ ] **Premium video vendor bake-off.** Same 5 prompts and scene images through Kling 2.5 Turbo Pro (current) and the cheapest credible alternatives the scout finds (open-weight video models such as Wan and LTX hosted on other inference APIs, Seedance-class models, and self-hosting on per-second GPU such as Modal). Report cost per 5s clip, latency, failure rate, and a side-by-side for Tudor to judge. Do not switch without his sign-off.
- [ ] **Hero-shot Premium.** AI clip on the hook scene only, stills for the rest (about one third of the cost). Model the price and the margin, then offer it as a tier.
- [ ] **Script model.** Claude Sonnet 5.5 for scripts at about $0.04 a job. Test a Haiku-class model with the same JSON schema and a quality check; add prompt caching for the fixed system prompt. Measure tokens per script first (G1).
- [ ] **Voice.** Compare ElevenLabs Flash against cheaper TTS (hosted and open-weight) on listener quality; check the saved-voice slot cost.
- [ ] **Images.** Reuse and cache by prompt hash; drop to fewer or smaller images on short scenes; check if FLUX schnell is still the cheapest acceptable option.
- [ ] **Storage and egress.** Retention policy for old renders; move `media` to Cloudflare R2 behind the `MediaStore` port (no egress fees).
- [ ] **Render.** Measure ffmpeg seconds on Vercel per video; if a 60s render is costly, test a cheaper compute path.

### Grow MRR

- [ ] **Annual plans** (cash up front, lower churn): model a discount that keeps the margin gate, add Stripe prices.
- [ ] **Price test** on the Starter → Pro step and on top-up sizes, using scoreboard data once there are paying users.
- [ ] **Failed-payment recovery** (Stripe Smart Retries, dunning emails) and **cancel-save offer** (pause, or downgrade, instead of cancel).
- [ ] **Expansion**: low-credit nudge to upgrade, credit-pack upsell at the paywall, Premium trial of one hero shot.
- [ ] **Referral / affiliate economics** (30% recurring is planned in the master plan §6): model payback per referred subscriber.
- [ ] **Free-trial abuse check**: trial burn is about $0.14 per signup; count signups per card or device and cap if needed.

---

## 6. Access and inputs the CFO needs (owner checklist)

The routine reports each of these in "Needs Tudor" until it is true. Say so in the PR or the digest when one is done.

| Need                                   | Why                                                       | How to provide                                                              |
| -------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Repo write access**                  | Branches and PRs on `TudorFnsn/Shortcraft`.                | Routine environment already clones it; keep the GitHub App installed with contents + pull requests write. |
| **Stripe, live mode, read-only**       | MRR, churn, refunds, fees, failed payments, Sigma queries. | Authorise the Stripe connector on claude.ai and add the **live** account. Prefer a restricted read-only scope. |
| **Supabase read-only**                 | Cost per video, tokens, usage, retention.                  | The Supabase connector; if it fails from the cloud proxy, create a read-only Postgres role and give the routine a `SHORTCRAFT_READONLY_DB_URL` environment secret. |
| **Vercel**                             | Spend, function duration, bandwidth, plan.                 | Vercel connector (usage and billing tools).                                 |
| **Vendor spend**                       | fal.ai, ElevenLabs, Anthropic, Resend, Sentry totals.      | Each has a usage page or API; add read-only/admin usage keys as routine environment secrets (e.g. `FAL_ADMIN_KEY`, `ANTHROPIC_ADMIN_KEY`, `ELEVENLABS_API_KEY` with usage scope), or paste monthly totals into §3. |
| **Benchmark budget**                   | Real calls to compare vendors.                             | A cap in this table, e.g. **$10 per week**, and the keys in the routine environment. Default is **$0: analysis only**. Current cap: **$0**. |
| **Fixed costs**                        | Domain, tax software, legal, tools, the owner's time.      | Paste into §2 (amounts and renewal dates).                                  |
| **Outbound network**                   | Read vendor pricing pages (earlier routines were blocked from some).      | Allow-list `fal.ai`, `replicate.com`, `elevenlabs.io`, `anthropic.com`, `vercel.com`, `supabase.com`, `stripe.com`, `cloudflare.com` and the scout's finds in the routine environment's network policy. |

### Suggested connectors, tools and add-ons

- **Stripe connector (live, read-only)**: the single biggest unlock, because MRR is the headline number.
- **Supabase connector** (already used): reconnect it for the routine; fall back to a read-only DB URL.
- **Vercel connector**: `list_billing_charges`, usage and function metrics, so hosting is measured.
- **Sentry and PostHog connectors** (planned in the master plan): failures cost money and funnels drive conversion.
- **Web search and fetch** with an allow-listed network: price scouting.
- **A scheduled weekly `scripts/finance-report.mts`** (once G1 ships) so numbers are the same every run.
- **Skills worth adding** (Claude Code skills or plugins, suggest via `SearchSkills`): spreadsheet output (`xlsx`) for the monthly cost model, `dataviz` for the scoreboard chart, `deep-research` for vendor scans.

---

## 7. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (§7 monetisation, §9 runbook), this file, `git log -20`, open and recent PRs.
- **Files it may change:** this file, `docs/routines/**`, `scripts/finance-*.mts` and bench scripts, `src/config/models.ts`, `src/config/plans*`, `src/features/billing/margin.ts` tests, `src/features/providers/**` (cost-saving swaps behind the registry), a new `src/features/finance/**`, and the finance lines of `TheMasterPlan.md`. It does **not** touch UI files owned by Design, auth, moderation or migrations that it was not asked for. A migration is proposed in the PR and **applied only by Tudor**.
- **Never:** merge, use live secrets beyond what the environment provides, write to Stripe or Supabase data, sign up for or pay a vendor, raise customer prices, or switch the production provider without Tudor's yes. Switches ship disabled behind an env flag or catalog entry.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `npx tsx scripts/margin-report.mts` stays ≥ 3x on every product.
- **Output:** a digest with the scoreboard deltas, MRR ratio, dollars saved or earned per month for each proposal and its payback time, what shipped (PR links), what is waiting on Tudor, and the next item. Send a push notification **only** when something needs action: MRR ratio below 1, margin gate failing, a vendor price change that matters, a failed payment spike, a spend cap about to be hit, an access gap blocking the routine, or a PR ready to review.

---

## 8. Changelog (newest on top)

- **2026-10-18** — Finance track created: charter, cost map, scoreboard, agent structure, backlog and access checklist (`FinancePlan.md`) plus the routine prompt (`docs/routines/finance-cfo.md`). No code changes. (interactive)
