# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md` (the master plan wins on product and priority;
> this file wins on cost, pricing and cash). Every finance PR updates this file
> (backlog + changelog) in the same change.
>
> Last updated: 2026-10-15 (created)

---

## 1. Charter (owner-requested 2026-10-15)

Maximise **profit and cash return**. Every run: check the MRR picture, find the
cheapest way to produce a video at the same quality, find ways to monetise
better, and prioritise whatever returns cash soonest.

Always report these numbers (and say which are measured vs estimated):

1. **MRR** (EUR, from active subscriptions) and its change, new/churned subscribers, trial → paid.
2. **Cost per video** by shape (Standard/Premium × length): provider spend per step (script tokens, images, AI video seconds, voice characters, render).
3. **Revenue per video** (credits charged ÷ credit price net of VAT and Stripe fees) and **gross margin %** (the margin gate target is ≥ 3x).
4. **Fixed costs**: Vercel, Supabase, ElevenLabs plan, Resend, domain, Sentry/PostHog when added.
5. **Burn vs MRR**: monthly fixed + variable cost, break-even MRR, runway.

Autonomy: **PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`; never merge. Any write to Stripe, Supabase data/migrations, Vercel settings or a provider account needs the owner's explicit OK. Price changes to customers (plan prices, credit amounts) are **proposals only** until the owner approves.

---

## 2. The routine: a master agent that splits the work

Same pattern as the other routines. The **master** (the routine session) reads
this file, `TheMasterPlan.md`, `git log -20` and open + recently closed PRs
(an item with an open PR is in review, not available), then fans out
independent workers in one message and merges their reports. Workers do not
write code unless the master assigns an exact file list.

| Worker                 | Job                                                                                                                                                                                                             | Output                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Revenue analyst**    | MRR, subscribers, churn, trial → paid, top-up share. Stripe API read (sandbox now, live later), `scripts/metrics-report.mts`.                                                                                   | MRR table + deltas                          |
| **Unit-cost auditor**  | Tokens and provider units per finished job vs `api_cost_usd`; compares catalog `costUsdPerUnit` to invoiced spend; runs `scripts/margin-report.mts`; flags overruns and failed-job waste.                       | Cost per video by shape, margin per product |
| **Fixed-cost auditor** | Vercel / Supabase / ElevenLabs / Resend / other plans and usage; which tier is oversized, which free limit is near.                                                                                             | Fixed-cost table, downgrade/upgrade calls   |
| **Provider scout**     | Web research (`WebSearch`, `extended` for niche/new): cheaper or better image, video, voice and script models, caching, batch pricing, new platforms. Prices from provider pages, not snippets, when reachable. | Ranked swaps with $/video saved and risk    |
| **Monetisation lead**  | Pricing, packaging, credit scale, annual plans, top-up nudges, trial burn, referral/affiliate, upsell paths, churn saves. Models each idea on real numbers.                                                     | Ranked ideas with expected €/month          |
| **Implementer**        | Only when the master picks one change: builds it (usually `src/config/models.ts`, a provider adapter, a script), runs the bar below, opens the PR.                                                              | PR                                          |

**One shipped change per run**: the highest expected cash per unit of effort that
is not already in an open `ceo-finance/*` PR. Prefer improving an open finance PR.

**Files it may change:** `FinancePlan.md`, `scripts/finance-*.mts`, `src/features/finance/**`, `src/config/models.ts` (costs and credits per unit), provider adapters under `src/features/providers/live/**` (new/cheaper model behind the existing port), and the finance lines of `TheMasterPlan.md`. It never touches the UI files owned by the Design CEO, migrations, webhooks or auth. `src/config/plans.ts` and top-up prices change only with the owner's approval written in §6.

**Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and the margin gate stays ≥ 3x. A provider swap must be A/B-checked on quality (owner looks at output) before it becomes the default; until then it ships behind an env switch like `FAL_VIDEO_MODEL`.

**Output:** a digest (MRR, cost/video, margin, top 3 opportunities with €/month, what is waiting on Tudor, next item). **Notify the owner** (`PushNotification`) only when: MRR moved materially, a margin fell below 3x, a cost spiked, a PR needs a decision, or the routine could not reach its data.

---

## 3. Data access (checked 2026-10-15)

| Source                                | Status                                                                                                                                                                                                                                | What the routine does about it                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GitHub (`tudorfnsn/shortcraft`)       | ✅ Reachable through the GitHub connector.                                                                                                                                                                                            | Reads code, PRs; pushes `ceo-finance/*`.                                                                                           |
| Supabase connector                    | ✅ Read-only SQL works on project `iqvrovjwoavvmhaithwn` (`render_jobs`, `credit_transactions`, `subscriptions`, `profiles`). The `.mcp.json` `supabase` server failed in this session (proxy tunnel); the claude.ai connector works. | Use `execute_sql` `select`s only.                                                                                                  |
| Stripe connector                      | ⚠️ Sandbox account only (`acct_1UKkSC0LHtTQ4zpU`, test mode). **Sigma is not subscribed**, so `stripe_analytics` fails.                                                                                                               | Compute MRR from `stripe_api_read` (list subscriptions, price × quantity ÷ interval). Owner: add the live account when going live. |
| Vercel connector                      | ⚠️ Team found; `list_billing_charges` returns 404 `costs_not_found` (Hobby plan has no charges yet).                                                                                                                                  | Re-check monthly; once on Pro it gives the hosting line.                                                                           |
| fal.ai / ElevenLabs / Anthropic spend | ❌ No connector. Provider hosts were not reachable from earlier cloud sessions.                                                                                                                                                       | Owner sends monthly totals (§6), or add the keys below. `api_cost_usd` in `render_jobs` is usage × list price, not an invoice.     |

**Needed from the owner to do this job properly** (details and priority in §6): monthly invoice totals from fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend; the live Stripe account added to the connector; Stripe Sigma (optional, ~$10-ish/month, only worth it with real volume).

---

## 4. Baseline (2026-10-15, read-only)

- **Revenue:** no live revenue. Stripe is test mode, so **MRR = €0 real**. Sandbox catalog: Starter €14.99 / Pro €29.99 / Ultra €79.99; top-ups €12 / €29 / €59.
- **Usage in the database:** 17 render jobs (14 done, 3 failed), `api_cost_usd` total **$8.13**, 55,648 credits charged. These are mostly the owner's tests (the Premium horror-story run alone was $1.92).
- **Known unit costs** (`TheMasterPlan.md` §5/§7, catalog): Standard 15s ≈ $0.04, 30s ≈ $0.05; Premium 30s (5 scenes) ≈ $1.92 at the conservative $0.12/s line. Margin gate: Starter 9.4x, Pro 3.0x (zero headroom), Ultra 3.2x, top-ups 4.0–5.9x.
- **Failure waste:** 3/17 jobs failed (18%). Failed jobs refund credits but may already have spent provider money; the auditor must quantify that (`api_cost_usd` on `status='failed'`).

---

## 5. Backlog (priority = expected cash ÷ effort)

Tick items as they ship; the master picks the top unchecked one not in an open PR.

- [ ] **F1 Finance report script** `scripts/finance-report.mts` (read-only, `--json`): MRR from Stripe subscriptions, cost per job shape from `render_jobs`, failed-job spend, fixed-cost inputs from a small `config/fixed-costs.ts` the owner fills, burn and break-even MRR. Pure math in `src/features/finance/` with tests. _This is the routine's instrument; build it first._
- [ ] **F2 Premium video cost** — the biggest variable cost. Scout and price against Kling 2.5 Turbo Pro (~$0.07/s on fal): Wan 2.x, Seedance, LTX-2 / LTX Video, Hailuo, Veo Fast, and image-to-video on cheaper hosts (Replicate, Runware, WaveSpeed, Novita, direct vendor APIs). Check per-clip minimums (Kling bills fixed 5s clips, so a 3s scene wastes 40%). Ship the winner behind `FAL_VIDEO_MODEL` / a new adapter id.
- [ ] **F3 Hero-shot Premium** — AI clip on the hook scene only, stills for the rest (~$0.45 vs ~$1.10 per 15s). Price it between Standard and full Premium; most of the perceived quality for a third of the cost. Needs the owner's call (TheMasterPlan §5 "Decide the Premium shape").
- [ ] **F4 Script tokens** — measure input/output tokens per script from the Anthropic response `usage`; store them on the job (needs a migration, owner-applied). Then: prompt caching on the fixed system prompt, a Haiku-class model for the script where quality holds, trimmed schema. Script is $0.04 of a $0.04 Standard video, so it is most of the Standard cost.
- [ ] **F5 Image cost** — compare FLUX schnell ($0.003/MP) with other fast models and with caching/reuse of theme stills; check that a 720×1280 image really bills as 1 MP.
- [ ] **F6 Voice cost** — ElevenLabs Flash ($0.05/1k chars) vs cheaper TTS (OpenAI, Cartesia, Deepgram Aura, Google/Azure neural, Kokoro self-hosted). Voice is per-character; also watch custom-voice slot limits (§8 of the master plan).
- [ ] **F7 Failed-job waste** — which step fails, how much provider spend is lost per failure, retry-before-refund, earlier moderation to fail before spend.
- [ ] **F8 Monetisation experiments** (all proposals for the owner): annual plans (~2 months free, cash up front), a €5–9 entry top-up, trial burn cap and trial → paid nudge, "videos left this month" upsell at 80% of credits, credit expiry/rollover policy, a Premium pack, affiliate payout cost model (30% recurring) vs ads CAC, regional pricing, VAT handling (Stripe Tax vs manual).
- [ ] **F9 Fixed-cost review** — Vercel Hobby limits (commercial use needs Pro: confirm with the terms before going live), Supabase free vs Pro (point-in-time recovery, leaked-password protection are Pro), ElevenLabs plan sizing, Cloudflare R2 for egress (already in the master plan), Resend tier.
- [ ] **F10 Live monitoring** — a daily cost-spike check (`api_cost_usd` per day vs revenue per day) that the routine can run and notify on.

---

## 6. Open questions for the owner

1. **Monthly spend totals** for fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend (even rough). Without invoices, "cost" is list price × usage. _(Already requested for 2026-10-08 in the master plan.)_
2. **Stripe live account** added to the connector when you go live, so the routine reads real MRR. Until then MRR is €0 and the routine reports it as such.
3. **Approval to change prices?** Default is no: the routine only proposes. Write "prices: routine may change X" here to widen it.
4. **Quality bar for a cheaper model:** who approves an A/B (you, by looking at two videos)? Default: you.
5. **Break-even target:** your monthly fixed cost and the MRR you want to reach, so the routine can say how far away it is.

---

## 7. Suggested connectors, tools and add-ons (ranked by value for this job)

1. **Stripe live account in the Stripe connector** (have the connector, needs the account): real MRR, churn, refunds, fees.
2. **Stripe Sigma** (optional): SQL over subscriptions/invoices for cohorts and churn. Not needed below ~100 subscribers; the Stripe API read is enough.
3. **Provider usage/cost APIs as read-only keys in the routine environment:** Anthropic Admin API (usage + cost report), ElevenLabs `/v1/user/subscription` (character usage), fal.ai usage/billing page or API. Read-only keys only, stored as routine secrets, never in the repo. This replaces "owner sends totals".
4. **Vercel connector (have it):** `list_billing_charges` once on Pro; `get_runtime_logs` for render durations (function seconds are a cost).
5. **Supabase connector (have it):** read-only `execute_sql`; consider a read-only Postgres role for the routine so no write is possible by accident.
6. **PostHog** (planned in the master plan): signup → first video → paid funnel, to put a number on CAC and activation. Add its read key later.
7. **Sentry** (already a dependency): failure rate per step, to size the failed-job waste.
8. **Claude tooling that helps:** `WebSearch` (`extended` mode for model/price scouting), subagents for the workers above, the `xlsx` skill for an owner-readable finance workbook, the `dataviz` skill + an Artifact page as a private finance dashboard (MRR, cost per video, margin) that republishes each run, and `loop`/routine scheduling for the weekly cadence.

---

## 8. Cadence

Recommended: **weekly** (Mondays 07:00 UTC) while there is no revenue, **daily** once real money flows. A daily run with nothing new wastes tokens; the routine should exit with no notification when nothing changed.

---

## 9. Changelog (newest on top)

- **2026-10-15** — Finance track created: charter, worker split, data-access audit (Supabase read OK; Stripe sandbox only and no Sigma; Vercel charges unavailable on Hobby; no provider billing access), baseline (17 jobs, $8.13 API cost, €0 real MRR) and backlog F1–F10. No code change. (Interactive)
