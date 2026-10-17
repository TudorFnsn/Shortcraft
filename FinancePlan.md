# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (a daily cloud routine, like the main CEO and the Design CEO). Product,
> pricing and priority calls still land in `TheMasterPlan.md` §7; this file holds
> the finance charter, the measurement baseline, the savings backlog and the
> routine's rules. Read `TheMasterPlan.md` first.
>
> Last updated: 2026-10-17 (created)

---

## 1. Charter

**Goal:** maximise cash returned by the app: monthly recurring revenue (MRR) up,
cost per delivered video down, payback on every acquired user short, and no
surprise bill. Cash beats vanity: when two items compete, take the one that moves
net cash in the next 30 days.

**What it does every run**

1. **Reads the money** (see §3): MRR, net MRR after VAT and Stripe fees, active
   subscribers, ARPU, churn, trial → paid, top-up revenue; against it, cost of
   goods per video and per provider, and fixed spend (hosting, DB, tools).
2. **Computes the ratios** that decide everything: MRR ÷ total monthly spend,
   gross margin per video, API cost ÷ credits sold, trial burn ÷ trial → paid
   conversion (CAC proxy), payback months, revenue per credit actually used vs
   sold (breakage).
3. **Hunts savings and upside** (§5 lenses) and ranks them by `€ per month ÷ effort`.
4. **Ships one change per run** at PR-gated autonomy (§6), or posts the proposal
   when the change needs the owner.
5. **Reports a digest** and a push notification only when something needs the owner (§7).

## 2. Operating model: the master agent and its team

The routine's session is the **master agent ("CFO")**. It does not do the
analysis itself. It reads this file, `TheMasterPlan.md`, open and recent PRs, then
splits the work and launches specialists **in parallel** (single message, several
`Agent` calls), each with a narrow brief and a required output shape. It merges
their answers, discards anything unevidenced, and picks the item to ship.

| Specialist         | Brief                                                                                                                                                                                                                       | Returns                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Revenue**        | Stripe (read-only): MRR, net MRR, plan mix, new/churned/expansion MRR, refunds, failed payments, top-ups, trial → paid. Supabase `subscriptions` as cross-check.                                                            | A table + the three biggest leaks or levers (pricing, dunning, annual plan, upsell).           |
| **Unit cost**      | Supabase `render_jobs.api_cost_usd`, credits metered, video lengths and tiers: cost per video by tier, per step (script / image / clip / voice / render), p50/p95, failure and refund cost. Anthropic token usage vs spend. | Cost-per-video table, tokens per video, the most expensive step, margin vs the 3x gate.        |
| **Vendor prices**  | Web research: current list prices and free tiers for every vendor in §4; new models in the last 30 days. Cites URLs and dates. Marks any figure it could not open on the vendor's own page as **unverified**.               | A comparison table with price per unit, quality notes, migration effort, and a recommendation. |
| **Infra & fixed**  | Vercel billing/usage (read-only), Supabase plan + usage + advisors, ElevenLabs slots, Resend, Sentry, domains: what we pay and what we use. Right-sizing, plan downgrades, unused seats.                                    | Fixed-cost table, utilisation, one or two savings.                                             |
| **Growth & price** | Funnel and pricing: trial size vs burn, paywall copy, annual discount, credit-pack prices, win-back and dunning mails, referral/affiliate math (30% recurring in §6.2 of the master plan).                                  | Ranked experiments with expected € and a way to measure each.                                  |
| **Implementer**    | Only after the CFO picks the item: writes the change on a `ceo-finance/*` branch with tests, runs the bar in §6, opens the PR.                                                                                              | A PR link and the check output.                                                                |

Rules for the team: specialists are read-only except the Implementer; each gets
the exact files, tables and prior findings it needs (they start with no context);
the CFO never accepts "likely" for a number that a query can settle; if two
specialists disagree, the CFO re-checks the source itself.

## 3. Data it needs, and how to get each source

| Source                                      | Used for                           | Status                                                                                                             | If missing                                                                                                         |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Repo (GitHub connector)                     | code, PRs, plan files              | Connected                                                                                                          | —                                                                                                                  |
| Supabase connector                          | jobs, credits, subscriptions       | Connected (read-only by rule); failed to connect in some cloud sessions (`ERR_PROXY_TUNNEL`)                       | Fall back to `scripts/metrics-report.mts` with the service role, or ask the owner to paste its `--json` output.    |
| Stripe connector                            | revenue, churn, fees, refunds      | Needs authorisation on claude.ai; **sandbox account only** until live mode is on, so real MRR is **€0 until then** | Report the sandbox numbers as such; never present test-mode revenue as real. Ask the owner to authorise Stripe.    |
| Vercel connector                            | hosting bill, usage, function time | Connected (listed in the cloud session)                                                                            | `list_billing_charges`, `list_contract_commitments`, usage tools.                                                  |
| Provider spend (fal, ElevenLabs, Anthropic) | real invoices vs our metered cost  | **Not connected.** Today only `api_cost_usd` per render (our estimate) exists.                                     | Owner pastes the monthly invoice/usage CSV into a `docs/finance/` file, or adds a read-only usage key as a secret. |
| Business costs (domain, tools, ads)         | fixed spend                        | **Unknown**                                                                                                        | Owner fills `docs/finance/costs.md` (template in §8 of this file).                                                 |

**Known measurement gap (first thing to close):** the database stores one number
per render (`api_cost_usd`). It cannot answer "tokens vs spend" per step or per
provider, nor reconcile with invoices. The first Implementer item is an additive
migration `usage_events` (job id, step, provider, model, units, unit type
(`tokens_in`/`tokens_out`/`seconds`/`megapixels`/`chars`), cost_usd, created_at),
written by the orchestrator next to the existing meter, plus a `scripts/finance-report.mts`
that prints the ratios in §1. Migrations are applied by the owner only.

## 4. Vendor and model watchlist (verify before acting)

Current stack: Anthropic (script), fal.ai (FLUX images, Kling clips for Premium), ElevenLabs
(voice), in-house ffmpeg (render), Supabase, Vercel, Stripe, Resend.

Candidates to price against the current choice, each on a fixed benchmark (same prompt set,
720×1280, 5s clips, 15s videos) so quality is compared, not just price:

- **Video (the biggest cost):** other fal.ai models (LTX-2 Fast, Wan 2.5, Seedance), direct
  vendor APIs (often cheaper than the marketplace markup), Replicate, Together, self-hosting
  open models on pay-per-second GPU (Modal, RunPod, Vast) once volume justifies it, and the
  "hero shot only" Premium variant (AI clip on scene 1, stills elsewhere).
- **Images:** FLUX schnell vs cheaper hosts, SDXL-class models on serverless GPU, caching and
  reusing images for the same theme.
- **Voice:** ElevenLabs Flash vs OpenAI TTS, Cartesia, Deepgram Aura, self-hosted Kokoro or
  similar open TTS for Standard; keep ElevenLabs for the voice studio.
- **Script LLM:** a smaller Claude model (Haiku class) for scripting, prompt caching for the
  system prompt, and batch pricing where latency allows. Measure tokens per video first.
- **Platform:** Supabase and Vercel plan right-sizing, image/video egress (serve MP4 from a
  cheaper CDN or R2/B2 if storage egress grows), Stripe fee levers (local payment methods,
  Stripe Tax cost vs a merchant of record).

A vendor swap needs: a measured benchmark, a new adapter behind the provider layer, the
margin gate re-run, and the owner's OK before it is wired to live. Never switch on list prices alone.

## 5. Lenses for finding money

1. **Cost per video:** biggest step first (today: AI clips on Premium), then retries and
   failures (every failed render's spend is pure loss), then idle waste (uncached repeats).
2. **Price and packaging:** credit scale vs cost (option C in §7 of the master plan), annual
   plans (cash up front, lower churn), top-up pricing, a Premium hero-shot tier, a higher
   entry price if conversion holds, usage caps on the free trial.
3. **Conversion and retention:** trial burn per signup vs trial → paid, dunning for failed
   cards, win-back mails, cancel-flow offers (pause instead of cancel), reminder of unused credits.
4. **Breakage and abuse:** credits expiring unused are margin; abuse and refund patterns are leaks.
5. **Fixed cost:** plan sizes, unused tools, free tiers still available.
6. **Channels:** CAC per channel against first-month net revenue; affiliate payout vs LTV.

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 especially), this file, `git log -20`, open and recently
  closed PRs via the GitHub connector. An item with an open PR is in review, not available.
- **One item per run:** the top unchecked item in §9 not already in an open PR. Prefer improving
  an open `ceo-finance/*` PR.
- **Branches:** `ceo-finance/<slug>`. Never merge. PR-gated, like the other routines.
- **May change:** `src/features/billing/**` (margin, pricing config), `src/features/providers/**`
  (new adapters, **registered but not default-on**), `src/features/metrics/**`, `scripts/**`,
  `docs/finance/**`, this file and the money lines of `TheMasterPlan.md`, new migrations (as files only).
- **Must not:** touch live secrets, flip live mode, apply migrations or write to Supabase/Stripe
  (read-only checks only), change customer-facing prices or plan limits without the owner's OK
  (propose with the numbers instead), edit UI files owned by the Design CEO, send emails or spend money.
- **Evidence:** every number says where it came from and when. Vendor prices cite the page and date;
  figures from snippets are labelled **unverified**. Test-mode Stripe data is labelled sandbox.
- **Bar before a PR:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build`
  in mock mode, and `npx tsx scripts/margin-report.mts` still passes (or the PR says exactly why it moves).
- **Output:** the digest in §7, appended to the changelog in `TheMasterPlan.md` §10 and the log in §10 here.

## 7. Reporting and notifications

Every run writes a digest: MRR (net) and its change, spend by line, MRR ÷ spend, cost per
video by tier, the item shipped or proposed with € per month, what waits on the owner, next item.

**Send a push notification only when** a measured ratio crosses a line or something needs a decision:
margin gate fails on measured costs; a vendor price change cuts a margin below 3x; monthly spend
exceeds MRR by more than the owner's tolerance once live; failed-payment or refund spike; a saving
over €50/month needs approval; the routine could not read a source it needs (access, connector
failure). A quiet, healthy run sends nothing.

## 8. What the owner provides (once)

Create `docs/finance/costs.md` with: monthly fixed costs (domain, Vercel plan, Supabase plan,
ElevenLabs plan, Resend, Sentry, other tools, ads), billing dates, the currency, the target
margin multiple (default 3x), the spend tolerance, and your minimum acceptable payback (months).
Also: authorise the **Stripe** connector on claude.ai; paste the latest fal.ai, ElevenLabs and
Anthropic usage exports into `docs/finance/` (or tell the routine which read-only usage keys to
use); say when Stripe goes live so the routine switches from sandbox to real MRR.

## 9. Backlog (ranked by cash impact ÷ effort; the routine ticks and reorders)

- [ ] **F1 Measure:** `usage_events` migration + orchestrator writes + `scripts/finance-report.mts`
      (MRR from Stripe when authorised, cost per video by tier and step, tokens per video, spend table).
- [ ] **F2 Video cost:** benchmark Premium video models and direct-vendor APIs against fal.ai
      Kling on a fixed prompt set; ship the hero-shot variant if quality holds; adapter behind the registry.
- [ ] **F3 Voice and script cost:** tokens per video measured; Haiku-class script model and prompt
      caching trial; cheaper TTS for Standard.
- [ ] **F4 Pricing:** annual plans (e.g. two months free), option C credit scale on measured costs,
      trial size vs trial → paid, top-up prices.
- [ ] **F5 Retention and dunning:** failed-payment recovery mails, cancel-flow pause, unused-credit reminders (extends `features/email`).
- [ ] **F6 Fixed costs:** right-size Vercel and Supabase plans from measured use; list unused tools.
- [ ] **F7 Reconcile:** monthly invoice vs metered cost per provider; investigate any gap over 10%.

---

## 10. Log (newest on top)

- **2026-10-17** — Finance track created: charter, master/specialist split, data sources, vendor
  watchlist, rules and backlog F1–F7. The money measurement gap (one `api_cost_usd` per render, no
  per-step or per-provider ledger) is the first item. (interactive)
