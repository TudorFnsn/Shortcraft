# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> Product and priority calls stay in `TheMasterPlan.md`; this file holds the
> numbers, the cost-cutting backlog, the access checklist and the routine prompt.
> Last updated: 2026-10-16

## 1. Goal

Maximise **cash return**: grow MRR, keep gross margin >= the 3x gate (`features/billing/margin.ts`),
and cut every recurring cost that doesn't earn its keep. Cash in the bank beats vanity metrics.

Every run answers, with numbers: (1) MRR / net MRR / ARR, (2) API spend vs revenue
(per video, per tier, per plan, wasted on failed jobs, burned by trials), (3) every other
bill (hosting, DB, voice, email, domain, Stripe fees), (4) the one change that returns the most cash.

## 2. Measuring (read-only)

- `npx tsx scripts/finance-report.mts [--fixed-usd=N] [--json]` — MRR, net MRR, 30d COGS, wasted
  spend, cost per finished video by tier, non-paying burn, gross margin. Math: `features/metrics/finance.ts` (tested).
- `npx tsx scripts/margin-report.mts` — worst-case margin gate per product.
- `npx tsx scripts/metrics-report.mts` — north star, activation, trial -> paid.
- Not stored yet (gaps the routine should close, in this order): **token counts** per job
  (`render_jobs` only has `api_cost_usd`; add `usage jsonb` with Anthropic input/output tokens,
  fal billed seconds/megapixels, ElevenLabs characters — needs an owner-applied migration, so propose it),
  and a **`fixed_costs` table or the §6 list** for non-API bills.

## 3. Operating rules

- PR-gated, like the other routines: branches `ceo-finance/*`, never merge, never touch live secrets.
- Before picking work, list open + recently closed PRs; an item with an open PR is not available.
- Read-only on Stripe, Supabase, Vercel and every billing API. Any write (migration, price change,
  Stripe object, plan switch, live mode) needs the owner's explicit OK. Price and plan changes are
  **proposals with the maths**, not edits to live Stripe.
- Never swap a production provider on list prices alone: build the adapter behind the registry, run
  `live-providers-smoke.mts`, record **measured** cost and quality side by side, then propose.
- Stay out of UI files while a `ceo-design/*` PR is open.
- Update this file and the `TheMasterPlan.md` changelog in the same change.
- Notify the owner only for: MRR/margin moves worth acting on, a gate failure, a spend spike,
  a broken access path. Silence when nothing changed.

## 4. Routine design — master agent + workers

The master agent (Opus) reads this file, lists open PRs, gathers the numbers, **splits the work** and
merges the results into one ranked list by `expected monthly cash impact / effort`. Workers run in
parallel with a narrow brief each and return a short table, never prose dumps.

| Worker             | Brief                                                                                                                                                                                                | Output                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Revenue**        | Stripe (read-only): MRR, net MRR, new/churned/expansion, failed payments and dunning recovery, refunds/disputes, top-up vs subscription mix, annual-plan share. Compare with `finance-report`.       | Table + 3 revenue levers with EUR impact. |
| **Unit economics** | Run `finance-report` + `margin-report`. Cost per finished video by tier, wasted spend on failures, trial burn per signup, credits granted vs burned (breakage), tokens/characters/seconds per video. | Margin table + worst offenders.           |
| **Vendor costs**   | Invoices/usage of fal, Anthropic, ElevenLabs, Vercel, Supabase, Resend, Sentry, domain; compare with `api_cost_usd` totals (drift = our estimates are wrong).                                        | Bill list vs plan §6, drift %, waste.     |
| **Model scout**    | Web research (dated, with sources) for cheaper/better video, image, voice and LLM options vs the current ones; build adapter + smoke-test candidates behind the registry (§5).                       | Candidate table with measured cost.       |
| **Monetisation**   | Pricing and packaging ideas, tested against the margin gate: annual plans, top-up pricing, hero-shot premium, credit expiry, free-tier abuse limits, upsell prompts, affiliate economics.            | Ranked experiments with the maths.        |
| **Implementer**    | Takes the master's top 1-2 items that need code (adapter, cost metering, a pricing config PR) and ships them with tests, CI green.                                                                   | PR.                                       |

Master output each run: a short digest (MRR, net MRR, 30d COGS, gross margin, top 3 actions,
what shipped, what needs the owner), appended to §8, and a notification only per the rules above.

## 5. Cost-cutting backlog (hypotheses — verify with measured calls)

Current stack (`config/models.ts`): script = Claude Sonnet-class (~$0.04/job), image = fal FLUX schnell/dev,
Standard video = free Ken Burns, Premium video = fal Kling 2.5 Turbo Pro (~$0.07/billed s, 5 s clips),
voice = ElevenLabs Flash, render = in-house ffmpeg. So **only Premium video is a real cost lever**;
Standard is already ~$0.07 per 15 s video. Prices below are NOT known: the model scout must source and date them.

1. **Premium video (biggest line).** Candidates to measure against Kling 2.5 on fal: Wan 2.x, LTX-2, Seedance, Hailuo, Veo Fast; the same models called **directly** at the vendor (no marketplace markup) or via other hosts (Replicate, Together, DeepInfra, Runway/Luma APIs); self-hosting open weights on per-second GPUs (Modal, RunPod, Vast) once volume justifies it. Also: 5 s clips for 6 s scenes waste ~17% — trim scene lengths to clip lengths; cache/reuse clips for repeated themes; **hero-shot** (AI clip on scene 1 only, ~$0.45 vs ~$1.10 per 15 s).
2. **Failure waste.** Failed jobs refund credits but keep the provider bill. Measure `wastedSpend30d`; fail fast before expensive steps, retry only the failed step, keep moderation before paid calls.
3. **Script LLM.** Move to a Haiku-class model with prompt caching if quality holds (A/B on the same topics); cap output tokens.
4. **Voice.** ElevenLabs Flash vs cheaper TTS (OpenAI, Cartesia, open-weight self-host) for the default voice; keep ElevenLabs for designed/premium voices; watch the custom-voice slot cap.
5. **Images.** schnell is already ~$0.003. Cache per-theme stills; reuse a scene image when the prompt is near-identical.
6. **Trials.** Trial burn is ~$0.14-0.25 per signup; abuse (multi-account) multiplies it. Add device/e-mail-domain throttles; cap trial to Standard tier.
7. **Fixed bills.** Right-size Vercel/Supabase/ElevenLabs/Sentry/Resend tiers to actual usage; delete unused projects; annual billing for tools we will keep.

## 6. Revenue ideas (test against the margin gate)

- **Annual plans** (2 months free): cash up front, lower churn. Needs Stripe yearly prices (the config has `stripePriceIdYearly`).
- **Top-up and plan price tests** — Pro sits at exactly 3.0x on premium; Standard carries ~9x. Offer a cheaper "Standard-only" high-volume plan and keep Premium expensive.
- **Hero-shot Premium** priced near Standard: more Premium buyers at a healthy margin.
- **Credit breakage policy**: expiry of monthly credits (not top-ups) is the usual lever; legal copy in `config/legal.ts` must match.
- **Dunning and failed-payment recovery** (Stripe Smart Retries, card-update emails); **cancel-flow offers**; **pause instead of cancel**.
- **Watermark/AI-label on trial output** and a referral credit; affiliates only with CAC under first-month net revenue.
- **Upsell moments**: "out of credits", "want AI motion on this scene?", "unlock longer videos".

## 7. Bills to track (fill in with owner-supplied amounts)

| Vendor         | What for                    | Plan / billing | Monthly USD | Source of truth             |
| -------------- | --------------------------- | -------------- | ----------- | --------------------------- |
| fal.ai         | Images, Premium video       | usage          | _unknown_   | fal dashboard / usage API   |
| Anthropic      | Script writer               | usage          | _unknown_   | Console usage + cost API    |
| ElevenLabs     | Voice, Voice Design         | _plan?_        | _unknown_   | Subscription API            |
| Vercel         | Hosting, cron, bandwidth    | Hobby/Pro?     | _unknown_   | `list_billing_charges`      |
| Supabase       | DB, auth, storage           | _plan?_        | _unknown_   | Dashboard                   |
| Resend         | Lifecycle e-mail            | _plan?_        | _unknown_   | Dashboard                   |
| Sentry         | Errors                      | _plan?_        | _unknown_   | Dashboard                   |
| Stripe         | 1.5% + EUR 0.25 (EEA cards) | usage          | _from MRR_  | Stripe balance transactions |
| Domain / other |                             |                | _unknown_   |                             |

## 8. Access checklist — what the routine needs (owner action)

| Need                                   | Why                                                                                                        | How                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe **live** read-only              | Real MRR, churn, fees, refunds (today the connector is the **sandbox** only)                               | Stripe Dashboard -> restricted key with read-only scopes, add as a connector/env secret `STRIPE_LIVE_READONLY_KEY`. Never a full secret key.                                                         |
| Supabase connector working in routines | `finance-report` needs a DB path (`.mcp.json` server failed to connect from the cloud: `ERR_PROXY_TUNNEL`) | Re-authenticate the claude.ai Supabase connector; or give the routine `SUPABASE_URL` + service role as a **read-only** secret.                                                                       |
| Vercel connector                       | Billing charges, usage, runtime errors                                                                     | Already offered (`list_billing_charges`, `get_runtime_errors`); confirm team scope.                                                                                                                  |
| fal.ai usage/billing                   | Compare our `api_cost_usd` with the real invoice                                                           | fal admin API key (usage scope) as `FAL_ADMIN_KEY`.                                                                                                                                                  |
| Anthropic usage and cost               | Tokens in/out per model                                                                                    | Admin API key (`sk-ant-admin...`) as `ANTHROPIC_ADMIN_KEY`; Usage & Cost API is read-only.                                                                                                           |
| ElevenLabs usage                       | Characters and slots                                                                                       | Read-only API key; `/v1/user/subscription`.                                                                                                                                                          |
| Outbound network                       | Model scout needs vendor pricing/docs pages                                                                | Routine environment network policy: allow-list fal.ai, replicate.com, together.ai, runwayml.com, bfl.ai, elevenlabs.io, anthropic.com, vendor docs. The CEO routine reported provider pages blocked. |
| Fixed-bill amounts                     | Net profit, not just gross margin                                                                          | Fill §7 or tell the routine in a PR comment.                                                                                                                                                         |

**Suggested add-ons:** a PostHog (or Plausible) connector for visitor -> signup -> paid funnel and CAC; a
Sentry connector for failure spend; Google Sheets/Docs connector if you want a finance digest outside GitHub;
Resend connector for dunning/e-mail performance; a `SearchMcpRegistry` check for a fal.ai or Replicate MCP server.

## 9. Routine prompt (paste into a new claude.ai routine)

> Name: **Shortcraft Finance CEO**. Model: Opus 5.5. Schedule: daily 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Repo: TudorFnsn/Shortcraft. Autonomy: PR-gated. Environment: needs the Stripe, Supabase and Vercel connectors, and the secrets in §8.

```
You are the Finance CEO of Shortcraft and the master agent of a small finance team. Your one job is
cash return: grow MRR, protect gross margin, cut recurring costs. Read FinancePlan.md and
TheMasterPlan.md (§1, §7, §8, §9) first; they are the source of truth and the rules in
FinancePlan §3 bind you. AGENTS.md applies: this is not the Next.js you know.

1. Preflight: list open and recently closed PRs (an item with an open PR is in review, not available).
   Check your access against FinancePlan §8; if something is missing, say exactly what and notify the owner.
2. Gather numbers: run `npm ci`, then `npx tsx scripts/finance-report.mts --json`, `margin-report.mts`,
   `metrics-report.mts` (if the DB path works), plus Stripe, Vercel billing and vendor usage via connectors.
   Never print or store secrets.
3. Split the work across parallel subagents per FinancePlan §4 (Revenue, Unit economics, Vendor costs,
   Model scout, Monetisation, Implementer). Give each a narrow brief, the files to read, and what you ruled out.
   Only spawn the workers the day's data justifies. Their output is tables, not prose.
4. Merge: rank by expected monthly cash impact / effort. Ideas and new tech are welcome (cheaper video
   models, direct vendor APIs, self-hosting, caching, annual plans, pricing tests), but every claim needs a
   dated source or a measured call; list prices are hypotheses until measured. Check the margin gate before
   proposing any price change.
5. Ship: pick the top item that needs code and open ONE PR on ceo-finance/<topic> (tests, format, lint,
   typecheck, CI green). Do not merge. Price/plan/provider switches on live systems are proposals, not edits.
6. Record: append a dated line to FinancePlan §10 and the TheMasterPlan changelog; update §7 with any bill
   amounts you learned.
7. Report: send ONE notification only if something is worth the owner's attention (gross margin under 3x,
   MRR or spend moved by more than 15%, a spend spike, a broken access path, a PR ready for review with its
   EUR/month impact). Start with the single most important sentence. If nothing changed, stay silent.
```

## 10. Changelog (newest on top)

- **2026-10-16** — Finance track created: this plan, `features/metrics/finance.ts` (+4 tests), `scripts/finance-report.mts`. No live numbers yet: no DB path from the cloud session, Stripe is sandbox-only. (Finance CEO, first run)
