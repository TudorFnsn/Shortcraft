# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine.
> `TheMasterPlan.md` §7 holds the pricing decisions; this file holds the
> measurements, the cost-cutting backlog and the routine's rules. Product and
> price changes still need Tudor's OK (§5).
>
> Last updated: 2026-10-14

---

## 1. Charter

Maximise **cash return**: grow MRR while keeping contribution margin per video
at or above the 3x gate. Every run answers four questions:

1. **MRR health:** MRR, net new MRR, churn, ARPU, trial→paid, credit
   breakage (credits granted vs. burned), top-up share.
2. **Unit economics:** real API cost per video by tier vs. credits charged vs.
   revenue per credit, and the tokens/seconds/characters behind each cost.
3. **Fixed costs:** Vercel, Supabase, Sentry, Resend, ElevenLabs plan, domain,
   anything billed monthly. Compare against MRR (burn and runway).
4. **Next best move:** one change that lifts margin or revenue, with a number
   attached (e.g. "swap X for Y saves $0.21 per standard video").

Cash priority order: (a) stop margin leaks, (b) cut variable cost per video,
(c) raise revenue per user, (d) cut fixed cost, (e) new features only when
they pay for themselves.

---

## 2. Operating model: DM master agent

One routine, one master agent ("DM"), five specialists run in parallel
(Agent tool, read-only unless stated). The master never does the analysis
itself: it splits, collects, decides, and writes the single PR and digest.

| Specialist              | Job                                                                                                                                                                                  | Reads                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Revenue analyst**     | MRR, net new MRR, churn, ARPU, trial→paid, top-up share, by plan. Flags past-due subs and failed payments.                                                                           | Stripe (Sigma + API read), `subscriptions`        |
| **Unit-cost analyst**   | Cost per video by tier and per step from `render_jobs.api_cost_usd`; compares to modelled cost in `src/config/models.ts`; token/second/character counts; margin per plan and per job. | Supabase SQL, `scripts/margin-report.mts`         |
| **Vendor scout**        | Searches for cheaper or better models/providers per slot (video, image, voice, script, render) and verifies prices on the vendor page, not just snippets. Produces a ranked table.  | WebSearch/WebFetch, `fal.ai` pricing, vendor docs |
| **Infra cost analyst**  | Vercel billing charges, Supabase usage/advisors, Sentry/Resend/ElevenLabs plan limits vs. use. Finds idle spend and plan downgrades.                                                 | Vercel connector, Supabase, env/docs              |
| **Growth/pricing lead** | Pricing and packaging ideas: annual plan, credit expiry/rollover, top-up nudges, paywall placement, referral/affiliate economics. Models effect on MRR and margin before proposing.  | Plan + analysts' output                           |

Master steps: read this file, `TheMasterPlan.md` §7/§8, `git log -20`, open and
recent PRs (skip anything already in review) → fan out the five specialists in
one message → merge findings → pick **one** implementable win → implement on a
`ceo-finance/*` branch with tests → update §4 and §7 here → open a PR → digest.

---

## 3. Baseline (first measurement, 2026-10-14, Supabase live project)

Read-only. Stripe is **sandbox only**, so there is no real revenue yet.

| Metric                      | Value                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| Profiles                    | 6                                                                               |
| Live subscriptions          | 2 (sandbox/test)                                                                |
| Render jobs (all time)      | 16: 13 done, 3 failed (failed cost $0, credits refunded)                        |
| Total API cost recorded     | $6.21                                                                           |
| Standard, done              | 11 jobs, $2.37 → **$0.216/job** (gate model assumes ~$0.07 for a 15s video)     |
| Premium (AI video), done    | 2 jobs, $3.84 → **$1.92/job** (gate model assumes ~$1.80, Kling list ~$1.10)    |
| Credits charged             | 105,173 (≈ $0.059 per 1k credits of cost)                                       |

**Findings**

1. Standard measured at ~3x its modelled cost. Sample is tiny and probably
   includes smoke/dev runs, but it is the single most important thing to
   confirm: it is the volume tier. First task: split cost by step.
2. `render_jobs.api_cost_usd` is one number per job. There is **no per-call
   usage ledger**, so tokens (Claude), characters (ElevenLabs), megapixels
   (FLUX) and clip seconds (Kling) cannot be tied to cost, and a price change
   cannot be detected until the bill arrives. Highest-value build: item F1.
3. Only the Claude adapter returns real usage-based cost (`costUsdFor`); every
   other adapter reports `models.ts` constants, so "measured" is mostly modelled.
4. Revenue cannot be judged yet. Needs Stripe live mode, or a real-money pilot.

---

## 4. Roadmap (top unchecked, not already in an open PR, goes first)

`[ ]` todo · `[~]` in progress / in review · `[x]` shipped · `[?]` needs Tudor

- [ ] **F1 Usage ledger.** Migration `provider_usage` (job_id, step, provider, model, units, unit_kind, tokens_in/out, cost_usd, created_at); adapters write real usage; extend `scripts/metrics-report.mts` into `scripts/finance-report.mts` (MRR, cost/video by step, margin by plan, burn). Migration is owner-applied.
- [ ] **F2 Measure real costs.** One paid smoke per live adapter, compare with `models.ts`, update constants, re-run margin gate. Needs `FAL_KEY` spend OK (≈ $5).
- [ ] **F3 Video vendor bake-off.** fal.ai Kling 2.5 Turbo ≈ $0.07/s is the premium cost driver. Candidates to price and test on the same 5 prompts: Wan 2.5/2.6, LTX-2 Fast, Seedance Lite, Hailuo, Veo 3.1 Fast, plus direct-from-vendor APIs and open-weights hosts (Replicate, Together, RunPod/Modal serverless GPU). Quality blind-compare, then swap by changing `FAL_VIDEO_MODEL` or one adapter.
- [ ] **F4 Hero-shot premium.** AI clip on scene 1 only, stills for the rest (~$0.45 vs ~$1.10 per 15s). Cheap tier between Standard and Premium; priced near Standard.
- [ ] **F5 Cheaper script/voice.** Prompt caching and shorter system prompts on the script call; try Haiku-class for scripts; ElevenLabs plan vs. pay-as-you-go vs. alternatives (OpenAI TTS, Cartesia, Deepgram Aura) on the same text; cache voice previews.
- [ ] **F6 Retention/revenue levers.** Annual plan (2 months free), credit rollover cap or expiry, low-credit top-up nudge in `/create`, trial-to-paid email (lifecycle email already exists), reduce trial burn.
- [ ] **F7 Fixed-cost audit.** Vercel plan and function minutes (ffmpeg render, every-minute cron), Supabase plan and storage egress (media bucket lifecycle: delete or move old MP4s), Sentry sample rate.
- [ ] **F8 Affiliate/referral economics.** 30% recurring is in the plan; model payback per channel before launching.

---

## 5. Rules for the Finance CFO routine

- **Read first:** this file, `TheMasterPlan.md` §7, §8, §9, then `git log -20` and open + recently closed PRs. An item with an open PR is in review, not available.
- **One item per run**, on a `ceo-finance/*` branch, PR-gated. Never merge.
- **Read-only on live systems.** Supabase `execute_sql` SELECT only. Stripe read/analytics only. Vercel list/get only. Any write, migration, price change, Stripe object, live-mode switch or paid API call needs Tudor's explicit OK. Ask in the digest; do not assume.
- **Files it may change:** `src/config/models.ts` costs (only from measured data), `src/features/metrics/**`, `src/features/billing/margin.ts` (tests included), `scripts/finance-report.mts`, `scripts/*smoke*` , `docs/finance/**`, this file, and the finance lines of `TheMasterPlan.md`. Provider adapters only for usage capture or a vendor swap that passed the bake-off. Never touch auth, webhooks, moderation or UI (Design CEO owns UI).
- **Pricing changes** (plan prices, credit grants, `creditsPerUnit`) are proposals with a before/after margin table; Tudor decides.
- **Margin gate must stay green** (`npm run` margin report ≥ 3x on every plan and top-up) in the same PR.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Source quality:** every price carries a source URL and date; prefer the vendor page; if blocked, say so and mark "unverified".
- **Notify** (PushNotification) only when: gate would fail, a vendor price moved >20%, cost per video is >1.5x modelled, MRR drops, a payment fails, or a decision from Tudor is blocking. Otherwise stay silent.
- **Output:** digest with MRR snapshot, cost/video vs. model, top saving found (with $), PR link, what is waiting on Tudor, next item.

---

## 6. Data and access the routine needs

Have now: Supabase (SQL, logs, advisors), Stripe (sandbox), Vercel (billing
charges), GitHub, web search.

Missing, in priority order (ask Tudor, or configure):

1. **Stripe live-mode read-only restricted key / connector** for real MRR. Until then MRR is sandbox.
2. **fal.ai usage/billing:** a read-only dashboard export or API usage key, so spend is checked against `api_cost_usd`.
3. **ElevenLabs and Anthropic usage:** Anthropic Admin API key (usage + cost report, read-only) and ElevenLabs subscription/usage endpoint.
4. **Monthly fixed-cost list** (Vercel plan, Supabase plan, Sentry, Resend, domain, ElevenLabs tier, anything else) as `docs/finance/fixed-costs.md`. Amounts only, no card data.
5. **Funnel analytics:** PostHog or Vercel Web Analytics connector for visitor→signup→paid, and ad/affiliate spend if any.
6. **Routine environment network access** to fal.ai, replicate.com, together.ai, elevenlabs.io pricing pages (earlier routines were blocked from vendor pages; see TheMasterPlan §7 note 3).

Useful additions: Vercel Cost/Usage Observability, a Supabase read-only
Postgres role for the routine, Stripe Sigma saved queries (MRR, churn),
`/schedule` for the weekly vendor price re-check, the `xlsx` skill for a
monthly P&L sheet, and the `dataviz` skill for an MRR/margin artifact.

---

## 7. Decision log

- **2026-10-14** (Tudor) → New Finance CFO routine, DM-master pattern like the CEO and Design CEO. Goal: MRR ratio, cost per video, cheaper vendors than fal.ai where possible, cash first.

## 8. Changelog (newest on top)

- **2026-10-14** — Plan created, baseline measured (read-only), routine prompt written in `docs/finance/routine-prompt.md`. No code or schema change. (Interactive)
