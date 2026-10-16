# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> ("Shortcraft Finance CEO"). It sits under `TheMasterPlan.md`: the master plan
> wins on product and priority; this file wins on cost, pricing and cash.
> Every finance PR updates the ledger (§7) and changelog (§9) in the same change.
>
> Last updated: 2026-10-16 (created; baseline only, no live revenue data read yet)

---

## 1. Charter (owner request 2026-10-16)

Maximise **profit and cash return**. Every run: check MRR, find the biggest leak
or lever, and propose or implement it.

| Question  | Answer                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | Max contribution profit, then max MRR. Cash first: prefer annual prepay, fewer free-trial losses, lower COGS.                                            |
| Always    | Report MRR, net new MRR, churn, ARPU, gross margin, cost per finished video, trial burn, runway-style "cash in vs cash out" for the month.               |
| Scope     | Pricing and plans, credit scale, model/vendor swaps, infra plan choices, trial/abuse limits, upsell and top-up flows, annual plans, payment fees, taxes. |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`. Never merge, never touch live secrets, no Stripe writes or live-mode changes.      |
| Hard rule | The margin gate (`npx tsx scripts/margin-report.mts`, 3x worst case) must still pass after any change. Fail-closed stays on.                           |
| Cadence   | Daily cloud routine, 07:00 UTC (after the CEO at 06:00, before Design at 09:00). Weekly deep dive on Mondays.                                            |
| Files     | May edit `config/models.ts`, `config/plans.ts`, `features/billing/**`, `features/providers/live/**`, `scripts/*report*`. Leave UI files to Design CEO.   |

## 2. Run protocol: the master agent ("Finance CEO") and its team

The master agent does **not** do the analysis itself. It reads this file, checks
PRs, decides which sub-agents the day needs, launches them **in parallel in one
message** with narrow briefs, then merges their answers into one decision.

**Step 0 (always):** list open + recently closed PRs (`ceo-finance/*`, `ceo/*`,
`ceo-design/*`). An item with an open PR is in review, not available. Read
`TheMasterPlan.md` §7 and §10 and §7 of this file.

**Step 1 (always): data access check.** Try each source in §4. Record in the
ledger which worked. A missing source is reported (notification) once, with the
exact fix; do not guess numbers that a source would give.

**Step 2: dispatch.** Typical day = A + B + one of C/D/E. Monday = all.

| Agent                   | Question it answers                                                                                                         | Reads                                                                                                    | Output                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **A. Revenue/MRR**      | MRR, net new MRR, churn (logo + revenue), ARPU, trial→paid, refunds, failed payments, annual vs monthly mix, Stripe fees.   | Stripe (MCP/Sigma), `subscriptions`, `credit_transactions`, `scripts/metrics-report.mts`                 | MRR table + 3 biggest movements                                 |
| **B. Unit economics**   | Real cost per finished video by shape (tier, length), cost per credit, tokens in/out per script, failed-job waste, trial burn. | `render_jobs.api_cost_usd`, `charged_credits`, `scenes`, provider usage APIs, `scripts/margin-report.mts` | Measured vs modelled cost; rows that break the gate             |
| **C. Vendor scout**     | Cheaper or better replacements per slot: video, image, voice, script (§5). Verifies prices on the vendors' own pages.        | WebSearch (extended for niche prices), WebFetch of pricing pages                                         | Candidate table: $/unit, quality, licence, API fit, risk, saving |
| **D. Infra auditor**    | Every recurring bill: Vercel, Supabase, ElevenLabs plan/slots, Resend, Sentry, domain, Anthropic. Wasted or over-provisioned. | Vendor billing/usage APIs and MCPs (§4), `docs/DEPLOYMENT.md`                                            | Bill list with $/mo, free-tier headroom, downgrade/upgrade call |
| **E. Pricing/monetise** | Plan prices, credit packs, annual discount, trial size, upsells, paywall moments, price tests, abuse limits.                | A + B output, competitors' public pricing, `config/plans.ts`                                             | 1-3 ranked experiments with expected € per month                |
| **F. Implementer**      | Turns the chosen change into a PR: code, tests, margin-gate proof, ledger + changelog.                                       | The repo                                                                                                 | One PR, gate output pasted in the description                   |

Rule: C and E only propose; F only builds what the master picked. The master
picks by **expected € per month ÷ effort**, discounted by risk, and never more
than one pricing change per week (so effects stay attributable).

**Step 3: decision + notification.** Send a notification (PushNotification,
`<routine_summary>`) only when: MRR drops week over week, the margin gate or a
measured cost breaks, a source is missing/blocked, a PR is ready for review, or
a saving over €20/mo is found. Quiet days stay silent.

## 3. North-star money metrics (definitions)

- **MRR** = sum of live subscriptions' monthly-equivalent net price (annual ÷ 12), excluding VAT and Stripe fees shown separately. Net new MRR = new + expansion − contraction − churn.
- **Gross margin** = (net revenue − API cost − infra allocated) ÷ net revenue. Target ≥ 70% blended; gate floor stays 3x revenue/worst-case cost.
- **Cost per finished video** by shape, from `render_jobs.api_cost_usd`; failed jobs count as cost with zero revenue.
- **Trial burn** per signup; **CAC payback** once paid acquisition exists (kill cohorts where CAC > first-month revenue, per master plan §6).
- **Tokens vs spend**: Anthropic input/output tokens per script and $ per script (modelled $0.04; measure it), plus fal seconds and ElevenLabs characters per video. Per-video COGS = script + images + clips + voice + render.

## 4. Access matrix (state as of 2026-10-16) and what to connect

| Source                  | Status this run                                                                 | Needed for                | Action for owner                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GitHub (repo)           | **Works** (branches, PRs)                                                       | all code work             | none                                                                                                                     |
| Supabase MCP            | **Failed to connect** from this cloud session (`ERR_PROXY_TUNNEL`)               | A, B (the cost ledger)    | Retry; if it persists, allow `mcp.supabase.com` in the environment's network policy, or set `DATABASE_URL` read-only role |
| Stripe MCP              | **Needs authorisation** (claude.ai connector settings). Sandbox account only     | A (MRR)                   | Authorise Stripe connector; later add a **restricted read-only live key** when live                                       |
| Vercel MCP              | **Works**, but `list_billing_charges` returns 404 (Hobby plan, no charges)       | D                         | none until Pro; then it feeds D automatically                                                                            |
| Anthropic usage         | Not connected                                                                   | B (tokens), D             | Create an **Admin API key** (read-only usage/cost report) and store as env var `ANTHROPIC_ADMIN_KEY` in this routine's environment |
| fal.ai usage/billing    | Not connected                                                                   | B, D                      | fal dashboard → usage export or API key with billing read; env var `FAL_ADMIN_KEY`                                        |
| ElevenLabs usage        | Not connected                                                                   | B, D                      | `ELEVENLABS_API_KEY` with usage read (subscription + usage endpoints)                                                     |
| Resend, Sentry          | Not connected                                                                   | D                         | Optional; free tiers for now, check quotas monthly                                                                       |
| PostHog / analytics     | Not connected                                                                   | E (funnel: view→trial→paid) | Add PostHog (or Vercel Web Analytics) connector when traffic exists                                                       |
| Ad platforms (Meta/TikTok) | Not connected                                                                | CAC                       | Only once paid ads start                                                                                                  |
| Web research            | **Works** (WebSearch/WebFetch)                                                  | C, E                      | none                                                                                                                     |

**Cleanest fix for A and B:** a read-only reporting path to the production DB
(a Postgres role with `select` on `render_jobs`, `credit_transactions`,
`subscriptions`) plus the Stripe read connector. Everything else is a nice-to-have.
Suggested add-ons: Stripe MCP (live, read-only), Supabase MCP (already in
`.mcp.json`), a PostHog connector, and a Google Search Console connector for the
SEO pages. Routines can't prompt the owner mid-run, so missing access becomes a
notification, never a silent skip.

## 5. Vendor baseline for scouting (searched 2026-10-16; vendor blogs, **verify on the vendor's own pricing page before acting**)

Our slots and current cost (from `config/models.ts`):

| Slot            | Today                                    | Modelled cost                         |
| --------------- | ---------------------------------------- | ------------------------------------- |
| Script          | Claude Sonnet 5.5                        | $0.04 per script                      |
| Image           | FLUX.1 schnell on fal                    | $0.003 per image                      |
| Video (Premium) | Kling 2.5 Turbo Pro via fal              | ~$0.07/s list, **$0.12/s** in the gate |
| Voice           | ElevenLabs Flash 2.5                     | ~$0.05 per 1k chars                   |
| Render          | In-house ffmpeg                          | ~$0.01 per video                      |

Leads to test (claims from aggregator blogs, not confirmed):

- **Video:** Wan 2.2 Turbo around $0.026/s, Kling 3.0 Std around $0.071/s (aggregator, e.g. Atlas Cloud), Seedance 2.0 Fast quoted $0.022/s to $0.24/s depending on reseller and resolution; fal itself lists Seedance 2.0 Fast at $0.2419/s (720p). Spread is 10x, so measure on real calls with the same prompt and clip. Check quality at 5s, 9:16, face/motion artefacts, and the reseller's uptime and licensing for commercial use before any swap.
- **Voice:** Deepgram Aura-2 about $0.030 per 1k chars, OpenAI TTS about $0.015 per 1k chars, Google/Polly standard about $0.004 (lower quality). ElevenLabs stays where voice design / saved voices matter (custom-voice slots). A cheap "default voice" with ElevenLabs reserved for designed voices could cut voice COGS, but voice is already <$0.01 per 15s video, so low priority.
- **Biggest lever is not the vendor but the shape:** per master plan §7, Premium's AI clips are ~90% of cost. Options in order: hero-shot variant (AI clip on scene 1 only), cheaper clip model, shorter clips, cache/reuse clips.
- **Script:** at $0.04 per script a smaller model (Haiku 5.5) may do the same job at a fraction; test quality, and use prompt caching for the fixed system prompt.

## 6. Monetisation ideas queue (ranked by my guess, to be re-ranked with real data)

1. **Annual plans** (2 months free): improves cash and churn. Needs Stripe price objects (owner) and `config/plans.ts` support.
2. **Trial tightening:** one trial per card/device/IP, watermark kept, smaller Premium trial. Trial burn is $0.25 modelled; abuse is the real risk.
3. **Hero-shot Premium** as a mid tier priced between Standard and full Premium.
4. **Top-up nudges** at low-credit moments (balance < one video) in Create and by lifecycle email.
5. **Annual-only Ultra / agency seat** for creators running many niche accounts.
6. **Affiliate (30% recurring)** only after gross margin is measured; cap payouts so margin stays ≥ 3x.
7. **Price test** (Starter €14.99 vs €19.99) once there are enough signups to read it.

## 7. Ledger (append newest on top)

| Date       | Finding / action                                                                                                                                                      | Source           | € per month impact | Status |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------ | ------ |
| 2026-10-16 | Plan created. Access check: GitHub ok, Vercel ok (no billing data on Hobby), Supabase MCP failed to connect, Stripe needs owner authorisation. MRR **unknown** (no live data yet). | Finance CEO setup | n/a                | Open   |

## 8. Open questions for the owner

1. Authorise the Stripe connector, and fix the Supabase connection (or provide a read-only DB role). Until then MRR and measured COGS stay unknown.
2. Create read-only usage keys for Anthropic, fal.ai and ElevenLabs (§4) and add them to this routine's environment.
3. Is Stripe still sandbox-only? If so MRR is test data and the first real MRR number arrives at go-live.
4. Budget guardrail: what monthly spend (€) makes the routine alert immediately?

## 9. Changelog (newest on top)

- **2026-10-16** — Finance track created: charter, master-agent protocol with six sub-agents, access matrix, vendor baseline and monetisation queue. Docs only. (Finance CEO setup)
