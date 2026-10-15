# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (a master agent that splits the work across worker agents; see §3). It sits
> under `TheMasterPlan.md`: the master plan wins on product and priority, this
> file wins on cost, pricing and vendor choices. Every finance PR updates this
> file (numbers, backlog, changelog) in the same change.
>
> Last updated: 2026-10-15 (routine defined; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-15, do not change without Tudor)

| Question | Owner's answer |
| --- | --- |
| Goal | Maximise profit and **cash return**. Cash in beats margin on paper; protect cash first, then margin, then growth. |
| Standing duty | Every run checks the **MRR ratio** (§2) and proposes or implements changes that monetise the app better. |
| Scope | Everything that moves money: revenue (plans, top-ups, trials, churn), per-video cost, tokens, provider and SaaS bills, hosting, payment fees, tax. |
| Vendors | Challenge every paid vendor. The owner already finds **fal.ai expensive**: find cheaper or better options and prove them on real calls before any switch. |
| Fresh tech | Each run scouts new models, APIs, pricing tiers and techniques that could cut cost or lift revenue (§6). |
| Autonomy | **Analyse freely, change through PRs.** Branches `ceo-finance/<slug>`; never merge. Read-only on live systems. Any write (migration, Stripe object, price change, vendor key, live mode) needs the owner's explicit OK. |
| Access | The routine configures what it can itself (§5) and **asks the owner, in its digest, for anything it cannot reach**. Missing data is reported as missing, never invented. |
| Cadence | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the 06:00 CEO, before the 09:00 Design CEO). Prompt: `docs/routines/finance-cfo.md`. |

---

## 2. KPIs the routine reports every run

"MRR ratio" is read as **MRR ÷ total monthly cost** (the cover ratio), with MRR
growth next to it. If Tudor meant something else (for example MRR ÷ ARR, or
net-new ÷ churned MRR), say so and §2 changes. Always show both the **measured**
value and the **list-price/assumed** value, labelled, so a gap is visible.

| KPI | Definition | Source |
| --- | --- | --- |
| **MRR** | Sum of monthly-normalised active subscriptions. Excludes trials, top-ups and test mode. | Stripe (live) |
| **MRR ratio** | MRR ÷ (variable API cost + fixed vendor/hosting cost + payment fees), trailing 30 days. Target ≥ 3.0, floor 1.0 (below 1.0 is burning cash). | Stripe + `render_jobs` + vendor bills |
| **Net MRR movement** | New + expansion − contraction − churn. | Stripe |
| **Cash margin per video** | (Net revenue per credit × credits charged) − `api_cost_usd`, by tier and length. | `render_jobs`, `credit_transactions` |
| **Breakage** | Credits granted but never spent when a period ends. It is free margin, but also a churn signal. | `credit_transactions` |
| **Cost per signup (trial burn)** | Trial credits × measured cost per credit, plus failed-render waste. | `render_jobs` |
| **Token and unit cost** | Tokens (script), characters (voice), megapixels (images), clip-seconds (video) used per video vs dollars spent. Estimate vs measured. | provider usage (§5, gap G1) |
| **Fixed cost run-rate** | Hosting, database, email, monitoring, plan fees per month, and what each would cost at 10x and 100x users. | Vercel, Supabase, vendor invoices |
| **Payback** | Months for a paying user's net margin to cover blended acquisition cost. Uses ad spend once it exists. | Stripe + owner input |

Report each KPI as: value · change vs last run · one-line cause · action.

---

## 3. Operating model: master agent plus workers

The routine is one **master (CFO) agent** that never does the deep work itself.
It plans, delegates in parallel, merges results and decides. Same shape as the
CEO routines, with a finance split.

```
                         ┌───────────── Finance CFO (master) ─────────────┐
 1 preflight + read plan │ 2 fan out workers (parallel, one message)      │ 3 merge → decide → act
                         └───────────────────────┬────────────────────────┘
        ┌───────────────┬───────────────┬────────┴───────┬───────────────┬───────────────┐
   W1 Revenue &    W2 Unit-cost     W3 Fixed-cost    W4 Vendor &     W5 Pricing &    W6 Builder
   MRR analyst     auditor          & infra auditor  tech scout      monetisation    (only if a
   (read-only)     (read-only)      (read-only)      (web research)  strategist      PR is worth it)
```

**Master duties, in order:**

1. **Preflight.** Run the access check (§5). Record what is reachable and what is not. Read `TheMasterPlan.md` §7–§9, this file, and the last digest.
2. **List open and recently closed PRs** (`ceo-finance/*` and all others). An item with an open PR is in review, not available. Leave UI files alone while a `ceo-design/*` PR is open. Never duplicate another routine's PR.
3. **Fan out W1–W5 in one message** (they are independent). Give each the question, the files and tables to read, what is already ruled out, and the output shape (§3.1). Spawn W6 only after a decision.
4. **Merge and rank.** Convert findings into candidate actions scored by *cash impact per month*, *confidence* (measured > list price > estimate) and *effort*. Pick the single highest cash-return item that needs no unapproved write.
5. **Act.** Implement it as one PR on `ceo-finance/<slug>` (tests green, `FinancePlan.md` and `TheMasterPlan.md` updated). Things that need the owner go into the digest as a **decision request** with a recommendation, not a menu.
6. **Notify.** Send a push notification only when something needs the owner (§7). A quiet run stays quiet.

### 3.1 Workers

| Worker | Job | Reads | Output |
| --- | --- | --- | --- |
| **W1 Revenue & MRR analyst** | MRR, MRR ratio inputs, net MRR movement, churn, trial → paid, plan mix, top-up share, failed payments, refunds, Stripe fees and tax. | Stripe connector (`stripe_analytics`, `stripe_api_read`), `subscriptions`, `credit_transactions`, `npx tsx scripts/metrics-report.mts` | KPI table, three biggest revenue leaks or levers |
| **W2 Unit-cost auditor** | Cost per video by tier and length (measured vs the catalog), token/character/megapixel/clip-second usage vs dollars, overruns, failed-render waste, retry cost, cost of the trial. | `render_jobs.api_cost_usd`, `credit_transactions`, `src/config/models.ts`, `src/features/billing/margin.ts`, `scripts/margin-report.mts`, provider dashboards if reachable | Catalog rows that are wrong, margin by shape, waste list |
| **W3 Fixed-cost & infra auditor** | Every recurring bill: Vercel, Supabase, ElevenLabs plan and voice slots, Anthropic, fal.ai, Resend, Sentry, domain, Stripe. Which plan tier each is on, what the next tier triggers, what is unused. | Vercel connector (`list_billing_charges`, `list_contract_commitments`), Supabase advisors and usage, vendor invoices the owner provides | Monthly run-rate table, upgrade tripwires, cuts |
| **W4 Vendor & tech scout** | Find cheaper or better providers and techniques for each cost line (§6). Web research, then a **bake-off plan** with a fixed test set. Never switch on list prices alone. | Web search and fetch, provider docs, `src/features/providers/*` adapter contract | Ranked candidates: price, quality risk, adapter effort, bake-off steps |
| **W5 Pricing & monetisation strategist** | Plan prices, credit packs, annual billing, trial design, upsell and win-back, usage-based add-ons, referral and affiliate, watermark and export gating, regional prices. Models impact with the margin math, not guesses. | `src/config/plans.ts`, `src/features/billing/*`, `/pricing`, W1/W2 output, competitor pricing | Ranked experiments with expected MRR effect and the guardrail metric |
| **W6 Builder** | Implements the chosen change as a PR: adapter, catalog row, script, migration *file* (never applied), copy, tests. | Repo | PR on `ceo-finance/<slug>` |

Workers never write to live systems. W6 never touches live secrets and never
flips `MOCK_PROVIDERS`. Cap: at most 6 workers per run.

---

## 4. Known facts and open numbers (from the repo, 2026-10-15)

- **Revenue side:** Starter €14.99 / 30k credits · Pro €29.99 / 100k · Ultra €79.99 / 250k; top-ups €12 / €29 / €59. Net-revenue assumptions: 20% VAT, 1.5% + €0.25 Stripe, 1.08 USD/EUR (`REVENUE_ASSUMPTIONS`). Stripe is **sandbox only**, so real MRR is unknown until live mode.
- **Margin gate:** passes (Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x) on *researched* list prices. Pro sits at exactly 3.0x, so any measured cost rise fails it.
- **Standard tier already avoids video models** (Ken Burns stills, in-house ffmpeg): ~$0.07 per 15s video. The expensive line is **Premium AI video** (Kling via fal.ai, catalog `$0.12` per scene-second, list ~$0.07/s; a 15s Premium video is ~$1.10–$2.30). fal.ai is therefore expensive only where Premium is used, plus FLUX images (~$0.003 each on schnell, $0.025 on dev).
- **Other per-video lines:** script ~$0.04 (Claude Sonnet 5.5, assumed 2k in / 1.5k out), voice ~$0.00075/s (ElevenLabs Flash), render ~$0.01.
- **Fixed costs the catalog does not see:** ElevenLabs plan and custom-voice slots, Supabase and Vercel tiers, Resend, Sentry, domain. `docs/DEPLOYMENT.md` says Vercel **Hobby**; Hobby is for non-commercial use, so verify the terms before charging real money, and budget Pro (per seat) into the fixed run-rate.
- **Gaps (the routine closes these first, in this order):**
  - **G1: tokens and provider usage are not stored.** Only `render_jobs.api_cost_usd` exists, and it is computed from the catalog, not from the provider's response. Proposal for owner approval: a `provider_usage` table (job, step, provider, model, input/output tokens or chars/MP/seconds, billed USD from the response, request id) written by each adapter, plus a monthly reconciliation against the provider invoice.
  - **G2: no live billing data.** Stripe is test mode, so MRR is not real yet. Until go-live the routine reports *modelled* MRR (plan prices × assumed subscribers) and labels it as such.
  - **G3: no ad or acquisition spend input**, so payback cannot be computed. Ask the owner.
  - **G4: no vendor invoices.** The owner pastes or connects them (§5).

---

## 5. Access and tooling

### 5.1 Preflight (the master runs this every time and records the result)

| Check | How | If it fails |
| --- | --- | --- |
| Repo read and push to `ceo-finance/*` | `git` and GitHub tools; confirm the working tree and remote | Notify: routine cannot run |
| Supabase (read-only SQL) | Supabase connector `execute_sql` with `select` only; project `iqvrovjwoavvmhaithwn` | Fall back to `scripts/metrics-report.mts` if `.env.local` exists; else report "no DB access" and ask the owner to re-auth the connector |
| Stripe | Stripe connector (`stripe_analytics`, `stripe_api_read`); note whether the account is test or live | Report "Stripe unreachable"; model revenue from `plans.ts` |
| Vercel billing | Vercel connector `list_billing_charges`, `list_contract_commitments` | Ask the owner to attach the Vercel connector to the routine |
| Web research | WebSearch/WebFetch; note blocked domains (provider pricing pages were blocked in an earlier routine) | Use aggregator snippets, label them unverified, and propose a measured test |

The routine may **change its own configuration only inside the repo** (this
file, its prompt, scripts). It cannot add connectors or secrets to itself; it
lists what it needs in the digest (§5.2) and the owner attaches them.

### 5.2 Connectors and tools worth adding (ask the owner, in this order)

| Priority | Add | Why |
| --- | --- | --- |
| 1 | **Stripe, live-mode read-only restricted key** (balance, charges, subscriptions, invoices, refunds, disputes) | Real MRR, churn, fees. Today's connector is the sandbox account. |
| 2 | **Vercel** connector on this routine (already connected at account level) | Billing charges, usage, function duration, bandwidth: the hosting line. |
| 3 | **Supabase** connector re-authenticated (it failed to connect on the first run, `ERR_PROXY_TUNNEL`) | Read-only SQL on `render_jobs`, `credit_transactions`, `subscriptions`; advisors; usage. |
| 4 | **Read-only usage/cost keys** for fal.ai, ElevenLabs and Anthropic (Admin/usage API or a billing export) | Actual billed cost per day, to reconcile against `api_cost_usd`. Never the generation keys. |
| 5 | **Google Sheets or Drive** connector with one "Finance inputs" sheet | Where the owner drops invoices, ad spend and manual costs the APIs can't see. |
| 6 | **PostHog** (or Vercel Web Analytics, already listed in the Vercel tools) | Visitor → signup → paid funnel and paywall conversion, for pricing experiments. |
| 7 | **Sentry** connector | Failed renders are cash: each one costs a refund plus the spent API calls. |
| Optional | A bank/accounting export (Wise, Qonto, Xero, QuickBooks or a CSV) | Reconcile Stripe payouts and every vendor payment in one place. |

Claude-side tools that help: the **Workflow**/subagent fan-out (already how §3
works), the **Artifact** tool to publish a private finance dashboard page with
the KPI table and charts (so the owner sees the numbers without opening the
repo), **Skills** `dataviz` and `xlsx` for charts and a vendor-comparison
workbook, and **deep-research** for the vendor scout when a question is large.

### 5.3 Information the routine needs from the owner

Answer in a PR comment or in `docs/finance/inputs.md` (the routine reads it):

1. Do you mean MRR ÷ cost by "MRR ratio"? (§2)
2. Go-live date for Stripe live mode, and any real subscribers yet.
3. Current monthly bills by vendor (plan names and amounts): Vercel, Supabase, ElevenLabs, fal.ai, Anthropic, Resend, Sentry, domain, anything else.
4. Marketing or ad spend per month, and any affiliate or influencer deals.
5. Company/VAT setup (one-stop shop for EU VAT, Stripe Tax on or off), because tax and payment fees change the revenue side.
6. Risk appetite: may the routine propose dropping Premium AI video, or raising prices, or must it find savings elsewhere first?
7. Quality bar for the bake-off: who judges whether a cheaper model's output is good enough (suggestion: Tudor rates 20 blind pairs, the routine prepares them).

---

## 6. Savings and revenue backlog (hypotheses to test, not facts)

Everything here is **unverified**. Prices change monthly; the vendor scout
re-checks each one, and nothing is adopted without a bake-off on a fixed test
set (same 10 topics, same prompts, measured cost, blind quality rating).

### 6.1 Cut cost

| # | Idea | Why it might pay | How to prove it |
| --- | --- | --- | --- |
| C1 | **Cheaper Premium video model than Kling** (candidates to price: Wan, LTX, Seedance, Hunyuan-class open models, Veo Fast tiers) on fal.ai *and* on other hosts (Replicate, Runware, Fireworks, WaveSpeed, Novita, RunPod/Modal serverless GPU) | Premium is the one line with real per-video cost; a 2x saving moves Pro's 3.0x gate | Bake-off; add as a second adapter behind a catalog row |
| C2 | **Hero-shot Premium**: AI clip on scene 1 only, stills for the rest | ~$0.45 vs ~$1.10 per 15s video, already modelled in §7 | Smoke script `--premium`, then price it between Standard and Premium |
| C3 | **Self-host an open video model** on pay-per-second serverless GPU (Modal, RunPod, Replicate Deployments) | Can beat per-call API margins at volume; **not** at low volume (cold starts, idle cost) | Break-even model: volume at which fixed GPU cost beats per-clip price |
| C4 | **Cache and reuse**: stock/background loops, per-theme B-roll library, reuse of identical scene prompts, regenerate only the changed scene on edits | Cuts clip and image calls for repeat themes | Count duplicate/similar prompts in `render_jobs` |
| C5 | **Cheaper image model**: FLUX schnell is already ~$0.003; test other hosts and SDXL-class turbo models; lower resolution where the render crops anyway | Small per image, large over 6+ scenes at volume | Bake-off + measured MP billed |
| C6 | **Script model routing**: Haiku-class model for short/simple scripts, Sonnet only when needed; prompt caching for the fixed system prompt; batch API where latency allows | Script is ~$0.04 per video, but the most predictable line to halve | Token logging (G1), then A/B on output quality |
| C7 | **Voice**: compare ElevenLabs Flash against cheaper TTS (OpenAI, Google, Azure neural voices, Cartesia, Deepgram Aura, open-source Kokoro/XTTS) for Standard tier, keep ElevenLabs for Premium or for voice design; watch custom-voice slot fees | Voice is cheap per second, but slots and plan tiers are a fixed cost | Blind listening test |
| C8 | **Failed-render waste**: stop early on a bad scene instead of finishing the job, retry only the failed step, smaller retry budget | Every failure costs a refund plus spent calls | Failure rate by step in `render_jobs` |
| C9 | **Fixed stack**: stay on free/low tiers as long as terms allow; pick up Vercel Pro only when required; Supabase Pro only when limits bite; cut Sentry quota; check Cron and function duration | Fixed cost is paid even at zero revenue | Run-rate table + tripwires (W3) |
| C10 | **Negotiate/commit**: volume discounts or committed-use credits from fal.ai/ElevenLabs once spend is predictable | Typical list-to-commit gap is large at scale | Only after 2–3 months of measured spend |

### 6.2 Raise revenue

| # | Idea | Guardrail |
| --- | --- | --- |
| R1 | **Annual plans** (2 months free) | Pulls cash forward; cap refunds by ledger-granting credits monthly |
| R2 | **Metered overage / auto top-up** at plan limit instead of a hard paywall | Show cost before generating (design principle 3) |
| R3 | **Trial → paid**: trial credits sized to the first "aha" video only; watermark kept on trial; email day-1/3/7 (lifecycle cron exists) | Keep trial burn ≤ $0.25 |
| R4 | **Win-back and churn save**: pause instead of cancel, discount offer in Stripe portal, dunning (smart retries, card updater) | Measure saved MRR per offer |
| R5 | **Price tests** on Starter/Pro (Pro is the margin floor) and a higher-priced "Studio" tier for agencies (more voices, brand kit, team seats) | A/B by cohort, never change a subscriber's price silently |
| R6 | **Premium upsell moments**: hero-shot as an add-on per video, "make this one AI-animated" in the library | Priced by the cost model, not by feel |
| R7 | **Regional pricing** (purchasing-power tiers) and local payment methods (iDEAL, Bancontact, SEPA, Apple/Google Pay) | Watch fee mix; some methods cost less than cards |
| R8 | **Affiliate/referral**: credits for both sides, paid only after the first paid month | Cost = credits at measured cost, not list price |
| R9 | **Breakage design**: rollover cap (e.g. one month) to reduce churn while keeping some breakage | Model effect on margin before shipping |
| R10 | **Export/branding tiers**: watermark removal, 4K export, brand kit, bulk generation, scheduling and posting integrations | Higher perceived value at near-zero marginal cost |

---

## 7. Notification rules (the point of a scheduled run)

Send a push notification (inside `<routine_summary>` tags, lead sentence first)
only when the run finds one of:

- MRR ratio < 1.0, or it fell > 15% vs the previous run;
- the margin gate would fail on measured costs, or any product < 3x;
- a vendor bill or usage is > 25% above its run-rate, or a tripwire is within 20% of a paid tier;
- a validated saving or revenue lever worth ≥ €100/month is ready to approve (PR opened);
- the routine cannot reach a required data source (access denied, connector down, key expired);
- anything needing an owner decision with a deadline (price change, vendor switch, going live).

Otherwise: no notification. Write the digest to the PR or the changelog.

---

## 8. Roadmap (the routine works top to bottom; one item per PR)

| # | Item | Needs the owner? | Status |
| --- | --- | --- | --- |
| F0 | Charter, routine prompt, registration in the master plan | no | ✅ this PR |
| F1 | Preflight and first baseline: what is reachable, which numbers exist (`docs/finance/baseline.md`) | connectors (§5.2) | ⬜ |
| F2 | `scripts/finance-report.mts` + pure `features/metrics/unit-economics.ts`: MRR, MRR ratio, cost per video by shape, waste, breakage; tested; read-only | no | ⬜ |
| F3 | Migration **file** for `provider_usage` (G1) + adapter instrumentation, mock-safe | **apply** needs OK | ⬜ |
| F4 | Vendor bake-off harness (`scripts/bakeoff.mts`): fixed test set, per-provider cost and latency capture, side-by-side output page | provider keys | ⬜ |
| F5 | First vendor decision memo for Premium video (C1/C2/C3) with measured numbers | key for each candidate | ⬜ |
| F6 | Fixed-cost run-rate table and tripwires (C9), Vercel plan check | invoices | ⬜ |
| F7 | Pricing experiments (R1, R3, R4), one at a time, behind a flag | price changes need OK | ⬜ |
| F8 | Finance dashboard artifact (private) refreshed by the routine | no | ⬜ |

---

## 9. Changelog (append newest on top)

- **2026-10-15** — Finance track created: charter, KPI definitions, master/worker model, access preflight, connector wishlist, cost and revenue backlogs, notification rules. No code or schema change. Routine prompt in `docs/routines/finance-cfo.md`. (interactive)
