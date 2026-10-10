# DesignPlan — Shortcraft redesign

> **Source of truth for the design track.** Owned by the **Design CEO** routine.
> It sits under `TheMasterPlan.md`. The master plan wins on product, money and
> priority; this file wins on how the app looks and feels. Every design PR
> updates this file (screen status + changelog) in the same change.
>
> Last updated: 2026-10-10

---

## 1. Charter (owner-configured 2026-10-10, do not change without Tudor)

| Question          | Owner's answer                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| What "home" means | **Calm studio**: warm neutrals, soft surfaces, generous space, one confident accent. The UI stays quiet so the videos carry the color.              |
| Reference feel    | **CapCut / Captions** for layout and flow (content-first, big vertical previews, an obvious create path), inside the calm studio shell.             |
| Primary user      | **Faceless-channel creators** posting daily to niche accounts: speed, repeatable output, a library of their videos.                                 |
| Scope (phase 1)   | **Core loop only: Create + Gallery**, plus the shared shell/tokens they need. Landing, pricing and login inherit the tokens but are not redesigned. |
| Brand             | Keep the name **Shortcraft**. The Design CEO proposes a new identity (mark, palette, type, voice) for owner approval.                               |
| Theme             | **Light + dark, following the system**, with a manual toggle. Both themes are warm.                                                                 |
| Devices           | **Desktop web first**, then a dedicated mobile pass (390px). Both must work at every step; desktop gets the design attention first.                 |
| Review            | Designs are reviewed on a **Claude Design canvas** (artboards per screen, light + dark). The owner comments; the next run iterates.                 |
| Autonomy          | **Design + PR-gated code.** No code for a screen until its design is marked approved below. Branches `ceo-design/<slug>`; never merge.              |
| Cadence           | Separate daily cloud routine **"Shortcraft Design CEO"**, 09:00 UTC (3h after the main CEO). Pause it once the core loop ships.                     |

### Design principles (derived from the charter)

1. **The video is the hero.** Every screen shows vertical 9:16 media as big as the layout allows. Chrome is neutral and recedes.
2. **One obvious next action per screen.** Create has one primary button; Gallery has one "New video" entry point. Everything else is secondary.
3. **No surprises about money.** The credit cost and balance stay visible before Generate (from the master plan: "no surprise paywall"). Locked options stay visible with the plan that unlocks them; they are never hidden.
4. **Calm is not empty.** Use warm surfaces, soft radii (12–16px), subtle depth and friendly microcopy. Avoid cold grey-on-black.
5. **Fast for repeat use.** Remember the last theme, length and quality. Keyboard-friendly (`⌘/Ctrl+Enter` generates). Creators make a video a day.
6. **Accessible by default.** WCAG 2.2 AA contrast in both themes, visible focus, 44px targets on touch, honour `prefers-reduced-motion`.

---

## 2. Current state (audit, 2026-10-10)

The UI is still the Next.js scaffold: ~600 lines across 7 screens, `neutral-950` everywhere, `globals.css` with two unused tokens, the body font falling back to Arial even though Geist is loaded, and no shared components.

- **Create** (`src/app/create/create-form.tsx`): one column of native `<select>`s. Themes are text-only, so you can't see what a theme looks like. The cost line is small and grey, and three stacked grey notes (upgrade, watermark, error) compete with each other. There is no preview.
- **Gallery** (`src/app/gallery/page.tsx`): a text list with raw status strings (`scripting`, `clips`) and a static %. There are no thumbnails, no player (Watch opens a raw signed URL in a new tab, and it expires after 24h), no filters, and a bare empty state.
- **Shell** (`src/components/header.tsx`): text links, no credit balance, no theme toggle, no active state.

---

## 3. Target experience

### Shell (shared)

- **Desktop:** a slim top bar (logo · Create · Library · credits pill → `/pricing` · avatar menu with the theme toggle and sign-out). The content area is centred and has a max width; the Gallery may go wider.
- **Mobile (phase D3):** a compact top bar with a bottom tab bar (Library · **Create** · Account).
- Tokens live in `globals.css` under Tailwind v4 `@theme`, with a warm light set and a warm dark set. Nothing hardcodes `neutral-*` any more.

### Create: "Compose → preview → generate"

- **Desktop, two panes:**
  - **Left (composer):** a large prompt box with rotating example ideas and "idea starter" chips per theme. A **theme gallery** of visual 9:16 cards (sample frame, name, blurb), not a dropdown. **Length** as segmented chips (15/30/60/90/120s; locked ones show a lock icon and the plan name). **Quality** as two cards: Standard (animated stills) and Premium (AI video, with a Pro badge when locked).
  - **Right (sticky):** a phone-frame **preview** of the chosen theme's look, a summary (theme · length · quality), a **cost meter** (estimate vs balance, with a clear state when you can't afford it), and the primary **Generate** button. A trial watermark note sits here as one quiet line.
- **States:** empty, typing, unaffordable (inline "get credits" action), plan-locked option picked, moderation block (friendly and specific), submitting, and an error with retry.
- Remembers the last theme, length and quality. `⌘/Ctrl+Enter` submits.

### Gallery → "Library"

- A **grid of 9:16 cards**: thumbnail (first scene image), title, theme, duration, status chip.
- **In-progress cards** show the named step ("Writing script", "Drawing scenes", "Animating", "Recording voice", "Adding captions", "Final cut") and a progress bar, and update by polling.
- **Failed cards** say the credits were refunded and offer a one-click retry.
- Clicking a finished card opens a **player sheet**: an inline 9:16 player, download, copy title/caption, and "Make another like this" (prefills Create).
- Filter chips: All · In progress · Ready · Failed. The empty state is a warm illustration with three one-click starter ideas.

### Identity: Direction A "Paper & Ember" (owner-chosen 2026-10-10)

- **Palette:** light = paper `#F7F3EC` ground, `#FFFDF9` surface, `#EFE9DF` raised, `#E3DBCD` border, ink `#221C17`, muted `#6B6158`, ember `#C2461F` (white text on it), soft `#FBE3D8`, accent text `#A63A17`. Dark = `#1A1613` / `#231E1A` / `#2D2722` / `#3A322B`, text `#F3EDE5`, muted `#A89C90`, ember `#F0714A` (dark text on it), soft `#3A2219`, accent text `#F59272`. Status colours get tuned to sit with ember in the design-system step.
- **Type:** **Bricolage Grotesque** (700) for display and headings, **Geist** for UI and body.
- **Shape:** 16px radius on cards and inputs, 20px on panels, pill chips and nav, 14px on primary buttons.
- **Mark:** an ember rounded square with a play glyph next to the "Shortcraft" wordmark. It also works as the favicon.
- **Voice:** friendly, concise and second person ("Your video is ready"), never hype.

---

## 4. Roadmap (priority order)

Each item flows **canvas → owner approval → PR**. Status: `[ ]` todo · `[~]` in progress · `[✓]` design approved · `[x]` shipped.

### D0: Direction & foundations

- [✓] **Direction canvas:** three directions published; **Tudor picked A, Paper & Ember** (2026-10-10).
- [✓] **Design system** (Claude Design "Design System" artifact, **approved by Tudor 2026-10-10**): tokens (colour, type scale, radii, spacing, shadow, motion) and the primitives Button, Input/Textarea, Segmented, Choice card, Chip, Badge, Progress, Toast, Sheet/Modal, Skeleton.
- [x] **Code** (PR #34, merged 2026-10-10): tokens in `globals.css` (light + dark + `data-theme` override), theme toggle (no flash on load), Button + Badge primitives in `src/components/ui/*`, new shell/header with credits pill. The remaining primitives (Segmented, Choice card, Chip, Progress, Toast, Sheet, Skeleton) land with the screen that first needs them (D1/D2).

### D1: Create (desktop first)

- [✓] **Canvas** (https://claude.ai/artifact/P9KyYHKzwai14M61UvsKce): Create at 1440 and 1024, light + dark, plus every state (empty, not enough credits, plan-locked option picked, topic blocked, submitting, error + retry) in both themes. **Approved by Tudor 2026-10-10** with all three open decisions accepted (§8).
- [x] **Code** (PR #37, merged 2026-10-10): `create-form.tsx` rebuilt to the canvas on the same API contract, entitlement and moderation logic. The pure state is in `src/app/create/composer.ts` (unit-tested). It remembers the last settings from the newest job, supports ⌘/Ctrl+Enter and arrow-key radio groups, and draws the theme frames (`src/components/theme-frame.tsx`). Real sample stills in `public/themes/*` wait on Tudor's OK for one paid image run.

### Activation & retention (owner-approved 2026-10-10)

- [x] **One tap to a first video** (PR #37): a brand-new account lands on Create with a ready Fun Facts idea, 15s Standard (~2,024 of the 3,000 trial credits), and a note saying "Your first video is one tap away".
- [x] **Today's ideas** (PR #37): three one-tap ideas in the Library that rotate daily (UTC). Two come from the creator's latest theme and one from another theme. Each opens Create prefilled (`/create?theme=…&idea=…`). On an empty Library it doubles as the starter row ("Start with one of these"). The D2 canvas carries it into the new Library design.

### D2: Library (desktop first)

- [✓] **Canvas** (https://claude.ai/artifact/SA65b6TeMc6TT139s8kPwT): the Library at 1440 and 1024, light + dark, Today's ideas, filter chips, the 9:16 grid, in-progress, failed, player sheet and empty Library. **Approved by Tudor 2026-10-10** with the three decisions in §8.
- [~] **Code** (PR `ceo-design/d2-library`): `src/app/gallery/*` rebuilt to the canvas. The view model lives in `library.ts` (unit-tested). The grid, filters, one-click retry and player sheet live in `library-grid.tsx`; the sheet is a native modal `<dialog>`, so focus is trapped and Esc closes it. Thumbnails come from `video-thumb.tsx` (`/api/jobs/:id/thumbnail`, falling back to the drawn theme frame). The existing 4s refresh keeps polling while a video is in progress. "Make another like this" passes `len`/`tier` to Create (`composer.ts`). Nothing touches credits, billing or the pipeline.

### D3: Mobile pass

- [ ] **Canvas:** Create and Library at 390px, bottom tab bar.
- [ ] **Code:** responsive implementation. Create becomes a single scroll with a sticky Generate bar.

### D4: Quality bar

- [ ] Accessibility audit (WCAG 2.2 AA, both themes, keyboard-only run). Before/after screenshots in each PR.

### Later (out of the current charter, needs owner sign-off)

Home dashboard · fuller onboarding (beyond the one-tap first video) · landing + pricing redesign · auth screens.

---

## 5. Rules for the Design CEO routine

- **Read first:** `TheMasterPlan.md`, then this file, then `git log -20`, open and recent PRs (`gh pr list --state all --limit 20`), and the canvas comments when the canvas is reachable.
- **One item per run:** take the top unchecked item in §4 that is not already in an open `ceo-design/*` PR. Prefer improving an open design PR over starting a new one.
- **Approval gate:** never open a code PR for a screen whose canvas item is not `[✓]`. Only Tudor sets `[✓]`, through a canvas comment or an edit to this file.
- **Files it may change:** `src/app/create/**`, `src/app/gallery/**`, `src/components/**`, `src/app/globals.css`, `src/app/layout.tsx`, `public/**`, this file, and the Design-track lines of `TheMasterPlan.md`. Small read-only data helpers for D2 are allowed. It never touches `src/features/credits|billing`, migrations, webhooks, providers or pricing.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` all pass in mock mode. Every page still works with JavaScript-light server rendering, and both themes reach AA.
- **Output:** a digest with what moved, the canvas and PR links, what is waiting on Tudor, and the next item.

---

## 6. Links

- Design canvas (D0 Direction): https://claude.ai/artifact/3gMxoCVVP4AKatSL7bJZYJ — three directions (A Paper & Ember, B Night Studio, C Sage Room), Create + Library each, light + dark. Private to Tudor; share it from its Share menu if a routine or teammate must read it.
- D1 Create canvas: https://claude.ai/artifact/P9KyYHKzwai14M61UvsKce: 16 artboards (4 layouts + 6 states × 2 themes), built on the Paper & Ember tokens, credit numbers from the real estimator. Private to Tudor.
- D2 Library canvas: https://claude.ai/artifact/SA65b6TeMc6TT139s8kPwT: 8 artboards (grid at 1440/1024, player sheet, empty Library × light/dark). Private to Tudor.
- Design system (Paper & Ember): https://claude.ai/artifact/VZML2hgEyRes35PbWopudn: tokens (light + dark), type, spacing, radii, shadows, brand book, mark, and Button / ChoiceCard / Segmented / Chip / Progress / VideoCard. The source of truth for every design and for the D0 code tokens.
- Main CEO routine: `trig_01HJ4PZK4zLRutuBCtMST2Wx` · Design CEO routine: `trig_01T9k9zrSgLbcPa6noXKAr8P` (https://claude.ai/code/routines/trig_01T9k9zrSgLbcPa6noXKAr8P)

---

## 7. Changelog

- **2026-10-10** — Tudor approved the D2 Library canvas and its three decisions. The D2 code is in review on `ceo-design/d2-library`. Next: D3 mobile canvas. (Design CEO, interactive)
- **2026-10-10** — D1 shipped (PR #37: Create rebuild, one-tap first video, Today's ideas). D2 Library canvas published, waiting on Tudor's approval and three decisions (§8). (Design CEO, interactive)
- **2026-10-10** — Tudor approved the D1 Create canvas and its three decisions, plus the two activation/retention ideas. PR #35 merged with the canvas docs only, so the Create rebuild, the one-tap first video and the Library's Today's ideas row follow in their own PR (same branch, restarted from main). (Design CEO, interactive)
- **2026-10-10** — D0 marked shipped (PR #34 merged). D1 Create canvas published: two-pane composer + sticky preview/cost panel at 1440 and 1024, six states, light + dark, interactive. Waiting on Tudor's approval and three decisions (§8). (Design CEO, routine)
- **2026-10-11** — D0 foundations in review as PR #34: tokens (light + warm dark), System / Light / Dark picker with no flash, new header (mark, Create / Library nav, credits pill, account menu), Button + Badge primitives, all pages moved onto tokens. (Design CEO, interactive)
- **2026-10-10** — Tudor approved the Paper & Ember design system. D0 code starts on `ceo-design/foundations`.
- **2026-10-10** — Paper & Ember design system published in Claude Design (tokens, brand book, mark, six core-loop components). Next: Tudor reviews it, then D0 code (tokens in `globals.css`, theme toggle, shell, `src/components/ui/*`).
- **2026-10-10** — Tudor picked **Direction A, Paper & Ember**. Identity in §3 updated with its exact tokens. The design-system canvas comes next.
- **2026-10-10** — D0 direction canvas published (3 directions × Create + Library, interactive, light + dark). Waiting on Tudor to pick one.
- **2026-10-10** — Design track set up. Tudor answered the configuration questions (§1), the Design CEO audited the current UI (§2) and wrote the target experience and roadmap D0–D4. (Design CEO, interactive)

## 8. Decision log

- **D2 Library canvas approved** (2026-10-10, owner: "D2 approved. 1. first option. 2. first option. 3.yes"):
  1. **5 columns at 1440, 4 at 1024** (3 on tablets, 2 on phones).
  2. **"Try again" starts the same video straight away**, with its cost on the button. The failed run was refunded. When the balance is short, it becomes "Get credits to try again".
  3. **"Make another like this"** opens Create with the same theme, length and quality plus a fresh idea from that theme.

- **D1 Create canvas approved** (2026-10-10, owner: "i approve the canvas … 1. yes 2. yes 3. yes"):
  1. Theme cards crop the sample frame to **4:5** so all eight fit in a 4×2 grid. The full 9:16 shows in the sticky phone preview.
  2. **Locked options are pickable.** Picking one shows the plan that unlocks it (price + credits), swaps Generate for "See the <plan> plan" and offers a one-tap way back.
  3. **Three idea chips per theme** under the composer.
- **Activation + retention ideas approved** (2026-10-10, owner: "also implement the ideas for activation and retention") → one-tap first video (Create) and a daily "Today's ideas" row (Library). Both are in the D1 code PR. The Library row ships on the current page now, and the D2 canvas restyles it.

- **Direction A, Paper & Ember** (2026-10-10, owner: "I like option A") → the warmest of the three and the closest to "home", while the ember accent keeps creator energy. B (dark-first, CapCut) and C (sage, serif) are set aside; the Library's CapCut-style grid layout carries over regardless.

- **Core loop first, marketing later** (2026-10-10, owner) → retention (weekly creators) lives in Create + Library. Landing and pricing redesigns wait until the core loop feels like home.
- **Desktop first, then mobile** (2026-10-10, owner) → creation happens at a desk today. Mobile gets its own pass (D3) rather than a compromise layout.
- **Approval-gated per screen** (2026-10-10) → design is subjective, so code follows an approved canvas. That avoids PRs the owner has to unwind.
