# FinancePlan — Shortcraft unit economics & cash

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing levers and vendor choice. Every finance PR updates this
> file (ledger, watchlist, changelog) in the same change.
>
> Last updated: 2026-10-14

---

## 1. Charter (owner request 2026-10-14, do not change without Tudor)

**Goal:** maximize profit and cash return. Watch MRR and gross margin every run;
propose or implement changes that monetize better; replace expensive vendors
(fal.ai video is the first suspect) with cheaper or better ones; keep the 3x
margin gate green while doing it.

| Question   | Answer                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| North star | **Gross profit per month** (net MRR + top-ups − API spend − fixed costs), then growth of MRR. Cash first: prefer annual prepay, fewer refunds, lower cost per video.                                                                  |
| Autonomy   | **PR-gated.** Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe, Supabase and Vercel. **Any write** (price change in Stripe, migration, live-mode flip, plan purchase) needs the owner's explicit OK, quoted in the PR. |
| Cadence    | Daily cloud routine **"Shortcraft Finance CEO"** (suggested 07:30 UTC, after the main CEO at 06:00 and before Design at 09:00). Notifies the owner only when something needs them (§6).                                               |
| Scope      | Pricing/plans/credit scale, provider choice + cost, fixed costs and plans of every vendor, checkout/upsell/retention levers that move revenue. **Not** UI redesign (Design CEO) or unrelated features (main CEO).                     |
| Files      | `config/models.ts`, `config/plans.ts`, `features/billing/**`, `features/finance/**`, `features/providers/**`, `scripts/*report*`, this file. Leave `ceo-design/*` UI files alone.                                                     |

## 2. Master-agent operating model

The routine's first session is the **DM (master agent)**. It does not research or
code serially. Each run it:

1. **Reads** this file, `TheMasterPlan.md` §7/§8/§9 and open + recently closed PRs (an item with an open PR is in review, not available).
2. **Measures** (§3), then **splits the work** into independent briefs and spawns them in one message so they run in parallel. Standard split:

| Agent            | Brief                                                                                                                   | Output                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Metrics**      | Run `finance-report`, `metrics-report`, `margin-report`; pull Stripe MRR/churn/refunds/disputes and Supabase cost rows  | Numbers table + anomalies                 |
| **Vendor scout** | Re-price the watchlist (§5) from provider pages and aggregator prices; look for newly released cheaper models           | Ranked swaps with $/unit and quality risk |
| **Pricing**      | Compare our plans/top-ups to competitors; model price, annual plan, credit scale and packaging changes with `margin.ts` | Proposed table + margin impact            |
| **Cost audit**   | Every fixed and variable bill (§4); find the unused or over-tiered ones                                                 | Savings list                              |
| **Implementer**  | Takes the DM's single chosen item and builds it with tests (one PR)                                                     | Branch + checks green                     |

3. **Chooses one win** (highest expected profit per hour of review), implements it via the Implementer, and logs the rest as proposals in §7. Research agents never edit code; only the Implementer commits.
4. **Reports**: updates §3 numbers and §8 changelog, opens the PR, and notifies the owner only per §6.

Pass agents what they need (paths, the numbers, what is already ruled out) and ask for sources on every price. A price from a search snippet is marked **unverified** until measured.

## 3. KPIs, read every run

| KPI                                                        | Source                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| MRR (gross, net), ARPU, paying subs                        | `npx tsx scripts/finance-report.mts --json` (Supabase) + Stripe connector for what was actually billed |
| New MRR, churned MRR, refunds, disputes                    | Stripe connector (read-only)                                                                           |
| Realized API cost per done video, per tier, per 1k credits | `finance-report` (`render_jobs.api_cost_usd`)                                                          |
| Wasted spend (failed or abandoned jobs)                    | `finance-report` (`monthToDate.wastedSpendUsd`)                                                        |
| Gross margin month to date                                 | `finance-report`; target ≥ 70% blended, never < 3x at full burn                                        |
| Margin gate                                                | `npx tsx scripts/margin-report.mts` (exit 1 = fail)                                                    |
| Trial burn (cost per signup)                               | `margin-report`                                                                                        |
| Trial → paid, activation                                   | `npx tsx scripts/metrics-report.mts --json`                                                            |
| Fixed costs vs MRR                                         | §4 ledger                                                                                              |

**Token vs cash check.** Claude script cost: Anthropic usage (Console) vs `script` steps in the DB (modelled $0.04). Voice: ElevenLabs characters vs `voice` steps. Images/video: fal.ai spend vs `image`/`video` steps. A gap over 20% between the vendor invoice and `api_cost_usd` means the catalog's `costUsdPerUnit` is wrong: fix it (the margin gate then re-evaluates). `api_cost_usd` is a model, not an invoice, so **vendor dashboards are the ground truth** (§9).

## 4. Cost ledger (fill from real bills; unknown = ask the owner)

| Item                              | Type     | Monthly cost                         | Source / status                         |
| --------------------------------- | -------- | ------------------------------------ | --------------------------------------- |
| fal.ai (FLUX images, Kling video) | variable | unknown                              | owner: share usage page or export       |
| ElevenLabs (TTS + voice slots)    | mixed    | unknown                              | plan tier + slot count needed           |
| Anthropic (scripts)               | variable | unknown                              | Console usage, workspace spend          |
| Supabase                          | fixed    | unknown                              | plan (Free vs Pro) + egress             |
| Vercel                            | fixed    | unknown                              | Hobby assumed (€0); check function time |
| Resend, Sentry                    | fixed    | unknown                              | free tiers assumed                      |
| Domain                            | fixed    | unknown                              |                                         |
| Stripe fees                       | variable | ~1.5% + €0.25 per charge (EEA cards) | `margin.ts` assumption                  |

## 5. Vendor watchlist (prices unverified until measured; revalidate each month)

| Slot                | Today                      | Candidates to evaluate                                                                                            | Why                                                                       |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Premium AI video    | fal.ai Kling 2.5 Turbo Pro | Direct Kling API, Wan 2.x, LTX-2, Seedance, Hailuo; other hosts (Replicate, Runware, WaveSpeed, Novita, Together) | ~$0.07/s is our largest variable cost; hosts differ ~2x on the same model |
| Hero-shot packaging | AI clip on every scene     | AI clip on scene 1 only, stills elsewhere (already modelled, ~$0.45 per 15s)                                      | cuts cost ~60% at little perceived loss                                   |
| Images              | fal.ai FLUX schnell/dev    | Runware, self-hosted via Modal/RunPod serverless GPUs, SDXL-Turbo variants                                        | already ~$0.003/image; low priority                                       |
| Voice               | ElevenLabs Flash v2.5      | Cartesia, Deepgram Aura, OpenAI TTS, Kokoro (self-host)                                                           | $0.05/1k chars; word timestamps needed for captions                       |
| Scripts             | Claude Sonnet 5.5          | Haiku 5.5 for drafts, prompt caching, Batch API (-50%) for non-urgent jobs                                        | ~$0.04/script; small but trivial to cut                                   |
| Render              | in-house ffmpeg            | none (already ~$0.01)                                                                                             |                                                                           |

Rule: a swap needs (1) a measured cost on real calls, (2) a side-by-side quality sample the owner can see, (3) an adapter behind the registry (one row in `models.ts` + one adapter). Unmeasured prices never change `costUsdPerUnit`.

## 6. When to notify the owner

Only when the run finds something to act on: gross margin < 60% or the gate fails; a vendor invoice contradicts `api_cost_usd` by > 20%; wasted spend > 10% of API spend; refunds/disputes spike; a swap or price change is ready for approval; or the routine **cannot run** (connector down, access denied, script error). A quiet healthy run sends nothing.

## 7. Proposals & backlog (newest first; owner decides, DM implements one per run)

| #   | Idea                                                                                                         | Est. impact           | Needs owner                | Status   |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------- | -------------------------- | -------- |
| F1  | Annual plans (e.g. 2 months free): cash up front, lower churn, fewer Stripe fees per euro                    | cash, retention       | Stripe price creation      | proposed |
| F2  | Measure real costs on live calls (`scripts/live-providers-smoke.mts`) and replace list prices in `models.ts` | trust in margin       | fal/ElevenLabs keys in env | proposed |
| F3  | Hero-shot Premium tier at a Standard-like price                                                              | new mid tier, volume  | price decision             | proposed |
| F4  | Prompt caching + Haiku 5.5 for script drafts                                                                 | small, easy           | none                       | proposed |
| F5  | Expiring credits / rollover cap on subscription grants (breakage)                                            | margin                | terms update               | proposed |
| F6  | Video-host price shootout (§5) with a quality sample                                                         | largest variable cost | approve quality            | proposed |
| F7  | Top-up nudge when balance < next video, and annual upsell at day 25                                          | revenue               | none                       | proposed |
| F8  | Trial abuse guard (one trial per card/email domain/device)                                                   | trial burn            | legal OK                   | proposed |

## 8. Changelog (newest on top)

- **2026-10-14** — Finance track created (owner request): this plan, `features/finance/unit-economics.ts` (MRR, ARPU, realized cost per done video, wasted spend, month-to-date gross margin) with tests, `scripts/finance-report.mts` (read-only), and the routine prompt in `docs/routines/finance-ceo.md`. No runtime change, no migration, no new dependency. (Finance CEO, setup)

## 9. Access the routine needs (owner checklist)

- [x] GitHub repo `tudorfnsn/shortcraft` (branches `ceo-finance/*`, PRs only).
- [ ] **Stripe connector** with live-mode read access (today: sandbox only) for real MRR, churn, refunds and disputes.
- [ ] **Supabase connector** reconnected (failed from the cloud session on 2026-10-14: `ERR_PROXY_TUNNEL`); or a read-only Postgres role + `SUPABASE_SERVICE_ROLE_KEY` as a routine secret so `finance-report` can run.
- [ ] **Vercel connector** (billing charges, usage): `list_billing_charges` is already exposed.
- [ ] Vendor spend: monthly export or screenshot from fal.ai, ElevenLabs and Anthropic Console, or read-only admin API keys (Anthropic usage/cost admin API; fal usage API) stored as routine secrets.
- [ ] Outbound network that allows provider pricing pages (the earlier routine was blocked; add the domains to the environment's allowlist: fal.ai, replicate.com, elevenlabs.io, cartesia.ai, anthropic.com, klingai.com, runware.ai).
- [ ] Optional: PostHog (funnel), Sentry (failure causes behind wasted spend), Google Search Console (organic growth).
