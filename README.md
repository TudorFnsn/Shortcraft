# Shortcraft

AI short-form video generator — turn an idea into a vertical video (TikTok / Reels /
Shorts) with script, images, clips, voiceover and subtitles generated for you.
Sold as monthly credits + top-ups.

The pipeline chains swappable AI model providers behind a single adapter contract,
so the entire app runs end-to-end on **deterministic mocks with zero API keys**
(`MOCK_PROVIDERS=true`, the default). Real providers are flipped on per-adapter later.

## Stack

Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui · Supabase
(auth/db/storage) · Stripe (credits + subscriptions) · fal.ai / Anthropic /
ElevenLabs / a managed render API behind provider adapters · Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local   # runs on mocks with nothing filled in
npm run dev
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (mock providers by default) |
| `npm test` | Vitest — must stay green with no secrets |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run format` | Prettier |

## Architecture

The pipeline is a state machine:
`draft → scripting → images → clips → voiceover → subtitles → stitching → done`
(`→ failed` auto-refunds credits). Credits are an append-only ledger
(balance = SUM of deltas). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the
conventions and module layout.
