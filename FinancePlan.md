# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (a master agent that splits the work across specialist sub-agents). It sits
> under `TheMasterPlan.md`: the master plan wins on product and priority, this
> file wins on cost, price and cash. Every finance PR updates this file (numbers,
> backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (charter written, no measurements yet)

---

## 1. Charter (owner-configured 2026-10-19, do not change without Tudor)

| Question        | Owner's answer                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal            | **Maximum profit, cash first.** Watch MRR every run; propose and build changes that monetise better and cost less.                                  |
| Priority order  | 1. Cash in (conversion, price, annual prepay, top-ups) · 2. Cash out (provider, hosting and tool spend) · 3. Everything else.                       |
| Known pain      | **fal.ai looks expensive.** Find cheaper or better AI video/image providers and fresh techs; prove them on measured calls, not list prices.         |
| Must be tracked | Tokens/units used per video vs what each video costs, hosting, every subscription and fee: **every single payment**, not only API calls.           |
| Autonomy        | PR-gated, like the other routines: it opens PRs and reports, it never merges and never touches live secrets, live Stripe or production data writes. |
| Asks            | Anything it needs (data, access, connectors) it **asks the owner for in its digest** or configures itself. See §7.                                  |

---

## 2. The routine: master agent + sub-agents

The routine runs as a **master agent** (the "Finance CEO") on the same model and
PR gates as the other routines. It does not do the deep work itself. It reads the
state, picks the highest cash-return items, and fans out to sub-agents in
parallel, each with a narrow brief and read-only access unless it is the one
builder. It merges their findings into one digest and at most one PR.

| Sub-agent                | Job                                                                                                                                                                       | Writes? |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Revenue analyst**      | MRR, new/expansion/churned MRR, ARPU, trial→paid, plan mix, top-up share, refunds, failed payments. Sources: Stripe (Sigma/read), `scripts/metrics-report.mts`.           | no      |
| **Unit-cost auditor**    | Per video: units and tokens used (Anthropic in/out tokens, fal images/MP/seconds, ElevenLabs characters, ffmpeg time) vs `api_cost_usd` vs provider invoices. Finds gaps.  | no      |
| **Overheads auditor**    | Every non-API payment: Vercel, Supabase, Resend, Sentry, domain, ElevenLabs seat, Stripe fees, VAT, tools. Plan tier vs real use, ToS risks, what can be downgraded.       | no      |
| **Provider scout**       | Cheaper or better replacements and new techs for video, image, voice, script and storage (§5). Reads live pricing pages and docs, builds a comparison with sources.       | no      |
| **Pricing strategist**   | Plan and top-up prices, annual plans, credit scale, trial size, overage, expiry and rollover, paywall timing. Models each change with `features/billing/margin.ts`.       | no      |
| **Builder**              | Implements the one approved-by-rule change as a PR: tests, margin gate, docs. Only runs when the master has a change that needs no owner decision first.                  | yes     |
| **Skeptic (reviewer)**   | Tries to break the chosen change: margin gate, refunds, plan limits, quality drop, vendor lock-in, ToS. Gets the diff and the numbers, not the master's conclusion.        | no      |

**Split rule:** spawn only what the run needs. A quiet run (no new data, nothing
changed) uses the analyst and auditor only. Provider scouting and pricing studies
run when their last report is older than 14 days or a trigger in §6 fires. Never
fan out for the sake of it.

### Run loop

1. **Read:** `TheMasterPlan.md` (§7 money, §8 risks, §9 runbook), this file, `git log -20`, open and recent PRs. An item with an open PR is in review, not available.
2. **Measure:** collect the numbers in §3 through the best path in §7. Mark each as _measured_, _computed from the catalog_ or _unknown_. Never present a catalog figure as measured.
3. **Rank:** score every backlog item by `(monthly dollars gained or saved) × confidence ÷ effort`. Cash in beats cash out at equal score.
4. **Fan out:** brief the sub-agents above in one parallel step, each with the question, the files and sources to read, and what is already ruled out.
5. **Decide:** choose at most one PR-sized change. Anything that needs the owner (a price change, a vendor signup, a Stripe write, a migration) becomes a clearly worded ask, not an action.
6. **Gate:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` and `npx tsx scripts/margin-report.mts` all pass in mock mode. A change may never lower a product below the 3x margin gate.
7. **Report:** update §3 and the changelog; send the digest (below). Notify the owner only when the run found something to act on (§6); a flat, healthy run stays silent.

### Digest format

MRR now vs last run (and new / expansion / churn split) · cost per video measured vs catalog · top 3 leaks in dollars per month · what shipped (PR links) · what waits on Tudor, as numbered asks · next item.

---

## 3. Numbers to keep (updated every run)

Status: **nothing measured yet.** First run fills this in and says which cells it
could not fill and why.

| Metric                                                     | Value  | Basis (measured / catalog / unknown) | As of |
| ---------------------------------------------------------- | ------ | ------------------------------------ | ----- |
| MRR (EUR) and subscribers by plan                          | —      | unknown (Stripe is test mode only)   | —     |
| Net MRR change (new / expansion / contraction / churn)     | —      | unknown                              | —     |
| Trial → paid, activation, paid churn                       | —      | `metrics-report.mts` once live       | —     |
| Blended gross margin per video, Standard                   | —      | catalog: ~$0.04–0.05 per 15–30s      | —     |
| Blended gross margin per video, Premium                    | —      | catalog: ~$1.92 per 30s (Kling)      | —     |
| Anthropic tokens per script (in / out) and cost            | —      | unknown: not stored per job          | —     |
| fal spend per Premium clip and per image                   | —      | unknown: invoices not compared       | —     |
| ElevenLabs characters per video and plan headroom          | —      | unknown                              | —     |
| Fixed monthly costs (hosting, DB, email, tools, domain)    | —      | unknown: owner list needed (§7)      | —     |
| Trial burn per signup                                      | $0.14  | catalog (`margin-report.mts`)        | 10-05 |
| Break-even: paying subscribers needed to cover fixed costs | —      | needs the fixed-cost list            | —     |

**Cash-return formula the routine optimises:**
`monthly profit = Σ plan net revenue + top-ups − API cost − fixed costs − Stripe fees − VAT − refunds − trial burn`.
Report it, and the one term that moves it most.

---

## 4. Instrumentation gaps to close first (they block everything else)

These come first because without them every number in §3 stays a guess.

- [ ] **Per-step cost ledger.** `render_jobs.api_cost_usd` is one number priced from the catalog (`src/config/models.ts`), not from provider usage. Add a `job_cost_lines` table (job, step, provider, model, units, unit type, cost USD, source `usage|list`) and write it from the orchestrator. Record real usage: Anthropic `usage.input_tokens/output_tokens`, fal billed seconds/megapixels, ElevenLabs characters. _Migration is owner-applied; the PR ships the SQL, the writer and tests._
- [ ] **Reconcile with invoices.** Monthly: provider dashboard totals vs the ledger sum. Variance above 10% means the catalog price is wrong; fix `costUsdPerUnit` and re-run the margin gate.
- [ ] **`scripts/finance-report.mts`** (read-only): revenue (Stripe), cost lines (ledger), fixed costs (§7 file), profit, margin per plan, tokens per video. `--json` for the digest, same pattern as `metrics-report.mts`.
- [ ] **Fixed-cost file.** `docs/finance/fixed-costs.json` (service, plan, monthly price, billing day, renews, owner). The owner fills it once; the Overheads auditor keeps it honest.
- [ ] **Failed-render cost.** Jobs that fail after paid provider calls refund credits but the API spend is gone. Count it as its own line (cost of failures per week).

---

## 5. Backlog seeds (hypotheses, not facts)

Everything here is **unverified** and must be priced from live pages and a real
test call before it changes code. List prices drifted up to 2x between sources
before (TheMasterPlan §7), so the scout records the source URL and date for each.

**Cash in**

- [ ] Annual plans (prepay, ~2 months free): cash up front, lower churn. Needs Stripe prices (owner OK).
- [ ] Trial: 3,000 credits (~$0.14 burn) is cheap; test whether card-on-file before the trial or a smaller trial lifts paid conversion per euro of burn.
- [ ] Paywall timing and copy at the moment credits run out (the highest-intent moment); top-up upsell next to the plan upsell.
- [ ] Premium "hero shot" tier (AI clip on the hook scene only, ~$0.45 per 15s): sells an AI-video feeling at near-Standard cost. Model its price against the margin gate.
- [ ] Credits expiry/rollover rules: unused monthly credits are pure margin; check the policy against EU consumer law before tightening.
- [ ] Price tests per plan (Pro sits at exactly 3.0x, so any measured cost rise breaks the gate: prefer raising price or credit cost over lowering margin).
- [ ] Add-ons priced on cost plus margin: voice design, re-voice, extra saved voices, watermark-free export.
- [ ] Affiliates and referral credit (30% recurring is in the master plan): count CAC in this file once live.

**Cash out**

- [ ] **AI video:** compare fal.ai's current model with the same models on cheaper hosts or direct APIs, and with other video models. Candidates to price: Kling (direct API), Wan 2.x, LTX-2, Seedance, Hailuo, Veo Fast, Runway; hosts such as Replicate, WaveSpeed, Runware, Novita. Measure cost per usable 5s clip **including retries and rejects**, plus quality on our own prompts.
- [ ] **Fewer paid clips:** animate only the hook scene, reuse clips, shorter clips (3s) with cuts, lower resolution for preview, cache by prompt. Often a bigger saving than a cheaper vendor.
- [ ] **Images:** FLUX schnell is already ~$0.003. Check cheaper hosts or self-hosted open models only if image spend is a visible line.
- [ ] **Script:** Sonnet 5.5 for a ~2k in / 1.5k out script. Test Haiku 5.5 with prompt caching and a tighter schema; measure quality on the eight themes before switching. Tokens per script go in the ledger first.
- [ ] **Voice:** ElevenLabs Flash is ~$0.00075/s. Compare cheaper TTS (Cartesia, Deepgram Aura, OpenAI TTS, self-hosted open models) only after the ledger shows voice is a real share of cost; custom-voice slots are a separate cap.
- [ ] **Storage and egress:** Supabase Storage to Cloudflare R2 (no egress fees) is already in the plan; add a retention policy that deletes old intermediates and unwatched renders.
- [ ] **Hosting plan check:** the app is live on **Vercel Hobby, which is for non-commercial use**. Once real euros come in, Vercel Pro is likely required by its terms. Treat as a known fixed cost and a compliance item, and confirm on Vercel's current terms. Likewise Supabase free-plan limits (pause, size, no leaked-password protection) against real traffic.
- [ ] **Serverless time:** rendering and polling run on Vercel functions; check function duration and memory in Vercel usage, and keep the Hobby/Pro limits in mind when the ffmpeg render gets slower.
- [ ] **Tool sprawl:** list every subscription (domain, Resend, Sentry, ElevenLabs, design tools, Claude/AI seats); cancel or downgrade what the ledger shows is unused.

**Fresh techs worth a spike** (each as a small measured experiment, one at a time): open-weight video models on pay-per-second GPU hosts; image-to-video with fewer steps/lower fps plus ffmpeg frame interpolation; reusable character/background packs rendered once per theme; batch/async provider endpoints that bill less; Anthropic prompt caching and batch pricing for scripts; precomputed hook libraries per theme.

---

## 6. Rules for the Finance CEO routine

- **One PR per run, at most.** Prefer improving an open `cfo/*` PR over a new one. List open and recently closed PRs first.
- **Branches:** `cfo/*`. Never push to `main`, never merge.
- **Files it may change:** this file, `docs/finance/**`, `scripts/finance-report.mts` and other new read-only scripts, `src/config/models.ts` and `src/config/plans.ts` (only with the margin gate green and the change explained in the PR), `src/features/billing/margin.ts` and its tests, new cost-ledger code under `src/features/render/**` and `src/features/metrics/**`, new migrations (**owner applies**), and the Finance lines of `TheMasterPlan.md`. It leaves UI files alone while a `ceo-design/*` PR is open.
- **Needs the owner's explicit OK first:** changing a customer-facing price or credit amount, creating Stripe prices/products, any write to Stripe or Supabase, switching a live provider, buying or cancelling anything, and enabling a vendor that needs a new secret. The routine writes these as numbered asks with the expected dollar effect.
- **Never:** print or store a secret; call a paid provider API in a routine run (mock mode only; a live test is an owner ask with a stated budget cap); lower a product under the 3x gate; present a catalog or list price as measured.
- **Evidence bar:** a provider swap needs a source URL and date for the price, a measured cost on a real call (owner-run, or a capped test the owner approved), and a quality check on our prompts. Without that it stays in the backlog.
- **Notify the owner when:** MRR falls two runs in a row or churn jumps; a product's measured margin drops under 3x; measured cost differs from the catalog by more than 20%; spend or a bill exceeds its expected level; a fixed cost is about to renew that the ledger shows is unused; a clear saving above ~$50/month is ready for a decision; or the routine could not run (access lost, connector down). Silent otherwise.
- **Bar:** same CI bar as the other routines (§2 step 6).

---

## 7. Access, connectors and what the owner must provide

The routine asks for what it lacks in every digest until it has it. State at
creation (2026-10-19):

| Need                                       | Status                                                                                                  | Ask / action                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `tudorfnsn/shortcraft`         | Available (branch + PR).                                                                                | None.                                                                                                                                                                             |
| **Stripe** (MRR, churn, refunds, fees)     | Connector exists but needed authorisation at creation; it only sees the **sandbox**. MRR is test data.  | Owner: authorise the Stripe connector (claude.ai connectors). When live, add the live account **read-only** (a restricted key or connector read scope). Enable Sigma if on the plan. |
| **Supabase** (jobs, ledger, profiles)      | Connector failed to connect from the cloud session at creation (proxy tunnel error); `.mcp.json` is set. | Owner: retry the connector. Fallback: a **read-only Postgres role** and `SUPABASE_URL`/key in the routine's environment so `metrics-report.mts` and the finance report can run.   |
| **Vercel** (hosting bill, function usage)  | Connector available (billing charges, usage, runtime logs). Not used by other routines yet.             | Owner: confirm the routine may read billing/usage for the project (read-only).                                                                                                    |
| fal.ai, ElevenLabs, Anthropic spend        | No API access. Catalog prices only.                                                                     | Owner: monthly invoice totals per vendor (paste into the digest reply or `docs/finance/invoices.csv`), or a **read-only usage/billing key** per vendor if the vendor offers one.  |
| Fixed costs and every other payment        | Unknown.                                                                                                | Owner: fill `docs/finance/fixed-costs.json` (service, plan, price, renewal date), including domain, email, Sentry, tools, bank/company fees and any payment not listed here.     |
| Business facts                             | Unknown.                                                                                                | Owner: company/tax setup (VAT regime, Stripe Tax or manual), target monthly profit and runway, how much monthly test spend the routine may request, markets/currencies.            |
| Web access for live prices                 | Provider pages were blocked from an earlier routine's network (TheMasterPlan §7).                       | Owner: set the routine's environment network policy to allow the provider, docs and pricing domains (fal.ai, replicate.com, elevenlabs.io, anthropic.com, vercel.com, supabase.com). |

**Connectors, tools and add-ons that would help** (suggest, owner decides):

- **Stripe connector** (read) with **Sigma**: the single most useful one: MRR, cohorts, refunds, fee totals without writing a metrics pipeline.
- **Vercel connector**: billing charges and function usage per project; already present.
- **Supabase connector** or a read-only DB role: ledger, cost lines, job outcomes.
- **PostHog** (planned in the stack): funnel from landing → signup → first video → paywall → paid, which is where conversion gains hide. Needs a connector or read key.
- **Sentry**: failed-render and webhook errors translate directly into lost cash and refunds.
- **Resend** read access: lifecycle email sends vs resulting conversions.
- **Provider usage APIs** (OpenAI-style cost endpoints where they exist: Anthropic Usage & Cost API with an admin key, fal and ElevenLabs usage endpoints): exact spend without manual invoices.
- **A bookkeeping source** (bank feed, Wise/Revolut export, or an accounting tool CSV): the only way to see "every single payment" including the ones no API shows.
- **Workflow/sub-agent support in the routine runtime**, so the master can fan out in parallel (§2).

---

## 8. Links

- Main CEO routine `trig_01HJ4PZK4zLRutuBCtMST2Wx` · Design CEO routine `trig_01T9k9zrSgLbcPa6noXKAr8P` (see TheMasterPlan §9).
- Finance CEO routine: **not created yet.** A scheduled session cannot create a cloud routine. Create it at https://claude.ai/code/routines with the prompt in §9, then put its trigger id here.
- Margin gate: `npx tsx scripts/margin-report.mts` · north star: `npx tsx scripts/metrics-report.mts`.

---

## 9. Routine prompt (paste this into a new routine)

Suggested settings: daily, 07:00 UTC (after the main CEO at 06:00, before the Design CEO at 09:00), repo `tudorfnsn/shortcraft`, connectors Stripe + Supabase + Vercel + GitHub, network policy allowing the pricing domains in §7, same model as the main CEO routine.

```
You are the Finance CEO of Shortcraft, a master agent. Your job is to maximise
the app's profit with cash first: watch MRR, cut cost per video, and find
changes that monetise better.

Read first: FinancePlan.md (your charter, rules and backlog), then
TheMasterPlan.md §7-§9, git log -20, and open and recently closed PRs. An item
with an open PR is in review, not available.

Follow FinancePlan.md §2 exactly: measure (mark each number measured / catalog /
unknown), rank by dollars x confidence / effort, then fan out to sub-agents in
parallel (Revenue analyst, Unit-cost auditor, Overheads auditor, Provider scout,
Pricing strategist, Skeptic; Builder only for the one change you will ship).
Brief each one like a peer: goal, files and sources, what is already ruled out.
Do not tell the Skeptic your conclusion.

Close the instrumentation gaps in §4 before optimising on guesses. Compare
provider prices only from live pages with a source URL and date. Open at most
one PR on a cfo/* branch, pass the CI bar and the 3x margin gate, update
FinancePlan.md (§3 numbers, backlog, changelog) and the Finance lines of
TheMasterPlan.md.

Never merge, never use live secrets, never write to Stripe or Supabase, never
change a customer-facing price without the owner's OK, never call a paid
provider in a routine run. Turn anything needing the owner into a numbered ask
with its expected dollar effect, and ask for any data or access you lack (§7).

Send a push notification only under the conditions in §6; otherwise finish with
the digest and stay silent. If you cannot run (access denied, connector down),
notify with exactly what is missing.
```

---

## 10. Changelog (append newest on top)

- **2026-10-19** — Finance track created: charter, master-agent + sub-agent design, instrumentation gaps, backlog seeds, access asks and the routine prompt. No code and no measurements yet. (CEO, scheduled setup)
