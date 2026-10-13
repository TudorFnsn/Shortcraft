# Deployment strategy

How Shortcraft goes from a branch to production on Vercel (Hobby plan) +
Supabase + Stripe, and how to undo it. Owner-facing; keep it in sync with
`vercel.json`, `src/lib/env.ts` and `.github/workflows/ci.yml`.

## 1. The three environments

| Vercel environment | Built from                                        | URL                                                      | Purpose                                                          |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| **Production**     | `main` (every merge)                              | `shortcraft-rho.vercel.app` (+ custom domain later)      | Real users, real money                                           |
| **Preview**        | every other branch / PR (`ceo/*`, `ceo-design/*`) | `shortcraft-git-<branch>-tudorfnsns-projects.vercel.app` | Review a change before merge: click through it, check the design |
| **Development**    | your machine (`npm run dev`)                      | `localhost:3000`                                         | Building and debugging                                           |

Hobby has no custom environments (a separate "Staging" needs Pro), so
**Preview is our staging**. That is enough at our size: every PR gets its own
throw-away deployment, and `main` is always what's live.

## 2. What each environment may touch

The rule: **only Production can spend money, charge cards or write to the
production database.** Previews run on every routine PR (several a day), so a
misconfigured Preview would burn provider credit and pollute real data.

| Variable                                                                                 | Production                                      | Preview                                                     | Development (`.env.local`)                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `MOCK_PROVIDERS`                                                                         | `false`                                         | `true` (**forced by code**, see §5)                         | `true` (flip to `false` only to test live) |
| `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `FAL_KEY`                                     | real keys                                       | **not set**                                                 | your keys, if testing live                 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | production project                              | **staging project** (recommended) or not set (demo mode)    | staging project                            |
| `STRIPE_SECRET_KEY`                                                                      | test key now → **live key** at go-live          | test key (`sk_test_…`); a live key is **ignored by code**   | test key                                   |
| `STRIPE_WEBHOOK_SECRET`                                                                  | from the Production webhook endpoint            | not set (no webhooks reach previews)                        | from `stripe listen`                       |
| `CRON_SECRET`                                                                            | long random string                              | not set                                                     | not needed (route is open in dev)          |
| `NEXT_PUBLIC_SENTRY_DSN`                                                                 | the Sentry project's DSN                        | same DSN (events are tagged `preview`)                      | not set (Sentry off)                       |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET`                                      | Resend key, verified sender, long random string | not set (`RESEND_API_KEY` is **ignored by code**)           | not set (the lifecycle cron is a dry run)  |
| `NEXT_PUBLIC_SITE_URL`                                                                   | the production URL / domain                     | not set (nothing reads it yet; reserved for emails/OG tags) | `http://localhost:3000`                    |

In Vercel → Settings → Environment Variables, each variable has checkboxes for
Production / Preview / Development. **Untick Preview for every secret that
reaches real money or real data.** Mark secrets as **Sensitive**.

### Supabase: one project per stage

Recommended: a second free Supabase project, `shortcraft-staging`, for Preview
and local development, with the same migrations (`supabase/migrations`, run in
order in its SQL Editor). Its Auth → URL Configuration allows the preview URLs:
`https://shortcraft-*-tudorfnsns-projects.vercel.app/**` and
`http://localhost:3000/**`. The production project allows only the production
URL (and the custom domain later).

Until the staging project exists, leave the Supabase variables off Preview:
previews then run in demo mode (in-memory store), which is fine for reviewing
pages and design but can't sign in.

## 3. Release flow

```
branch (ceo/*, ceo-design/*, feature/*)
  └─ PR → GitHub CI "check": format, lint, typecheck, tests, next build (mock mode)
        → Vercel Preview deployment (mock providers, test Stripe)
        → review: CI green + preview clicked through (+ migration applied, if any)
  └─ merge to main → Vercel builds Production automatically
        → smoke test (§6) → done, or roll back (§7)
```

- **Never push to `main` directly.** Protect it in GitHub → Settings →
  Branches → Add rule for `main`: require a pull request, require status
  checks **`check`** (CI) and **Vercel** to pass, and block force pushes.
- **Docs-only changes don't deploy.** `vercel.json` `ignoreCommand` skips the
  build when a commit only touches `*.md` or `docs/` (`TheMasterPlan.md`,
  `DesignPlan.md`). Saves Hobby build minutes; CI still runs on the PR.
- **Production deploys only from `main`.** Don't use "Promote to Production"
  on a preview unless you're rolling back.

## 4. Database migrations (expand → deploy → contract)

Vercel deploys code; it does not migrate Supabase. Migrations are applied by
hand in the SQL Editor (owner), so order matters:

1. **Expand first.** A PR that needs a schema change ships a migration that is
   _backwards compatible_ (new tables/columns/functions, nothing removed or
   renamed). Apply it to **staging**, then to **production**, **before**
   merging the PR. Old code keeps working against the new schema.
2. **Deploy** the code (merge).
3. **Contract later.** Drops/renames go in a later migration, after no
   deployed code uses the old shape.

Every PR that adds a file under `supabase/migrations/` says so at the top of
its description, with the exact apply + verify SQL. Migrations are written to
be re-runnable (`if not exists`, `create or replace`), so applying twice is
safe.

## 5. Guards in code (fail closed)

`src/lib/env.ts` → `applyDeploymentGuards` (tested in
`tests/lib/env-guards.test.ts`):

- On a **Preview** (`VERCEL_ENV=preview`), `MOCK_PROVIDERS` is forced to
  `true` even if the dashboard says `false`. Escape hatch for a deliberate
  live test on a preview: `ALLOW_LIVE_PROVIDERS_IN_PREVIEW=true` (set it on
  that one branch only, remove it after).
- A **live Stripe key** (`sk_live_…` / `rk_live_…`) is ignored anywhere but
  Production, so checkout fails with "not configured" instead of charging a
  real card from a preview or a laptop.
- Already in place: the margin gate refuses live providers while any plan
  earns < 3x its worst-case API cost; the cron route needs `CRON_SECRET`.

Each override logs one `[env]` warning in the deployment's logs.

## 6. Smoke test after every production deploy (2 minutes)

1. `/api/health/supabase` reports OK.
2. Sign in, open `/create` and `/gallery`.
3. `/pricing`, `/terms`, `/privacy` load.
4. After a change to rendering, billing or the cron: make one 15s Standard
   video and check it finishes and plays.
5. Supabase SQL Editor (weekly, or after a cron change):
   `select status, return_message from cron.job_run_details order by start_time desc limit 5;`

## 7. Rollback

- **Code:** Vercel → Deployments → pick the last good Production deployment →
  **⋯ → Instant Rollback** (Hobby can roll back to the previous production
  deployment). Then revert the bad PR on GitHub so `main` matches what's live;
  the next merge would otherwise redeploy the bad code.
- **Database:** migrations are additive (§4), so rolling back code never
  needs a schema rollback. If a migration itself is wrong, fix forward with a
  new migration.
- **Cron:** pause the per-minute sweep with
  `select cron.unschedule('shortcraft-advance-jobs');` and re-run migration
  0007 to restore it.
- **Payments:** if checkout misbehaves, remove `STRIPE_SECRET_KEY` from
  Production and redeploy: checkout returns "not configured", nothing is
  charged, existing credits are untouched.

## 8. Secrets hygiene

- Secrets live only in Vercel env vars, Supabase Vault and `.env.local`
  (gitignored). Never in the repo, PR text, chat or screenshots.
- Nothing secret starts with `NEXT_PUBLIC_` (those are sent to the browser).
- Rotate `CRON_SECRET` by updating it in Vercel **and** in Vault
  (`vault.update_secret`) at the same time.
- Use `vercel env pull .env.local` (Vercel CLI) to sync Development variables
  instead of copying by hand.
