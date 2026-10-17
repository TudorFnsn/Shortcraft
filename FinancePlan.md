# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (`.claude/routines/finance-ceo.md`). `TheMasterPlan.md` wins on product and priority;
> this file wins on money: cost of goods, pricing, MRR health. Every finance PR updates
> §3 (numbers), §5 (levers) and the changelog.
>
> Last updated: 2026-10-17 (routine created, baseline from code; no live data read yet)

## 1. Charter

Maximise cash return: **MRR up, API + infra cost per revenue euro down, payback short.**
Floor: the 3× margin gate (`scripts/margin-report.mts`) never relaxes. Branches `ceo-finance/<slug>`,
PR-gated, never merge. Prices, provider switches and anything that moves money need the owner.

## 2. Baseline (from the catalog and margin report, 2026-10-17, list prices, not measured)

Assumptions: VAT 20%, Stripe 1.5% + €0.25, 1 EUR = 1.08 USD.

| Product              | Credits | Net revenue              | Worst-case API cost    | Multiple           |
| -------------------- | ------- | ------------------------ | ---------------------- | ------------------ |
| Starter €14.99       | 30,000  | $12.98                   | $2.31                  | 5.62×              |
| Pro €29.99           | 100,000 | $26.24                   | $8.73                  | **3.00×**          |
| Ultra €79.99         | 250,000 | $70.43                   | $21.83                 | 3.23×              |
| Top-ups 20K/60K/150K |         | $10.34 / $25.36 / $51.87 | $1.75 / $5.24 / $13.10 | 5.9× / 4.8× / 4.0× |

Trial burn: $0.23 per signup.

**What the numbers say**

- A 30s **Standard** video (animated stills) costs about **$0.07** (script $0.04, 5 images $0.015, voice
  ~$0.01, render $0.01) and burns ~3,240 credits. Standard is where the volume and the margin are; Starter
  could make ~9 videos for ~$0.65 of cost. Script (Claude Sonnet) is ~60% of Standard COGS: the biggest cost
  line there. Candidates: prompt caching, a Haiku-class model with a quality check.
- A 30s **Premium** (AI video) costs up to **$3.60** at the catalog's $0.12/s bound; Pro only just clears 3.00×
  because premium is priced at the minimum credits that pass the gate. This is the only place fal.ai matters,
  and it is where the margin is thin. If real cost is nearer $0.07/s (Kling 2.5 Turbo Pro list), margin is
  ~1.7× better than the gate assumes; **measure before changing anything** (§4).
- Images (fal FLUX schnell, $0.003) and voice (ElevenLabs Flash) are already cheap; savings there are cents.
- Fixed costs (Vercel, Supabase, Sentry, Resend, domain) are unknown: not readable from the repo (§6).
- Tokens per video are **not stored** (only `api_cost_usd`, which the script step already derives from token
  usage). To audit tokens per video, add input/output token columns to `render_jobs` (lever L1).

## 3. Live numbers (updated every run)

| Date | MRR (net €)  | Subs | Net new MRR | Churn | API cost ÷ revenue | Gross margin | Cost/video std | Cost/video prem | Failed-job spend |
| ---- | ------------ | ---- | ----------- | ----- | ------------------ | ------------ | -------------- | --------------- | ---------------- |
| —    | not read yet | —    | —           | —     | —                  | —            | —              | —               | —                |

Read with `npx tsx scripts/unit-economics-report.mts` and `scripts/metrics-report.mts` (need
`SUPABASE_SERVICE_ROLE_KEY`), plus Stripe for fees, refunds, churn and disputes.

## 4. Provider price research (2026-10-17, secondary sources: verify on the vendor page before acting)

| Slot                   | Today                                                            | Candidates seen                                                                                                                                                                                                          | Note                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Premium image-to-video | fal Kling 2.5 Turbo Pro, ~$0.07/s billed (catalog bound $0.12/s) | fal Kling 3.0 Pro from $0.112/s; one comparison lists Kling 3.0 at ~$0.029/s 720p and Seedance 2.0 Fast ~$0.022/s; Atlas Cloud (reseller) Seedance 2.0 ~$0.09/s; Hailuo 02 listed $0.017–0.045/s; Replicate $0.07–0.25/s | Sources disagree by 3–5×; resolution, audio and min clip length differ. Run a priced bake-off on the same 5 prompts at 720p before deciding. Replicate looks dearer than fal, not cheaper. |
| TTS                    | ElevenLabs Flash v2.5, ~$0.05/1k chars                           | Google/Polly standard ~$4/1M chars, Deepgram Aura-1 $15/1M, Cartesia ~$5–37/1M, self-hosted Kokoro <$1/1M                                                                                                                | Voice is ~$0.01 per video, so even a 10× saving is cents. Not worth quality risk; revisit at scale.                                                                                        |
| Script LLM             | Claude Sonnet 5.5, $0.04/video                                   | Haiku 5.5 with the same schema; prompt caching of the system prompt                                                                                                                                                      | Largest Standard COGS line. Needs a quality A/B before switching.                                                                                                                          |
| Stripe                 | 1.5% + €0.25 EU card (assumed)                                   | Local methods (SEPA/iDEAL/Bancontact) are cheaper than cards; annual plans cut the fixed €0.25                                                                                                                           | The fixed fee is 1.7% of a €14.99 charge: annual and larger top-ups help.                                                                                                                  |

## 5. Levers (ranked by expected cash return; estimates are placeholders until §3 has real volume)

| #   | Lever                                                                                                                                | Type    | Needs                     | Status            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------- | ----------------- |
| L1  | Store token counts and per-step cost on each render (new columns + logging) so tokens vs spend is auditable                          | Measure | migration                 | proposed          |
| L2  | Measure real premium-video cost per billed second from fal's usage export; set `costUsdPerUnit` from it                              | Measure | fal usage access          | blocked on access |
| L3  | Premium video bake-off (Kling 2.5 vs 3.0, Seedance 2.0 Fast, Hailuo, Wan) behind `FAL_VIDEO_MODEL`/new adapter; owner judges samples | Cost    | owner sample review       | proposed          |
| L4  | Prompt-cache the script system prompt; test Haiku-class for the script step                                                          | Cost    | quality A/B               | proposed          |
| L5  | Annual plans (e.g. 2 months free): cash up front, lower churn, fewer fixed fees                                                      | Revenue | owner (new Stripe prices) | proposed          |
| L6  | Cap regenerations / retries and meter failed-job spend; refund policy check                                                          | Cost    | data                      | proposed          |
| L7  | Storage retention: expire old intermediate assets (images, clips) after the final MP4 is made                                        | Cost    | Supabase storage numbers  | proposed          |
| L8  | Trial tuning: trial burn is $0.23/signup; test fewer credits or a watermark-only trial against activation                            | Revenue | owner, data               | proposed          |
| L9  | Upgrade prompts at the credit-exhaustion moment (top-up vs upgrade), dunning emails via Resend                                       | Revenue | data                      | proposed          |

## 6. Access and tooling (what this routine needs, who does it)

| Need                    | Why                                                          | Status                                            | Action                                                                                                          |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GitHub repo             | PRs, plan updates                                            | ok                                                | none                                                                                                            |
| Supabase DB (read-only) | MRR, cost per video, failures                                | **MCP failed to connect (proxy tunnel)** this run | Re-add the MCP with a read-only role or put a read-only `SUPABASE_*` key in the routine's environment variables |
| Stripe connector        | real MRR, churn, fees, refunds, disputes                     | **needs authorising**                             | claude.ai → Settings → Connectors → Stripe (restricted/read-only key is enough)                                 |
| Vercel connector        | billing, usage, function time                                | connecting                                        | authorise; confirm `list_billing_charges` works                                                                 |
| fal.ai usage/billing    | measured $/second per model                                  | missing                                           | add a read-only/admin key or a monthly CSV export to the routine environment                                    |
| Anthropic usage         | tokens and $ per workspace (`ANTHROPIC_WORKSPACE_ID` exists) | missing                                           | Admin API key (read-only usage + cost report)                                                                   |
| ElevenLabs usage        | characters per month                                         | missing                                           | API key with usage read                                                                                         |
| Sentry, Resend          | fixed cost and email volume                                  | missing                                           | read-only tokens                                                                                                |
| Environment             | tsx scripts need `.env.local`                                | n/a in cloud                                      | set the vars above as routine environment variables, never in the repo                                          |
| Network policy          | pricing pages, vendor docs                                   | check                                             | the routine environment must allow outbound HTTPS to vendor sites                                               |

Suggested add-ons: the Stripe MCP (MRR, subscriptions, disputes), a Google Sheet or Notion connector only if the
owner wants a human-readable P&L; `anthropic-skills:xlsx` for a monthly P&L export; no extra tools are required
beyond the above.

## 7. Open questions for the owner

1. Is there live revenue yet? (The north-star report says "once there are paying users".)
2. Monthly fixed costs you already pay (Vercel plan, Supabase plan, Sentry, Resend, domain, other SaaS)?
3. Any cash targets (MRR goal, runway, max burn per signup)?
4. Are you OK with the routine opening PRs that change `costUsdPerUnit` to measured values? Price changes will always be asked first.

## Changelog

- 2026-10-17: routine, charter, baseline, `scripts/unit-economics-report.mts` (+ pure `features/metrics/unit-economics.ts`, tested).
