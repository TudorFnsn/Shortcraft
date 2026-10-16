# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CFO** routine
> (prompt and setup: `docs/routines/finance-cfo.md`). `TheMasterPlan.md` §7 holds
> the pricing decisions made so far; this file holds the running cash picture,
> the cost inventory, the vendor-swap backlog and the monetization experiments.
> Read `TheMasterPlan.md` first, then this file.
>
> Last updated: 2026-10-16

---

## 1. Charter

Maximise **cash return**: net MRR growth and gross margin per video, without
hurting activation or retention (the north star in `TheMasterPlan.md` §1). Every
run answers four questions in order:

1. **Is the money healthy?** MRR, paying subscribers, ARPU, top-ups, API spend, waste on failed jobs, profit after fixed costs.
2. **Where does a euro leak?** Cost per finished video by tier, tokens/units per step, failed or retried calls, trial burn, idle vendor plans.
3. **What is cheaper at the same quality?** New providers, models and techniques (§4).
4. **What earns more?** Pricing, packaging and upsell experiments (§5).

Cash first: a change that saves or earns money this month beats a better idea
that pays in six. Quality is a constraint, not a variable: a cheaper model only
ships when a side-by-side on real prompts shows no visible drop.

## 2. KPIs (read with `npx tsx scripts/finance-report.mts`)

| KPI                                 | Where it comes from                              | Target                                  |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Net MRR, subscribers, ARPU          | `subscriptions` × plan prices, net of VAT + fees | up week over week                       |
| API cost share (API cost ÷ revenue) | `render_jobs.api_cost_usd`                       | < 33% (the 3x gate), aim < 20%          |
| Cost per finished video, per tier   | same, grouped by `model_tier`                    | Standard < $0.10 (15s), Premium falling |
| Waste on failed jobs                | failed jobs' `api_cost_usd`                      | < 3% of API spend                       |
| Trial burn per signup               | `margin-report.mts`                              | < $0.25                                 |
| Fixed costs vs revenue              | `src/config/vendor-costs.ts` (owner-filled)      | known for every vendor                  |
| Margin gate                         | `npx tsx scripts/margin-report.mts`              | PASS (≥ 3x on every product)            |

North-star companion: `scripts/metrics-report.mts` (paying-retained creators,
trial → paid). Money without retention is a leak, so the CFO reads both.

## 3. Cost inventory (what we pay for)

Known from the repo (per-use costs are list prices, **not yet measured**; see `TheMasterPlan.md` §7):

| Line               | Vendor / model                          | Cost basis                                    | Notes                                               |
| ------------------ | --------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Script             | Anthropic Sonnet 5.5                    | ~$0.04 per script (~2k in / 1.5k out)         | Token counts are not stored yet (F1).               |
| Images             | fal.ai FLUX schnell / dev               | $0.003 / $0.025 per MP (720×1280 = 1 MP)      | One image per scene.                                |
| Standard motion    | in-house Ken Burns (ffmpeg)             | $0                                            | No video model on the Standard tier.                |
| Premium video      | fal.ai Kling 2.5 turbo (image-to-video) | ~$0.07/s, ~$0.35 per 5s scene                 | The expensive line. A 15s Premium ≈ $1.10.          |
| Voiceover          | ElevenLabs Flash                        | ~$0.05 / 1k chars                             | Plus custom-voice slots on the plan (Voice Studio). |
| Render             | in-house ffmpeg on Vercel               | ~$0.01 / video                                | Function time + storage egress.                     |
| Hosting            | Vercel                                  | **unknown**                                   | Hobby forbids commercial use; Pro is per seat.      |
| Database + storage | Supabase                                | **unknown**                                   | Storage and egress grow with every stored MP4.      |
| Email              | Resend                                  | **unknown**                                   | Free tier covers early volume.                      |
| Payments           | Stripe                                  | 1.5% + €0.25 (EEA cards), plus Tax if enabled | Already inside `REVENUE_ASSUMPTIONS`.               |
| Errors / analytics | Sentry, Vercel Speed Insights           | **unknown**                                   |                                                     |

**Gaps the CFO must close (ask the owner, then record the answer here):**

- [ ] Exact monthly price of each fixed vendor → fill `src/config/vendor-costs.ts`.
- [ ] A read-only usage path per vendor (see `docs/routines/finance-cfo.md` §3). Until then, API spend is read from `render_jobs.api_cost_usd`, which is our own estimate, not the invoice.
- [ ] Reconcile estimate vs invoice once fal.ai / Anthropic / ElevenLabs usage is readable. A gap above 15% means the catalog prices in `config/models.ts` are wrong and the margin gate is lying.

## 4. Cost reduction backlog (vendors, models, techniques)

Everything below is a **hypothesis to test**, not a fact: model prices change
monthly and earlier research disagreed by 2x across sources (`TheMasterPlan.md`
§7). The CFO verifies on the vendor's own page (or a measured call) before any
number goes into `config/models.ts`.

| #   | Idea                                                                                                                                         | Why it could pay                                                    | How to prove it                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| C1  | **Premium video: cheaper image-to-video models** (Wan 2.x, LTX-2, Seedance, Hailuo, newer Kling tiers) on fal.ai or another host             | Premium is ~$1.10 per 15s; this is the biggest line per video       | Same 5 prompts through each; compare price per second and a blind visual check |
| C2  | **Other inference hosts for the same open models** (Replicate, WaveSpeed, Runware, Novita, Together, DeepInfra)                              | The same open weights are often cheaper than fal.ai's markup        | Price per output second at the same resolution; check queue time and uptime    |
| C3  | **Hero-shot Premium**: AI clip on scene 1 only, Ken Burns for the rest                                                                       | ~$0.45 vs ~$1.10 per 15s, close to Standard cost                    | Already previewable with `--premium` in the smoke script                       |
| C4  | **Self-host open video / image models** on pay-per-second GPUs (Modal, RunPod, Replicate deployments)                                        | Beats per-call pricing once volume is steady                        | Only worth modelling past a few thousand Premium videos a month                |
| C5  | **Script model**: Haiku-class for scripts, prompt caching on the fixed system prompt, Batch API for non-urgent jobs                          | Scripts are ~$0.04 each; caching and a cheaper model can halve that | Compare scripts blind; track tokens (needs F1)                                 |
| C6  | **Image model**: Runware or another FLUX host, smaller resolution for non-hero scenes, reuse an image across similar scenes                  | Images are tiny on Standard; matters mostly for Premium             | Cost per scene before/after                                                    |
| C7  | **Voice**: ElevenLabs Flash vs Cartesia, Deepgram Aura, OpenAI TTS, self-hosted Kokoro; cache repeated lines; right-size the ElevenLabs plan | Voice is the second-largest per-video line on Standard              | Blind listening test; check word-timing support (subtitles need it)            |
| C8  | **Failure waste**: stop a job before the paid step when an earlier step is doubtful; cap retries; refund-safe idempotency                    | Failed jobs burn API money and credits                              | `wastedOnFailedUsd` from the report                                            |
| C9  | **Storage and egress**: expire or compress old MP4s, serve thumbnails not video, lifecycle rules in the `media` bucket                       | Storage grows forever; Supabase egress is billed                    | Bucket size and egress from the Supabase dashboard                             |
| C10 | **Fixed vendors**: right-size every plan, drop unused add-ons, annual billing where cheaper                                                  | Fixed costs matter most while revenue is small                      | Invoices, filled into `vendor-costs.ts`                                        |
| C11 | **Merchant of record** (Paddle, Lemon Squeezy) vs Stripe + Stripe Tax                                                                        | Handles EU VAT filing; fees are higher, admin is lower              | Compare fee + VAT admin cost at expected volume. Owner decision                |

## 5. Revenue backlog (monetization)

| #   | Idea                                                                                    | Mechanism                                                                 |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R1  | **Annual plans** (≈ 2 months free)                                                      | Cash up front, lower churn. Prices exist in `plans.ts`, unsold            |
| R2  | **Pay per Premium video** instead of burning a big credit block                         | Premium is where margin is thinnest; price it per clip                    |
| R3  | **Watermark removal as an add-on**; trial videos keep the watermark (already shipped)   | Cheap to deliver, direct upsell                                           |
| R4  | **Credit expiry / no rollover on plans, top-ups never expire**                          | Unused plan credits are pure margin; top-ups stay trust-building          |
| R5  | **Trial tuning**: trial burn is $0.14–0.25; test 1 vs 2 videos and a card-on-file trial | Lower acquisition cost or higher trial → paid                             |
| R6  | **Upgrade nudges at the moment of need** (blocked Premium, out of credits)              | Shown in-product when a limit is hit, with the exact plan that unlocks it |
| R7  | **Win-back and unused-credit emails** (lifecycle email cron exists)                     | Recovers churn at ~zero cost                                              |
| R8  | **Price tests** by region / currency; USD price points for non-EU visitors              | Stripe multi-currency prices; read results against the margin gate        |
| R9  | **Referral credits**, **affiliate 30% recurring** (distribution, `TheMasterPlan.md` §6) | Paid only on revenue, so it cannot lose money                             |
| R10 | **Higher tiers**: team seats, brand kits, API access for agencies                       | Raises ARPU; only after Pro has paying users                              |

## 6. Roadmap

Work top to bottom. One item per run, never an item with an open `cfo/*` PR.

- [ ] **F1 — Cost ledger with units.** Migration `0013_job_costs`: one row per paid provider call (`job_id`, `step`, `provider`, `model`, `units`, `unit_kind` (tokens in/out, images, seconds, characters), `cost_usd`). Orchestrator writes it next to `charge()`. Gives real cost per step and tokens per video; unlocks C5 and reconciliation. _Migration is owner-applied._
- [ ] **F2 — Fill fixed vendor costs** (`src/config/vendor-costs.ts`). Needs the owner's invoices; then the report shows true profit.
- [ ] **F3 — Measure real per-call costs** with the live smoke scripts and replace list prices in `config/models.ts`; re-run `margin-report.mts`. Needs `FAL_KEY` etc. in the routine's environment.
- [ ] **F4 — Vendor bake-off** for C1/C2 (Premium video) with a written table: price per second, blind visual check, queue time, API fit with `providers/live/*`. Ship the winner as a new adapter behind the existing registry.
- [ ] **F5 — Annual plans (R1)** in Stripe + `/pricing`, behind the margin gate. _Stripe writes need owner OK._
- [ ] **F6 — Hero-shot Premium (C3 / R2)** as a priced tier.
- [ ] **F7 — Spend alerts**: a daily check that flags API spend per day above a limit, a failure-rate spike, or cost/revenue above 33%.
- [ ] **F8 — Script cost cuts (C5)**: prompt caching, cheaper script model, measured blind.
- [ ] **F9 — Storage lifecycle (C9).**

## 7. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md` (§7 pricing, §8 risks, §9 ops), this file, `git log -20`, open and recent PRs (an item with an open PR is in review, not available), then the live numbers: `scripts/finance-report.mts`, `scripts/metrics-report.mts`, `scripts/margin-report.mts`.
- **Autonomy: PR-gated**, same as the other routines. Branches `cfo/*`. Never merge. Never touch live secrets. Never turn on live mode or change live Stripe prices.
- **Write needs the owner:** migrations, Stripe objects, vendor account changes, anything that spends money. Draft it, put the exact steps in the PR and the digest.
- **Files it may change:** this file, `src/config/models.ts`, `src/config/vendor-costs.ts`, `src/config/plans.ts` (proposals only unless the margin gate passes), `src/features/finance/**`, `src/features/providers/**`, `scripts/**`, `docs/**`, `tests/**`, and the finance lines of `TheMasterPlan.md`. Not UI files (Design CEO owns them) unless a change is tiny and money-critical (e.g. a price label).
- **A vendor swap ships only with:** a written comparison (price, quality check on real prompts, reliability), a new adapter behind the registry, tests, and the margin gate still passing. Prices come from the vendor's own page or a measured call, never from a single aggregator snippet.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Notify the owner (PushNotification) only when it matters:** net MRR dropped, the margin gate fails, API cost share above 33%, a daily spend or failure spike, an invoice vs estimate gap above 15%, a needed connector or secret is missing, or the run could not read the data. A quiet healthy run sends nothing.
- **Output:** a digest: the KPI table with deltas, what moved, PR links, the top three savings or revenue ideas ranked by euros per month, what is waiting on the owner, the next item.

## 8. Ask list for the owner

Open items the CFO cannot fix alone. Strike them when done.

- [ ] Authorize the **Stripe** connector in claude.ai (it showed "needs authentication"; the routine can only read MRR from Stripe after this).
- [ ] Reconnect **Supabase** for the routine (the connector failed to connect from the cloud session with a proxy tunnel error on 2026-10-16). Alternative: put a read-only `SUPABASE_SERVICE_ROLE_KEY` in the routine's environment so the report scripts run.
- [ ] Add the **Vercel** connector to the routine (billing charges and usage are readable through it).
- [ ] Add read-only usage access: **fal.ai** (usage/billing API key), **Anthropic** (Admin API key for the usage and cost report), **ElevenLabs** (usage endpoint on a read-only key).
- [ ] Tell the CFO the **monthly price** of Vercel, Supabase, ElevenLabs, Resend, Sentry and the domain (or fill `src/config/vendor-costs.ts`).
- [ ] Confirm the **business model constraints**: target gross margin, how much runway or ad budget exists, whether prices may be changed without asking, and whether a merchant of record is acceptable.
- [ ] Create the routine from `docs/routines/finance-cfo.md` (this session cannot create cloud routines).

## 9. Changelog (newest on top)

- **2026-10-16** — Finance track started (CFO routine, interactive setup): this plan, the routine prompt (`docs/routines/finance-cfo.md`), `features/finance/unit-economics.ts` (MRR, ARPU, cost per finished video by tier, waste on failed jobs, profit with unknown fixed costs flagged), `scripts/finance-report.mts`, `config/vendor-costs.ts`, +5 tests. Finding: the app stores only a total `api_cost_usd` per job, no tokens or units per step, so cost by step and tokens per video cannot be reported yet (roadmap F1).
