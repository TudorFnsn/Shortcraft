# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file wins on
> unit economics, vendor cost and pricing proposals. Every finance PR updates this file
> (KPI snapshot + changelog) in the same change.
>
> Last updated: 2026-10-20 (charter created)

---

## 1. Charter (owner request 2026-10-20, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash return first.** Raise MRR, cut cost per finished video, shorten payback on every euro spent.                                                              |
| Always    | Check the **MRR ratio** (net MRR ÷ metered API cost, target ≥ 3x) first, every run.                                                                                              |
| Scope     | Pricing, plans, top-ups, upsell and retention levers that move revenue; vendor choice and per-call cost (video, image, voice, script, render, hosting); every recurring payment. |
| Ideas     | Look for new, fresh tech and cheaper vendors. Example from the owner: **fal.ai video looks expensive**, so find better and cheaper video generation.                             |
| Tokens    | Track tokens and units used per video against what they cost, and every other payment (Vercel, Supabase, Sentry, Resend, ElevenLabs plan, Stripe fees, domains).                 |
| Autonomy  | **PR-gated**, same as the other routines: branches `ceo-finance/<slug>`, never merge, never touch live secrets, never switch a vendor on live traffic without Tudor's OK.        |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the main CEO 06:00 and Design CEO 09:00). Weekly deep run on Mondays.                                         |
| Questions | Anything the routine needs (a number, a login, a connector) it asks for in the digest under **Needs from Tudor**. It does not guess prices.                                      |

---

## 2. How the routine works (master agent + workers)

One **master agent** (the routine's own session, Opus-class) reads this file, `TheMasterPlan.md`, `git log -20` and open + recently closed PRs, then splits the day's work across **parallel worker agents** (the `Agent` tool, one message, several calls). Workers are read-only unless named; only the master edits files, commits and opens the PR. The master does not repeat a worker's research.

| Worker                 | Job                                                                                                                                                                                                                         | Reads                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Revenue analyst**    | Run `npx tsx scripts/finance-report.mts --json` and `scripts/metrics-report.mts --json`; read Stripe (MRR, new, churned, failed payments, refunds, disputes, fees). Return MRR, net MRR, ARPU, churn, trial → paid.         | Supabase, Stripe connectors, `.env.local` scripts                   |
| **Cost auditor**       | Tokens and units per finished video vs cost: `render_jobs.api_cost_usd`, `charged_credits`, per-step cost in `config/models.ts`, provider dashboards. Flag any model whose measured cost differs from the catalog by > 20%. | Supabase, `config/models.ts`, fal / ElevenLabs / Anthropic billing  |
| **Vendor scout**       | Find cheaper or better models and services per slot (§5). Return a table: price per unit, quality notes, licence/commercial terms, API fit, source link and date. Prices without a source are marked unverified.            | Web search (extended mode for pricing)                              |
| **Platform spend**     | Every non-API payment: Vercel usage + invoices, Supabase plan and usage, Sentry, Resend, domains, ElevenLabs plan. Propose downgrades, caps, caching or retention limits.                                                   | Vercel, Supabase connectors                                         |
| **Pricing strategist** | Check plans and top-ups against the margin gate and the cost auditor's real numbers; propose price, credit-grant, annual-plan, upsell or trial changes with the margin table before and after.                              | `config/plans.ts`, `billing/margin.ts`, `scripts/margin-report.mts` |
| **Implementer**        | Only after the master picks ONE item: writes the change on `ceo-finance/<slug>`, runs the bar (§6). Worktree-isolated.                                                                                                      | repo                                                                |

Run order: analysts and scouts fan out in parallel → the master ranks findings by **cash return** (euros per month gained or saved ÷ effort and risk) → the Implementer builds the top one → the master writes the digest.

---

## 3. KPIs (the scoreboard; the routine fills §4 each run)

| KPI                     | Definition                                                  | Target                            |
| ----------------------- | ----------------------------------------------------------- | --------------------------------- |
| **MRR ratio**           | net MRR ÷ metered API cost (30 days)                        | ≥ 3x, alert below                 |
| MRR / net MRR           | live subscriptions × list price, net of VAT and Stripe fees | grow month on month               |
| ARPU                    | net MRR ÷ paying subscribers                                | grow                              |
| Cost per finished video | all metered cost ÷ videos that reached `done`               | fall; Standard < $0.15            |
| Burn per credit         | metered cost ÷ credits charged                              | ≤ 1/12,000 USD (the credit scale) |
| Gross margin            | (net MRR − metered cost) ÷ net MRR                          | ≥ 67% (3x)                        |
| Trial burn              | cost of a free trial signup                                 | ≤ $0.25                           |
| Failed-job cost share   | cost of jobs that ended `failed` ÷ total cost               | < 5%                              |
| Churn, failed payments  | Stripe                                                      | falling                           |
| Fixed monthly spend     | every non-API recurring payment                             | tracked in §7                     |

`scripts/finance-report.mts` computes the first six from the database (pure math in `src/features/metrics/finance.ts`, tested). Top-up income is not in net MRR (no per-sale record), so margin is understated, never overstated.

---

## 4. Latest snapshot

_No live numbers yet._ The app runs on test Stripe and mock providers until go-live, so MRR is €0 and metered cost is not measured. First live run fills this table. Until then the margin gate (`npx tsx scripts/margin-report.mts`) is the only ratio: Starter 5.3x, Pro 3.2x, Ultra 3.4x, top-ups 4.2–6.2x (TheMasterPlan §7).

| As of | MRR | Net MRR | Subs | Cost / video | Burn / credit | Gross margin | MRR ratio |
| ----- | --- | ------- | ---- | ------------ | ------------- | ------------ | --------- |
| —     | —   | —       | —    | —            | —             | —            | —         |

---

## 5. Ideas backlog (rank by cash return; take the top one not already in an open `ceo-finance/*` PR)

### 5.1 Video cost (the biggest line)

Premium AI video is the largest per-second cost: `video-premium` is set at $0.12/s on fal.ai (Kling 2.5 Turbo Pro, billed in fixed 5s clips). Standard already avoids it (Ken Burns stills, $0).

- [ ] **Measure before switching.** Run `scripts/live-providers-smoke.mts` for a 6s, 9s and 15s Premium job and record real `costUsd` per scene. Replace the catalog guess.
- [ ] **Scout cheaper image-to-video models** (all prices unverified, source and date required): Wan 2.x / Wan-Animate open weights on a pay-per-second GPU host (fal, Replicate, Runpod serverless, Modal); LTX-Video / LTX-2 Fast; Hunyuan Video I2V; Seedance and Hailuo (MiniMax) lite tiers; Kling Standard instead of Pro; Veo Fast tiers. Check commercial licence and API terms for each.
- [ ] **Shorter clips.** Billing is by clip: cap Premium at 5s clips that align with Kling's fixed length, so no billed second is wasted. Mix: AI clip for the hook scene, Ken Burns for the rest (hybrid tier).
- [ ] **Self-host an open model** only when monthly Premium volume pays for a reserved GPU; compute the break-even in the PR.
- [ ] **Cache and reuse.** Reuse generated scenes for the same theme/prompt hash (series, re-voice already skips video).

### 5.2 Other per-video costs

- [ ] Script: Sonnet 5.5 at ~$0.04 per script. Test Haiku 5.5 for scripts with the same moderation + quality checks; use prompt caching on the fixed system prompt. Log `usage` tokens per job so cost is auditable (today only `costUsd` is stored).
- [ ] Images: FLUX schnell is $0.003/MP. Compare Flux-class alternatives, and 540p generation upscaled in ffmpeg where quality holds.
- [ ] Voice: ElevenLabs Flash at ~$0.00075/s. Compare Cartesia, Deepgram Aura, OpenAI TTS, and an open model for the Standard tier.
- [ ] Render: in-house ffmpeg is ~$0.01. Check real Vercel function GB-seconds per render.
- [ ] Failed jobs: a failed job still spent money. Fail earlier (moderation before images, validate before video) and refund-safe retries only.

### 5.3 Revenue

- [ ] **Annual plans** (2 months free): cash up front, lower churn. Stripe prices exist in `config/plans.ts` as `stripePriceIdYearly: null`.
- [ ] Price test: Starter is the entry plan; compare a €9.99 tier with fewer credits against the €14.99 tier (margin table in the PR).
- [ ] Top-up nudges when credits run low (lifecycle email exists: `api/cron/lifecycle-email`).
- [ ] Dunning: Stripe Smart Retries and failed-payment emails (check enabled).
- [ ] Credit expiry or rollover rule: unused monthly credits are pure margin; decide policy with Tudor.
- [ ] Affiliate payout (30% recurring) cost model, so CAC is known before launch.
- [ ] Voice slots are a scarce paid resource (`SAVE_VOICE_CREDITS`): check the price still covers the ElevenLabs plan slot cost.

### 5.4 Platform spend

- [ ] Vercel: Hobby limits vs Pro; function duration and memory for renders; image optimisation and bandwidth.
- [ ] Supabase: plan, storage growth of the `media` bucket (add a retention rule for old renders), egress.
- [ ] Sentry sampling, Resend volume, domain renewals.

---

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 money), this file, `git log -20`, open and recent PRs. An item with an open PR is in review, not available.
- **MRR ratio first:** run `scripts/finance-report.mts` (needs `.env.local`; if absent, use the Supabase and Stripe connectors for the same numbers) and record it in §4. If the ratio is below 3x, that is the day's item.
- **One item per run**, the top of §5 by cash return. Prefer improving an open `ceo-finance/*` PR.
- **Evidence:** every price carries a source link and a date. Prices from search snippets are marked unverified. Measured numbers beat researched ones. Never edit `costUsdPerUnit` in `config/models.ts` without a measured value or a cited price page.
- **Files it may change:** this file, `scripts/finance-report.mts`, `src/features/metrics/**`, `tests/metrics/**`, `src/config/models.ts` and `src/config/plans.ts` (proposals as PRs only), `docs/**`, and the finance lines of `TheMasterPlan.md`. It never touches webhooks, migrations that change money tables, or live secrets, and never edits UI files while a `ceo-design/*` PR is open.
- **Money moves need Tudor:** changing prices, credit grants, a live vendor, or any paid plan is a PR he approves. The routine proposes with a before/after margin table from `margin-report.mts`.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `npx tsx scripts/margin-report.mts` still passes (exit 0).
- **Notify** (PushNotification) when: the MRR ratio is below 3x, a vendor price rose or a cheaper vendor saves > 20% of cost per video, a payment failed or a spend cap is close, or the run could not read a data source. Stay silent when nothing changed.
- **Output:** a digest: KPI table with change since last run, what the workers found, the PR link, **Needs from Tudor**, and the next item.

---

## 7. Payments inventory (fill in; the routine keeps it current)

| Vendor                 | What for                | Billing model                         | Monthly €  | Source of truth | Status |
| ---------------------- | ----------------------- | ------------------------------------- | ---------- | --------------- | ------ |
| fal.ai                 | images, Premium video   | per MP / per second                   | usage      | fal dashboard   | open   |
| ElevenLabs             | voiceover, voice design | plan + characters, custom slots       | ?          | EL dashboard    | open   |
| Anthropic              | script writer           | per token                             | usage      | Console usage   | open   |
| Vercel                 | hosting, functions      | plan + usage (`list_billing_charges`) | ?          | Vercel MCP      | open   |
| Supabase               | DB, auth, storage       | plan + usage                          | ?          | Supabase MCP    | open   |
| Stripe                 | payments                | 1.5% + €0.25 (EEA cards, assumed)     | % of sales | Stripe          | open   |
| Resend, Sentry, domain | email, errors, DNS      | plan                                  | ?          | dashboards      | open   |

---

## 8. Access and tooling the routine needs

**Already in the repo or session:** GitHub (this repo), Supabase connector, Vercel connector (billing charges, usage, runtime logs), Stripe connector (needs re-authorisation in claude.ai connector settings; it showed "requires authentication" on 2026-10-20), web search.

**Needs from Tudor:**

1. **Create the routine** at claude.ai/code/routines: name "Shortcraft Finance CEO", repo `TudorFnsn/Shortcraft`, Opus-class model, 12:00 UTC daily, with the prompt in §9. Add its id to §10 and to `TheMasterPlan.md` §9.
2. **Re-authorise the Stripe connector** (read access is enough: MRR, churn, failed payments, fees).
3. **Read-only billing access** for fal.ai, ElevenLabs and Anthropic usage: either connectors if available, or a monthly CSV/screenshot of each usage page pasted into the repo under `docs/finance/`, or read-only API keys stored as routine secrets (`FAL_ADMIN_READ`, `ELEVENLABS_READ`, `ANTHROPIC_ADMIN_READ`). The routine never needs write keys.
4. **Supabase read access from the routine's network.** On 2026-10-20 the `supabase` MCP entry in `.mcp.json` failed to connect from the cloud session (`ERR_PROXY_TUNNEL`) while the claude.ai Supabase connector loaded. Use the claude.ai connector in the routine. The report script needs `SUPABASE_SERVICE_ROLE_KEY` in the routine's environment, or run it locally and paste `--json`.
5. **Real numbers:** actual monthly price of the ElevenLabs plan, Vercel plan, Supabase plan, and any other subscription (§7).

**Suggested additions (ask before installing):**

- Connectors: Stripe (revenue), a bank or accounting connector (Qonto, Wise, Xero or QuickBooks) for true cash balance and every payment, Google Sheets for a shared cost ledger, Slack or email for the digest.
- Cost observability: Anthropic Console usage export, fal.ai usage API, Vercel `list_billing_charges` and `list_contract_commitments`.
- Product analytics later: PostHog for funnel and cohort retention (no vendor today).
- Claude tools: a `cost-ledger` skill that formats §7, and the Supabase read-only role so the routine never holds the service key.

---

## 9. Routine prompt (paste into the routine)

> You are the Shortcraft Finance CEO, running unattended. Read `FinancePlan.md` and `TheMasterPlan.md` §7 first, then follow §6 of `FinancePlan.md` exactly. You are the master agent: split the work across parallel workers as in §2 (revenue analyst, cost auditor, vendor scout, platform spend, pricing strategist), rank what they return by cash return, pick one item, implement it on a `ceo-finance/<slug>` branch with tests, open a PR, update §4, §5, §7 and the changelog. Always compute the MRR ratio first. Never merge, never touch live secrets, never change a live vendor or price without Tudor's approval. Send a PushNotification only for the conditions listed in §6; otherwise end quietly with the digest.

---

## 10. Links and changelog

- Routine id: _not created yet_ (see §8.1).
- Related: `scripts/margin-report.mts` (gate), `scripts/metrics-report.mts` (north star), `scripts/finance-report.mts` (this track), `src/features/billing/margin.ts`.

**Changelog (newest on top)**

- **2026-10-20** — Finance track created: charter, master + worker agent design, KPI definitions, ideas backlog (video cost first), payments inventory, access list. Added `src/features/metrics/finance.ts` + `scripts/finance-report.mts` (read-only MRR, net MRR, ARPU, metered cost, cost per finished video, burn per credit, gross margin, MRR ratio) with +5 tests. No migration, no dependency, no runtime change. (Finance CEO, setup)
