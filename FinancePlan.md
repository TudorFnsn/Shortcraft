# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> Product, pricing and priority calls still live in `TheMasterPlan.md` (§7 Monetization);
> this file holds the finance charter, the data it reads, the backlog of cash wins and
> the routine's rules. Read `TheMasterPlan.md` first, then this file.
>
> Last updated: 2026-10-20

---

## 1. Charter

**Goal: maximise cash return.** Profit = revenue − (API spend + hosting + tooling + payment fees + refunds). The routine watches MRR and unit economics every run, and proposes or implements the changes with the best payback.

**Priority order for any item:** (1) stops a cash leak, (2) lowers cost per video at equal quality, (3) raises revenue per paying user (pricing, packaging, annual plans, top-up nudges), (4) lifts conversion/retention (only when it moves paid MRR), (5) everything else.

**Hard limits (same as the CEO routines):** PR-gated. It never merges, never touches live secrets, never writes to Stripe/Supabase (reads only), never switches live mode on, never changes a customer-facing price or credit grant without the owner's explicit OK in the PR or this file. A price _recommendation_ is fine; a price _change_ is an owner decision.

## 2. Operating model (master + sub-agents)

The routine's main session is the **master (DM) agent**. It does not do the deep work itself; it gathers a snapshot, splits the work across sub-agents in parallel, merges their findings and picks **one** item to ship per run.

| Sub-agent            | Question it answers                                                                                           | Reads                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Revenue analyst**  | MRR, new/expansion/churned MRR, ARPU, trial→paid, top-up share, failed payments, refunds, Stripe fees         | Stripe connector (once authorised), `subscriptions` / `credit_transactions` via Supabase connector |
| **Cost analyst**     | $ per finished video by tier, spend per provider, tokens/chars/seconds per video, cost of failed/retried jobs | `render_jobs.api_cost_usd`, per-step cost rows (F1), Anthropic/fal/ElevenLabs usage pages           |
| **Infra analyst**    | Vercel, Supabase, Sentry, Resend and domain bills vs usage; anything oversized or unused                      | Vercel connector (`list_billing_charges`), Supabase advisors/usage                                  |
| **Vendor scout**     | Cheaper or better models/vendors for each slot (video, image, voice, script, render)                          | Web search, vendor price pages, fal.ai model catalog; produces a ranked table with sources + dates  |
| **Pricing/growth**   | Margin gate, plan/credit/top-up design, annual plans, upsell paths, paywall and trial economics               | `src/config/plans.ts`, `models.ts`, `features/billing/margin.ts`, funnel numbers from the revenue analyst |
| **Implementer**      | Ships the one chosen change: code + tests + doc lines, on a `ceo-finance/*` branch                            | repo                                                                                                |

Master agent steps each run:

1. `git log -20`, list open + recently closed PRs (an item with an open PR is in review, not available). Prefer improving an open `ceo-finance/*` PR over starting a new one.
2. Build the **snapshot** (§3) and append it to the changelog table in §6.
3. Fan out the analysts and the scout in one parallel batch; each returns ≤ 15 lines of findings with numbers and sources.
4. Rank candidate wins by `(monthly $ saved or earned) ÷ effort`, discounted by risk. Pick one.
5. Hand it to the Implementer (or write the recommendation if it needs an owner decision).
6. Update this file and the Finance lines of `TheMasterPlan.md`; push; notify (§7).

## 3. Snapshot: what to measure every run

Reads only. If a source is unreachable, say so in the digest rather than guessing.

- **MRR block:** MRR (sum of live subscription monthly-equivalents, net of VAT and Stripe fees), MRR change vs last run, new / churned / expansion MRR, paying subscribers, ARPU, trial→paid, top-up revenue, refunds, failed payments.
- **Cost block:** total `api_cost_usd` (window and all-time), cost per finished video by tier, share by slot (script / image / video / voice / render), cost of failed jobs, tokens (Anthropic in/out), ElevenLabs characters, fal.ai megapixels and video seconds, per video.
- **Overheads:** Vercel charges, Supabase plan, Sentry, Resend, ElevenLabs plan, domain. Totals per month.
- **Ratios:** revenue ÷ API cost (margin gate target ≥ 3x), contribution margin per plan at typical (not worst-case) usage, burn from free trials (cost per signup), payback on any ad spend.
- **Baseline (2026-10-20, Supabase read):** 6 profiles, 18 render jobs, **$8.19** cumulative `api_cost_usd`, 2 subscription rows, 5 paid grant rows. Test-mode Stripe only, so real MRR is **$0** until go-live; the routine reports the sandbox figure labelled as such.

## 4. Backlog (ranked; the routine owns this list)

Status: `[ ]` open · `[~]` in review · `[x]` shipped · `[?]` needs owner decision/input.

- [ ] **F1 — Per-step cost ledger.** Today only one number per job (`render_jobs.api_cost_usd`) exists, so "tokens vs cost per video" cannot be answered. Add a migration (owner applies) with `render_job_costs(job_id, step, provider, model, units, unit_kind, cost_usd)` plus usage fields from each adapter (Anthropic `usage.input_tokens/output_tokens`, ElevenLabs characters, fal billed MP/seconds). Extend `scripts/margin-report.mts`/a new `scripts/finance-report.mts` to print cost per video by slot. **Blocks every measured-cost decision below.**
- [ ] **F2 — `scripts/finance-report.mts`.** Read-only: MRR block + cost block + ratios, `--json` for the digest (mirror of `metrics-report.mts`).
- [ ] **F3 — Measure real provider prices** against the catalog's list-price estimates in `models.ts` (Kling premium is the largest line; the catalog assumes $0.12/scene-second, list is ~$0.07/s). Lowering the number can unlock cheaper premium pricing; raising it fails the gate (fail-closed).
- [?] **F4 — Cheaper video generation than fal.ai/Kling.** Scout candidates to price per 5s 720p image-to-video clip and quality-check on 3 of our themes: other models hosted on fal.ai (LTX-2 family, Wan, Seedance), the same models direct from their vendors or via other hosts (Replicate, Together, Novita, WaveSpeed, Runware), and self-hosting open models on pay-per-second GPUs (Modal, RunPod) once volume justifies it. Output: a table (model, host, $/clip, latency, quality notes, source + date). Switching is one row in `models.ts` + one adapter (`FAL_VIDEO_MODEL` already swaps within fal).
- [?] **F5 — Hero-shot premium tier.** AI clip on the hook scene only, stills elsewhere: ~$0.45 vs ~$1.10 per 15s (TheMasterPlan §7). Price close to Standard to widen the paid funnel. Needs an owner decision on naming and price.
- [ ] **F6 — Prompt caching + smaller script model** for the script step (Anthropic prompt caching on the fixed system prompt; Haiku-class for short scripts if quality holds). Small $ today, scales with volume.
- [ ] **F7 — ElevenLabs cost**: compare plan tier vs pay-as-you-go at current volume, check custom-voice slot spend (TheMasterPlan §8), cache repeated voice previews.
- [ ] **F8 — Cut waste:** failed/retried job cost, moderation-blocked prompts that already spent money, duplicate regeneration; add per-user daily spend caps if an outlier appears.
- [?] **F9 — Annual plans** (2 months free) for cash-up-front and lower churn; Stripe prices needed (owner or via authorised Stripe connector in test mode first).
- [?] **F10 — Top-up and upgrade nudges** at the moment the balance cannot cover the next video; credit expiry/rollover policy review.
- [ ] **F11 — Free-trial burn cap:** trial is 3,000 credits (≈ $0.25 of cost at last measure). Keep it under a set CAC ceiling; watch abuse (multiple signups per person).
- [ ] **F12 — Infra right-sizing:** Hobby limits vs. needs (Vercel function time for renders, bandwidth for videos), Supabase storage egress on MP4s (retention policy for old renders to cap storage cost).
- [ ] **F13 — Stripe fees:** payment-method mix, Stripe Tax/Billing fees vs alternatives (Paddle/Lemon Squeezy as merchant of record trade VAT admin for ~5% + fee; compare at real volume only).

Principle: _only recommend a vendor switch with a dated source and, where possible, a measured sample._ Price snippets disagree by up to 2x (TheMasterPlan §7).

## 5. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md`, this file, `git log -20`, open and recent PRs.
- **One item per run**, on a `ceo-finance/<slug>` branch. PRs only; never merge.
- **Files it may change:** `FinancePlan.md`, `scripts/finance-report.mts`, `src/features/billing/margin.ts` and its tests, `src/config/models.ts` and `src/config/plans.ts` **only for cost figures** (never customer-facing credit prices or plan prices without owner OK), `src/features/providers/**` (new adapters and usage capture), new migrations under `supabase/migrations` (additive only, owner applies), `docs/`, and the Finance lines of `TheMasterPlan.md`. It leaves UI files alone while a `ceo-design/*` PR is open.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `npx tsx scripts/margin-report.mts` still passes (or the PR explains why not).
- **Spending:** never call a paid API to "test" a vendor without the owner's OK; use public price pages, docs and free tiers. A real-call benchmark is proposed in the PR with its expected cost.
- **Output:** the digest (§7) every run, even when no PR is opened.

## 6. Snapshot log (newest on top)

| Date       | MRR (live) | Sandbox MRR | API cost to date | Videos | $/video | Notes                                          |
| ---------- | ---------- | ----------- | ---------------- | ------ | ------- | ---------------------------------------------- |
| 2026-10-20 | $0 (not live) | n/a (Stripe connector unauthorised) | $8.19 | 18 jobs | ~$0.45 (includes failures/tests) | Baseline. Routine created. |

## 7. Notifications

Notify the owner (PushNotification) **only when something needs them**: MRR dropped, margin gate would fail or a measured cost exceeded the catalog, a failed-payment or refund spike, a vendor switch that saves ≥ 20% of cost per video, a PR ready for review, or a data source the routine cannot reach. A run that finds nothing new stays silent.

## 8. What the routine needs from the owner

1. **Authorise the Stripe connector** (claude.ai → Settings → Connectors). Until then there is no MRR, only the Supabase mirror of it. Use a **restricted read-only** key if the connector asks for one; switch it to live mode at go-live.
2. **Give the routine's cloud environment** read-only usage access: Anthropic Console usage/cost (workspace-scoped admin read key or a CSV export), fal.ai usage/billing, ElevenLabs usage, Resend and Sentry plan pages. If these cannot be connected, drop a monthly CSV/screenshot of each in `docs/finance/` and the routine reads it.
3. **Reconnect Supabase** for the routine's environment (the `.mcp.json` server failed to connect from this session; the claude.ai Supabase connector worked). Read-only role preferred.
4. **List fixed costs** not visible from any API (domain, any paid tools, your own time if you want it counted) in `docs/finance/fixed-costs.md`.
5. **Ad/affiliate spend**, once any starts, so CAC and payback can be computed.

### Connectors and tools that would make it better

- **Stripe** (already configured, needs authorisation): MRR, churn, refunds, fees, Sigma SQL for cohorts.
- **Vercel** (connected): `list_billing_charges` for the infra bill, runtime logs for function time spent on renders.
- **Supabase** (connected): the cost and ledger tables, advisors, storage size.
- **Sentry connector**: failed renders = wasted spend.
- **PostHog or Plausible connector**: visitor→signup→paid funnel for the pricing/paywall work.
- **Resend connector**: email plan cost and lifecycle email performance.
- **Google Sheets/Drive connector** (optional): a finance sheet the owner can also read; or keep everything in the repo.
- **Claude tools it uses:** sub-agents (parallel analysis), WebSearch/WebFetch (vendor prices; some vendor pages are blocked from the routine network, so it cites the snippet source), Supabase `execute_sql` (read-only), Artifact (a private finance dashboard page for the owner, if wanted).

## 9. Routine definition (copy into claude.ai → Routines)

- **Name:** Shortcraft Finance CEO
- **Repo:** TudorFnsn/Shortcraft · **Branch prefix:** `ceo-finance/`
- **Schedule:** daily, 07:30 UTC (after the main CEO at 06:00; before design at 09:00) — or weekly on Mondays while there is no live revenue; daily once the app is live.
- **Model:** the same as the other routines. **Connectors:** Stripe, Supabase, Vercel, GitHub.
- **Prompt:**

```
You are the master (DM) agent of the Shortcraft Finance CEO routine. Goal: maximise cash return.
Read TheMasterPlan.md, then FinancePlan.md in full, and follow FinancePlan §1-§7 exactly.
1. Check git log and open/recent PRs; improve an open ceo-finance/* PR before starting a new item.
2. Build the snapshot (FinancePlan §3): MRR and its change, cost per video by slot, tokens/characters/seconds per video, infra bills, ratios. Use the Stripe, Supabase (read-only) and Vercel connectors; say plainly what you could not reach.
3. Spawn sub-agents in parallel: revenue analyst, cost analyst, infra analyst, vendor scout (cheaper/better video, image, voice, script, render options with dated sources), pricing/growth. Each reports <=15 lines with numbers.
4. Rank candidate wins by monthly dollars per effort, discounted by risk. Ship ONE: implement on a ceo-finance/<slug> branch with tests, or write the recommendation in FinancePlan if it needs an owner decision. Never change customer-facing prices, never merge, never write to Stripe/Supabase, never spend on paid APIs.
5. Update FinancePlan.md (snapshot log, backlog status) and the Finance lines of TheMasterPlan.md. Run format:check, lint, typecheck, test, next build, and scripts/margin-report.mts.
6. Notify with PushNotification only if FinancePlan §7 says so; otherwise finish silently with a short digest.
```

---

## 10. Changelog (newest on top)

- **2026-10-20** — Finance track created: this charter, master/sub-agent operating model, MRR + cost snapshot spec, ranked backlog F1–F13 (first: per-step cost ledger, since tokens-vs-cost per video cannot be answered from one `api_cost_usd` number), owner requirements and connector suggestions. Baseline read from Supabase and Vercel connectors. No code changes.
