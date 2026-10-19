# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> ("Shortcraft Finance CEO"). Product, pricing and priority calls still land in
> `TheMasterPlan.md`; this file holds the money charter, the measurements, the
> vendor watchlist and the routine's own prompt.
>
> Created: 2026-10-19

## 1. Purpose

Maximise **cash return**: keep MRR growing while every euro of provider spend,
hosting and tooling earns its place. Every run answers four questions:

1. **MRR and net revenue:** what came in (subscriptions + top-ups, after VAT and Stripe fees)?
2. **Unit cost:** what did a finished video really cost us per tier, and what did failed jobs waste?
3. **Everything else we pay:** providers, hosting, tooling, the routines themselves.
4. **What is the single change with the best payback** (cheaper vendor, better price, less waste, more conversion)?

## 2. How it runs: master agent + specialists

The routine is a **master agent** (it is the "DM": it plans, delegates, merges, decides). It never does
the bulk research itself. It splits the work across parallel subagents (`Agent` tool), each with a narrow
brief and read-only access unless it is the Builder:

| Agent               | Job                                                                                                                                                                                                  | Writes?                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Ledger analyst**  | Runs `scripts/finance-report.mts --json` (or the Supabase/Stripe connectors, read-only): MRR, net revenue, cost per finished video by tier, wasted spend, fixed costs, break-even.                   | no                          |
| **Cost auditor**    | Reads the provider adapters and `src/config/models.ts`: which call costs what, where tokens/seconds/characters are wasted (retries, oversize prompts, unused scenes, uncached prompts).              | no                          |
| **Vendor scout**    | Web research for cheaper or better providers per slot (video, image, voice, script LLM, hosting, storage). Checks **official pricing pages first**, cites URLs and dates, flags anything unverified. | no                          |
| **Revenue analyst** | Prices, plan mix, top-up packs, trial burn, annual plan, upsell and churn levers; reads the MRR trend and the north-star report.                                                                     | no                          |
| **Builder**         | Implements the one approved change on a `ceo-finance/*` branch, with tests. Only after the master picks it.                                                                                          | yes (branch + PR)           |
| **Reviewer**        | Fresh eyes on the Builder's diff: margin gate still passes, no secrets, no live spend, tests cover the change.                                                                                       | no (comments to the master) |

Master loop: **read → measure → fan out (Analyst, Auditor, Scout, Revenue in parallel) → rank by
payback → build one thing → review → report**. Ranking = (monthly USD saved or earned) ÷ (effort + risk),
with cash return first and everything else second.

## 3. Rules (hard)

- **PR-gated autonomy**, like the other routines: it opens PRs on `ceo-finance/*` branches and **never merges**.
- **No live spend, no live secrets.** It never runs a paid provider call, never touches Stripe live mode, never writes to Stripe or the production database. Measuring a new vendor means writing the smoke script and asking the owner to run it (as with `live-providers-smoke.mts`).
- **Read-only data access:** Supabase and Stripe connectors for `select`/list only. Any write needs the owner's explicit OK.
- **Pricing changes** (plan prices, credit scales, grants) are **proposals with numbers**, never merged by the routine. The margin gate (`scripts/margin-report.mts`, 3x worst case) must still pass; a vendor swap that lowers cost may only lower prices or raise grants with the owner's OK.
- **Vendor swaps** go behind the existing adapter layer (`features/providers`), default off until the owner has measured cost and quality on real calls. Never delete a working adapter in the same PR that adds its replacement.
- **Check open and recent PRs first** (`mcp__github__list_pull_requests`); an item with an open PR is in review. Prefer improving an open `ceo-finance/*` PR over starting a new one.
- **Files it may change:** `FinancePlan.md`, `src/features/finance/**`, `src/config/fixed-costs.ts`, `scripts/finance-report.mts`, `tests/finance/**`, and, for an approved vendor swap, the adapter for that slot in `src/features/providers/live/**` + `src/config/models.ts` + `.env.example` + tests. It leaves UI files (Design track), billing/webhook code and migrations alone; a migration is a proposal the owner applies.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test` pass in mock mode before every push.
- **Report honestly:** every number says where it came from (`api_cost_usd` is usage × catalog list price, **not an invoice**) and every price says when it was checked.
- **Notify only when it matters:** a margin gate failure, MRR down week over week, a vendor price change that moves cost by more than 10%, a saving found worth more than ~$50/month, a blocked data source, or an owner decision needed. Quiet runs stay quiet.

## 4. What we measure

| Number                                    | Source today                                                                   | Gap                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| MRR, ARR, subscribers by plan             | `subscriptions` table × `PLANS` (the report); Stripe connector for cross-check | Stripe is sandbox only until go-live                                                                                                          |
| Net revenue (subs + top-ups)              | report: list price after 20% VAT and Stripe fees                               | real Stripe fees, FX and refunds                                                                                                              |
| Cost per finished video, by tier          | `render_jobs.api_cost_usd` (usage × catalog price)                             | **not an invoice**: compare with provider dashboards (`--invoiced=`)                                                                          |
| Wasted spend (failed jobs)                | `api_cost_usd` of `failed` jobs                                                | none                                                                                                                                          |
| **Tokens / seconds / characters per job** | **not stored**                                                                 | Roadmap F2: a `usage jsonb` on `render_jobs` (LLM in/out/cached tokens, image MP, clip seconds, TTS characters) so cost per unit is auditable |
| Fixed monthly costs                       | `src/config/fixed-costs.ts`                                                    | ElevenLabs plan, domain, Sentry, Claude: the owner fills these                                                                                |
| CAC / ad spend                            | none                                                                           | no paid ads yet                                                                                                                               |

Run it: `npx tsx scripts/finance-report.mts` (`--json` for the digest, `--invoiced=<usd>` to compare with real invoices).
The pure math is `src/features/finance/unit-economics.ts` (tested in `tests/finance`).

## 5. Roadmap (top first; the master takes the highest item with no open PR)

- [x] **F0: finance report** (this PR): MRR/ARR, net revenue, cost per finished video by tier, waste, fixed costs, cash after costs, break-even subscribers, invoice gap.
- [ ] **F1: invoice reconciliation.** Owner sends the fal.ai, ElevenLabs, Anthropic, Vercel, Supabase totals for the last 30 days; the routine compares them with `api_cost_usd` and recalibrates `costUsdPerUnit` (TheMasterPlan §5 already asks for this; Premium is priced at $0.12/s while Kling 2.5 Turbo Pro lists ~$0.07/s).
- [ ] **F2: usage ledger.** Migration `0013_job_usage` (additive, owner-applied): `render_jobs.usage jsonb` filled by the orchestrator per step (tokens in/out/cached for the script, megapixels, clip seconds, TTS characters, provider id, model id). Then tokens-per-video vs dollars-per-video is exact.
- [ ] **F3: video model bake-off.** fal.ai is the Premium cost driver (a 30s Premium video is $1.92 at catalog price). Scout candidates per slot, check each official price page, then write a smoke script that renders the same 5s clip on each and prints cost, latency and a quality note. Owner runs it. Candidates to verify (none verified yet): other Kling hosts and direct APIs, Wan 2.x via cheaper inference hosts, LTX, Hailuo/MiniMax, Seedance, Veo Fast, and renting a GPU on demand (Modal, RunPod) for open weights.
- [ ] **F4: cheaper where quality allows.** Script LLM: a Haiku-class model, prompt caching and the Batch API for non-urgent work. Images: FLUX schnell is already ~$0.003; compare other hosts. Voice: compare ElevenLabs Flash against Cartesia, Deepgram, OpenAI TTS and self-hosted open models, with a listening test by the owner. Storage: Cloudflare R2 (no egress) behind `MediaStore` plus a retention policy that deletes old renders.
- [ ] **F5: revenue levers.** Annual plan (cash up front), top-up pack ladder, trial burn (currently ~$0.14 a signup), a "hero shot" Premium tier priced between Standard and full AI video, referral credits, win-back for lapsed subscribers.
- [ ] **F6: spend alarms.** A daily check (cron, no new vendor) that compares 24h API cost with 24h net revenue and logs `alert: finance_burn` past a threshold; the routine pushes a notification when it trips.

## 6. What the routine needs from the owner

Everything it needs is either already connected or a one-time answer. Please provide (reply in a PR comment or edit this file):

1. **Fixed costs:** the monthly price of the ElevenLabs plan, domain, Sentry, and what you want counted for Claude/routines (fills `src/config/fixed-costs.ts`).
2. **Invoices:** last 30 days of spend per provider (fal.ai, ElevenLabs, Anthropic) so F1 can calibrate. Until the routine has billing access, a monthly paste into §8 is enough.
3. **Stripe live:** when the live account is added to the Stripe connector, tell the routine; until then MRR is computed from the database and Stripe is a cross-check.
4. **Quality bar:** what is "good enough" for Standard stills and Premium motion, so the scout can reject cheap options that look bad.
5. **Risk appetite:** may a swap that saves more than X% ship behind a flag without a bake-off, or must the owner approve each swap?

### Connectors, tools and add-ons that would help (suggested, owner decides)

| Tool                                                                                                                                                                     | Why                                                                                                                                                           | Status                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase connector** (project `iqvrovjwoavvmhaithwn`)                                                                                                                  | read-only SQL for the ledger/jobs; `.mcp.json` already has it                                                                                                 | connected, but failed to connect from the cloud session on 2026-10-19 (`ERR_PROXY_TUNNEL`): retry or whitelist `mcp.supabase.com` in the environment's network policy |
| **Stripe connector**                                                                                                                                                     | MRR, churn, fees, refunds, Sigma queries                                                                                                                      | needs authorizing in claude.ai connector settings                                                                                                                     |
| **Vercel connector**                                                                                                                                                     | `list_billing_charges` and usage for hosting cost                                                                                                             | present                                                                                                                                                               |
| **GitHub connector**                                                                                                                                                     | PRs, CI, code search                                                                                                                                          | present                                                                                                                                                               |
| Provider billing exports (fal.ai usage CSV, ElevenLabs usage, Anthropic Console usage and cost API)                                                                      | the only way to reconcile `api_cost_usd` with invoices; an Anthropic Admin API key (read-only usage/cost reports) would let the routine pull LLM spend itself | owner to supply; never put keys in the repo                                                                                                                           |
| **Network policy**: allow-list the vendors' official pricing pages (fal.ai, replicate.com, elevenlabs.io, anthropic.com, runware.ai, wavespeed.ai, modal.com, runpod.io) | the earlier routine could only read search snippets that disagreed by up to 2x (TheMasterPlan §7)                                                             | owner: environment settings                                                                                                                                           |
| Optional: a spreadsheet or Notion page for monthly invoices; PostHog later for CAC/conversion                                                                            | closes the CAC gap once ads start                                                                                                                             | later                                                                                                                                                                 |

## 7. The routine (create it once)

Create a daily cloud routine at https://claude.ai/code/routines: name **"Shortcraft Finance CEO"**, repo
`TudorFnsn/Shortcraft`, model Opus 5.5, **12:00 UTC** daily (after the CEO at 06:00 and Design at 09:00, so it sees their merged work), connectors: GitHub, Supabase, Stripe, Vercel. Prompt:

```
You are the Finance CEO of Shortcraft, the master agent of a small team. Your job is cash return:
grow MRR and cut cost per finished video, without hurting quality or breaking the margin gate.

1. Read FinancePlan.md (charter, rules, roadmap), TheMasterPlan.md §7-§9, and `git log -20`.
   List open and recently closed PRs; an item with an open PR is in review, not available.
2. Measure: run `npx tsx scripts/finance-report.mts --json` (needs the Supabase connector or
   .env.local; if neither works, say so in the digest and use the connector's read-only SQL).
   Also run `npx tsx scripts/margin-report.mts` and `npx tsx scripts/metrics-report.mts --json` if you can.
3. Fan out in parallel with the Agent tool: Ledger analyst, Cost auditor, Vendor scout, Revenue
   analyst (roles and briefs in FinancePlan §2). Give each only the files and questions it needs, and
   tell each to cite sources and dates and to separate verified facts from guesses.
4. Rank findings by (monthly USD saved or earned) / (effort + risk). Pick ONE item with no open PR,
   usually the top unchecked roadmap item. Build it on a `ceo-finance/<slug>` branch with tests
   (Builder), have a Reviewer check the diff, run format:check, lint, typecheck, test, and open a PR.
   Never merge. Never make a paid provider call. Never write to Stripe or the database.
5. Update FinancePlan.md (roadmap, §8 log, new vendor prices with the URL and date checked) and add
   one line to TheMasterPlan.md §10.
6. Notify (PushNotification) only if: the margin gate fails, MRR fell week over week, a vendor price
   moved cost by >10%, you found a saving worth >$50/month, a data source is blocked, or the owner must
   decide something. Lead with the one number or decision that matters. If nothing qualifies, stay quiet.
7. Finish with a digest: MRR and trend, net revenue vs cost, cost per video by tier, top 3 findings
   with payback, what you built (PR link), what is waiting on the owner, next item.
```

Add the routine id to TheMasterPlan §9 and here once it exists.

## 8. Log (append newest on top)

- **2026-10-19** — Finance track created: charter, master-agent split, `scripts/finance-report.mts` + pure `computeFinance` (+5 tests), `config/fixed-costs.ts` with unknowns listed as gaps, vendor watchlist and roadmap F0–F6. No pricing, provider or migration change. Not yet measured against live data: the Supabase connector failed to connect from the cloud session (`ERR_PROXY_TUNNEL`) and Stripe needs authorizing. (Finance CEO, interactive)
