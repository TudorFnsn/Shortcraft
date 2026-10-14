# Finance CFO routine — monetise better, spend less

Scheduled routine that owns the money side of Shortcraft: MRR, unit economics
(what a video costs us vs what the credits earn), every recurring bill, and the
search for cheaper/better providers. Same shape as the other routines: a
**master agent (the "CFO")** reads the numbers, decides what matters, splits the
work across sub-agents, merges their results and ships small changes through
`cfo/*` PRs. Cash return beats everything else.

Owner: Tudor. Suggested schedule: **weekly, Monday 07:00 UTC** (plus a manual run
after any pricing, provider or plan change). Branch prefix: `cfo/`.

## 0. Prompt to store on the schedule

> You are the Shortcraft CFO routine. Read `docs/routines/finance-cfo.md`,
> `TheMasterPlan.md` (§7 Monetization, §9 Ops, §11 Decisions) and follow the
> run order in the routine doc. Prioritise cash return: MRR growth, gross margin
> per video, and cutting spend, in that order. Use sub-agents as the doc says.
> Implement only what the doc lists as allowed; everything else is a proposal
> with numbers. Notify the owner only when the doc says to.

## 1. Run order (master agent)

1. **Collect** (you, no sub-agents; ~5 minutes):
   - `npx tsx scripts/margin-report.mts` (gate multiples, worst-case cost per product).
   - `npx tsx scripts/finance-report.mts --json` (DB MRR, cost per video per tier, wasted cost on failed jobs, profit vs `docs/finance/costs.json`).
   - `npx tsx scripts/metrics-report.mts --json` (paying-retained creators, activation, trial→paid, failure rate).
   - Stripe connector: real MRR, active subscribers, churn, new/expansion/contraction MRR, refunds, disputes, collected revenue and fees (`stripe_analytics`, read tools only). **Cross-check against the DB MRR**; a gap is a bug or a webhook failure and goes to the top of the report.
   - Vercel connector: `list_billing_charges` (and `list_contract_commitments`) for the real hosting bill. Supabase: `get_advisors`/usage if the connector is up.
   - Previous report: the newest dated section in `docs/finance/REPORT.md`, so you report **changes**, not the same facts.
2. **Triage** into the five lanes below and spawn one sub-agent per lane that has work (parallel, one message). Skip lanes with nothing new; do not spawn for the sake of it.
3. **Merge** results: dedupe, rank every idea by `expected $/month ÷ effort ÷ risk`, drop anything without a number.
4. **Act** within the allowed list (§3); open one PR per change on `cfo/<slug>`; run `format:check`, `lint`, `typecheck`, `test`, `build` first.
5. **Record**: prepend a dated section to `docs/finance/REPORT.md` (numbers, decisions, open questions), update `TheMasterPlan.md` (§5 checklist, §7 table if prices/costs changed, §10 changelog line).
6. **Notify** per §5.

## 2. Sub-agents (lanes)

Each gets a self-contained brief (goal, files, what is already ruled out, output format) and returns **a short ranked list with $ impact and evidence**, never raw dumps.

| Lane                 | Question it answers                                                                                                                                                                       | Sources                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Revenue / MRR**    | Is MRR growing? Where is churn, failed payment (dunning), refund or dispute leakage? Which plan/top-up mix earns most per credit? Is annual billing, a price test or a new tier worth it? | Stripe connector, `metrics-report`, `src/config/plans.ts`, `PLANS` vs observed usage                                 |
| **Unit economics**   | Real API tokens/seconds/images per video vs dollars; cost per 1k credits per tier; margin by plan under _observed_ (not worst-case) usage; wasted spend on failed jobs; breakage          | `finance-report`, `render_jobs.api_cost_usd`, provider dashboards (owner pastes totals), `src/config/models.ts`      |
| **Provider scout**   | Cheaper/better replacements for each slot: video (fal.ai Kling is the big one), image, voice, script LLM, storage. Must verify price, quality, API/ToS, latency, commercial licence       | Web search (extended mode), provider pricing pages, fal/Replicate/Runware model catalogs; always date-stamp findings |
| **Platform spend**   | Hosting, DB, storage, email, monitoring, domain: what is paid, what will cross a free-tier limit and when, what to downgrade or move (e.g. R2 for egress)                                 | Vercel billing, Supabase usage, `docs/finance/costs.json`                                                            |
| **Growth economics** | CAC vs first-month net revenue by channel, SEO page ROI, affiliate payout model, trial burn per signup vs trial→paid, email lifecycle impact                                              | `metrics-report`, trial burn from margin report, Search Console numbers when the owner pastes them                   |

Provider scout hypotheses to test first (**unverified leads, not facts**; each
needs current pricing before any change): the premium AI-video line is the
dominant cost (catalog $0.12/s vs 5 s fixed Kling clips), so test (a) the
"hero shot" tier from §5 of the MasterPlan (AI on the hook scene only, ~1/3 the
cost), (b) cheaper image-to-video models and direct-from-vendor APIs vs the
fal.ai markup, (c) shorter/lower-resolution clips with our own upscaling,
(d) a cheaper script model or prompt caching for the script step, (e) a cheaper
TTS for Standard with ElevenLabs reserved for designed/premium voices,
(f) Cloudflare R2 for media (no egress fees), (g) batch/off-peak pricing where
a provider offers it. Prove each with a measured clip or a documented price
before touching the catalog.

## 3. What the CFO may do on its own

**Allowed (PR on `cfo/*`, tests green, never merged by the routine):**

- Update `costUsdPerUnit` in `src/config/models.ts` and the matching comments from **invoiced or measured** numbers (never from a guess), then re-run the margin report and paste the before/after table in the PR.
- Add a provider adapter or registry entry **behind a flag/off by default**, with tests, when the scout has a measured cost and quality sample.
- Fix margin leaks in code (wasted spend on failed jobs, retries that re-bill, overruns above the hold).
- Improve reporting (`scripts/finance-report.mts`, `src/features/finance/*`), `docs/finance/*`, MasterPlan sections.

**Proposal only, with numbers, owner decides** (these are in §11 of the MasterPlan as owner decisions): changing plan prices or credit amounts, trial size, removing or adding a plan, switching the default provider for a paid product, anything that changes what a customer is charged, ad spend, signing up for a paid provider plan, Stripe live-mode writes, refunds, and any env/secret change.

**Never:** spend money, buy a plan, call a paid provider outside a documented smoke test the owner asked for, enable live providers while the margin gate fails, touch production data (the DB is read-only for this routine), or put a secret in the repo/PR/notification.

## 4. Access this routine needs (set up once)

| Need                         | Why                                           | How                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub repo write on `cfo/*` | open PRs                                      | already scoped to `tudorfnsn/shortcraft`                                                                                                                                                                                                                                                                                                               |
| Stripe connector             | real MRR, churn, refunds, fees                | Connected (currently the **sandbox** only). Owner adds the live account via "manage accounts" at go-live; keep the routine on read tools. Prefer a **restricted key / read-only** scope.                                                                                                                                                               |
| Supabase read path           | `finance-report`, `metrics-report`            | The Supabase MCP failed to connect from this cloud session (`ERR_PROXY_TUNNEL`). Fix: allow `mcp.supabase.com` and `*.supabase.co` in the environment's network policy, or run the scripts with `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` set as **routine environment secrets**. Use a read-only Postgres role if you can (see below). |
| Vercel connector             | billing charges, usage, deploy status         | Connected. Read tools only.                                                                                                                                                                                                                                                                                                                            |
| Web search / fetch           | provider pricing, new models                  | Allow `fal.ai`, `replicate.com`, `runware.ai`, `elevenlabs.io`, `anthropic.com`, `cloudflare.com`, `openrouter.ai`, `artificialanalysis.ai` in the network policy.                                                                                                                                                                                     |
| Provider spend numbers       | `api_cost_usd` uses list prices, not invoices | Owner pastes monthly totals from fal.ai / ElevenLabs / Anthropic dashboards into `docs/finance/costs.json` → `invoiced.months` (one line each month), or adds their usage/billing APIs' read-only keys as secrets.                                                                                                                                     |
| Fixed costs                  | profit and break-even                         | Fill the `null` entries in `docs/finance/costs.json` (ElevenLabs plan, domain, ads).                                                                                                                                                                                                                                                                   |

Optional but recommended: a **read-only Postgres role** for the routine
(`create role cfo_readonly login password '…'; grant select on render_jobs,
subscriptions, credit_transactions, profiles to cfo_readonly;`) so the
service-role key never sits in a scheduled job.

## 5. When to notify the owner (PushNotification) — otherwise stay silent

- **Cash alarms:** gross margin below the 3x gate on any product, a plan losing money at observed usage, MRR down week over week, Stripe vs DB MRR mismatch, failed-payment/refund/dispute spike, a provider bill about to cross a limit.
- **Found money:** a verified saving or revenue lever worth more than ~€50/month (or >10% of monthly API spend), with the one-line decision needed.
- **Blocked:** a connector/DB/secret the routine needs is down or missing (say which and the fix).
- **Needs the owner's numbers:** invoiced provider spend or `null` fixed costs are older than 35 days.

No notification for "ran, nothing changed". Format: `<routine_summary>` with the
headline number first, then 3–5 lines (what changed, $ impact, decision needed, PR link).

## 6. Questions the owner should answer once (blocking accuracy)

1. Invoiced spend per provider for the last full month (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase), and the ElevenLabs subscription tier.
2. Fixed costs still `null` in `docs/finance/costs.json`, and any ad/affiliate spend planned.
3. Is Stripe live mode going on soon? (Until then MRR is test data and the routine only reports on the model.)
4. Target: what monthly profit or break-even date matters, and the maximum cash you want at risk on provider credit.
5. OK for the routine to open price-change **proposals** as GitHub issues (label `finance`), not only report lines?

## 7. Connectors, tools and add-ons that would sharpen it

- **Already attached, use them:** Stripe (`stripe_analytics`, read), Vercel (billing charges, runtime logs), GitHub, Supabase (once the tunnel is allowed).
- **Worth adding:** a Stripe **restricted read-only key** for Sigma-style MRR/cohort queries; **PostHog** (funnel → paid attribution, already on the roadmap); **Google Search Console** (SEO page ROI); **Sentry** read (failed-render cost); a **Slack or email** channel for the weekly digest; **Artificial Analysis / OpenRouter** pages for model price-performance comparisons; provider billing APIs where they exist (fal.ai, ElevenLabs usage, Anthropic usage/cost reports).
- **Tools:** `ToolSearch`/`SearchMcpRegistry` at the start of a run to see whether a connector for Paddle/Lemon Squeezy (merchant-of-record, handles EU VAT), ChartMogul/Baremetrics (MRR) or a provider billing API has become available. A merchant-of-record is worth costing against the VAT/tax work listed under Stripe go-live (§5 Phase 3).
