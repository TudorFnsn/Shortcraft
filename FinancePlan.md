# FinancePlan — Shortcraft CFO track

> Owned by the **CFO routine** (prompt: `docs/routines/cfo-routine-prompt.md`). Companion to `TheMasterPlan.md` (§7 pricing, §8 risks) and `DesignPlan.md`. Goal: maximise cash return. Every change must improve MRR, gross margin per video, or cash runway, and says which.
>
> Last updated: 2026-10-18 (bootstrap, no live data read yet)

## 1. Charter

- **Metric order:** (1) cash in vs cash out this month, (2) MRR and net new MRR, (3) gross margin per video (revenue per credit vs measured API cost), (4) fixed-cost burn (hosting, seats, plans), (5) payback on paid acquisition.
- **Autonomy (PR-gated, same as the CEO routine):** may read anything; may open PRs on `cfo/*` branches for code, config and docs; never merges; never touches live secrets, live Stripe objects, prices customers already pay, or Supabase writes. Anything that changes what a customer is charged, or switches a provider in production, is a **proposal for the owner** with numbers, not a PR to merge blindly.
- **Files it may edit:** `FinancePlan.md`, `src/config/models.ts` (measured `costUsdPerUnit` only), `src/features/providers/live/*` (new cheaper adapters behind a flag), `scripts/*report*.mts`, `docs/`. Leaves UI files to the Design CEO and anything with an open `ceo*/` PR.
- **Gate:** `npx tsx scripts/margin-report.mts` must pass (≥3x on every plan and top-up) in every PR. Pro is at exactly 3.00x today: any measured cost increase fails it.

## 2. Cost map (what we pay for, as of the repo)

| Cost                    | Driver                             | Variable?   | Where it shows up                                       |
| ----------------------- | ---------------------------------- | ----------- | ------------------------------------------------------- |
| fal.ai FLUX schnell/dev | images per scene                   | per video   | `api_cost_usd` on jobs, `image-*` in `config/models.ts` |
| fal.ai video (Kling)    | Premium only, 5s clips             | per video   | `video-premium`, assumed $0.12/s vs ~$0.07/s list       |
| Anthropic (script)      | tokens per script, Sonnet 5.5      | per video   | assumed $0.04/script                                    |
| ElevenLabs              | chars of voiceover + custom voices | per video + fixed plan slots | `voice-default`, voice slots per plan       |
| ffmpeg render           | Vercel function compute            | per video   | assumed $0.01                                           |
| Supabase                | DB + storage + egress of MP4s      | fixed + GB  | storage growth is the hidden one (no retention policy yet) |
| Vercel                  | seats, functions, bandwidth        | fixed + use | billing via Vercel connector                            |
| Stripe                  | ~1.5% + fixed per charge           | per sale    | already in margin gate assumptions                      |
| Resend / Sentry / domain| fixed                              | fixed       | small                                                   |

**Key fact for the fal.ai question:** Standard videos use no video model (Ken Burns stills, $0 video cost). fal.ai video spend only exists on Premium jobs, so replacing it only pays off if Premium volume is meaningful. Images (FLUX schnell, $0.003) are already near the floor. Read real spend before optimising.

## 3. Candidate savings (unverified research, 2026-10-18; verify on vendor pages and real calls before acting)

Search snippets only; vendor pages weren't reachable and sources disagree, same caveat as TheMasterPlan §7.

1. **Premium video, cheaper models.** Roundups put Seedance 2.0 Fast at ~$0.02–0.09/s and Kling 3.0 at ~$0.03/s (one source), versus the ~$0.07/s we assume for Kling 2.5 Turbo Pro. The fal.ai range quoted is $0.03–0.10/s. Action: A/B 3 models on 10 identical hook images (cost, quality score, failure rate), through the existing `FAL_VIDEO_MODEL` switch first (zero code), then direct-vendor/reseller APIs if >30% cheaper. Sources: [veed.io comparison](https://www.veed.io/learn/best-image-to-video-api), [devtk.ai pricing](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/), [techsy.io](https://techsy.io/en/blog/best-ai-video-providers).
2. **Hero-shot Premium** (AI clip on scene 1 only, stills elsewhere): ~$0.45 vs ~$1.10 per 15s. Already modelled in TheMasterPlan §7; a pricing tier the owner can sell cheaper, widening the funnel to paid.
3. **Voiceover.** ElevenLabs Flash ≈ $0.05/1k chars. Listed alternatives: Deepgram Aura-1 $15/1M chars, Google Standard $4/1M, Mistral Voxtral ~$16/1M, self-hosted Kokoro <$1/1M. At ~15 chars/s the voice is ~$0.00075/s, i.e. under 2% of a Standard video, so **voice is not worth switching for cost**; the real ElevenLabs exposure is the fixed plan and custom-voice slots. Sources: [apiframe TTS comparison](https://apiframe.ai/blog/best-text-to-speech-apis-2026), [tokencost TTS](https://tokencost.app/blog/tts-api-pricing-2026).
4. **Script.** Prompt caching on the fixed system prompt, and a cheaper model (Haiku 5.5) for the first draft if quality holds: check `anthropic-script.ts` cache use. Likely cents per video; low priority.
5. **Storage/egress.** Add a retention policy for old MP4s (e.g. free-tier 30 days) and compress renders; do after measuring storage GB.
6. **Revenue side (often larger than cost cuts):** annual plans (Stripe yearly price ids are already `null` in `plans.ts`), top-up upsell when credits hit zero, trial → paid nudges (lifecycle email exists), abandoned-checkout recovery, dunning/retry for failed renewals, Premium hero-shot as a mid tier, price test on Starter (9.4x margin means room to give more or charge less to lift conversion, or raise ARPU on Pro), affiliate payout caps (30% recurring is a margin tax; model it).

## 4. Data the routine needs (status)

| Data                         | Source                                          | Status                                                      |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| MRR, subs, churn, refunds    | Stripe connector (live account)                 | **Needs owner:** connector is authorised for the *sandbox* only; needs live-mode read-only |
| Jobs, `api_cost_usd`, credits| Supabase (project `iqvrovjwoavvmhaithwn`)       | Connector failed to connect from the cloud session on 2026-10-18 (proxy tunnel error); `scripts/metrics-report.mts` works if a service-role key is in the env |
| Vercel bill, usage           | Vercel connector (`list_billing_charges`, `list_contract_commitments`) | Connected; scope check pending |
| fal.ai spend                 | fal dashboard / API usage endpoint              | **Needs owner:** admin API key (read-only usage) or monthly CSV |
| Anthropic spend              | Anthropic Console usage/cost API                | **Needs owner:** Admin API key (read-only)                  |
| ElevenLabs spend             | ElevenLabs usage API                            | **Needs owner:** the production key already has usage read if scopes allow; confirm |
| Ad spend / affiliate payouts | Meta/TikTok, affiliate tool                     | None yet                                                    |
| Fixed costs (seats, domain)  | Owner                                           | **Needs owner:** one-off list with monthly amounts          |

## 5. Backlog (ordered; the routine takes the top open item with no open PR)

- [ ] **F1 Unit-economics report** `scripts/unit-economics-report.mts` (read-only): per period, jobs by tier, tokens/credits burned, sum `api_cost_usd`, credits charged → revenue-equivalent, margin per video, top 10 costly jobs, overrun warnings. Joins Stripe MRR when the key exists. Pure math in `features/metrics/`, tested.
- [ ] **F2 Measure real costs:** record per-step provider cost on each job (the schema has only `api_cost_usd` per job; add per-step actuals + fal request ids, token counts from Anthropic `usage`), so `costUsdPerUnit` can be replaced by measurements.
- [ ] **F3 Premium video bake-off** (item 1 above), result in §6.
- [ ] **F4 Annual plans** (yearly price ids, discount ≈ 2 months free): cash up front, lower churn.
- [ ] **F5 Failed-payment recovery** (Stripe Smart Retries + dunning emails) and abandoned-checkout email.
- [ ] **F6 Storage retention + cost alert** when monthly spend or margin multiple crosses a threshold (feeds a PushNotification).
- [ ] **F7 Affiliate economics model** before launching 30% recurring.
- [ ] **F8 Break-even page:** fixed costs ÷ gross margin per paying user = subs needed.

## 6. Findings log (newest first)

- **2026-10-18 — Bootstrap.** Routine defined; no live numbers read (Stripe live, fal and Anthropic cost APIs not connected; Supabase connector failed to connect). Repo-only findings: Pro gate margin is exactly 3.00x with no headroom; Premium cost assumption ($0.12/s) is ~70% above Kling list ($0.07/s), so measuring it is the cheapest margin win and may let Premium be priced lower to convert; Standard has no video-model cost so the fal.ai worry applies to Premium and images only.
