# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine. Product and priority calls stay in `TheMasterPlan.md`; this file holds the numbers, the cost sheet, the experiment backlog and the routine's rules.
>
> Last updated: 2026-10-16 (created)

## 1. Charter

**Goal:** maximise cash return. Every run answers four questions in this order: (1) what is MRR and is it moving, (2) what did the last 30 days cost to run, (3) which single change moves profit most, (4) what does the owner need to give me to see more.

**Metrics the routine always reports** (target in brackets):

| Metric                                        | Source                                                        | Target               |
| --------------------------------------------- | ------------------------------------------------------------- | -------------------- |
| MRR gross (EUR) / net (USD)                   | `scripts/finance-report.mts`, cross-checked with Stripe Sigma | up week on week      |
| Net MRR growth, churn (subscriber + revenue)  | Stripe `stripe_analytics` templates                           | churn < 5%/month     |
| Variable API cost per finished video, by tier | `finance-report` (`render_jobs.api_cost_usd`)                 | Standard ≤ $0.05     |
| API cost ÷ net MRR                            | `finance-report`                                              | < 33% (the 3x gate)  |
| Wasted spend (failed jobs)                    | `finance-report`                                              | < 3% of API cost     |
| Fixed costs per month                         | vendor dashboards / Vercel billing connector; owner fills §4  | known to the dollar  |
| Monthly profit and coverage (net MRR ÷ cost)  | `finance-report --fixed=...`                                  | coverage ≥ 1.5x      |
| Trial burn per signup, trial → paid           | `metrics-report` + `margin-report`                            | burn < 5% of Starter |
| Margin gate (every product ≥ 3x)              | `scripts/margin-report.mts`                                   | passes               |

North-star metric stays weekly paying-retained creators (`metrics-report`); finance work must not trade it for short-term margin (no price rise that kills activation).

## 2. How the routine runs (DM master agent + specialists)

The routine's main session is the **master agent ("CFO")**. It does not research or code itself beyond the report. It reads this file, `TheMasterPlan.md` §7 and §10, open + recent PRs, then **spawns the specialists below in parallel (one Agent call each, single message)** with a self-contained brief, and merges their reports into one ranked list. It picks **one** change to implement per run (PR-gated), puts the rest in §5.

| Specialist (agent)          | Job                                                                                                                                                     | Reads                                                         | May write                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| **Revenue analyst**         | MRR, churn, ARPU, plan mix, top-up share, trial → paid, failed payments, refunds, disputes. Proposes pricing/packaging tests.                           | Stripe (Sigma + read API), `metrics-report`, `finance-report` | nothing                            |
| **Cost auditor**            | Real spend per vendor (fal, ElevenLabs, Anthropic, Vercel, Supabase, Resend) vs the catalog's list-price estimates. Flags drift > 20%.                  | Vendor dashboards/billing connectors, §4 sheet, `models.ts`   | nothing                            |
| **Provider scout**          | Finds cheaper/better models and hosts per slot (image, video, voice, script, render, storage). Prices every candidate on the same unit; shortlists 1–3. | Web (Firecrawl/search), provider pricing pages                | `docs/finance/scout-YYYY-MM-DD.md` |
| **Token & unit economist**  | Cost per video by step: tokens in/out for scripts, images, clip-seconds, TTS characters, render compute. Finds the step that dominates cost.            | `render_jobs`, `scenes`, `models.ts`, Anthropic usage         | nothing                            |
| **Monetization strategist** | New revenue ideas (annual plan, credit packs, add-ons, affiliates, watermark/free tier, agency seats), each with a cash estimate and effort.            | §1–§3 of both plans, competitor pricing                       | idea rows in §5                    |
| **Implementer**             | Builds the one chosen change on a `ceo-finance/*` branch with tests, behind the margin gate, then opens a PR.                                           | repo                                                          | files allowed in §6                |

Run the first four in parallel (read-only), then the strategist with their findings, then the implementer. If an agent cannot reach its source, it reports exactly what it needs (key, role, export) rather than guessing; the master turns that into an **Owner ask** in the digest.

## 3. Access today (verified 2026-10-16, cloud session)

| Source                                | State                                                                                                                         | What it gives                                   | Gap                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| GitHub repo                           | OK (`TudorFnsn/Shortcraft`; push to the session branch)                                                                       | code, PRs, CI                                   | —                                                                 |
| Stripe connector                      | Connected, **sandbox only** (`acct_1UKkSC0LHtTQ4zpU`, test mode)                                                              | Sigma MRR/churn templates, read API             | No live account yet, so MRR is test data until go-live            |
| Supabase connector                    | Connected in claude.ai, but **failed from this session** (`ERR_PROXY_TUNNEL`); `.mcp.json` HTTP server also failed            | `render_jobs`, `subscriptions`, ledger via SQL  | Needs a working read-only path (see §7, ask 1)                    |
| Vercel connector                      | Connected; team `tudorfnsns-projects`                                                                                         | `list_billing_charges` (FOCUS cost data), usage | Hobby plan: charges are ~0, still check function/bandwidth limits |
| fal.ai / ElevenLabs / Anthropic spend | **No connector**                                                                                                              | provider invoices                               | Owner pastes monthly totals, or an admin/usage key (ask 2)        |
| Web research                          | Search works; direct provider pages are often blocked from the sandbox; Firecrawl connector is connected but disabled in chat | prices, model news                              | Enable Firecrawl for the routine (ask 3)                          |

Until ask 1 is solved the routine falls back to: the owner pastes `npx tsx scripts/finance-report.mts --json` into §8, and Stripe Sigma for revenue.

## 4. Cost sheet (owner fills the blanks; the routine keeps it current)

Variable costs come from `src/config/models.ts` list prices; **they are estimates, not invoices.** First measured runs (2026-10-08): Standard 15s $0.037, Standard 30s $0.049, Premium 30s $1.92 (priced at $0.12/s; Kling 2.5 Turbo Pro lists ~$0.07/s).

| Line           | Vendor / plan            | USD per month | Measured? | Notes                                                                              |
| -------------- | ------------------------ | ------------- | --------- | ---------------------------------------------------------------------------------- |
| Hosting        | Vercel Hobby             | 0 (?)         | ☐         | Hobby is non-commercial by ToS; Pro is $20/seat once paid users arrive. Budget it. |
| Database/auth  | Supabase Free            | 0 (?)         | ☐         | Pro $25 gives backups + leaked-password protection; needed before real customers.  |
| Voice          | ElevenLabs plan          | ?             | ☐         | Plan also sets custom-voice slots; watch slot count.                               |
| Script LLM     | Anthropic API            | usage         | ☐         | ~$0.04/video at Sonnet 5.5 list.                                                   |
| Images + clips | fal.ai                   | usage         | ☐         | Premium clips dominate (§5 F1).                                                    |
| Email          | Resend free              | 0             | ☐         | 100/day cap.                                                                       |
| Domain         | —                        | ?             | ☐         |                                                                                    |
| Stripe fees    | 1.5% + €0.25 (EEA cards) | % of revenue  | ☐         | Already in the margin gate; check real fee on the first live charge.               |
| Tax            | Stripe Tax or manual VAT | ?             | ☐         | Decide before charging EU consumers (gate assumes 20% VAT).                        |

Provider scan, 2026-10-16 (web search snippets from resellers; **verify on the vendor's page before acting**):

| Slot           | Today                            | Candidates (indicative USD)                                                                                                                        |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image-to-video | fal Kling 2.5 Turbo Pro ~$0.07/s | Wan 2.2 Turbo ~$0.02/s; Wan 2.6 ~$0.07/s; Veo 3.1 Lite $0.05/s (720p); Kling 3.0 ~$0.075–0.11/s; LTX-2.3 Fast $0.06+/s; Seedance 1.5 Pro ~$0.025/s |
| Image          | fal FLUX schnell $0.003/MP       | Replicate, Together ≈ $0.003; Runware and some hosts $0.0005–0.0006 (unconfirmed model)                                                            |

Sources: [fal.ai image-to-video guide](https://fal.ai/learn/tools/best-image-to-video-apis-2026), [AI video pricing normalised](https://invideo.io/blog/ai-video-model-pricing), [Atlas Cloud price comparison](https://www.atlascloud.ai/blog/cheapest-ai-video-generation-api-2026), [Flux API pricing](https://pricepertoken.com/flux-pricing), [techsy image providers](https://techsy.io/en/blog/best-ai-image-providers).

## 5. Backlog (ranked by expected cash per day of work; the routine re-ranks every run)

Status: `[ ]` open · `[~]` in review/in progress · `[x]` shipped · `[✗]` rejected.

- [ ] **F1. Premium video cost.** Premium is the only product with real cost ($1.9 per 30s) and Pro sits at exactly 3.0x. Scout runs the same 3 test scenes on Wan 2.2 Turbo, Wan 2.6, Kling 3.0 and Veo 3.1 Lite through fal and one direct/alternative host (WaveSpeed, Replicate, Atlas Cloud, Runware). Output: cost per 5s clip, render time, a quality verdict with the clips linked. If one holds quality at ≤ half the price, add it as a catalog row behind `FAL_VIDEO_MODEL`, then lower the premium credit price or widen Pro's headroom. Needs the owner's eye on quality (Owner ask 4).
- [ ] **F2. Hero-shot Premium tier** (AI clip on scene 1 only, stills for the rest, ~$0.45 per 15s vs ~$1.10). Priced near Standard, it opens Premium to Starter. Cash effect: upgrade pressure Starter → Pro without the cost.
- [ ] **F3. Cost telemetry per step.** Today only a single `api_cost_usd` per job exists, so "tokens vs spend" is invisible. Add a `render_costs` table (job, step, vendor, model, units, unit, usd, tokens_in, tokens_out) written by the orchestrator, plus a `finance-report` section by vendor and step. Migration is additive; **owner applies it**. Also record provider-reported usage (Anthropic `usage`, fal billed seconds) so the catalog can be reconciled to invoices.
- [ ] **F4. Annual plans** (≈2 months free): cash up front, lower churn, lowers Stripe's fixed-fee share. Needs Stripe prices + `/pricing` toggle; webhook already keys on price metadata. Test in Stripe sandbox first.
- [ ] **F5. Trial and free-tier abuse control.** 3,000 trial credits ≈ $0.14 burn per signup; one person with many emails multiplies it. Add email-domain/IP velocity check and a card-on-file trial variant for Premium. Measure trial → paid first (`metrics-report`).
- [ ] **F6. Prompt caching + cheaper script model.** The script call is ~$0.04 per video: Haiku-class for Standard (`ANTHROPIC_SCRIPT_MODEL`) and prompt caching of the static system prompt. Small, safe, measurable against F3. Check the current model and cache prices in the Anthropic pricing page first.
- [ ] **F7. Storage/egress.** Move media to Cloudflare R2 behind `MediaStore` (no egress fees) and add a retention policy (delete renders after N days unless downloaded/posted). Only worth it once storage or egress shows on a bill.
- [ ] **F8. Top-up and upgrade nudges.** In-app prompt when a creator has < 1 video of credits left (top-up) or hits a plan limit (upgrade), reusing `cheapestPlanAllowing`. Revenue analyst sizes it from the top-up share first.
- [ ] **F9. Dunning and win-back.** Stripe smart retries + a failed-payment email through the Resend lifecycle cron; cancel-flow survey with a pause option. Needs live Stripe data to size.
- [ ] **F10. Affiliate / referral** (TheMasterPlan §6.2): 30% recurring is a cash cost, so model it against net MRR before building.
- [ ] **F11. Batch / off-peak inference.** Use batch or queued pricing where a provider offers it (Anthropic batch, cheaper fal queue tiers) for non-urgent renders; offer "ready in an hour" at a discount.
- [ ] **F12. Vercel/Supabase plan right-sizing.** Move to paid plans exactly when the ToS or limits require (commercial use, backups) and not before; the Cost auditor re-checks usage vs plan every run.

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` §1, §7, §9, §10 and the top of §11; this file; `git log -20`; open and recently closed PRs (list them before picking anything; an item with an open PR is in review).
- **Measure before you change.** No pricing or provider change ships without a number from §1's table, a before/after estimate, and the margin gate passing (`npx tsx scripts/margin-report.mts`).
- **One change per run, PR-gated**, on a `ceo-finance/<slug>` branch. Never merge, never push to `main`.
- **Owner approval required (propose in the digest, never do):** changing customer prices or credit grants, adding a paid vendor or plan upgrade, any Stripe write (even sandbox objects) or live-mode action, applying migrations, handling live secrets, spending money on provider test runs above $1.
- **Files it may change:** `src/features/finance/**`, `scripts/finance-report.mts`, `scripts/margin-report.mts`, `src/config/models.ts` (catalog rows and cost values only, gate must pass), `src/features/providers/live/**` (new adapters behind the registry), `tests/**` for those, `docs/finance/**`, this file, and the finance lines of `TheMasterPlan.md`. It leaves UI files alone while a `ceo-design/*` PR is open, and never touches auth, webhooks, RLS or moderation.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Honesty:** label every figure as measured (invoice or DB), estimated (list price) or sourced from a blog snippet. Reseller blogs disagree by 2x; never act on one.
- **Output:** a digest. Notify the owner when MRR moved, a cost line drifted > 20%, the gate failed, a cheaper provider passed the quality test, or the routine lacks access to something it needs. If nothing changed, stay silent.

## 7. Owner asks (answer by editing this list or pasting into the routine's chat)

1. **Supabase read path from the cloud.** The claude.ai Supabase connector and `.mcp.json` failed from this session (`ERR_PROXY_TUNNEL`). Easiest: create a **read-only Postgres role** (`select` on `render_jobs`, `subscriptions`, `credit_transactions`, `profiles`) and store its connection string as a routine environment variable `FINANCE_DB_URL`; or re-authenticate the connector. The report script then runs with no service-role key in the routine.
2. **Spend totals.** Last 30 days from fal.ai, ElevenLabs, Anthropic (console → usage), plus the plan prices you pay for Vercel, Supabase, ElevenLabs, Resend, domain. Paste into §8 monthly, or create admin/usage API keys scoped read-only and add them as routine secrets (`FAL_ADMIN_KEY`, `ANTHROPIC_ADMIN_KEY`).
3. **Enable connectors for the routine:** Firecrawl (provider price pages the sandbox can't open). Later: Stripe **live** account when you go live.
4. **Quality calls.** When the scout posts a clip comparison (`docs/finance/`), reply which model's look is acceptable.
5. **Business facts the routine cannot see:** current subscribers outside Stripe, ad spend, any contracts or credits (fal/Anthropic startup credits change the cost picture), your target monthly profit, and your tolerance for raising prices.

## 8. Latest numbers (the routine overwrites this block each run)

_No run yet. First run: `npx tsx scripts/finance-report.mts --days=30 --fixed="Vercel=0,Supabase=0,ElevenLabs=?,Resend=0"`._

## 9. Suggested connectors, tools and add-ons

| Tool                                     | Why                                                                                         | Priority   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| Stripe **live** connector account        | Real MRR, churn, refunds, fees via Sigma                                                    | at go-live |
| Supabase read-only DB access (see ask 1) | Per-job cost, burn, cohorts without human copy-paste                                        | now        |
| Firecrawl (already connected, enable it) | Reads provider pricing pages the sandbox blocks                                             | now        |
| Vercel billing (connected)               | `list_billing_charges` for hosting spend; `get_runtime_logs` for slow/failed renders = cost | now        |
| Google Sheets/Drive connector            | Keep the cost sheet and monthly P&L somewhere you can edit by hand                          | soon       |
| Gmail connector (read-only)              | Pulls vendor invoices/receipts (fal, ElevenLabs, Anthropic) so §4 is invoiced, not guessed  | soon       |
| PostHog (or Vercel Analytics)            | Visitor → signup → paid funnel, the missing half of CAC                                     | soon       |
| Sentry                                   | Failed renders are wasted spend; alert on step failure rate by provider                     | soon       |
| Anthropic Console usage/cost API         | Exact script-token spend                                                                    | with F3    |
| Meta/TikTok Ads connector                | Only once paid acquisition starts (CAC vs first-month net revenue)                          | later      |

## 10. Routine

- **Routine name:** "Shortcraft Finance CEO" · suggested 07:00 UTC daily (after the main CEO at 06:00, before Design at 09:00; weekly deep run on Mondays), Opus-class, PR-gated, `ceo-finance/*` branches.
- **Prompt to paste** (create it at https://claude.ai/code/routines, attach the Stripe, Supabase, Vercel and Firecrawl connectors, repo `TudorFnsn/Shortcraft`, and the `FINANCE_DB_URL` env var if set):

```
You are the Finance CEO for Shortcraft. Work to FinancePlan.md in the repo.
1. Read FinancePlan.md, TheMasterPlan.md (§1, §7, §9, §10), git log -20, and list open + recently closed PRs.
2. Get the numbers: run `npm ci` then `npx tsx scripts/finance-report.mts --json` (and scripts/margin-report.mts, scripts/metrics-report.mts) if a DB path exists; otherwise use Stripe Sigma and the numbers pasted in FinancePlan §8. Check Vercel billing charges.
3. As the master agent, spawn in parallel (one message, self-contained briefs): Revenue analyst, Cost auditor, Provider scout, Token & unit economist. Then the Monetization strategist with their findings. Follow the table in FinancePlan §2.
4. Merge their reports, re-rank the §5 backlog by expected cash per day of work, update §3 (access), §4 (cost sheet) and §8 (numbers).
5. Implement ONE item via the Implementer rules in §6 on a ceo-finance/<slug> branch, open a PR. Never merge, never change customer prices, never write to Stripe or the DB, never touch live secrets: propose those in the digest.
6. Send a PushNotification only if MRR moved, a cost line drifted over 20%, the margin gate failed, a cheaper provider passed, or you lack access you need. Lead with the single most important sentence, then what to approve. Stay silent otherwise.
```

## 11. Changelog

- **2026-10-16** — Finance track created: this plan, `src/features/finance/unit-economics.ts` (MRR net of VAT + fees, API cost by tier, waste on failed jobs, profit and coverage), `scripts/finance-report.mts`, 5 tests. Access check: Stripe (sandbox) and Vercel connect, Supabase failed from the cloud session, no vendor-spend connectors. No migration, no dependency, no runtime change. (Finance CEO, interactive setup)
