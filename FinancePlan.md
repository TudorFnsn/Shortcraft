# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing levers, vendor choice and cash. Every finance PR updates
> this file (§4 baseline, §5 backlog, §7 changelog) in the same change.
>
> Last updated: 2026-10-20 (routine created; no live numbers read yet)

---

## 1. Charter

**Goal: maximise cash return.** Grow net MRR, keep gross margin high, and cut every
avoidable dollar of spend, without hurting the north star (weekly paying-retained
creators, `TheMasterPlan.md` §1).

| Question  | Answer                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merges; never touches live secrets; no Stripe/Supabase/Vercel **writes** (read-only checks are fine).                 |
| Cadence   | Daily cloud routine, **07:30 UTC** (after the main CEO at 06:00, before Design at 09:00).                                                                                                         |
| Always    | Check MRR and the margin first (`scripts/finance-report.mts`, `scripts/margin-report.mts`), then pick the one change with the best cash return per hour of work.                                  |
| Guardrail | The 3x margin gate (`features/billing/margin.ts`) stays. A cheaper provider may raise margin; a change that lowers quality, safety or reliability needs a measured comparison and the owner's OK. |
| Money     | Prefer prices **measured from invoices** over list prices. Label every number `measured`, `list` or `guess`.                                                                                      |

---

## 2. Operating model: one master, specialist sub-agents

The routine is the **master agent** (DM). It does not do the deep work itself. Each
run it reads the state, picks 2–4 lanes that matter today, and spawns those
sub-agents **in parallel** (Agent tool), each with a narrow brief, the files to read
and what to return. The master merges results, ranks them by cash impact, ships at
most **one** PR, updates this file and sends the digest.

| Lane (sub-agent)           | Looks at                                                                                                         | Returns                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Revenue / MRR**          | `finance-report`, Stripe (read-only connector), `metrics-report`: MRR, ARPU, churn, trial→paid, top-up mix       | MRR delta, the biggest leak or lever                                          |
| **Unit economics**         | `render_jobs.api_cost_usd` vs credits charged, by tier; wasted spend on failed jobs; trial burn; `margin-report` | real cost per video and per 1k credits; a catalog repricing if the gate moved |
| **Vendor scout**           | Web research: video, image, TTS and LLM alternatives; new models; batch/caching/volume discounts                 | ranked list: price, quality, risk, switch effort (an adapter row)             |
| **Infra & fixed costs**    | Vercel, Supabase, storage/egress, Sentry, Resend; Vercel MCP billing tools; `config/fixed-costs.ts`              | what to downgrade, cap or move; plan-tier triggers                            |
| **Pricing & monetization** | `config/plans.ts`, `/pricing`, conversion data; annual plans, top-up packs, upsell hooks, free-trial burn        | one pricing/packaging experiment with expected € impact                       |
| **Cost engineering**       | Code: token use in `anthropic-script.ts`, retries, clip lengths, image sizes, caching, wasted renders            | a code change that lowers cost per video, with a test                         |
| **Risk & compliance**      | Provider ToS, VAT/Stripe Tax, Vercel Hobby terms, refund exposure                                                | blockers that would cost money later                                          |

Skip lanes with nothing new. The vendor scout runs at most weekly.

### Routine prompt (paste into the routine; keep it in sync with this file)

> You are the Shortcraft **Finance CFO** master agent. Read `FinancePlan.md` (this
> file), then `TheMasterPlan.md` §5/§7, `git log -20` and open + recently closed PRs
> (an item with an open PR is in review: improve that PR instead of starting a
> duplicate). Run `npx tsx scripts/finance-report.mts --json` and
> `npx tsx scripts/margin-report.mts` when the database/env is reachable; otherwise
> read-only via the Supabase and Stripe connectors; otherwise say what is missing
> and notify. Lead with MRR and margin. Then spawn the 2–4 sub-agent lanes from §2
> that matter today, in parallel, each with a narrow brief. Rank findings by cash
> impact. Ship at most one PR on `ceo-finance/<slug>` that passes
> `format:check → lint → typecheck → test → next build` in mock mode; update §4–§7
> here. Never merge, never touch live secrets, no Stripe/Supabase/Vercel writes.
> Send a PushNotification only when something needs the owner: MRR down, margin gate
> failing, a spend spike, an exposure, a PR to review, or a missing input (§6).
> Stay silent on a quiet day.

---

## 3. Tools and connectors

Have now: GitHub, Supabase (project `iqvrovjwoavvmhaithwn`), Vercel (billing, runtime
logs), Stripe (needs re-authorising: it showed "requires authentication" this run),
web search. **The Supabase MCP failed to connect this run (`ERR_PROXY_TUNNEL`), so
the first run had no database access.** Fix: set up the routine environment so the
sandbox can reach `*.supabase.co`, or give it a read-only DB role (below).

Worth adding (ranked by value to this job):

1. **Read-only Postgres role + `.env` for the routine.** Create a `finance_ro` role with `select` on `render_jobs`, `subscriptions`, `credit_transactions` only, put its URL in the routine environment. No service-role key in a routine.
2. **Stripe, re-authorised** (restricted, read-only) for MRR, churn, refunds, disputes, fees, payouts (Sigma if enabled).
3. **Provider usage/billing APIs as read-only keys:** fal.ai usage, ElevenLabs subscription/usage, Anthropic Usage & Cost API (admin key). They turn `list` prices into `measured` and close the open invoice request in `TheMasterPlan.md` §5.
4. **Vercel billing** (already in the Vercel MCP: `list_billing_charges`, `list_contract_commitments`).
5. **PostHog or Plausible** (planned): visitor → signup → paid funnel for the CAC side.
6. **Slack or email** for the digest (PushNotification already reaches the phone).
7. **Claude tools worth using:** the Agent tool for lanes, WebSearch `extended` for vendor scouting, the `dataviz` skill for a monthly cash chart, a published Artifact as a live finance dashboard once there is data.

---

## 4. Baseline (what we know, with its label)

| Item                   | Value                                                                        | Label                                     |
| ---------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| Plans (EUR/mo)         | Starter 14.99 / Pro 29.99 / Ultra 79.99                                      | catalog                                   |
| Net revenue per plan   | after 20% VAT and Stripe (1.5% + €0.25), at 1.08 USD/EUR (`margin.ts`)       | assumption                                |
| Margin gate            | Starter 9.4x, Pro 3.0x, Ultra 3.2x, top-ups 4.0–5.9x                         | list prices                               |
| Standard video         | 15s ≈ $0.04, 30s ≈ $0.05 API cost; 44–52s                                    | **measured** (3 real renders, 2026-10-08) |
| Premium video          | 30s / 5 scenes = $1.92 booked at $0.12/s; Kling 2.5 Turbo Pro lists ~$0.07/s | measured × list                           |
| MRR, paying subs, ARPU | **unknown**: first run had no database access                                | missing                                   |
| Fixed costs            | all `null` in `config/fixed-costs.ts`                                        | missing                                   |
| Provider invoices      | not yet compared with `api_cost_usd`                                         | missing                                   |

---

## 5. Findings and backlog (ranked by cash impact)

Prices below are from web search snippets, 2026-10-20 (vendor blogs and aggregators
disagree; each is `list`). Re-check on the vendor's own page before switching.

1. **🚨 Vercel Hobby forbids commercial use.** Vercel's fair-use terms say any deployment that takes payments needs Pro (≈$20/month per seat). The app is live on Hobby with Stripe checkout; going live with real euros on Hobby risks suspension. Budget it as the first fixed cost; decide with the owner before Stripe goes live. (Source: vercel.com/docs/limits/fair-use-guidelines.)
2. **Premium AI video is the whole cost line** (>95% of a Premium video). Candidates to price-compare on real clips, all image-to-video, per second: Kling 2.5 Turbo Pro on fal ≈ $0.07 (current); Seedance 2.0 Mini ≈ $0.045 and Seedance 2.0 ≈ $0.07–0.09 on Runware / Atlas Cloud; Wan 3.0 (Alibaba Cloud) ≈ $0.08; LTX-2 on fal ≈ $0.0018/MP (cheapest, lower quality); Veo 3.1 Fast ≈ $0.10. Action: add a `FAL_VIDEO_MODEL`-style switch for a second host (Runware or Atlas Cloud) behind the same adapter, run the same 3 scenes through each, compare look and cost. Even at fal prices, the **hero-shot tier** (AI on scene 1 only, ~$0.45 vs ~$1.10 per 15s video) is the biggest lever and needs no new vendor.
3. **Bill by billed second, not scene second.** Kling bills fixed 5s clips; the catalog uses a conservative $0.12/s. Measuring will probably lower booked cost (more headroom on Pro) and shows whether short scenes should be merged to 5s.
4. **TTS:** ElevenLabs Flash ≈ $0.04–0.05 per 1k characters. A 15s video is ~225 characters ≈ $0.01, so voice is not the cost problem today. Revisit (Google/Polly standard ≈ $4 per 1M chars; OpenAI tts-1 $15; Kokoro self-hosted ≈ $0.7 per 1M) only if voice becomes more than ~10% of a Standard video. Quality drop is the risk. ElevenLabs **plan** (custom-voice slots) is a fixed cost to check.
5. **LLM script cost** (Sonnet 5.5, ≈ $0.04 per script): use prompt caching for the fixed system prompt, and try a Haiku-class model for the first draft with a measured quality check. Small, but free to test.
6. **Storage/egress:** Supabase Storage vs Cloudflare R2 (R2 has no egress fees, ≈ $0.015/GB-month). Videos are watched and downloaded; revisit when stored GB or egress approaches the free tier. Already on the roadmap.
7. **Waste:** `finance-report` shows API spend on failed jobs and by non-paying users. Both are pure loss: cap trial burn (already $0.14–0.25), retry-once policies, fail-fast moderation before any paid call.
8. **Revenue levers to test once MRR exists** (one at a time): annual plan (2 months free), a cheaper entry pack for the trial → paid step, top-up nudge at low balance, price test on Starter (9.4x margin leaves room to cut price or give more videos), affiliate commission budget (30% recurring in the launch plan is real cost: model it in the gate).
9. **Stripe fees:** 1.5% + €0.25 EU cards is hurting small tickets (€0.25 on €12 = 2%); prefer fewer, larger charges (annual plan, bigger top-ups). Add Stripe Tax decision cost.

---

## 6. Inputs needed from the owner

1. Authorise the **Stripe** connector (read-only is enough) and fix **Supabase** access for the routine (proxy blocked `mcp.supabase.com` this run), or create a `finance_ro` Postgres role.
2. Fill `src/config/fixed-costs.ts` from the real invoices (Vercel, Supabase, ElevenLabs plan, domain, Sentry, Resend, Claude plan).
3. Send monthly spend from the fal.ai, ElevenLabs and Anthropic dashboards (or give read-only usage keys).
4. Decide the Vercel Pro question (§5.1).
5. Create the routine in claude.ai (§8): the repo cannot create it.

---

## 7. Changelog

- **2026-10-20** — Track created. `FinancePlan.md`, `scripts/finance-report.mts` (MRR net of VAT + fees, revenue vs API spend, gross margin, cost per video and per 1k credits by tier, wasted and free-user spend, break-even subscribers), `features/finance/unit-economics.ts` (pure, tested), `config/fixed-costs.ts`. +4 tests (524). First vendor scan and the Vercel Hobby finding in §5. No live numbers read: database not reachable from the cloud sandbox. (Finance CFO, setup)

---

## 8. Setup of the routine

The cloud routine itself lives in claude.ai, not in the repo (like the CEO and Design routines). Create it at https://claude.ai/code/routines: name **"Shortcraft Finance CFO"**, repo `TudorFnsn/Shortcraft`, model Opus, daily **07:30 UTC**, PR-gated, prompt = the block in §2, connectors GitHub + Supabase + Stripe + Vercel, environment allowing `*.supabase.co`, `api.stripe.com`, `fal.ai` docs and the web. Then record its id in `TheMasterPlan.md` §9 next to the other two.
