# TheMasterPlan — Shortcraft

> **Single source of truth** for Shortcraft. Every meaningful change to the app
> updates this file (status, roadmap, changelog). If reality and this document
> disagree, fix whichever is wrong in the same change. Read this before planning
> any work.
>
> Operating model: see `~/.claude/the-master-plan-workflow.md` (the CEO + dev-team
> "heartbeat" that drives this project).
>
> Last updated: 2026-10-06

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
- Vitest + Prettier + strict tsconfig. 145 unit/integration tests green.

**Phase 1 — Monetizable MVP ✅ (verified end-to-end, live)**

- **Provider layer:** one adapter contract for script/image/video/voice/render; deterministic mocks; model→adapter registry. `MOCK_PROVIDERS=true` runs the whole pipeline offline.
- **Credit ledger:** append-only (`credit_transactions`), balance = SUM(delta); atomic `reserve_credits` / `add_credits` Postgres functions (advisory-locked, no overspend).
- **Render pipeline:** state machine `draft→scripting→images→clips→voiceover→subtitles→stitching→done` (`→failed` auto-refunds); DB-backed orchestrator; reserve→settle credit flow. The reserve is a guaranteed **upper bound**: scenes priced at `MAX_SCENE_SEC`, the script's plan is clamped to the budget, and the bill is capped at the hold (overruns log a `warn` = margin leak to watch).
- **Supabase:** auth (email/password), Postgres schema + RLS, storage-ready. Connection + schema verified live.
- **App:** landing, `/login`, `/create` (topic + theme + length + quality, live cost estimate + affordability gate + plan gate with "(Pro)" upgrade hints), `/gallery` (jobs + balance), header with auth state.
- **Billing (Stripe, sandbox-verified end-to-end):** products/prices (plans + top-ups, lookup_keys + credit metadata), `/pricing`, `POST /api/checkout`, `POST /api/webhooks/stripe` (grants credits, syncs subscription), `POST /api/billing/portal`. Subscription lifecycle (`customer.subscription.updated`/`.deleted`) syncs plan + status, which drive plan limits. A live sandbox purchase with a test card granted 20,000 credits.

**Proven loop:** sign up → 3,000 trial credits → generate → paywall → pay → credits granted → generate more. All persisted in real Supabase; payment via real Stripe (test mode).

---

## 3. Architecture (how it's built)

- **Feature-first** modules under `src/features/*`. Nothing calls a provider directly — only via `features/providers/registry.ts`, `features/render`, `features/credits`, `features/billing`.
- **Serverless-only pipeline:** each provider `run()` either completes inline (fast/sync models, and all mocks) or returns an async job resolved later by a vendor webhook + a cron fallback. This is what lets minutes-long renders run on Vercel with no self-managed worker. (Async branch is designed but not yet wired — see §5.)
- **Money & state:** append-only ledger; reserve/settle/refund; every render records `api_cost_usd` for the margin gate. Webhooks verify signatures; idempotent via `stripe_events`.
- **Migrations are the schema source of truth** (`supabase/migrations`).
- Full conventions: `docs/ARCHITECTURE.md`.

**Stack:** Next.js/React/TS · Supabase (auth/db/storage) · Stripe · providers (fal.ai, Anthropic, ElevenLabs) behind adapters + in-house ffmpeg renderer · Vercel (target) · PostHog/Sentry/Resend (planned).

---

## 4. Repository map

```
src/config/        brand, plans/top-ups, model catalog + pricing, themes
src/features/
  providers/       adapter contract, mocks, registry
  credits/         ledger math + job credit ops
  render/          state machine, pricing, repository ports + supabase/in-memory impls, orchestrator, store
  billing/         stripe customer, checkout, webhook handler, event + credit-grant ledgers (idempotency), entitlements (plan limits), margin gate
  auth/            server-side session helper
src/app/           landing, login, create, gallery, pricing, api/{jobs,checkout,webhooks/stripe,billing/portal,health}
src/utils/supabase supabase clients (server/browser/admin) + proxy session refresh
src/utils/stripe   stripe client
supabase/migrations 0001_init, 0002_stripe_events, 0003_credit_idempotency
scripts/           smoke.mts (live pipeline), stripe-setup.mts (create products/prices), margin-report.mts (margin gate)
```

---

## 5. Roadmap — what's next (priority order)

### NOW — Phase 1 hardening (before real traffic)

- [x] Run migration `0002_stripe_events` on the DB (webhook idempotency on). _(confirmed applied by Tudor, 2026-10-04)_
- [x] Make the credit estimate an **upper bound** (reserve ≥ actual) so balances can never go negative on settle. _(PR `ceo/credit-estimate-upper-bound`, 2026-09-30)_
- [x] CI on every PR + push to `main` (format, lint, typecheck, test, build — mock mode, no secrets); fixed the `/pricing` lint error + Prettier drift. _(PR `ceo/ci-lint`, 2026-09-30)_
- [x] Plan gating on `/create` (max duration + model tier per plan; server-enforced in `POST /api/jobs`, mirrored in the form with upgrade hints). _(PR `ceo/plan-gating`, 2026-09-30)_ Character limits wait for the Characters feature.
- [x] Handle `customer.subscription.updated` in the Stripe webhook (upgrades/downgrades/dunning/cancel sync `subscriptions` + `profiles.plan_id`; stale events for a replaced subscription are ignored; `.updated` is re-fetched from Stripe so out-of-order delivery can't regress state). _(PR `ceo/subscription-updated`, 2026-09-30; re-fetch added 2026-10-03)_ **Action for Tudor:** enable `customer.subscription.updated` on the Stripe webhook endpoint (dashboard / `stripe listen --events`).
- [x] Mid-cycle upgrade credits: a live `customer.subscription.updated` upgrade now grants the monthly-allotment difference (new − old) immediately via `upgradeCreditDelta`; downgrades never claw back. _(2026-10-04)_
- [x] Processed-events safety + minimal alerting: a failed handler now **releases** its `stripe_events` claim so Stripe's retry reprocesses it (before, a transient error marked a paid event done and the customer never got credits); `add_credits` errors now throw instead of being swallowed; credit grants are the last write of each branch; failures log `alert: stripe_webhook_failed` / `stripe_event_stuck`. _(PR `ceo/webhook-retry-safety`, 2026-10-04)_
- [x] Ledger-level idempotency: unique `credit_transactions.idempotency_key` + `grant_credits_once` (migration 0003); every webhook grant is keyed (checkout/renewal per event, upgrade per subscription + period + target plan), and the upgrade bonus is granted before the plan write so a failed sync can no longer lose it. _(PR `ceo/ledger-idempotency`, 2026-10-05)_
- [x] **🚨 Security: credit RPCs were callable by any user.** `add_credits` / `reserve_credits` are `SECURITY DEFINER` and never had `EXECUTE` revoked, so with Supabase's default grants any signed-in user (or the anon key) could mint credits or drain another user's balance via `/rest/v1/rpc/add_credits`. Migration 0003 revokes them from `public`/`anon`/`authenticated` (service role only); a test now fails if any future definer function isn't revoked. _(same PR, 2026-10-05)_
- [x] **Owner:** applied migration 0003 to the Supabase project; verified `has_function_privilege('authenticated','public.add_credits(uuid,bigint,text,uuid)','execute')` → `false`. _(Tudor, 2026-10-05)_

### NEXT — Phase 2: Real providers (make videos real + lock margins)

- [~] Live adapters behind the existing interfaces. **Done (2026-10-05, PR `ceo/live-script-voice`):** Anthropic script (`live/anthropic-script.ts`: Claude Sonnet 5.5, structured JSON output, server-side refusal fallbacks) and ElevenLabs voice (`live/elevenlabs-voice.ts`: Flash v2.5 with character timestamps → word timings, MP3 stored via `live/media-store.ts` in a private Supabase Storage bucket, signed URLs). Unit-tested with fakes; **not yet run against the real APIs** — `npx tsx scripts/live-providers-smoke.mts` does that in one command (~$0.02). **Done (2026-10-06, PR `ceo/fal-image-adapter`):** fal.ai image (`live/fal-image.ts`: FLUX [schnell] for standard, FLUX [dev] for premium, sync `fal.run`, 720×1280 = 1 billed MP, safety checker on and a flagged image fails the step, output copied into our media store). The smoke script now also generates one scene image when `FAL_KEY` is set (~$0.003). With script + voice + image live, **the live render adapter is the only missing piece for a fully live Standard video** (Ken Burns is local). **Still to do:** the live render adapter, then the premium video adapter (`ffmpeg-plan.ts` + `ffmpeg-render.ts` work locally; it needs asset download + upload via the media store). Live mode (`MOCK_PROVIDERS=false`) needs every step to have a live adapter, so it stays off until fal.ai + render land.
- [ ] **Owner:** add `ANTHROPIC_API_KEY` + `ELEVENLABS_API_KEY` (+ `FAL_KEY` for the image step) to `.env.local`, run the live smoke script, listen to `live-smoke/voiceover/*.mp3` and look at `live-smoke/images/*.jpg`; create a **private** Supabase Storage bucket named `media`.
- [ ] Wire the **async pipeline**: submit → persist provider job id → resume via provider webhook + a Vercel Cron fallback poller; per-step progress in the UI.
- [x] **Margin gate passes on every product** _(2026-10-05)_: gate + report _(PR `ceo/margin-gate`)_, researched costs in the catalog _(PR `ceo/real-provider-costs`)_, Standard = animated stills + in-house render _(PR `ceo/stills-and-inhouse-render`)_, and premium AI video repriced 220 → **1,420 cr/s** (owner decision). Starter 9.4x, Pro 3.0x, Ultra 3.2x, top-ups 4.0–5.9x; trial burn $0.14. **Pro has zero headroom** — the first measured premium cost above $0.12/s fails it again, so re-run `npx tsx scripts/margin-report.mts` whenever real costs come in. A test now fails if the shipped catalog drops below 3x.
- [~] Media storage: `MediaStore` port + Supabase Storage implementation (private bucket `media`, 24h signed URLs) landed with the voice adapter. Still to do: move to Cloudflare R2 (no egress fees) behind the same port, and a retention policy.
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

**Margin gate history:** it FAILED on researched real costs (2026-10-04) and PASSES since the 2026-10-05 repricing (see "Decided 2026-10-05" below). Original analysis: `costUsdPerUnit` now holds public list prices (mid-range per slot, sources below), not placeholders. Real prices do **not** rescue the current model: even the cheapest scenario fails.

| Scenario (per-slot cost)                                                    | Plan multiples (Starter / Pro / Ultra) | Top-ups    | Trial burn |
| --------------------------------------------------------------------------- | -------------------------------------- | ---------- | ---------- |
| Old placeholders                                                            | 0.43 / 0.22 / 0.23x                    | 0.29–0.43x | $3.01      |
| **Low** (LTX-2 Fast $0.04/s, render API $0.20)                              | 0.83 / 0.51 / 0.54x                    | 0.67–1.00x | $1.56      |
| **Mid — committed** (720p video $0.08/s, premium $0.12/s, render API $0.30) | 0.47 / 0.28 / 0.30x                    | 0.37–0.56x | $2.79      |
| High (video $0.10/s, FLUX dev images, render $0.40)                         | 0.35 / 0.21 / 0.23x                    | 0.28–0.42x | $3.70      |

**What the numbers say:**

1. **Generating AI video for every scene is the cost.** A 15s standard video costs ~$1.80 (≈$1.20 video clips + $0.30 render). At 3x, Starter (€14.99) can afford ~2.4 such videos a month. No credit-scale tweak fixes that.
2. **Credits aren't proportional to cost.** The worst case moved to the **shortest** video (6s standard), because the flat render fee costs $0.30 but is charged 100 credits. Premium is the reverse: 220 cr/s for $0.12/s, so it's overpriced relative to standard.
3. **Prices were researched, not measured.** Direct provider pages were blocked from the routine's network, so the figures come from search snippets of aggregator and fal.ai pages; they disagree by up to 2x per model. Measure on real calls before going live.

**Proposal (A + B approved and built 2026-10-04; C not approved):**

- **A. Make Standard an "animated stills" tier.** Ken Burns pan/zoom over the scene image + voice + captions (the format most faceless channels use). It needs no video model: ~$0.07 for a 15s video. Premium keeps AI video clips.
- **B. Render in-house** (ffmpeg on a serverless function) instead of a hosted render API: ~$0.01 vs $0.30 per video.
- **C. One credit scale tied to cost:** `creditsPerUnit = ceil(costUsd × 12,000)` for every model. Every shape then has the same markup, so no plan has a hidden worst case. 12,000 cr/$ is the smallest round scale that clears 3x on Pro, the plan with the lowest revenue per credit.

With A+B+C and the current plan prices + grants, the gate **passes**: Starter 5.3x, Pro 3.2x, Ultra 3.4x, top-ups 4.2–6.2x; trial burn **$0.25**.

| Video            | Credits | API cost | Starter (30k) | Pro (100k) | Ultra (250k) | Trial (3k) |
| ---------------- | ------- | -------- | ------------- | ---------- | ------------ | ---------- |
| 15s standard     | 888     | $0.07    | 33 / mo       | 112        | 281          | 3          |
| 30s standard     | 1,080   | $0.09    | 27            | 92         | 231          | 2          |
| 60s standard     | 1,560   | $0.13    | 19            | 64         | 160          | 1          |
| 15s premium (AI) | 27,582  | $2.30    | 1             | 3          | 9            | 0          |
| 30s premium (AI) | 45,570  | $3.80    | 0             | 2          | 5            | 0          |

Premium AI video stays genuinely expensive; a cheaper variant is to animate only the hook scene ("hero shot") and use stills for the rest.

**Decided 2026-10-05 (owner: "do your recommendations"):** premium AI video = **1,420 cr/s** (option A of the premium choice below); Standard keeps its margin (option C **not** adopted until costs are measured on real calls). Gate **PASSES**: Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x. Customer prices now:

| Video        | Credits | Pro (100k) / mo | Ultra (250k) / mo |
| ------------ | ------- | --------------- | ----------------- |
| 15s standard | 2,024   | 49              | 123               |
| 30s standard | 3,240   | 30              | 77                |
| 15s premium  | 26,504  | 3               | 9                 |
| 30s premium  | 44,040  | 2               | 5                 |
| 60s premium  | 87,880  | 1               | 2                 |

Follow-ups: model the "hero shot" premium variant (AI video on the hook scene only) once a live video adapter gives measured costs; revisit option C at the same time.

**Status after A + B (2026-10-04, credits unchanged):** Standard costs ~$0.07 for 15s instead of ~$1.80. Gate: Starter **9.4x** ✅, Pro 0.55x, Ultra 0.59x, top-ups 0.73–1.08x; trial burn **$0.14** (was $2.79). Everything that fails, fails on its worst case: long premium (AI video) jobs. The smallest single fix is to raise `video-premium` from 220 to **1,420 cr/s** (Pro then passes at exactly 3.0x, Ultra 3.2x, top-ups 4.0–5.9x). A 30s premium video would then cost ~44k credits (Pro ≈ 2/month). Standard prices stay as they are (15s ≈ 2,024 credits, ~14/month on Starter), so Standard now carries a ~9x margin. Option C would instead pass that margin on to customers as roughly 2.5x more videos per plan.

**Sources (search snippets, 2026-09/10):** fal.ai model and learn pages (LTX-2 Fast, Seedance 2.x, Wan 2.5); teamday.ai, devtk.ai, fluxnote.io and tryinfer.com price comparisons (Kling 3.0, Veo 3.1 Fast, Wan); fal.ai FLUX pricing via modelslab.com and pricepertoken.com; ElevenLabs Flash $0.05/1k chars via apiframe.ai and developer.puter.com; Shotstack and Creatomate pricing pages; Anthropic list prices (Sonnet 5.5 $2/$10 per MTok).

---

## 8. Risks & mitigations

- **API cost > credit value** → gate passes since 2026-10-05 (§7) but Pro is at exactly 3.0x: any measured cost increase fails it, and the gate then blocks live mode again (fail-closed). Re-run the margin report on measured costs.
- **Provider price/behavior changes** → adapter layer isolates swaps.
- **Platform rules tighten on AI content** → AI-label everything; no follower-buying.
- **Competitor head start (TrendStory, 750k+ creators)** → pick an angle (niche, language market, price, character consistency) rather than a generic clone.
- **Webhook double-grant** → `stripe_events` idempotency (0002 applied) + ledger-level grant keys (0003 applied).
- **Privileged DB functions exposed as RPCs** → every `SECURITY DEFINER` function must be revoked from `anon`/`authenticated` (enforced by `tests/billing/migrations-security.test.ts`).

---

## 9. Ops runbook (state that isn't in code)

- **Env:** `.env.local` (gitignored) holds Supabase URL/anon/service-role, Stripe test secret + webhook secret. `MOCK_PROVIDERS=true` today. Live provider env: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` (required for live script/voice), optional `ANTHROPIC_SCRIPT_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_WORKSPACE_ID` (only for an organization-level key not scoped to a workspace; sent as the `anthropic-workspace-id` header), `ELEVENLABS_VOICE_ID` (default: ElevenLabs stock voice), `FAL_KEY` (required for live images), `SUPABASE_MEDIA_BUCKET` (default `media`).
- **DB migrations:** `0001_init`, `0002_stripe_events` and `0003_credit_idempotency` applied.
- **Local Stripe testing:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Node ≥ 22 required** (`engines`); dev + CI on Node 24.
- **CI:** `.github/workflows/ci.yml` runs `format:check → lint → typecheck → test → next build` in mock mode. `npm run typecheck` runs `next typegen` first (Next's generated `LayoutProps`/route types), so it works on a fresh clone.
- **Repo:** github.com/TudorFnsn/Shortcraft (branch-per-feature → fast-forward `main`).
- **Demo account (sandbox):** a pre-confirmed test user exists for walkthroughs.
- **CEO routine:** daily cloud routine `trig_01HJ4PZK4zLRutuBCtMST2Wx` (Opus 5.5, 06:00 UTC) runs the heartbeat loop at PR-gated autonomy — reviews this plan, opens a PR for the day's highest-leverage win, updates this file, and reports a digest. It never merges or touches live secrets. **Before picking an item it lists open + recently closed PRs** — an item with an open PR is in review, not available (unmerged PRs don't show in `main`'s copy of this file; skipping this check produced duplicate PRs #4/#6 for one roadmap item). Manage: https://claude.ai/code/routines/trig_01HJ4PZK4zLRutuBCtMST2Wx

---

## 10. Changelog (append newest on top; every change lands a line here)

- **2026-10-06** — Optional `ANTHROPIC_WORKSPACE_ID`: the script adapter sends it as the `anthropic-workspace-id` header, so an organization-level Anthropic key (not scoped to a workspace) works. Found on the owner's first live smoke run, which failed with a 400 asking for that header. +1 test (145 total). (CEO, interactive)
- **2026-10-06** — Live fal.ai image adapter: FLUX [schnell] for `image-standard` and FLUX [dev] for `image-premium` (catalog `providerId`s now `fal:flux-schnell` / `fal:flux-dev`; registry wires both behind `FAL_KEY`). Synchronous `fal.run` call, 720×1280 (one billed megapixel, matches the catalog cost), safety checker on (a flagged image throws so the job refunds), result copied into the `MediaStore` so we don't depend on fal's CDN retention. Fixed along the way: media object paths were an 8-hex (32-bit) FNV hash of the step key, and `put` overwrites, so two jobs could collide and one user's voiceover silently replace another's (~50% odds by ~77k objects); new `mediaPath()` uses the full `job:step:scene` key. Smoke script gains an image step. +7 tests (144 total). (CEO routine)
- **2026-10-05** — First live provider adapters: Anthropic script (Claude Sonnet 5.5 via `@anthropic-ai/sdk`, zod structured output, `fallbacks: "default"`, refusal/max_tokens fail the step so the job refunds, cost from real token usage) and ElevenLabs voice (`with-timestamps`, characters → word timings, MP3 into a new `MediaStore`/Supabase Storage). Catalog `providerId`s now `anthropic:script` / `elevenlabs:voice`; registry wires both. New `scripts/live-providers-smoke.mts`. Mock mode unchanged and still the default. +10 tests (137 total). (CEO, interactive)
- **2026-10-05** — Premium AI video repriced 220 → 1,420 cr/s (owner decision). The margin gate now **passes on every plan and top-up** (Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x, Starter unchanged at 9.4x), so it no longer blocks live providers. Standard prices unchanged (option C deferred). New test: the shipped catalog must pass the gate. +1 test (127 total). (CEO, interactive)
- **2026-10-05** — Migration 0003 applied to the live Supabase project by Tudor; the credit-RPC hole is confirmed closed (`authenticated` can no longer execute `add_credits`), and webhook grants now go through `grant_credits_once`. (CEO routine, on owner confirmation)
- **2026-10-05** — Ledger idempotency + credit-RPC lockdown (migration 0003). `credit_transactions.idempotency_key` (unique, partial) + `grant_credits_once(user, delta, reason, key)`; `credit-grant.ts` port (Supabase impl falls back to `add_credits` with a warning until 0003 is applied; in-memory impl for tests). Webhook grants are keyed: checkout/renewal by event id, mid-cycle upgrade by subscription + period end + target plan, which also stops an upgrade→downgrade→upgrade toggle from earning the bonus twice in one period. The upgrade bonus now lands before the plan write, so a failed sync is retried with the bonus intact. Found while writing it: `add_credits`/`reserve_credits` were executable by `anon`/`authenticated` (free credits for anyone signed in); 0003 revokes that. SQL verified against Postgres (PGlite) with Supabase-style default grants: the hole exists before, is closed after, grants apply once per key, trial trigger intact, re-runnable. +16 tests (126 total). (CEO routine)
- **2026-10-04** — Standard tier = animated stills + in-house render (owner approved A + B of §7). New `local:ken-burns` video adapter (no video model, $0, runs in mock and live mode) and in-house ffmpeg renderer (`ffmpeg-plan.ts`: one-pass zoompan stills / fitted AI clips / concat / burned-in ASS captions / voiceover → H.264 MP4; `ffmpeg-render.ts` runner; `scripts/render-smoke.mts` renders a real 1080×1920 MP4 and checks it with ffprobe). `RenderClip`/`VideoOutput` are now still-or-video unions. Customer credit prices unchanged; tier labels now say "animated stills" / "AI video". Gate: Starter passes (9.4x), premium-capable products still fail; trial burn $2.79 → $0.14. +14 tests (110 total). (interactive session)
- **2026-10-04** — Real provider costs: `costUsdPerUnit` in `config/models.ts` now holds researched list prices (fal video/FLUX, ElevenLabs Flash, Sonnet-class script, hosted render API) instead of placeholders. Gate still fails (0.28–0.56x; trial burn $2.79). §7 rewritten with low/mid/high scenarios and a repricing proposal that passes at 3x. No pricing or credit changes yet. (interactive session)
- **2026-10-04** — Webhook retry safety: idempotency moved into `event-ledger.ts` (`processStripeEventOnce` + Supabase/in-memory ledgers). A handler failure releases the event claim so Stripe retries for real; `grant()` throws on `add_credits` errors; checkout grants credits after recording the subscription; route logs a stable `alert` tag. +6 tests (96 total). (CEO routine)
- **2026-10-04** — Mid-cycle upgrade credits: on a live `customer.subscription.updated` plan upgrade, the webhook grants the monthly-allotment **difference** (new − old) immediately (`upgradeCreditDelta`), instead of waiting for the next renewal. Idempotent (after the upsert the stored plan equals the new plan; per-event `stripe_events` guard); downgrades never claw back. +3 tests (90 total). (interactive session)
- **2026-10-03** — PR #4 (subscription sync): `customer.subscription.updated` now re-fetches the subscription from Stripe (`currentSubscriptionFor`) instead of trusting the payload, ported from the closed duplicate #6 per the owner's review note. `.deleted` keeps its payload (terminal). +2 tests. Routine now checks open PRs before picking work. (CEO routine)
- **2026-10-01** — Margin gate: `features/billing/margin.ts` prices every job shape a plan allows at the reserve's upper bound, takes net revenue after VAT + Stripe fees, and reports each plan/top-up's revenue ÷ worst-case API cost; the provider registry refuses live adapters while any product is below 3x. `scripts/margin-report.mts` prints the table. Finding: **every product is at 0.22–0.43x on placeholder costs** (§7). +12 tests. (CEO routine; merged after PR #4)
- **2026-09-30** — Stripe webhook now syncs `customer.subscription.updated` + `.deleted` through one pure mapper (`subscription-sync.ts`): plan from price metadata, status, period end. Upgrades/downgrades change limits immediately; `unpaid`/`paused`/`canceled` fall back to Starter. +7 tests. (CEO routine, same-day follow-up)
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

- **Images: FLUX on fal.ai, synchronous, copied into our storage** (2026-10-06) → schnell matches the $0.003/image the margin gate was approved on; the sync endpoint returns in ~1s, so no async plumbing is needed for this step. 720×1280 stays at one billed megapixel; the renderer upscales to 1080×1920 (a 1080×1920 request would bill 3 MP). We copy each image into our own bucket because the render step may run later and fal's CDN has no retention guarantee. Media paths come from the full step key, never a short hash, because uploads overwrite.

- **Script on Claude Sonnet 5.5, voice on ElevenLabs Flash, media on Supabase Storage first** (2026-10-05) → Sonnet 5.5 matches the $0.04/script the margin gate was approved on (~$0.02–0.03 typical; Opus 5.5 would roughly double it with Pro at exactly 3.0x) and is swappable via `ANTHROPIC_SCRIPT_MODEL`. Flash matches the catalog's voice price. Supabase Storage is already provisioned, so the voice adapter ships now; R2 replaces it behind the same `MediaStore` port when egress costs matter. Refusal fallbacks are on so a false-positive safety decline doesn't fail a paid job.

- **Premium AI video = 1,420 cr/s; Standard keeps its margin** (2026-10-05, owner-approved) → the smallest change that makes every product clear 3x, and a single config value, so it is easy to revisit. Premium becomes a deliberate luxury (2–3 short premium videos/month on Pro); Standard is the everyday product. Passing Standard's ~9x margin on to customers (option C, ~2.5x more videos) waits until costs are measured on real calls, because the researched prices disagree by up to 2x and Pro has no headroom. Cheaper premium via a single AI "hero shot" is the next thing to model.

- **Credit grants are keyed in the ledger; upgrade bonus = once per period per plan** (2026-10-05) → `stripe_events` dedupes deliveries, but only the ledger can make a grant exactly-once across partial failures, so the database enforces it, not handler ordering. The upgrade key is period-scoped (not event-scoped) so a Pro→Starter→Pro toggle, roughly free after Stripe proration, can't farm the bonus. Accepted edge: Starter→Ultra→Starter→Pro in one period still pays both bonuses (bounded, rare).
- **DB functions that move money are service-role only** (2026-10-05) → the app never calls credit RPCs with a user token, so there is no reason to expose them; a test enforces it for every future `SECURITY DEFINER` function.

- **Upgrades grant credits immediately** (2026-10-04) → the plan-allotment difference is granted the moment a subscription upgrades mid-cycle, not at the next renewal, so the upgrade feels instant (better conversion). Downgrades grant nothing and never claw back — goodwill beats a few credits. The slight over-grant across a cycle is an accepted conversion cost.
- **Serverless + webhook/cron pipeline** over a worker service → stay on Vercel+Supabase.
- **Provider adapter + model catalog** → swap models monthly without touching pipeline; pricing centralized.
- **Append-only credit ledger** → auditable, race-safe.
- **Markdown source of truth** (not .docx) → diffable, agent-editable, version-controlled.
- **No subscription ⇒ Starter limits** (2026-09-30) → trial and lapsed users can make ≤30s standard videos; premium quality and longer videos are the upgrade reason. Live statuses = `active`/`trialing`/`past_due` (grace during dunning). Limits live on the `subscriptions` row, not `profiles.plan_id`, because cancellation only updates `subscriptions`.
- **Stripe is the source of truth for subscription state** (2026-10-03) → on `.updated` we re-fetch rather than trust the event body; costs one Stripe API call per event, negligible at our volume.
- **Finish open PRs before starting new ones** (2026-10-03) → with PR-gated autonomy, review is the bottleneck; a fresh PR for an item already in review wastes reviewer time. The routine improves an open CEO PR (on its branch) when that's the highest-leverage move.
- **Margin gate is fail-closed for live mode** (2026-10-01) → no live provider call while any product earns < 3x its worst-case API cost at full burn. Worst case (not a typical 15s video) because credits are fungible and heavy users self-select; VAT + Stripe fees deducted because EU consumer prices include VAT. The trial is reported as acquisition cost, not gated. Trade-off: going live is blocked until costs are measured and pricing is changed, which is intentional, because shipping at today's numbers would lose money on every paying user.
- **CI gates every PR** (2026-09-30) → the daily CEO routine ships unattended PRs; CI is the reviewer's first line of defence, so lint/format are enforced (errors fail the build), not advisory.
- **Standard = animated stills, rendered in-house** (2026-10-04, owner-approved) → per-scene AI video was ~95% of a standard video's cost; Ken Burns over the scene image is the format faceless channels already use, and ffmpeg on our own compute replaces a ~$0.30/video render API. Credits stay the same for customers (option C not approved), so the saving is margin for now. The renderer is a pure, unit-tested plan builder plus a thin runner, so the same command runs locally, in tests and on serverless.
- **Researched costs go in the catalog now; prices wait for the owner** (2026-10-04) → the gate should judge against the best numbers we have, not placeholders that looked closer to passing. Repricing changes what customers get, so it stays a proposal (§7) until Tudor decides.
- **Webhook: release-on-failure, grant last** (2026-10-04) → retrying a failed event beats silently dropping it: a lost grant is a paying customer with nothing, a chargeback, a churn. Ordering each branch so the grant is the final write makes the retry safe without a schema change; the full fix (ledger idempotency key) is queued as migration 0003.
- **The reserve hold is the price ceiling** (2026-09-30) → a user is never billed more than the estimate shown on `/create`; any metered overrun is absorbed as margin and logged, never turned into user debt. Trust + no negative balances beats squeezing a few credits. Trade-off: estimates rose ~15% for some lengths (15s standard 1,760 → 2,024, still inside the 3,000 trial).
