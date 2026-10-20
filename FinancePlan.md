# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on cost, pricing experiments and cash. Every finance PR updates
> this file (baseline, backlog, changelog) in the same change.
>
> Last updated: 2026-10-20 (track created; no measurements yet)

---

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question       | Owner's answer                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal           | **Maximum profit, cash return first.** Every run starts from MRR and net cash, and picks the change that moves cash most per unit of effort and risk.                     |
| Always check   | **MRR, MRR growth, gross margin, API cost per video, free-trial burn, fixed costs, break-even subscribers.** Source: `scripts/finance-report.mts` (§3).                   |
| Look for       | New ideas and fresh tech that improve the economics: cheaper or better models and providers (fal.ai video looks expensive), pricing and packaging, retention.             |
| Analyse        | Tokens and units consumed per video vs what each video costs (LLM tokens, image MP, video seconds, TTS characters, render), plus hosting and every other bill.            |
| Autonomy       | **Research + PR-gated code**, same as the main CEO. Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe or live providers.                  |
| Cadence        | Daily cloud routine **"Shortcraft Finance CFO"**, 07:30 UTC (after the main CEO at 06:00, before the Design CEO at 09:00). Prompt: `docs/routines/finance-cfo-prompt.md`. |
| Ask for access | If a number needs data the routine cannot read, it asks (digest + notification) and proposes how to wire it. It never guesses a cost and presents it as measured.         |

---

## 2. How the routine works (master agent + workers)

The Finance CFO run is a **master agent** that reads this file, `TheMasterPlan.md` §7 and the live numbers, then **splits the work across worker agents in parallel** and merges their results. The master owns the decision and the PR; workers only investigate and report.

| Worker                           | Question it answers                                                                                                                                                               | Reads                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Revenue analyst**              | What is MRR, ARPU, churn, trial → paid, top-up share? Which plan or pack leaks? Where does a price, annual plan or dunning change pay most?                                       | `finance-report`, `metrics-report`, Stripe connector (read-only)    |
| **Cost auditor**                 | What does one video cost, by step and tier? Tokens/units per video vs cost. Which job shapes burn the margin? Failed-job waste?                                                   | `render_jobs.api_cost_usd`, `config/models.ts`, provider dashboards |
| **Provider scout**               | Is there a cheaper or better model/provider for script, image, video, voice, render at equal quality? Real price pages and free-credit programs only.                             | Web search/fetch, provider docs                                     |
| **Infra and fixed-cost auditor** | Hosting, database, email, monitoring, domain and tool bills: any plan that is over-sized, unused or replaceable?                                                                  | Vercel connector (billing), Supabase connector, `FinancePlan` §4    |
| **Experiment designer**          | Pricing and packaging tests (annual discount, Premium hero-shot tier, credit expiry/rollover, trial size, watermark rules) with the expected cash effect and a way to measure it. | Plans, `entitlements.ts`, funnel numbers                            |
| **Implementer**                  | Builds the one winning change (code, tests, docs) on a `ceo-finance/*` branch, keeping the margin gate green.                                                                     | Repo                                                                |

Master loop: (1) read plans, list open and recently closed PRs; (2) run the report and refresh §3; (3) fan out the five analysts in one message; (4) rank their proposals by **cash per week gained ÷ effort**, discarding anything unverified or needing live spend; (5) hand the winner to the implementer (or, if it needs owner action, put it in §6); (6) update this file and send the digest. Quiet runs (nothing new, nothing red) end silently.

---

## 3. Baseline (refresh every run)

`npx tsx scripts/finance-report.mts --fixed=<USD per month>` (read-only; `--json` for the digest). It prints MRR gross/net, ARPU, 30-day net cash in, API cost (and the share burned by users who never paid), fixed costs, contribution, gross margin, break-even subscribers, API cost per video by tier and credits charged per API dollar. Definitions: `src/features/metrics/finance.ts`.

Current numbers: **not measured yet.** The report needs `.env.local` with the Supabase service role, which the cloud routine does not have (§6, item 1). Until then, the margin gate (`scripts/margin-report.mts`) is the only quantitative source, and it uses list prices, not measured costs.

Known facts from `TheMasterPlan.md` §7 (2026-10-08): 15s Standard ≈ $0.07 API cost for 2,024 credits; 15s Premium ≈ $1.10 (Kling v2.5 turbo, 3 scenes) vs 26,504 credits; hero-shot Premium ≈ $0.45. Gate passes with Pro at exactly 3.0x, so any measured cost increase blocks live mode.

### Data gaps the routine should close (in order)

1. **Cost by step is not stored.** `render_jobs.api_cost_usd` is one total per job, and LLM tokens (`response.usage`) are priced and discarded in `anthropic-script.ts`. Without per-step usage nobody can compare tokens or units to cost, or see which step overruns. Proposed: an additive `provider_usage` table (`job_id, step, provider, model, units, unit_kind, cost_usd`) written by the orchestrator. Needs a migration the owner applies (expand-only).
2. **Provider invoices are not reconciled.** Compare `sum(api_cost_usd)` per provider with the fal.ai, ElevenLabs and Anthropic billing pages monthly. The gap is the margin we don't know we are losing.
3. **Fixed costs are not recorded.** §4 holds them; the owner fills the amounts.
4. **Stripe revenue is read from our DB.** Cross-check with Stripe (Sigma or the connector) once it is authorised: refunds, disputes, failed renewals and real fee rates differ from the gate's assumptions.

---

## 4. Fixed monthly costs (owner fills in; the routine keeps it current)

| Item                         | Plan today | USD / month | Notes                                                           |
| ---------------------------- | ---------- | ----------- | --------------------------------------------------------------- |
| Vercel                       | Hobby      | ?           | Hobby forbids commercial use; Pro is likely required at launch. |
| Supabase                     | ?          | ?           | `ShortCraft`, eu-west-1; free tier pauses idle projects.        |
| ElevenLabs                   | ?          | ?           | Custom-voice slots cap sign-ups (§8 of the master plan).        |
| Resend                       | ?          | ?           | Lifecycle email.                                                |
| Sentry                       | ?          | ?           |                                                                 |
| Domain                       | -          | ?           |                                                                 |
| Claude (routines, dev)       | ?          | ?           | CEO, Design CEO and this routine run on the owner's plan.       |
| **Total (`--fixed=` value)** |            | **?**       |                                                                 |

---

## 5. Backlog of levers (hypotheses, **none verified**; the routine proves or kills each with real prices or measurements)

Each item has an owner-visible status: `[ ]` open · `[~]` in review (PR) · `[x]` shipped · `[✗]` killed (with why).

**Cost: models and providers**

- [ ] **Premium video: replace or tier the model.** Compare Kling v2.5 turbo on fal.ai against direct vendor APIs and other hosts (Kling direct, Hailuo/MiniMax, Wan 2.x on cheaper GPU hosts, Seedance, LTX-2, Luma, Runway) for $/second at 720p–1080p, queue time and watermark/licence terms. Candidate hosts for the same open models: Replicate, Together, Novita, WaveSpeed, Runware, RunPod serverless. Measure on real calls, as §7 of the master plan insists.
- [ ] **Hero-shot Premium** (AI clip on scene 1 only) as the default Premium shape: ~$0.45 vs ~$1.10 per 15s video. Needs a pricing decision from Tudor.
- [ ] **Image generation:** FLUX schnell is already ~$0.003. Check whether Runware/Together/self-hosted beats it, and whether fewer images per video (reuse a scene image with pan/zoom) is invisible to viewers.
- [ ] **Voice:** ElevenLabs is the likely largest per-video line after video. Price Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural voices and open models (e.g. Kokoro) against it, keeping word timings for subtitles. Keep ElevenLabs for the voices people pay for (Voice Studio).
- [ ] **Script LLM:** Sonnet 5.5 at ~$0.04/video; test Haiku 5.5 on the same scripts (quality gate: scene count, hook, moderation pass), prompt caching on the system prompt, and the Batch API for non-interactive jobs.
- [ ] **Failed-job waste:** `failed` jobs refund the user but the provider spend stays. Find the steps that fail after paid calls and add a cheap pre-check or an earlier abort.
- [ ] **Caching and reuse:** reuse voice previews, theme stills and re-voiced copies (no new image/video spend); dedupe identical prompts.
- [ ] **Fixed costs:** right-size Supabase, Vercel and ElevenLabs plans; drop unused tools.

**Revenue: price, packaging, retention**

- [ ] **Annual plans** (2 months free): cash up front, lower churn. Stripe prices exist as `stripePriceIdYearly`; check what is wired.
- [ ] **Trial size:** trial burn is the acquisition cost (gate: $0.25 per signup). Test a smaller trial or a card-on-file trial against activation.
- [ ] **Credit expiry/rollover rules:** unused monthly credits are pure margin, but hurt retention; decide with data.
- [ ] **Top-up nudges** at low balance and at the moment a video is blocked; **Premium upsell** from the Standard result page.
- [ ] **Dunning:** Stripe smart retries and failed-payment emails recover a measurable share of churn; check they are on.
- [ ] **Price test:** raise Starter or add a €9 entry tier only after trial → paid is measured; never change prices without Tudor.
- [ ] **Affiliate/referral economics** (30% recurring in the master plan): model payback before launching.
- [ ] **Watermark policy** as a lever: free trial keeps "Made with Shortcraft"; test a paid-removal add-on.

---

## 6. Access and decisions the routine needs from Tudor

1. **Read-only database path for the cloud routine** (without it, every number above stays unmeasured). Preferred: re-authorise the **Supabase** claude.ai connector (it failed to connect from the cloud on 2026-10-20 with `ERR_PROXY_TUNNEL`) and allow read-only SQL; or run `finance-report --json` locally on a schedule and commit the JSON to a private branch.
2. **Authorise the Stripe connector** in claude.ai connector settings (it needs sign-in). Read-only use only: MRR, churn, refunds, disputes, fees, failed payments, Sigma queries.
3. **Vercel connector** is connected: the routine will use `list_billing_charges` and usage to track hosting spend. Confirm it may read billing.
4. **Provider billing data:** fal.ai, ElevenLabs and Anthropic usage. Easiest is a monthly CSV/usage export pasted into `docs/finance/`, or a read-only/admin usage key stored as a routine secret. Never put keys in the repo.
5. **Fill §4** (fixed costs) and say which provider free credits or startup programs the account already has.
6. **Decide:** hero-shot Premium as default; trial size; annual-plan discount; whether routine PRs may change prices (default: no, proposals only).

## 7. Suggested connectors, tools and add-ons

| Tool                                         | Why                                                                                      | Status                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Stripe** connector                         | Real MRR, churn, refunds, fee rates; Sigma for cohorts.                                  | Connected but **needs authorisation**        |
| **Supabase** connector                       | Read-only SQL for `finance-report`; advisors to spot over-sized DB.                      | Configured, **failed to connect** 2026-10-20 |
| **Vercel** connector                         | Billing charges, usage, function duration and bandwidth (the render runs on serverless). | Connected                                    |
| **GitHub** connector                         | PRs and CI.                                                                              | Connected                                    |
| PostHog (or Plausible) connector             | Funnel: visitor → signup → first video → paid. Needed before spending on ads.            | Not connected                                |
| Sentry connector                             | Failure causes that waste provider spend.                                                | Not connected                                |
| Resend / email-metrics                       | Lifecycle email → conversion.                                                            | Not connected                                |
| A Google Sheets/Drive connector              | Where Tudor can keep §4 and invoices without touching the repo.                          | Optional                                     |
| Claude Code `/loop`, routines, Workflow tool | Fan-out for the five analysts (the routine prompt uses subagents).                       | Available                                    |
| Anthropic Admin/Usage API key (read-only)    | Exact script-LLM spend and token counts, to reconcile `api_cost_usd`.                    | Needs an admin key as a routine secret       |

---

## 8. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (§1, §7, §8), this file, `git log -20`, open and recently closed PRs (an item with an open PR is in review, not available).
- **One shipped change per run at most**, from the ranked proposals. Prefer finishing an open `ceo-finance/*` PR.
- **Evidence rule:** a number is "measured" only if it came from our DB, Stripe or a provider invoice/dashboard. List prices and snippets are "researched", and the plan says which is which. Don't change `costUsdPerUnit` from a snippet.
- **Money-safety rules:** never enable live providers, switch Stripe to live mode, change a real price or create Stripe objects; those are proposals for Tudor. Read-only on connectors; any write needs the owner's explicit OK.
- **Files it may change:** `FinancePlan.md`, `docs/finance/**`, `docs/routines/finance-cfo-prompt.md`, `scripts/finance-*.mts`, `src/features/metrics/finance*.ts`, tests under `tests/metrics`, the Finance lines of `TheMasterPlan.md`. For an approved change it may also touch `src/config/models.ts`, `src/features/providers/**` (new adapter behind the margin gate) and a new additive migration file (not applied). It never touches UI files (Design track) or secrets.
- **Gate:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `scripts/margin-report.mts` still passes.
- **Notify** (PushNotification) only for: MRR drop, margin gate failing, a measured cost spike, a provider swap that saves real money (with the number), a blocker on access (§6), or a PR ready for review. Otherwise stay silent.
- **Output:** a digest with the baseline numbers, what moved, PR links, what is waiting on Tudor, and the next item.

---

## 9. Links

- Routine: `trig_` id to be added once created (see `docs/routines/finance-cfo-prompt.md`).
- Main CEO routine: `trig_01HJ4PZK4zLRutuBCtMST2Wx` · Design CEO routine: `trig_01T9k9zrSgLbcPa6noXKAr8P`.

---

## 10. Changelog

- **2026-10-20** — Finance track created: this plan, the routine prompt (`docs/routines/finance-cfo-prompt.md`), `features/metrics/finance.ts` (MRR, net cash, cost per video, trial burn, break-even; pure and tested) and `scripts/finance-report.mts` (read-only). No runtime change, no migration, no new dependency. Nothing measured yet; access requests in §6. (Finance CFO, interactive)
