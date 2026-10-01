# TheMasterPlan — Shortcraft

> **Single source of truth** for Shortcraft. Every meaningful change to the app
> updates this file (status, roadmap, changelog). If reality and this document
> disagree, fix whichever is wrong in the same change. Read this before planning
> any work.
>
> Operating model: see `~/.claude/the-master-plan-workflow.md` (the CEO + dev-team
> "heartbeat" that drives this project).
>
> Last updated: 2026-10-01

---

## 1. Vision & thesis

Shortcraft turns an idea into a ready-to-post vertical video (TikTok / Reels /
Shorts): script → image per scene → video clip per scene → voiceover → subtitles
→ stitched MP4. Sold as **monthly credits + one-time top-ups**.

The engineering truth: the "AI" is orchestration of third-party model APIs. We win
or lose on **(1) unit economics** (a video must cost less in API spend than the
credits it burns) and **(2) distribution**. The architecture is therefore built
around a **swappable provider layer** and an **auditable credit ledger**, and the
whole app runs on **deterministic mocks with zero API keys** so we can build and
test everything before spending a cent.

**North-star metric:** weekly paying-retained creators (people who make ≥1 video/week
and stay subscribed). Leading indicators: activation (signup→first video), visitor→paid,
gross margin/video, paid churn.

---

## 2. Current status (implemented)

**Phase 0 — Foundations ✅**

- Next.js 16 (App Router) + TS strict (`noUncheckedIndexedAccess`) + Tailwind v4, on Node 24.
- Typed env (zod, mock-friendly), `Result<T,E>`, structured logger.
- Vitest + Prettier + strict tsconfig. 78 unit/integration tests green.

**Phase 1 — Monetizable MVP ✅ (verified end-to-end, live)**

- **Provider layer:** one adapter contract for script/image/video/voice/render; deterministic mocks; model→adapter registry. `MOCK_PROVIDERS=true` runs the whole pipeline offline.
- **Credit ledger:** append-only (`credit_transactions`), balance = SUM(delta); atomic `reserve_credits` / `add_credits` Postgres functions (advisory-locked, no overspend).
- **Render pipeline:** state machine `draft→scripting→images→clips→voiceover→subtitles→stitching→done` (`→failed` auto-refunds); DB-backed orchestrator; reserve→settle credit flow. The reserve is a guaranteed **upper bound**: scenes priced at `MAX_SCENE_SEC`, the script's plan is clamped to the budget, and the bill is capped at the hold (overruns log a `warn` = margin leak to watch).
- **Supabase:** auth (email/password), Postgres schema + RLS, storage-ready. Connection + schema verified live.
- **App:** landing, `/login`, `/create` (topic + theme + length + quality, live cost estimate + affordability gate + plan gate with "(Pro)" upgrade hints), `/gallery` (jobs + balance), header with auth state.
- **Billing (Stripe, sandbox-verified end-to-end):** products/prices (plans + top-ups, lookup_keys + credit metadata), `/pricing`, `POST /api/checkout`, `POST /api/webhooks/stripe` (grants credits, syncs subscription), `POST /api/billing/portal`. A live sandbox purchase with a test card granted 20,000 credits.

**Proven loop:** sign up → 3,000 trial credits → generate → paywall → pay → credits granted → generate more. All persisted in real Supabase; payment via real Stripe (test mode).

---

## 3. Architecture (how it's built)

- **Feature-first** modules under `src/features/*`. Nothing calls a provider directly — only via `features/providers/registry.ts`, `features/render`, `features/credits`, `features/billing`.
- **Serverless-only pipeline:** each provider `run()` either completes inline (fast/sync models, and all mocks) or returns an async job resolved later by a vendor webhook + a cron fallback. This is what lets minutes-long renders run on Vercel with no self-managed worker. (Async branch is designed but not yet wired — see §5.)
- **Money & state:** append-only ledger; reserve/settle/refund; every render records `api_cost_usd` for the margin gate. Webhooks verify signatures; idempotent via `stripe_events`.
- **Migrations are the schema source of truth** (`supabase/migrations`).
- Full conventions: `docs/ARCHITECTURE.md`.

**Stack:** Next.js/React/TS · Supabase (auth/db/storage) · Stripe · providers (fal.ai, Anthropic, ElevenLabs, a render API) behind adapters · Vercel (target) · PostHog/Sentry/Resend (planned).

---

## 4. Repository map

```
src/config/        brand, plans/top-ups, model catalog + pricing, themes
src/features/
  providers/       adapter contract, mocks, registry
  credits/         ledger math + job credit ops
  render/          state machine, pricing, repository ports + supabase/in-memory impls, orchestrator, store
  billing/         stripe customer, checkout, webhook handler, entitlements (plan limits)
  auth/            server-side session helper
src/app/           landing, login, create, gallery, pricing, api/{jobs,checkout,webhooks/stripe,billing/portal,health}
src/utils/supabase supabase clients (server/browser/admin) + proxy session refresh
src/utils/stripe   stripe client
supabase/migrations 0001_init, 0002_stripe_events
scripts/           smoke.mts (live pipeline), stripe-setup.mts (create products/prices), margin-report.mts (margin gate)
```

---

## 5. Roadmap — what's next (priority order)

### NOW — Phase 1 hardening (before real traffic)

- [ ] Run migration `0002_stripe_events` on the DB (re-enables webhook idempotency; currently degrades gracefully with a warning).
- [x] Make the credit estimate an **upper bound** (reserve ≥ actual) so balances can never go negative on settle. _(PR `ceo/credit-estimate-upper-bound`, 2026-09-30)_
- [x] CI on every PR + push to `main` (format, lint, typecheck, test, build — mock mode, no secrets); fixed the `/pricing` lint error + Prettier drift. _(PR `ceo/ci-lint`, 2026-09-30)_
- [x] Plan gating on `/create` (max duration + model tier per plan; server-enforced in `POST /api/jobs`, mirrored in the form with upgrade hints). _(PR `ceo/plan-gating`, 2026-09-30)_ Character limits wait for the Characters feature.
- [ ] Handle `customer.subscription.updated` in the Stripe webhook (status + plan changes like upgrades/downgrades/`unpaid`) so `subscriptions.status` — which now drives plan limits — stays accurate.
- [ ] Add a processed-events safety + minimal alerting on webhook failures.

### NEXT — Phase 2: Real providers (make videos real + lock margins)

- [ ] Live adapters behind the existing interfaces: fal.ai (image, video), Anthropic (script), ElevenLabs (voice + word timings), render API (stitch + subtitle burn).
- [ ] Wire the **async pipeline**: submit → persist provider job id → resume via provider webhook + a Vercel Cron fallback poller; per-step progress in the UI.
- [~] **Margin gate:** gate + report built and enforced (live adapters refused while any product is < 3x at full burn). _(PR `ceo/margin-gate`, 2026-10-01)_ Remaining: replace placeholder `costUsdPerUnit` with measured costs, then **reprice** (see §7 — every product currently fails) until `npx tsx scripts/margin-report.mts` passes.
- [ ] Media storage: move assets to Cloudflare R2 (no egress); signed URLs; retention.
- [ ] Moderation: LLM prompt check + provider safety filters + block/refund path.

### NEXT — Phase 3: Ship it

- [ ] Deploy to Vercel (env, Supabase prod project, Stripe live keys, public webhook endpoint).
- [ ] Sentry + PostHog wired, Resend transactional email. (CI ✅ done in Phase 1.)
- [ ] Legal: ToS/Privacy, cookie banner (reject-all), EU AI Act AI-generated labelling (visible + metadata).

### LATER — Phase 4: Retention & ARPU

- [ ] Characters (consistent reference across scenes).
- [ ] Studio (edit/regenerate one scene).
- [ ] Series (recurring cast + story bible).
- [ ] AI Agent (chat that calls the existing pipeline — no second pipeline).
- [ ] Direct posting to TikTok/YouTube/IG (apply for TikTok Content Posting API early — weeks of lead time).
- [ ] Affiliate program (typically the best-paying channel in this niche).
- [ ] Yearly plans.

**Out of scope (deliberate):** "buy followers / Boost" (violates platform + Stripe rules), self-hosted GPUs/model training, mobile app, microservices, timeline editor.

---

## 6. Shipment / launch strategy

1. **Own faceless accounts from day 0** — 5–10 niche accounts posting daily with the tool; link in bio.
2. **Affiliates** — 30% recurring for creators in the "faceless channel / make money online" niche.
3. **SEO** — 2–3 pages/week: keyword guides ("AI TikTok video generator", "faceless video generator"), one page per theme with examples, model-comparison pages.
4. **Paid ads** (Meta/TikTok) only once signup→paid converts; use our own generated videos as the ads; kill any cohort where CAC > first-month revenue.
5. **Launch bursts** — Product Hunt, relevant subreddits (rules-compliant), build-in-public on X.
6. **Retention** — weekly trend-based themes, onboarding email sequence, reminder emails for unused credits.

---

## 7. Monetization & pricing (current placeholders)

Plans (EUR/mo): Starter €14.99 / 30k credits · Pro €29.99 / 100k · Ultra €79.99 / 250k.
Top-ups: 20k €12 · 60k €29 · 150k €59.
Internal credit scale (recalibrated): a 12s standard video ≈ ~1.4k credits, a 15s ≈ ~2k.
Trial: 3,000 credits (≈ one short video).

**🚨 Margin gate FAILS today (2026-10-01, placeholder costs).** At full burn on the worst-case shape a buyer may make, net revenue (after 20% VAT, Stripe fees, €→$1.08) covers only **0.22–0.43x** of API cost — every product loses money:

| Product         | Credits | Net rev | Worst-case API cost | Multiple | Max credits at 3x |
| --------------- | ------- | ------- | ------------------- | -------- | ----------------- |
| Starter €14.99  | 30k     | $12.98  | $30.09 (27s std)    | 0.43x    | ~4.3k             |
| Pro €29.99      | 100k    | $26.24  | $119.81 (87s prem)  | 0.22x    | ~7.3k             |
| Ultra €79.99    | 250k    | $70.43  | $300.06 (117s prem) | 0.23x    | ~19.6k            |
| Top-up 20k €12  | 20k     | $10.34  | $24.01              | 0.43x    | ~2.9k             |
| Top-up 60k €29  | 60k     | $25.36  | $72.02              | 0.35x    | ~7.0k             |
| Top-up 150k €59 | 150k    | $51.87  | $180.04             | 0.29x    | ~14.4k            |

Trial burn = **$3.01 API cost per signup**. Root cause: video is charged 80 credits/s for $0.10/s (800 credits/$), so a 30k-credit plan is ~$37 of video. Fix path (owner decision, not done by the routine): measure real costs first (fal.ai LTX/Kling may be far below $0.10/s), then raise `creditsPerUnit` ~7–14x **or** shrink grants to the "max credits" column — and re-check that the trial still covers one video. Pricing stays provisional until the report passes.

---

## 8. Risks & mitigations

- **API cost > credit value** → **currently true on placeholder costs (§7)**; margin gate now blocks live mode until fixed; cheapest-model defaults; cap video length.
- **Provider price/behavior changes** → adapter layer isolates swaps.
- **Platform rules tighten on AI content** → AI-label everything; no follower-buying.
- **Competitor head start (TrendStory, 750k+ creators)** → pick an angle (niche, language market, price, character consistency) rather than a generic clone.
- **Webhook double-grant** → `stripe_events` idempotency (run 0002).

---

## 9. Ops runbook (state that isn't in code)

- **Env:** `.env.local` (gitignored) holds Supabase URL/anon/service-role, Stripe test secret + webhook secret. `MOCK_PROVIDERS=true` today.
- **Pending DB migration:** `0002_stripe_events` not yet applied (webhook idempotency disabled, graceful).
- **Local Stripe testing:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Node ≥ 22 required** (`engines`); dev + CI on Node 24.
- **CI:** `.github/workflows/ci.yml` runs `format:check → lint → typecheck → test → next build` in mock mode. `npm run typecheck` runs `next typegen` first (Next's generated `LayoutProps`/route types), so it works on a fresh clone.
- **Repo:** github.com/TudorFnsn/Shortcraft (branch-per-feature → fast-forward `main`).
- **Demo account (sandbox):** a pre-confirmed test user exists for walkthroughs.
- **CEO routine:** daily cloud routine `trig_01HJ4PZK4zLRutuBCtMST2Wx` (Opus 5.5, 06:00 UTC) runs the heartbeat loop at PR-gated autonomy — reviews this plan, opens a PR for the day's highest-leverage win, updates this file, and reports a digest. It never merges or touches live secrets. Manage: https://claude.ai/code/routines/trig_01HJ4PZK4zLRutuBCtMST2Wx

---

## 10. Changelog (append newest on top; every change lands a line here)

- **2026-10-01** — Margin gate: `features/billing/margin.ts` prices every job shape a plan allows at the reserve's upper bound, takes net revenue after VAT + Stripe fees, and reports each plan/top-up's revenue ÷ worst-case API cost; the provider registry refuses live adapters while any product is below 3x. `scripts/margin-report.mts` prints the table. Finding: **every product is at 0.22–0.43x on placeholder costs** (§7). +12 tests. Yesterday's `customer.subscription.updated` work is open as PR #4, awaiting review. (CEO routine)

- **2026-09-30** — Plan gating: `entitlements` module + `PlanRepository` port (Supabase reads `subscriptions`; in-memory for tests). `POST /api/jobs` returns 403 `plan_limit` before creating a job or holding credits; `/create` shows locked options labelled with the plan that unlocks them. +10 tests. (CEO routine, same-day follow-up)
- **2026-09-30** — CI added (GitHub Actions: format, lint, typecheck, test, build; mock mode, no secrets). Fixed the `/pricing` React-Compiler lint error (`location.assign` instead of assigning `href`), allowed `_`-prefixed unused args, formatted the repo, made `typecheck` self-sufficient via `next typegen`. (CEO routine, same-day follow-up)
- **2026-09-30** — Credit hold is now a hard upper bound. Found that 6s/9s/15s jobs (15s is the default!) charged _more_ than they reserved, so settle could push a balance negative. Estimate now prices scenes at `MAX_SCENE_SEC`; orchestrator clamps the script plan and caps the bill at the hold. +26 tests (every length × tier, plus an over-delivering script model). (CEO routine)
- **2026-09-30** — Created TheMasterPlan + the CEO/dev-team operating workflow; stood up the daily "Shortcraft CEO" cloud routine (Opus 5.5, PR-gated).
- **2026-09-30** — Stripe billing verified live in sandbox (checkout → webhook → 20k credits granted). Webhook made resilient to a missing idempotency table.
- **2026-09-29** — Stripe integration built: products/prices, checkout, webhook, portal, `/pricing`; migration 0002.
- **2026-09-28/29** — Create-form affordability fix (default 15s + live estimate). Supabase integration: repository, auth, `/create` + `/gallery`; verified end-to-end live. Node upgraded 20→24. Credit scale recalibrated.
- **2026-09-24/25** — Foundation: provider adapters + mocks, credit ledger, render state machine, config/lib, tooling, DB schema + orchestrator. 30 tests green.

---

## 11. Decision log (why, not just what)

- **Serverless + webhook/cron pipeline** over a worker service → stay on Vercel+Supabase.
- **Provider adapter + model catalog** → swap models monthly without touching pipeline; pricing centralized.
- **Append-only credit ledger** → auditable, race-safe.
- **Markdown source of truth** (not .docx) → diffable, agent-editable, version-controlled.
- **No subscription ⇒ Starter limits** (2026-09-30) → trial and lapsed users can make ≤30s standard videos; premium quality and longer videos are the upgrade reason. Live statuses = `active`/`trialing`/`past_due` (grace during dunning). Limits live on the `subscriptions` row, not `profiles.plan_id`, because cancellation only updates `subscriptions`.
- **Margin gate is fail-closed for live mode** (2026-10-01) → no live provider call while any product earns < 3x its worst-case API cost at full burn. Worst case (not a typical 15s video) because credits are fungible and heavy users self-select; VAT + Stripe fees deducted because EU consumer prices include VAT. The trial is reported as acquisition cost, not gated. Trade-off: going live is blocked until costs are measured and pricing is changed, which is intentional, because shipping at today's numbers would lose money on every paying user.
- **CI gates every PR** (2026-09-30) → the daily CEO routine ships unattended PRs; CI is the reviewer's first line of defence, so lint/format are enforced (errors fail the build), not advisory.
- **The reserve hold is the price ceiling** (2026-09-30) → a user is never billed more than the estimate shown on `/create`; any metered overrun is absorbed as margin and logged, never turned into user debt. Trust + no negative balances beats squeezing a few credits. Trade-off: estimates rose ~15% for some lengths (15s standard 1,760 → 2,024, still inside the 3,000 trial).
