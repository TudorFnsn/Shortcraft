# FinancePlan — Shortcraft CFO ledger

> Owned by the **CFO routine** (`docs/routines/cfo-routine.md`). Money only: MRR, margins, vendor
> costs, pricing experiments. Product and engineering priorities stay in `TheMasterPlan.md`.
> Last updated: 2026-10-15 (set-up run: no live data yet, see §5)

## 1. KPIs (fill from `scripts/unit-economics-report.mts`, `scripts/metrics-report.mts`, Stripe)

| KPI                              | Now      | Target   | Source             |
| -------------------------------- | -------- | -------- | ------------------ |
| MRR (EUR)                        | _unread_ | growing  | Stripe             |
| Net new MRR (new+expansion−churn) | _unread_ | > 0      | Stripe             |
| Paying subscribers / ARPU        | _unread_ |          | Stripe + Supabase  |
| Gross margin per finished video  | _unread_ | >= 3x    | unit-economics     |
| API cost per 1k credits (USD)    | _unread_ | measured | unit-economics     |
| Failed-job spend (USD / period)  | _unread_ | ~0       | unit-economics     |
| Trial burn per signup (USD)      | $0.14–0.25 modeled | measured | margin-report |
| Fixed costs per month            | _owner_  |          | §3                 |
| Cash in − cash out               | _unread_ | > 0      | Stripe − §3 − API  |

## 2. Modeled cost per video (from `src/config/models.ts`, list prices, unmeasured)

Standard (Ken Burns stills): ~$0.07 for 15s (script $0.04, images, voice, in-house ffmpeg). Premium
(fal image-to-video, Kling 2.5 Turbo Pro): ~$0.07/billed second, ~$1.10 per 15s; the gate assumes
$0.12/s. **Premium video is >90% of variable cost per premium video.** That is where vendor savings pay.

## 3. Fixed and variable cost register (owner to fill; the routine cannot see invoices)

| Line            | Plan / basis       | USD or EUR per month | Notes |
| --------------- | ------------------ | -------------------- | ----- |
| Vercel          | _owner_            |                      | also readable via Vercel connector |
| Supabase        | _owner_            |                      | |
| ElevenLabs      | _owner_            |                      | custom-voice slots, see Master Plan §8 |
| Anthropic       | pay-as-you-go      |                      | script model, check Console usage |
| fal.ai          | pay-as-you-go      |                      | premium clips + images |
| Resend          | _owner_            |                      | lifecycle email |
| Stripe fees     | % + fixed          | from Stripe          | modeled in margin.ts |
| Domain / other  | _owner_            |                      | |

## 4. Vendor scouting (search snippets, 2026-10-15; vendor-influenced, verify before switching)

| Slot            | Today                          | Candidates to bake off                                                                 | Rough saving |
| --------------- | ------------------------------ | -------------------------------------------------------------------------------------- | ------------ |
| Image-to-video  | fal Kling 2.5 Turbo ~$0.07/s   | Wan 2.2 Turbo ~$0.02/s; Seedance 2.0 Fast ~$0.09/s (reseller claims as low as $0.022); Kling v3 Pro listed $0.095/s (Atlas) vs $0.168/s (fal) | up to ~70% if quality holds |
| Hosts           | fal.ai                         | Atlas Cloud, Replicate, Runware, WaveSpeed (same models, different rates; none priced here yet) | 10–50%, unverified |
| TTS             | ElevenLabs Flash ~$0.05/1k chars | Google Cloud TTS Standard/WaveNet ~$4/1M chars, Chirp 3 HD ~$30/1M; Deepgram Aura-1 ~$15/1M; Cartesia ~$5–37/1M | TTS is ~1% of cost; **not worth it**, keep ElevenLabs for voice quality + Voice Studio |
| Script LLM      | Sonnet 5.5 ~$0.04/script       | Haiku 5.5 for the first draft + Sonnet for polish; prompt caching on the system prompt     | small ($0.04 → ~$0.01) |
| Images          | FLUX schnell $0.003            | already near floor                                                                       | none |

Takeaway: only image-to-video moves the needle. Plan: add a second video adapter behind the registry
(e.g. Wan 2.2 Turbo and Seedance 2.0 Fast via the cheapest host), run `scripts/live-providers-smoke.mts --premium`
on 5 real prompts per candidate, record measured $/clip and a human quality score in this file, then
switch `FAL_VIDEO_MODEL` or the default only if quality is equal and the margin gate improves.
Also cheaper without any vendor change: hero-shot premium (AI clip on scene 1 only, ~$0.45/15s).

Sources: [Atlas Cloud price comparison](https://www.atlascloud.ai/blog/cheapest-ai-video-generation-api-2026) ·
[fal.ai image-to-video guide](https://fal.ai/learn/tools/best-image-to-video-apis-2026) ·
[Techsy providers](https://techsy.io/en/blog/best-ai-video-providers) ·
[TTS pricing (tokencost)](https://tokencost.app/blog/tts-api-pricing-2026) ·
[camb.ai TTS](https://www.camb.ai/blog-post/cheapest-real-time-tts-apis).
Fal and Atlas sell these APIs; their tables are not neutral.

## 5. Access the CFO needs (owner action list)

| Need | Why | Status 2026-10-15 |
| ---- | --- | ----------------- |
| GitHub repo access | read code, open PRs | works (session scoped to `tudorfnsn/shortcraft`) |
| Stripe connector, **live** account read-only | real MRR, churn, fees, disputes | connector is the **sandbox** (test mode): MRR will read $0 until a restricted live key / live connector is added |
| Supabase connector | job cost, trial burn | configured in `.mcp.json` but **failed to connect** from this cloud session (ERR_PROXY_TUNNEL); retry or reconnect in claude.ai connectors. Fallback: owner runs the two report scripts and pastes `--json` into §1 |
| Vercel connector | hosting spend, usage, runtime errors | listed as connecting; confirm it is authorized for the Shortcraft team |
| Provider spend (fal.ai, Anthropic, ElevenLabs, Resend) | actual API bills | no connector: paste monthly totals into §3, or add a read-only billing/usage key as a routine secret |
| PostHog or Plausible (analytics) | visitor→signup→paid funnel, CAC | not connected |
| Sentry | failure cost, error spikes | not connected |
| Ad-platform spend (Meta/TikTok) | CAC vs first-month revenue | not applicable until ads start |

Suggested additions (connector directory / tools): PostHog or Plausible, Sentry, Google Sheets (cash
ledger the owner can edit), a Slack or email destination for the digest, `ccusage`-style token tracking
for Claude Code itself (the routines also cost money: log their spend here), and a Stripe restricted
read-only key for live mode. Billing-reconciliation tools such as Stripe Sigma are already available
through the Stripe connector.

## 6. Idea backlog (impact = rough € MRR or € saved per month, to be estimated with real data)

1. Bake-off of cheaper image-to-video models (§4). Highest cost lever.
2. Hero-shot premium tier priced close to Standard: widens the premium audience without the $1+ clip bill.
3. Annual plans (2 months free): cash up front, lower churn. Needs Stripe prices; owner OK.
4. Dunning: Stripe smart retries + failed-payment emails (check the `invoice.payment_failed` handler).
5. Credit expiry/rollover policy: unused credits are pure margin, but rollover helps retention; decide with data.
6. Trial cost control: trial burn is $0.14–0.25; verify measured, cap abuse (disposable emails, many signups per IP).
7. Cache and reuse: re-voice/re-render should reuse images and clips already paid for; confirm in the orchestrator.
8. Stop paying for failed renders: measure failed-job spend; fail fast before the expensive step.
9. Prompt caching and a smaller model for the script step.
10. Affiliate at 30% recurring costs margin; model it against CAC before launch.

## 7. Run log (newest first)

- **2026-10-15** — Set-up run. Created the routine prompt, this ledger and `scripts/unit-economics-report.mts`
  (read-only; not run: no Supabase access from the cloud session). Vendor scan in §4. No live MRR yet.
