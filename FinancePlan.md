# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on cost, pricing experiments and vendor choices. Every finance PR updates
> this file (metrics table, backlog, changelog) in the same change.
>
> Last updated: 2026-10-18 (track created)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question     | Owner's answer                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal         | **Maximum profit, cash first.** Raise MRR and net revenue per subscriber, cut cost per finished video, and prefer changes that return cash soonest.                                        |
| First check  | Every run starts with **MRR and the revenue ÷ cost ratio** (`scripts/finance-report.mts`), compared with the last row of §3.                                                               |
| Scope        | Every payment in and out: Stripe revenue, VAT and fees, provider APIs (fal.ai, ElevenLabs, Anthropic), hosting (Vercel, Supabase), email, monitoring, domain, ad spend, affiliate payouts. |
| Vendors      | fal.ai looks expensive. The routine hunts cheaper or better models and hosts, and proves them on real calls before proposing a swap.                                                       |
| Tokens       | Track tokens and units per video (script tokens, images, video seconds, TTS characters) against what each video costs and what it earns.                                                   |
| Autonomy     | **Analyse freely, change through PRs.** Branches `ceo-finance/<slug>`; never merge. Pricing, plan limits, vendor swaps and anything that spends money need Tudor's explicit OK.            |
| Cadence      | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design CEO at 09:00).                                                                              |
| Master agent | The routine's first agent is a **DM** (master agent). It reads the state, splits the work across sub-agents in parallel, and merges their answers into one PR and one digest.              |

---

## 2. How the Finance CEO works

### 2.1 The DM master agent

The DM does no deep analysis itself. Each run it:

1. **Reads** `TheMasterPlan.md`, this file, `git log -20`, open and recently closed PRs (an item with an open PR is in review, not available), and `finance/costs.json`.
2. **Measures** by running `npx tsx scripts/finance-report.mts --json` (needs the read-only DB path, §5) and the margin gate `npx tsx scripts/margin-report.mts`.
3. **Splits** the work into the lanes below, spawns the sub-agents **in one parallel batch**, and gives each the numbers it needs and one question to answer.
4. **Decides** from their answers: one change per run, the one with the best cash return per hour of review. Prefers improving an open `ceo-finance/*` PR over starting a new one.
5. **Ships** the PR, updates §3 and §7 here, and sends the digest.

### 2.2 Lanes (sub-agents)

| Lane                | Question it answers                                                                                                                                                         | Reads                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Cash auditor**    | What came in and went out in the last 30 days, per vendor, and where do our metered numbers (`api_cost_usd`) disagree with the invoices?                                    | finance report, Stripe, Vercel billing, vendor usage exports        |
| **Unit economist**  | What does one finished video cost by tier and length, in units and tokens, and what does it earn? Which plan or pack has the thinnest margin at real usage, not worst case? | `render_jobs`, `scenes`, `config/models.ts`, margin gate            |
| **Vendor scout**    | Is there a cheaper or better model or host for any pipeline slot (§4)? What does it cost on a real 15s video, and what does quality look like?                              | web search, vendor pricing pages, smoke scripts                     |
| **Revenue analyst** | Which change raises net revenue per user: pricing, annual plans, top-up prompts, trial size, dunning, churn, discounts?                                                     | Stripe (MRR, churn, failed payments), `metrics-report`, plan config |
| **Builder**         | Implements the chosen change behind tests (adapter, config, script, UI copy) and runs the full bar (§6).                                                                    | repo                                                                |
| **Skeptic**         | Tries to break the proposal: hidden cost, quality drop, margin gate failure, refund exposure, VAT or legal impact. Nothing ships without its sign-off in the PR body.       | the diff and the numbers                                            |

Lanes that have nothing new say so in one line and the DM skips them. Cheap work (numbers, reading) runs on a small model; the DM, Vendor scout and Skeptic run on the strongest one.

---

## 3. Metrics (paste the newest report row on top each run)

| Date       | MRR (EUR) | Subs | Net rev 30d | API 30d | API / video | Fixed (known) | Profit 30d | Rev ÷ cost |
| ---------- | --------- | ---- | ----------- | ------- | ----------- | ------------- | ---------- | ---------- |
| 2026-10-18 | not run   | -    | -           | -       | -           | -             | -          | -          |

_Baseline note:_ the first run needs the read-only DB path (§5). The numbers above are filled by the routine, not estimated. Until then the only measured fact is the margin gate in `TheMasterPlan.md` §7 (research-based costs, Pro at exactly 3.0x).

---

## 4. What we know about the cost structure (from the code, 2026-10-18)

Per finished video, by tier (list prices in `src/config/models.ts`, **not yet measured**):

| Slot      | Standard ("animated stills")      | Premium ("AI video")                 | Provider today                            |
| --------- | --------------------------------- | ------------------------------------ | ----------------------------------------- |
| Script    | ~$0.04 (≈2k in / 1.5k out tokens) | same                                 | Anthropic, Sonnet 5.5 ($2 / $10 per MTok) |
| Images    | $0.003 each (FLUX schnell on fal) | $0.025 each (FLUX dev on fal)        | fal.ai                                    |
| Video     | **$0** (Ken Burns, in-house)      | **~$0.35 per 5s scene** (Kling 2.5)  | fal.ai (Premium only)                     |
| Voice     | ~$0.00075/s (ElevenLabs Flash)    | same                                 | ElevenLabs                                |
| Render    | ~$0.01 (ffmpeg on Vercel)         | same                                 | in-house                                  |
| **Total** | **~$0.07 for 15s**                | **~$1.10 for 15s**, ~$0.45 hero-shot | -                                         |

So the money is in two places: **Premium video clips** (about 90% of a Premium video's cost) and **fixed bills** that don't scale with usage. Standard is already cheap; fal.ai matters mostly for Premium clips and a little for images.

Data gaps the routine must close, in order (each is a small PR or an owner ask):

1. **Cost is one number per job.** `render_jobs.api_cost_usd` hides which slot spent it. Proposal: a `job_costs` table (job, step, vendor, model, units, tokens in/out, usd), written where the orchestrator already meters. Needs a migration (owner applies). Until it exists, per-slot cost comes from `scenes` counts × catalog prices, and is labelled an estimate.
2. **Tokens are metered for the script only** (`costUsdFor` in `anthropic-script.ts`). Store `input_tokens`, `output_tokens` and cache reads so prompt caching and a smaller model can be judged on real numbers.
3. **Vendor invoices aren't in the database.** The cash auditor reconciles `api_cost_usd` against fal.ai, ElevenLabs and Anthropic usage exports monthly; a gap over 10% means the catalog price is wrong and the margin gate must be re-run.
4. **No history of subscriptions, so no real churn or MRR trend.** Stripe is the source (`customer.subscription.*` events); until its connector is authorized, the report only knows "live today".

### Vendor hypotheses to price (unverified — the Vendor scout proves or kills each)

Premium video (the big lever):

- **Call the model maker directly instead of through fal.ai.** Resellers add margin; Kling, Seedance (BytePlus), MiniMax Hailuo and Alibaba Wan all sell their own APIs, often cheaper per second. fal's win is one key and fast queues; the adapter layer makes a swap one file.
- **Cheaper open models on pay-per-second GPU** (Wan 2.x, LTX-2, HunyuanVideo on Modal, RunPod serverless, or Replicate/WaveSpeed/Together): cost per clip can fall several times, at the price of cold starts and ops. Worth it only above a volume the report will show.
- **Hero-shot only:** AI video on scene 1, Ken Burns elsewhere (already costed at ~$0.45 per 15s). Cheapest fix and needs no new vendor.
- **Lower resolution / shorter clips, 480p draft then 720p on approval,** so users don't pay for rerolls of clips they discard.

Other slots:

- **Script:** Haiku 5.5 instead of Sonnet 5.5 for short scripts, prompt caching on the fixed system prompt, and batch for non-urgent work. Judge on an A/B of 20 scripts, not on price alone.
- **Voice:** ElevenLabs is the largest per-second voice cost. Candidates: Cartesia, Deepgram Aura, OpenAI TTS, or self-hosted Kokoro/Piper for the default voice with ElevenLabs reserved for designed voices. Also check whether the ElevenLabs plan's included credits beat pay-as-you-go at our volume.
- **Images:** FLUX schnell at $0.003 is already near the floor; test a self-hosted FLUX on the same GPU as video only if volume justifies it.
- **Hosting:** Vercel Hobby and Supabase free are $0 today. Find the usage at which the first paid tier is forced (function duration for ffmpeg, DB size, egress for video files) and price it into the plan before it surprises us. Consider Cloudflare R2 for MP4 storage and egress (no egress fees).

### Revenue levers to test (each needs Tudor's OK; the analyst sizes them first)

- **Annual plans** at ~2 months free: cash up front, lower churn. Stripe price + one pricing-page row.
- **Top-up prompt** when balance is below one video; top-ups carry 4.0–5.9x margin on the gate.
- **Trial size:** 3,000 credits cost ~$0.14 to give away on Standard. Test whether less or more changes trial → paid.
- **Failed-payment recovery:** Stripe smart retries and dunning emails (often 5–10% of MRR is lost to card failures).
- **Credit breakage:** unused monthly credits don't roll over; check what share expires, because that is pure margin and a churn risk if too tight.
- **Price of Standard credits:** Standard carries ~9x margin. Option C in the master plan §7 passes that on as more videos per plan, which may raise conversion. Model it before touching prices.
- **Affiliate payouts (30% recurring)** are a cost line: track them in the margin model before the program starts.

---

## 5. What the routine needs access to

| Need                                        | Status 2026-10-18                                                               | Action (owner)                                                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This repo (read, branch, PR)                | Granted: GitHub scope `tudorfnsn/shortcraft`.                                   | Attach the repo to the new routine.                                                                                                                                                                                                                   |
| **Stripe** (revenue, churn, payouts)        | Connector exists but **needs authorization** in the cloud session.              | claude.ai → Settings → Connectors → Stripe → connect. Test-mode today; when live mode opens, give the routine a **restricted read-only key** only.                                                                                                    |
| **Supabase** (jobs, costs, subs)            | Connector **failed to connect** (proxy tunnel error) in the 2026-10-18 session. | Re-authorize the Supabase connector; check the routine's environment network policy allows `mcp.supabase.com` and `*.supabase.co`. Read-only is enough.                                                                                               |
| **Vercel** (hosting spend and usage)        | Connector available (billing charges, usage, runtime errors).                   | Attach it to the routine. It reads `list_billing_charges` and contract commitments.                                                                                                                                                                   |
| Vendor spend: fal.ai, ElevenLabs, Anthropic | No read path.                                                                   | Add read-only usage keys as routine secrets: fal.ai usage/billing key, ElevenLabs API key with usage read, **Anthropic Admin API key** (usage + cost report). Never the production generation keys.                                                   |
| Vendor pricing pages                        | Blocked from the routine's network (master plan §7 note 3).                     | Allow-list `fal.ai`, `replicate.com`, `elevenlabs.io`, `anthropic.com`, `klingai.com`, `byteplus.com`, `modal.com`, `runpod.io`, `wavespeed.ai`, `cartesia.ai` in the environment's network policy, or choose "full" network access for this routine. |
| `finance/costs.json`                        | All values `null`.                                                              | Fill the monthly bills and 30-day ad spend. The routine asks again for every `null` in its digest.                                                                                                                                                    |
| Web search                                  | Available (`WebSearch`).                                                        | Use `extended` mode for price research.                                                                                                                                                                                                               |

### Connectors and tools that would help (recommendations)

- **PostHog** (or the Vercel Web Analytics already available): visitor → signup → paid funnel; needed once ads start so CAC is real.
- **Sentry connector:** failed renders cost money (a failed Premium job still burned its API spend); link error spikes to spend.
- **Resend connector:** lifecycle email conversion (reminders for unused credits are a retention lever).
- **A spreadsheet or Sigma-style read path in Stripe:** MRR movements (new, expansion, churn) without writing code. Stripe Sigma is mentioned in the master plan; the connector must be authorized first.
- **Claude skills worth installing for this routine:** `xlsx` (monthly cash model the owner can open), `dataviz` (MRR and cost charts in the digest), `deep-research` (vendor scouting with parallel sub-agents), `claude-api` (token and caching changes in `anthropic-script.ts`).
- **A shared "cost ledger" artifact** (Artifact with the database capability) once `job_costs` exists, so Tudor can see spend per vendor without opening the repo.

---

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md`, this file, `git log -20`, open and recent PRs. An item with an open PR is in review, not available.
- **Measure before proposing.** No vendor swap or price change is proposed from list prices alone. Run the smoke script on the candidate for a real 15s video and record cost, latency and a quality note (frame grabs or a short clip link).
- **One item per run:** the change with the best cash return per review hour. Prefer improving an open `ceo-finance/*` PR.
- **Files it may change:** this file, `finance/**`, `scripts/finance-report.mts`, `src/features/finance/**`, `tests/finance/**`, `src/config/models.ts` and `src/config/plans.ts` **only in a PR that Tudor has approved in this file's §7**, new provider adapters under `src/features/providers/live/` behind the registry (off by default), and the finance lines of `TheMasterPlan.md`. It never touches UI files (Design CEO), webhooks, auth, or migrations it hasn't written as a new numbered file for the owner to apply.
- **Never, without Tudor's explicit OK:** change a live price or plan limit, create or edit Stripe objects, switch live mode, add a paid vendor account, spend on ads, apply a migration, or put a production key in the repo or a PR. Read-only checks are always fine.
- **Guard the gate.** Any pricing or model change must keep `margin-report` passing at 3x on every product, or say plainly which product falls below and why that is acceptable.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Notify only when it matters:** a margin below 1x on any product, API cost per video up more than 25% week over week, MRR down more than 10%, a failed-payment spike, an unknown bill over $50, the routine unable to read a data source, or a PR waiting on Tudor. A healthy, unchanged run stays silent.
- **Digest:** MRR and ratio vs last run, the biggest cost line, the change made or proposed (with its cash effect per month), what is waiting on Tudor, and the next item.

### The routine prompt (paste into claude.ai/code/routines → New routine)

```
You are the DM (master agent) of the Shortcraft Finance CEO routine. Repo:
TudorFnsn/Shortcraft. Read FinancePlan.md in full first; it is your charter,
rules and backlog (§1, §2, §6). Then TheMasterPlan.md §7–§9 and open/recent PRs.

1. Measure: `npm ci`, then `npx tsx scripts/finance-report.mts --json` and
   `npx tsx scripts/margin-report.mts`. Add the Stripe, Vercel and Supabase
   connector data you can reach. Put the new row on top of FinancePlan.md §3.
   Check MRR and revenue ÷ cost against the previous row before anything else.
2. Split: spawn the lanes in FinancePlan.md §2.2 as parallel sub-agents, each
   with its numbers and one question. Skip lanes with nothing new.
3. Decide one change with the best cash return per review hour. Prove it on real
   calls or real data, never on list prices alone. Run the Skeptic on it.
4. Ship it as a PR on branch ceo-finance/<slug> (never merge), with tests, the
   full bar from §6, and FinancePlan.md §3/§7 plus the finance lines of
   TheMasterPlan.md updated. Never touch live prices, Stripe objects, secrets or
   migrations without Tudor's OK; propose instead.
5. Ask for anything you lack (data, keys, access, network allow-list, costs.json
   nulls) in the digest and in FinancePlan.md §5.
6. Notify (PushNotification, <routine_summary>) only for the conditions in §6.
   Otherwise end quietly.
```

Suggested settings: Opus 5.5 for the DM, daily 12:00 UTC, PR-gated, repo `TudorFnsn/Shortcraft`, connectors Stripe + Supabase + Vercel + GitHub, secrets for the read-only usage keys in §5.

---

## 7. Backlog and decisions (priority order)

- [ ] **F0 — Baseline.** Owner completes §5 (Stripe, Supabase, `finance/costs.json`); first run fills §3 with real numbers.
- [ ] **F1 — Measure per-slot cost and tokens.** `job_costs` migration (new numbered file, owner applies) + orchestrator metering; script tokens in/out/cache stored.
- [ ] **F2 — Premium video cost.** Price Kling direct, Seedance, Hailuo, Wan on Modal/Replicate against fal on the same 15s job; hero-shot as the default Premium shape if quality holds.
- [ ] **F3 — Reconcile invoices vs `api_cost_usd`** monthly; re-run the margin gate on measured costs (Pro sits at exactly 3.0x today).
- [ ] **F4 — Script model.** Haiku 5.5 + prompt caching A/B; keep the cheaper one if script quality is equal on 20 samples.
- [ ] **F5 — Voice cost.** Compare ElevenLabs vs Cartesia / OpenAI TTS / self-hosted for the default voice.
- [ ] **F6 — Revenue levers.** Annual plans, top-up prompt, dunning, trial size (sized by the analyst; each needs Tudor's OK).
- [ ] **F7 — Hosting thresholds.** Usage at which Vercel / Supabase paid tiers are forced; MP4 storage and egress on R2.

Decisions (append; owner decisions in bold):

- **2026-10-18 — Finance track created** (owner request): separate routine and plan file, DM master agent with parallel lanes, PR-gated, cash first. Profit is reported as unknown (never zero) while any bill in `finance/costs.json` is `null`.

---

## 8. Changelog (newest on top)

- **2026-10-18** — Track created: `FinancePlan.md` (charter, lanes, access list, routine prompt, backlog), `finance/costs.json` (owner-maintained bills, all unknown), `src/features/finance/unit-economics.ts` (pure MRR / net revenue / API cost per video / profit math) and `scripts/finance-report.mts` (read-only, `--json` for the digest). +7 tests. No migration, no new dependency, no runtime change. The cloud routine itself must be created by Tudor in claude.ai (prompt in §6); the session that wrote this had no tool to create one. (Finance setup, scheduled session)
