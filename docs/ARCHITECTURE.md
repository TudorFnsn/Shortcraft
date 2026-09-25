# Shortcraft — architecture & conventions

Read this before adding code. It keeps the codebase consistent as it grows.

## What this is

An AI short-form video generator: idea in → vertical MP4 out (script → image per
scene → video clip per scene → voiceover → subtitles → stitch). Sold as monthly
credits + top-ups. The "AI" is orchestration of third-party model APIs, so the
whole design centers on **swappable providers** and an **auditable credit ledger**.

## Golden rules

1. **Nothing calls a provider directly.** UI/route handlers go through
   `features/render` and `features/credits`. Provider adapters are resolved only
   via `features/providers/registry.ts`.
2. **`MOCK_PROVIDERS=true` must always keep the app fully working** with zero
   secrets. Every real adapter needs a mock twin. Tests run in mock mode.
3. **Credits are append-only.** Never mutate a balance; write a signed
   `credit_transactions` row. Balance = SUM(delta). The atomic reserve/settle/
   refund lives in one row-locked Postgres function; the math is in
   `features/credits/ledger.ts`.
4. **Money & state mutations are transactional and idempotent.** Every provider
   call is keyed by `idempotencyKey` (job+scene+step). Webhooks verify signatures.
5. **Validate every boundary with zod:** env, API inputs, provider responses,
   webhooks.
6. **Return `Result<T, E>`** (`lib/result.ts`) from provider/credits/orchestrator
   calls. Throw only for genuine bugs/unreachable states.
7. **Migrations are the schema source of truth** (`supabase/migrations`). Keep
   generated DB types in sync.
8. **Record `costUsd` on every job** so the margin gate (API spend vs credits
   charged) is always answerable.

## Layout

- `src/config` — brand (`site.ts`), plans/top-ups (`plans.ts`), model catalog +
  pricing (`models.ts`). Adding a model = one row + one adapter registration.
- `src/features/*` — feature-first modules. Core today:
  - `providers/` — adapter contracts (`types.ts`), `mocks.ts`, `registry.ts`.
    The `Provider.run()` either COMPLETES inline or returns an ASYNC job resolved
    later by webhook/cron — this is what keeps us serverless-only.
  - `credits/` — the ledger math.
  - `render/` — the pure state machine (`machine.ts`); the DB-backed orchestrator
    lands on top of it.
- `src/lib` — `env.ts` (typed, mock-friendly), `result.ts`, `logger.ts`, and (next)
  the Supabase clients.
- `tests/` — vitest unit + pipeline tests; Playwright e2e added in Phase 0 finish.

## Commands

- `npm run dev` — app (mock mode by default)
- `npm test` — vitest (must stay green with no secrets)
- `npm run typecheck` — `tsc --noEmit` (strict + noUncheckedIndexedAccess)
- `npm run format` — prettier

## Pipeline status

`draft → scripting → images → clips → voiceover → subtitles → stitching → done`,
with `→ failed` (auto-refund) from any step. See `features/render/machine.ts`.
