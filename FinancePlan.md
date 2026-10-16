# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine
> (`docs/routines/finance-cfo.md`). It sits under `TheMasterPlan.md`: the master plan
> wins on product and priority; this file wins on unit economics, vendor choice and
> pricing numbers. Every finance PR updates the ledger (§3) and changelog (§7) here.
>
> Last updated: 2026-10-16 (created; no measured data yet)

## 1. Charter (owner request 2026-10-16, do not change without Tudor)

- **Goal:** maximise profit and cash return. Watch MRR, cost per video, gross margin and burn; propose or implement changes that monetise better.
- **Mandate:** always check the MRR/margin ratio. Hunt for cheaper and better vendors than today's (fal.ai video looks expensive), new monetisation ideas, and fresh tech. Prioritise cash return over everything else.
- **Autonomy:** PR-gated, same as the other routines. Branches `ceo-finance/<slug>`. Never merge, never touch live secrets, never change live Stripe prices, never switch a live vendor. Read-only checks on Supabase/Stripe/Vercel are fine; any write needs the owner's explicit OK.
- **Scope of code:** `src/config/models.ts`, `src/config/plans.ts`, `src/features/billing/**`, `src/features/render/pricing.ts`, `src/features/providers/**` (adapters only behind the existing ports), `scripts/*report*`, tests, and the two plan files. UI copy about prices only with the Design CEO's files untouched while a `ceo-design/*` PR is open.
- **Cadence:** weekly cloud routine "Shortcraft Finance CFO" (Mondays 07:00 UTC, after the main CEO). Notify only when something needs the owner (margin gate fails, MRR drops, a vendor saving above 20% is ready, data access is broken).

## 2. Scoreboard (the CFO fills this in every run)

| Metric | Source | Latest | Target |
| --- | --- | --- | --- |
| MRR (EUR, net of VAT) | Stripe subscriptions (`stripe_analytics`/`stripe_api_read`) | _no data (sandbox only)_ | grows week over week |
| Paying subscribers, churn | Stripe + `scripts/metrics-report.mts` | _no data_ | churn < 8%/mo |
| API cost per finished video, by tier | `render_jobs.api_cost_usd` (Supabase read-only) | Std 15s $0.037, Premium 30s $1.92 (owner runs 2026-10-08, list-price based) | Std < $0.05, Premium < $1.00 |
| Credits charged vs cost, per tier | `render_jobs.charged_credits` / `api_cost_usd` | _no data_ | revenue/cost >= 3x on every plan (margin gate) |
| Revenue / worst-case cost (Pro) | `npx tsx scripts/margin-report.mts` | Pro 3.00x (zero headroom, 2026-10-05) | >= 3x with headroom |
| Fixed costs per month | Vercel, Supabase, ElevenLabs, Resend, Sentry, domain | see §4 | as low as the stage allows |
| Variable cost split | fal.ai, ElevenLabs, Anthropic, Stripe fees | see §4 | tracked monthly |
| Trial burn per signup | margin report | $0.14-0.25 | < $0.25 |
| Cash position / runway | owner supplies | _unknown_ | n/a |
| Blended gross margin | revenue minus (variable + fixed) | _no data_ | >= 70% |

## 3. Measured cost ledger (invoiced numbers beat catalog numbers)

Append one row per dashboard reading. The catalog in `src/config/models.ts` must end up matching this table.

| Date | Vendor | What | Invoiced amount | Units | Per-unit | Source |
| --- | --- | --- | --- | --- | --- | --- |
| _empty_ | | | | | | owner pastes dashboard totals, or a billing connector supplies them |

## 4. Cost map (what we pay for, from the repo; confirm amounts with the owner)

| Line | Type | Used for | Notes |
| --- | --- | --- | --- |
| fal.ai | variable | FLUX images (schnell/dev), Premium image-to-video (Kling 2.5 Turbo Pro default, ~$0.07/s list) | Biggest line on Premium. See §5. |
| ElevenLabs | variable + slot | voiceover (Flash v2.5), voice design, previews, saved-voice slots | Flat plan plus usage; slots cap sign-ups. |
| Anthropic | variable | script writer (Sonnet 5.5) | cents per video. Consider Haiku-class + caching. |
| Stripe | variable | 1.5% + EUR 0.25 assumed (EEA cards) in the margin gate | Confirm real rates, add Stripe Tax cost if enabled. |
| Vercel | fixed | hosting (Hobby) | Hobby is non-commercial; plan the upgrade into the budget. |
| Supabase | fixed | DB, auth, storage (free tier) | Pro needed for leaked-password protection, backups, storage egress. |
| Resend | fixed/free | lifecycle email (free 100/day) | |
| Sentry | free | errors | |
| Domain | fixed | not bought yet | |

## 5. Savings and revenue backlog (CFO ranks by cash return per hour of work)

Status values: `idea` (unverified), `researched`, `measured`, `PR open`, `shipped`, `rejected`. A price found by search is `researched`, never `measured`: the master plan already learned that snippets disagree by 2x.

### Cost side

1. **Premium video vendor shopping.** Compare per-second price, quality and latency of Kling 2.5/3 Turbo, Wan 2.5/2.6, Seedance, LTX-2, Hailuo/MiniMax, Veo 3.1 Fast, Runway, Luma, plus aggregators and cheaper hosts (Replicate, WaveSpeed, Novita, Together, Fireworks, DeepInfra, Runpod/Modal self-hosting open Wan/LTX weights). Swap is one env var (`FAL_VIDEO_MODEL`) or one adapter behind the existing port. Status: idea.
2. **Hero-shot Premium** (AI clip on the hook scene only, stills elsewhere): ~1/3 the cost; already previewable with the smoke script `--premium`. Needs the owner's Premium-shape decision. Status: idea.
3. **Image costs.** FLUX schnell at 1 MP is already cheap; check cheaper hosts and caching of repeated theme assets (reusable backgrounds, B-roll packs) to skip generation. Status: idea.
4. **Voice costs.** Compare ElevenLabs Flash against Cartesia, Deepgram Aura, OpenAI TTS, Google/Azure neural voices and open TTS (Kokoro, Chatterbox) for the Standard tier; keep ElevenLabs for Premium/voice design. Status: idea.
5. **Script costs.** Prompt caching on the system prompt and a Haiku-class model for short scripts. Measure tokens per script from `render_jobs`. Status: idea.
6. **Storage and egress.** Move media to Cloudflare R2 (zero egress) behind `MediaStore`, plus a retention policy (delete unwatched trial renders after N days). Status: idea.
7. **Failure and retry waste.** Failure rate times cost per failed step: refunded jobs still cost API money. Move moderation and cheap validation earlier. Status: idea.
8. **Trial burn.** 3,000 trial credits per signup; test lowering, or gating the trial behind email confirmation and a verified phone/Google account to stop farming. Status: idea.

### Revenue side

1. **Annual plans** (2 months free): cash up front, lower churn, lower Stripe fixed-fee share. Status: idea.
2. **Pricing page experiments:** anchor on Pro, change credit grants rather than prices, price per-video not per-credit in the UI. Status: idea.
3. **Overage/auto top-up** when credits run out mid-flow (highest-intent moment). Status: idea.
4. **Dunning and win-back:** Stripe Smart Retries, card-expiry emails, cancel-flow offer (pause instead of cancel). Status: idea.
5. **Affiliates** (30% recurring, master plan §6): model payback so commission never breaks the 3x gate. Status: idea.
6. **Add-ons that carry high margin:** extra voice slots, longer videos, brand kit, watermark-free exports on trial, team seats, API access. Status: idea.
7. **Regional pricing / VAT handling:** Stripe Tax vs manual; check the 20% VAT assumption per market. Status: idea.

## 6. Data access the CFO needs (owner checklist)

The routine runs in a cloud session. What it has and what is missing:

| Need | Via | State |
| --- | --- | --- |
| Repo read + PR | GitHub connector | have |
| MRR, subscriptions, churn, invoices, fees | **Stripe connector** (live account, read-only restricted key) | sandbox only today; owner adds the live account at go-live |
| Per-job cost and credits | **Supabase connector** (`render_jobs`, `credit_transactions`, `subscriptions`) | connector exists; it failed to connect from this cloud session on 2026-10-16 (ERR_PROXY_TUNNEL), retry; fallback: owner runs `scripts/metrics-report.mts` and pastes output |
| Vercel spend and usage | **Vercel connector** (`list_billing_charges`, usage) | connector present |
| fal.ai, ElevenLabs, Anthropic spend | none | owner pastes monthly totals into §3, or provides usage/billing read access; Anthropic Admin usage API and fal/ElevenLabs usage endpoints can be added behind a read-only key |
| Bank/cash/runway, tax, fixed costs | none | owner states them once in §2/§4 |
| Web research for vendor prices | WebSearch/WebFetch | have (provider pages may be blocked; flag snippets as `researched`) |

Suggested additions (propose, owner decides): a read-only billing export or Stripe Sigma saved queries, a cost-tracking table (`vendor_costs`: date, vendor, usd, units) fed by an owner script, PostHog for funnel conversion, a spreadsheet connector (Google Sheets) for the owner's cash ledger.

## 7. Changelog (newest on top)

- **2026-10-16** — Finance track created: charter, scoreboard, cost map, backlog and the routine prompt (`docs/routines/finance-cfo.md`) with its sub-agents (`.claude/agents/finance-*.md`). No numbers measured yet. (interactive)
