# FinancePlan — Shortcraft FinOps

> **Source of truth for the money track.** Owned by the **FinOps CEO** routine. It sits under
> `TheMasterPlan.md` (the master plan wins on product and priority; this file wins on cost,
> pricing and cash). Every FinOps PR updates this file (ledger + changelog) in the same change.
>
> Last updated: 2026-10-14

---

## 1. Charter (draft: owner to confirm the starred rows)

| Question       | Answer                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mission        | Maximise **cash return**: MRR up, cost per video down, payback short. Cash beats vanity.                                                                                       |
| Standing check | Every run reads **MRR, active subscribers, ARPU, churn, gross margin per video, API cost per 1k credits, fixed costs** and compares them with the last run's row in §3.        |
| Autonomy       | **PR-gated**, like the other routines: branches `ceo-finance/<slug>`, never merges, never touches live secrets, never changes live prices, Stripe objects or vendors. ★        |
| Allowed files  | `FinancePlan.md`, `scripts/finance-*`, `src/features/billing/margin.ts` + catalog costs/credit rates (via PR), `docs/finops/*`. Product/UI files stay with the other routines. |
| Cadence        | Daily cloud routine **"Shortcraft FinOps"**, 12:00 UTC (after CEO 06:00 and Design 09:00). ★                                                                                   |
| Hard floor     | Margin gate stays ≥ 3x on every plan and top-up (`margin.ts`). A cheaper vendor is only adopted if it still passes on **measured** cost.                                       |

---

## 2. Operating model: the DM master agent

The routine's main session is the **master (DM)**. It does no deep analysis itself: it reads §3, decides which questions are open, and fans out to sub-agents with the `Agent` tool (parallel, one message), each with a narrow brief and a required output shape. It merges their answers, picks **one** highest-cash-impact change, ships it as a PR, and sends the digest.

| Agent                | Job                                                                                                                                                                                                                     | Reads                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Revenue analyst**  | MRR (new / expansion / contraction / churned), ARPU, trial→paid, refunds, disputes, Stripe fees, net after VAT. Flags plans or top-ups that underperform.                                                               | Stripe connector (`stripe_analytics`, `stripe_api_read`)                             |
| **Cost analyst**     | API spend per video, per tier, per vendor, per step; tokens used vs dollars (Anthropic in/out tokens, ElevenLabs chars, fal.ai seconds/megapixels); failed-job waste; cost per 1k credits vs the plan's revenue per 1k. | `scripts/finance-report.mts`, Supabase `execute_sql` (read-only), vendor usage pages |
| **Infra analyst**    | Fixed + semi-fixed bills: Vercel, Supabase tier, Sentry, Resend, ElevenLabs plan/slots, domain. Right-sizing, free-tier headroom, what breaks at 10x users.                                                             | Vercel connector (`list_billing_charges`, usage), Supabase advisors                  |
| **Vendor scout**     | Finds cheaper or better model/vendor options per pipeline step and **prices them from primary sources** (WebFetch the vendor page, not aggregators; record URL + date). See §5 for the shortlist.                       | WebSearch / WebFetch                                                                 |
| **Pricing analyst**  | Plan/top-up price points, credit scale, annual plan, trial size, upgrade nudges, promo and win-back offers. Models each change on the margin gate and on the measured usage mix before proposing it.                    | `margin.ts`, §7 of the master plan, Revenue + Cost output                            |
| **Growth-ROI agent** | Cost to acquire vs first-month revenue for each channel in master plan §6; kills or scales. Only active once there is spend or traffic.                                                                                 | Stripe, Vercel analytics                                                             |
| **Implementer**      | Takes the DM's single chosen change and builds it on a `ceo-finance/<slug>` branch with tests, per repo rules (read `node_modules/next/dist/docs/` first; lint, typecheck, tests before pushing).                       | repo                                                                                 |
| **Skeptic**          | Reviews the DM's pick _without_ the DM's conclusion: tries to show the saving is smaller, the quality drop bigger, or the vendor claim unverified. A change ships only if it survives.                                  | the diff + sources                                                                   |

DM rules: run Revenue + Cost + Infra in parallel first (data), then Scout + Pricing (ideas, informed by the data), then one Skeptic pass, then one Implementer. Skip agents whose inputs are unavailable and say so in the digest instead of guessing.

---

## 3. Dashboard ledger (append one row per run, newest on top)

Numbers come from tools, never from memory. "n/a" means the source was unreachable; say which.

| Date       | MRR (€) | Subs | ARPU | Churn (30d) | Net rev 30d | API cost 30d | Fixed cost / mo | Cash margin | Avg cost / video | Notes                                                                                                         |
| ---------- | ------- | ---- | ---- | ----------- | ----------- | ------------ | --------------- | ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-10-14 | n/a     | n/a  | n/a  | n/a         | n/a         | n/a          | n/a             | n/a         | n/a              | Setup. Stripe is sandbox only (no live revenue yet); no metered cost trail beyond `render_jobs.api_cost_usd`. |

---

## 4. Data access (what exists, what is missing)

**Have:** GitHub repo; Stripe connector (sandbox account only, so MRR is a test number until live mode); Supabase connector (read-only SQL; it failed to connect from the cloud on 2026-10-14 `ERR_PROXY_TUNNEL`, so the first run must retry and fall back to `scripts/finance-report.mts` if a service key is in the environment); Vercel connector (billing charges, usage).

**Gaps the owner can close (ordered by value):**

1. **Per-call cost trail.** The DB stores one `api_cost_usd` per job. To answer "tokens vs dollars per step" we need `job_cost_lines (job_id, step, vendor, model, units, unit, usd)`, written by the orchestrator where it already calls `round4(job.apiCostUsd + costUsd)`. First FinOps PR. Additive migration; owner applies.
2. **Vendor invoices.** Anthropic, fal.ai, ElevenLabs, Supabase, Vercel, Resend have no connector. Until then the routine uses metered cost, and the owner pastes the monthly invoice totals into §3 "Fixed cost" and "API cost" so metered vs billed can be reconciled (a gap > 10% means unmetered spend).
3. **Live Stripe mode** (read-only restricted key) once the app takes real money.
4. **Analytics** (PostHog or Vercel Web Analytics) for visitor→signup→paid funnel and channel attribution.
5. **Banking or accounting** (Wise / Qonto / Xero export) for true cash position and runway, if the owner wants cash, not just margin.

**Suggested connectors / tools:** PostHog (funnel + experiments), Sentry (failed-job cost, already in app), a Google Sheets or Notion connector for the owner-editable cost sheet, ChartMogul or Baremetrics (if Stripe MRR cohorts get complex), Vantage / Helicone-style LLM gateway or Langfuse for token cost per call. Install nothing without the owner's yes.

---

## 5. Cost-down shortlist (hypotheses to verify on primary sources, not facts)

Current stack: Claude Sonnet 5.5 (script) · fal.ai FLUX schnell/dev (images) · fal.ai Kling 2.5 turbo (Premium clips) · ElevenLabs (voice) · in-house ffmpeg (render, ~$0.01) · Supabase · Vercel · Resend · Sentry.

| Step           | Idea                                                                                                                                                      | Why it might win                                             | Risk / test                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Premium video  | Hero-shot only (AI clip on scene 1, Ken Burns for the rest). Already in §7; ship first, it is a product change not a vendor change.                       | ~$0.45 vs ~$1.10 per 15s                                     | Quality perception; A/B on conversion                                   |
| Premium video  | Cheaper image-to-video: LTX-2 Fast, Wan 2.x, Seedance lite, Hailuo, via fal.ai or direct (Replicate, Novita, WaveSpeed, Runware).                         | Public list prices vary 2-5x per second of video             | Motion quality, 9:16 support, moderation; measure 20 real clips         |
| Images         | Cheaper image endpoints (Runware, Together FLUX, Replicate schnell), or fewer images per video (reuse + crop), or 1 image per 2 scenes.                   | Images are small per video but scale with volume             | Consistency across scenes                                               |
| Voice          | ElevenLabs Flash vs alternatives (Cartesia, Deepgram Aura, OpenAI TTS, Kokoro self-hosted). Cache narration of repeated text.                             | Voice is the largest _recurring_ per-minute cost on Standard | Voice quality is the product; blind test with the owner before any swap |
| Script LLM     | Prompt caching for the system prompt, shorter outputs, Haiku-class model for drafts, Sonnet for the final pass; Batch API for non-urgent jobs (-50%).     | Cheap, no vendor change, measurable in tokens                | Script quality; compare on 30 topics                                    |
| Hosting        | Vercel Hobby→Pro only when needed; Supabase free→Pro at the row/storage limit; media retention policy (delete MP4s after N days, keep thumbnails).        | Storage and egress grow with every video                     | Retention vs "Watch link doesn't die" promise                           |
| Revenue levers | Annual plan (cash up front, -churn), credit expiry/rollover policy, top-up nudge at 80% usage, trial → paid email, win-back email, price test on Starter. | Directly lifts MRR and cash, no vendor risk                  | Pricing changes need owner approval; ship behind a flag                 |

Every vendor claim in this table must be re-priced from the vendor's own page by the Vendor scout, with URL and date, before it enters a PR. Aggregator numbers disagreed by up to 2x last time (master plan §7).

---

## 6. Guardrails

- Never change a live price, create/modify Stripe live objects, switch a vendor in production, or touch secrets. Propose in a PR; the owner flips it.
- Read-only SQL only. Any write (migration, data) is a migration file in a PR, owner-applied.
- Don't skip the margin gate to look good. A vendor swap that lowers cost but fails quality gets a _recommendation_, not a merge.
- Check open and recently closed PRs before picking work (an open `ceo-finance/*` PR is in review, so improve it rather than start another). Leave `ceo-design/*` UI files alone.
- Be honest about thin data: with a handful of users, say "n=small" and don't extrapolate.
- Notify (PushNotification) only on: MRR drop > 10% week over week, margin below 3x on any product, API spend > expected by 25%, a vendor price change, a failing data source, or a finished PR needing review. Otherwise stay silent.

---

## 7. The routine prompt (paste into claude.ai/code/routines → New routine)

Name **Shortcraft FinOps**, repo `TudorFnsn/Shortcraft`, model Opus 5.5, schedule daily 12:00 UTC, connectors: GitHub, Stripe, Supabase, Vercel. Environment: allow web access (vendor pricing pages); add `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` only if the owner accepts a read key in the cloud env (otherwise rely on the Supabase connector).

```
You are the FinOps CEO of Shortcraft, run as a master (DM) agent. Goal: maximise cash return and
monetisation of the app: higher MRR, lower cost per video, faster payback.

1. Read FinancePlan.md, TheMasterPlan.md §7/§8/§9, and AGENTS.md. Read node_modules/next/dist/docs/
   before writing app code. List open + recently closed PRs (an open ceo-finance/* PR is in review:
   improve it, don't duplicate).
2. Fan out IN PARALLEL with the Agent tool (brief each in full, require structured output with
   numbers, sources, dates): Revenue analyst, Cost analyst, Infra analyst. Then Vendor scout and
   Pricing analyst, fed with that data. Roles and rules: FinancePlan.md §2.
3. Always compute and record MRR, subscribers, ARPU, churn, net revenue, API cost, fixed cost, cash
   margin, average cost per video, and tokens/units vs dollars per step. Add a row to §3. Compare
   with the previous row. Unreachable source => write n/a and name it; never invent numbers.
4. Pick ONE change with the best cash impact per unit of risk (new idea, cheaper vendor, pricing,
   cost trail, retention policy). Have the Skeptic try to break it. If it survives, the Implementer
   builds it on ceo-finance/<slug> with tests; run format:check, lint, typecheck, test before pushing;
   open a PR (template if present), update FinancePlan.md ledger + changelog and TheMasterPlan.md
   changelog. Never merge, never touch live secrets, prices, Stripe live objects or vendors.
5. Ask the owner (in the digest) for any data or access you lack, and suggest connectors/tools that
   would sharpen the next run (FinancePlan.md §4).
6. Notify with PushNotification only for the triggers in FinancePlan.md §6, using <routine_summary>.
   A quiet healthy run sends nothing.
```

---

## 8. Open questions for the owner

1. Confirm ★ rows in §1 (autonomy, cadence).
2. Which real-money plan: when does Stripe go live, and is there any paid traffic yet?
3. Monthly fixed bills today (Vercel, Supabase, ElevenLabs, Sentry, Resend, domain) and the ElevenLabs plan tier. Paste into §3 or a sheet.
4. Is there a monthly budget cap or target margin beyond the 3x floor? Target payback for a paid customer?
5. May the cloud environment hold a read-only Supabase key, and a restricted read-only live Stripe key later?
6. Quality red lines: is any downgrade acceptable in voice, image or clip quality for cost?

---

## 9. Changelog

- **2026-10-14** — Track created: charter, agent roster, ledger, data gaps, cost-down shortlist, routine prompt, `scripts/finance-report.mts` (read-only API-cost report by tier and week). Routine itself still has to be created at claude.ai/code/routines by the owner (the cloud session can't create routines).
