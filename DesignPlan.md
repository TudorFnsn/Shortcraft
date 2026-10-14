# DesignPlan — Shortcraft redesign

> **Source of truth for the design track.** Owned by the **Design CEO** routine.
> It sits under `TheMasterPlan.md`. The master plan wins on product, money and
> priority; this file wins on how the app looks and feels. Every design PR
> updates this file (screen status + changelog) in the same change.
>
> Last updated: 2026-10-14

---

## 1. Charter (owner-configured 2026-10-10, do not change without Tudor)

| Question          | Owner's answer                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| What "home" means | **Playful boxes** (changed 2026-10-14, journey B): bold colour blocks, big serif and poster type, motion. Each screen still asks one question.     |
| Reference feel    | **CapCut / Captions** for layout and flow (content-first, big vertical previews, an obvious create path), inside the calm studio shell.            |
| Primary user      | **Faceless-channel creators** posting daily to niche accounts: speed, repeatable output, a library of their videos.                                |
| Scope             | **Every page and flow** (widened 2026-10-14 for journey B): landing, sign-in, Create, Your videos, player, voices, pricing, ideas, keyword, legal. |
| Brand             | Keep the name **Shortcraft**. The Design CEO proposes a new identity (mark, palette, type, voice) for owner approval.                              |
| Theme             | **Light by default** (2026-10-14), dark as the partner, plus System, with a manual toggle.                                                         |
| Devices           | **Desktop web first**, then a dedicated mobile pass (390px). Both must work at every step; desktop gets the design attention first.                |
| Review            | Designs are reviewed on a **Claude Design canvas** (artboards per screen, light + dark). The owner comments; the next run iterates.                |
| Autonomy          | **Design + PR-gated code.** No code for a screen until its design is marked approved below. Branches `ceo-design/<slug>`; never merge.             |
| Cadence           | Separate daily cloud routine **"Shortcraft Design CEO"**, 09:00 UTC (3h after the main CEO). Pause it once the core loop ships.                    |

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

### Identity: Direction A "Paper & Ember" (owner-chosen 2026-10-10; superseded by Studio on 2026-10-13 and by Boxes, §4 B, on 2026-10-14)

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
- [x] **Code** (PR #39, merged 2026-10-10): `src/app/gallery/*` rebuilt to the canvas. The view model is in `library.ts` (unit-tested). The grid, filters, one-click retry and native `<dialog>` player sheet are in `library-grid.tsx`, and thumbnails in `video-thumb.tsx`. "Make another like this" passes `len`/`tier` to Create.

### D2.1: Library follow-up (from TheMasterPlan §5, Moderation "still to do")

- [✓] **Canvas** (https://claude.ai/artifact/KHgF5y7UMevAQvzhu6FYYQ): the failed card for a video our safety check stopped (job error starts with `moderation_blocked`), at 1440 and 390, light + dark. It drops "Try again" (the same script would be blocked again), offers "Try a different idea" (Create with the same theme, length and quality plus a fresh idea from that theme) and a "What we don't make" link to the Terms. The copy never repeats the prompt; the refund line stays. Every other failed card is unchanged. **Approved by Tudor 2026-10-12** with the recommended answers (§8).
- [x] **Code** (PR #51, merged 2026-10-12): `library.ts` sets `blocked` from `job.error` (`isModerationBlock`, unit-tested) and announces "<title> wasn't made" to screen readers; `library-grid.tsx` draws the variant. "Try a different idea" reuses `anotherLikeHref`. No API, credits or moderation changes.

### L: Landing page (owner-approved scope, 2026-10-10)

- [✓] **Canvas** (https://claude.ai/artifact/NpzYH2qhCUUdffN1vT1FcC): the logged-out landing at 1440 and 390, light + dark. **Approved by Tudor 2026-10-11** with the recommended answers (§8).
- [x] **Code** (PR #43, merged 2026-10-11): `src/app/page.tsx` → `src/components/landing/landing.tsx`. The pricing teaser reads `plans.ts` (`plan-teaser.ts`, unit-tested). The hero idea box rides through sign-up into Create (`?idea=` only, no open redirect).

### D3: Mobile pass

- [✓] **Canvas** (https://claude.ai/artifact/JSKAz555Rkng6FqWR1HbA7): Create, Library (light + dark), the player sheet and the Account sheet at 390×844, with a bottom tab bar (Library · Create · Account). **Approved by Tudor 2026-10-11** with the recommended answers (§8).
- [x] **Code** (PR #44, merged 2026-10-11): below `md`, a bottom tab bar (`tab-bar.tsx`) with an Account bottom sheet. Phone Create has a sticky cost + Generate bar and sideways theme and idea rows. Phone Library has sideways ideas and filters and a full-screen player.

### D4: Quality bar

- [x] **Accessibility audit, desktop core loop** (PR #42, merged 2026-10-11): axe (WCAG 2.2 A/AA) found 0 violations on Create (4 states), Library, landing, login and pricing in both themes. The manual pass fixed 8 smaller issues: page titles, a skip link, arrow keys in the theme picker, focus return from the account menu, reliable status messages (cost/plan changes, "video is ready"), reduced-motion spinners and 24px text targets. Report: `docs/design/d4-a11y-audit.md`. No visual change, so it needs no canvas.
- [x] **Audit, phones + landing** (PR #45, merged 2026-10-11): axe found 0 violations at 390px in both themes (landing, login, Create, plan-locked Create, Library). Five touch-target fixes bring the header, footer, idea chips, the "Use … instead" link and the filter chips to 44px on phones. The tab bar and Account sheet keyboard check passed. The login form stays with the auth-screens item in Later. Report: `docs/design/d4-a11y-audit.md` (part 2).

### F: Owner-approved follow-ups (2026-10-13, owner: "take them all in order and start implementing")

Approved straight to code, without a canvas, in this order:

- [x] **Landing hero plays real videos** (PR #55, merged 2026-10-13): the three phones play videos from Supabase, configured through `LANDING_SHOWCASE_JOB_IDS`. Drawn frames remain the fallback.
- [x] **"Posted?" check-off + weekly streak** (PR #56, merged 2026-10-13): stored in the browser for now. A `posted_at` column would make it work across devices (main CEO track, migration).
- [x] **Queue tomorrow's video** (PR #57, merged 2026-10-13): tomorrow's idea in the same theme, length and quality, shown in the Library and the player sheet.
- [x] **Pricing page redesign** (PR #58, merged 2026-10-13): layout only; plans, checkout and waiver unchanged. Screenshots in `docs/design/pricing/`.
- [x] **Login and sign-up screens** (PR #59, merged 2026-10-13): labelled fields, autocomplete, show-password, visible focus, announced errors, a page title. axe found 0 violations. Screenshots in `docs/design/auth/`.

### S: Calm & Clear (owner brief 2026-10-13: "more intuitive, less crowded, easier on the eye, a straightforward journey")

The app works, but every screen asks for attention at once. This journey keeps Paper & Ember and the content-first layout, and takes things away.

**Audit (2026-10-13, from the shipped code):**

- **Create** shows four sections expanded together (idea box with helper line, keyboard hint and 3 idea chips; 8 look cards; 5 length chips; 2 quality cards). It also has a side panel with a preview, a summary, a cost meter, a balance line and two notes. That is about 20 decisions or texts before Generate.
- **Library** stacks five competing actions above the grid: New video, Tomorrow's video, 3 daily ideas, the streak line, and filter chips with counts. Each card adds a Posted toggle.
- **Visual noise:** a hairline border on almost every card and input, several 13–15px grey helper lines, and ember appearing several times on one screen.

**Journey (one question and one ember action per screen):** Idea → Make → Watch → Post.

1. **Idea:** one big idea box, a "Surprise me" link and three setting pills (look · length · quality) that remember the last choice. The look picker opens as a sheet of 8 tiles only when asked.
2. **Make:** one button, "Make video", with the cost under it ("About 2,024 credits · you have 12,480"). Locked options and short balances keep today's behaviour (principle 3), shown inline under the button.
3. **Watch:** Home ("Your videos") shows the video being made as the first card, and the player opens when it is ready.
4. **Post:** in the player, Download (ember), Copy title and Posted. Tomorrow's idea moves to Home as a single "Today's idea" card (replacing the Tomorrow block and the 3-idea row).

**Visual rules:**

- No hairline borders on cards; separate them with surface fills and space.
- Two text sizes per block.
- Helper text only where a person can get stuck.
- Ember once per screen.
- Content width 680px (Create) and 1120px (Home).
- Navigation: "Your videos" + credits + avatar on desktop. On phones, a single floating "+" replaces the 3-tab bar.

- [✓] **S0 Canvas** (https://claude.ai/artifact/9GkURdvSAnYC2obP4EdnqG). **Approved by Tudor 2026-10-13: Look B "Studio" (dark, violet), "all screens adapt to the new look, start implementing".** The layout recommendations (Q1–Q6) are taken as accepted with it.
- [~] **Studio tokens** (PR #66): dark-first palette (`#0e0f11` ground, `#f5f5f4` ink, violet `#a78bfa`) plus an opt-in light partner. Geist-only type. Every screen adopts it through the existing token names.
- [~] **S1 Create** (PR #67, stacked on #66): one idea box with Surprise me, three setting pills that open sheets, and one Make video button with the cost underneath.
- [~] **S2 Home** (PR #68, stacked on #67): Today's idea as the headline with Make it, the latest video large, and one row of videos. Filters show only from 12 videos; Posted lives in the player.
- [~] **S3 Shell** (PR #69, stacked on #68): a quiet header (Your videos · credits · New video · avatar) and one floating + on phones instead of the tab bar.
- [ ] **S4 Check:** axe in both themes and at 390px, plus a 5-task walkthrough (first video, make another, find a finished video, download, mark posted). Count clicks before and after.

### V: Voice Studio (owner request 2026-10-13; product scope and backend in TheMasterPlan §5 "Voice Studio")

Three new surfaces, drawn in the Studio look. They follow the S rules: one violet action per screen, sheets instead of expanded sections, and helper text only where people get stuck.

- [✓] **V0 Canvas** (https://claude.ai/artifact/RGGjuaD9kq5wxaQKPsg4C1, published 2026-10-13, **approved by Tudor 2026-10-13** with all four recommendations): 10 artboards in the Studio look. Board 0 is the journey map. 1a–c are the Voice sheet (dark, light, phone). 2a–c are the voiceover editor (dark, light, phone). 3a–c are Create a voice (3 samples), My voices at the limit, and the phone describe step. 1a/b, 2a/b and 3a are interactive: ▶ toggles, picking, speed and delivery, and live word counts in the editor.
  1. **Voice sheet on Create:** a 4th pill "Voice · Will" (violet-tinted while it's the only pill not on its default, plain otherwise). The sheet lists My voices first plus a dashed "Create a voice" tile, then the 8 catalog voices in two columns (one column on phones). Each tile has a 44px ▶ button, the name and two-word character; the look's default carries "Look's pick". Speed and Delivery sit under the list as two 3-way segmented rows. "Included in every video. No extra credits." sits beside **Done**.
  2. **Voiceover editor:** "Edit voiceover" in the player opens a wide sheet. The video sits left (it plays the current line). On the right: the voice pill (Voice · Will · Normal · Natural, which opens the Voice sheet), then one row per scene with thumbnail, narration field, "▶ Hear this line" and a word count. An edited scene turns violet-tinted and says "Edited". Going over +30% turns the count amber ("Too long for this scene: 17 / 15 words") and disables Make new version. The footer line reads "1 scene changed · About 340 credits · you have 12,480". On phones it is a full-screen sheet with the action bar pinned to the bottom.
  3. **Create a voice:** its own route. Step 1 is a description box ("Age, accent, pace, mood") with 4 starter chips and "Hear 3 samples · 100 credits"; a note says to describe a type of voice, not a real person. Step 2 shows what was asked with "Change · 100 credits", 3 sample cards (▶, waveform, a short note) as one radio group, a name field and **Save voice**. The line under it reads "1,500 credits, once… You'll have 2 of 3 voices on Pro". **My voices** shows N of M on the plan, rows with ▶, name, description and "in 4 videos", plus Rename and Delete. At the limit, Create a voice is disabled and a tinted notice says "Delete one to make room, or move to Ultra for 10."
- **Implementation plan (design side), after approval.** Every step keeps the S rules: one violet action per screen, sheets instead of new sections, Studio tokens only, axe-clean in both themes and at 390px.
  - [~] **V2 Create pill + Voice sheet** (in review on `ceo-design/v2-voice-pill`; the voice choice is sent only when it differs from the defaults):
    - `create-form.tsx` gets a 4th pill and a `voice` sheet.
    - New `src/components/voice/voice-picker.tsx` holds the tile grid plus the two segmented rows, and is reused by the editor.
    - New `src/components/voice/use-voice-preview.ts` drives one shared `<audio>` playing `public/voices/<slug>.mp3`: one plays at a time, and it stops when the sheet closes.
    - Unlike the other sheets, picking does not close this one, because speed and delivery follow; Done or Escape closes it.
    - The voice is remembered with the other settings. Until the creator picks one, the voice follows the look's default; after that it stays put.
    - `POST /api/jobs` already takes `voiceId`, `speed` and `delivery`.
  - [~] **V3 Voiceover editor** (in review on `ceo-design/v3-voiceover-editor`). It is built on the CEO track's API contract (TheMasterPlan §5): `GET /api/jobs/:id/scenes` for the lines and their limits, `?scene=<idx>` thumbnails, `POST /api/voice/preview` for **"Hear this line"**, and `POST /api/jobs/:id/revoice`. It counts characters (the server's 130% + 20 limit), not words, and the voice opens inline in the editor instead of as a second sheet:
    - "Edit voiceover" sits in the player sheet next to Download, only for finished videos you own.
    - The editor is a `Sheet` with a new `size="wide"` variant (full screen on phones).
    - It needs a read-only helper that loads a job's scene narration and thumbnails.
    - Rows are built from scenes. Word limits come from the same +30% rule the API enforces, so the UI never offers what the server refuses.
    - Make new version closes the sheet. The new job appears in Your videos as its own card with a "v2" badge and the usual progress, and the original stays.
  - [~] **V4 Create a voice + My voices** (in review on `ceo-design/v4-my-voices`, built on the CEO track's `/api/voices*` contract). Two choices made while building: the ▶ on a saved voice speaks a short fixed line through the free, cached preview API, and after saving, "Make a video with it" opens Create with the new voice already picked (`/create?voice=<id>`):
    - The routes are `/voices` (My voices) and `/voices/new` (describe, then samples).
    - They are reached from the Voice sheet tile and a "My voices" item in the avatar menu. No new header link.
    - Deleting a voice asks for confirmation ("Videos you already made keep their voice").
    - Saved voices appear at the top of the Voice sheet and the editor.
- **Decided 2026-10-13** (Tudor: "use recommended"); the answers are in brackets:
  1. Does the Voice sheet stay open after picking a voice, with Done to close? [yes, because speed and delivery are tuned right after picking]
  2. Is a new version its own card with a "v2" badge, or a version switcher inside one card? [its own card: it's simpler, and posting both is a real use]
  3. Is the voice changed for the whole video only, not per scene? [whole video only: one voice per video sounds right and keeps the editor simple]
  4. Is My voices its own page, reached from the Voice sheet and the avatar menu, rather than a header link? [yes, to keep the header quiet]

### B: Boxes (owner request 2026-10-14: "redesign the app to be similar to lil-boxes.com … imitate the animations, sizes, fonts, colors"; **approved 2026-10-14**)

A full look-and-motion change for **every page and flow**, measured from lil-boxes.com (Firecrawl scrape of its HTML, inline CSS and GSAP timeline config). It replaces the Studio look (journey S) and the Paper & Ember identity (§3). The S layout rules stay: one question and one main action per screen, sheets instead of expanded sections, helper text only where people get stuck. What changes is the skin, the type and the motion.

- [✓] **B0 Canvas** (https://claude.ai/artifact/Va66qwzLQpCNKmya8GwepU, published 2026-10-14): 15 artboards. **Approved by Tudor 2026-10-14** ("i like it"), with every recommendation in §8 accepted. The canvas is the visual source of truth: code must match it board for board.

#### B.1 The Boxes system (measured from lil-boxes.com)

**Colour tokens** (same token names as today, so every screen switches at once; light is the default, dark is the partner):

| Token                          | Light                         | Dark                          | Use                                                          |
| ------------------------------ | ----------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `--paper`                      | `#F5F5F5`                     | `#1A1A1A`                     | page ground                                                  |
| `--surface`                    | `#FFFFFF`                     | `#212121`                     | sheets, inputs, cards on ground                              |
| `--raised` (blush)             | `#F0E2DD`                     | `#2A2A2A`                     | primary buttons (light), pills, soft boxes                   |
| `--blush-2`                    | `#F0E4E5`                     | —                             | hero box gradient end                                        |
| `--line`                       | `#E0E0E0`                     | `#333333`                     | dividers only, never card borders                            |
| `--ink`                        | `#212121`                     | `#F0E2DD`                     | text; dark boxes in light mode                               |
| `--ink-muted`                  | `#616161`                     | `#BDBDBD`                     | meta text (5.7:1 / 9.5:1)                                    |
| `--ember`                      | `#F0354D`                     | `#F0354D`                     | large red text (≥24px), handwritten notes, account dot       |
| `--ember-ink`                  | `#C81E3A`                     | `#F095A1`                     | small red text: eyebrows, status (5.2:1 / 7.3:1)             |
| `--red-deep`                   | `#A32435`                     | —                             | red text on blush boxes (5.8:1)                              |
| `--shadow-red`                 | `#5F151F`                     | —                             | poster text-shadow, under-line of buttons on the ember box   |
| `--orange`                     | `#F07142`                     | `#F07142`                     | ember gradient start, notes on dark                          |
| `--sky` / `--navy`             | `#35B5F0` / `#042839`         | `#0B6FA3` / `#042839`         | Your videos and looks boxes; navy is the text on sky (6.6:1) |
| `--yellow`                     | `#F0E835`                     | `#F0E835`                     | caption highlight, required `*` on dark                      |
| `--success / warning / danger` | `#166534 / #854D0E / #C81E3A` | `#4ADE80 / #FBBF24 / #F87171` | states (danger shares the red family)                        |

**Box gradients:** `--grad-ember` radial at 10% 10%, `#F07142 → #F0354D` (Create, CTA, Create a voice, Pro plan); `--grad-blush` radial at 10% 90%, `#DBBDC0 → #F0E2DD` (Today's idea, steps, My voices); `--grad-sky` radial at 90% 10%, `#70CBF5 → #35B5F0` (This week, looks, Look sheet; dark: `#0B6FA3 → #042839`); `--grad-hero` linear 135°, `#F0E2DD → #F0E4E5` (landing hero, sign-in).

**Type** (all via `next/font`; Geist and Bricolage leave):

| Role         | Face                                                    | Marketing scale (landing, keyword pages)      | App scale (Create, Your videos, sheets)         |
| ------------ | ------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Poster       | **League Gothic** (stand-in for Humane; one token swap) | `clamp(3rem, 30vw, 28rem)`, lh .75, uppercase | 300px "HELLO" on sign-in only                   |
| Heading      | **Fraunces** 400                                        | `clamp(1.2rem, 8vw, 9rem)`, lh .8, −5px       | page title 72–128 / 56 phone, lh .8, −3 to −5px |
| Hero / input | Fraunces 300 (placeholder 200)                          | `clamp(5rem, 8vw, 10rem)`, lh .75, −2px       | idea input 40 / 28 phone; buttons 30–48         |
| Card title   | Fraunces 400                                            | —                                             | 26 / 20                                         |
| Eyebrow      | **Inter** 600, +3px, uppercase                          | `clamp(1rem, 2vw, 1.5rem)`                    | 13–16                                           |
| Lead / body  | Inter 300 lead, Inter 400 body                          | `clamp(1.5rem, 1.75vw, 2rem)`, lh 1.2         | 17 / 16, lh 1.45                                |
| Label        | **Urbanist** 400, uppercase                             | 1–2rem (footer, meta)                         | 13–16 (player meta, top-up note)                |
| Note         | **Shadows Into Light Two**                              | 3rem, ±8–23°, blur .5px, `aria-hidden`        | 22–40, one per screen max                       |

**Shape and depth:** 8px radius on boxes, buttons, inputs and media (30px only while a box or sheet is entering); 50px pills and chips. Boxes sit 24px in from the window edge (8px on phones) and stack with 24px (12px phone) gaps. No card borders. Buttons: no fill border, a 1px under-line plus `0 1px 0 0` shadow in the line colour; hover/focus presses in (`translate(2px,2px)`, shadow `-2px -2px 2px 1px rgb(0 0 0/.1)`, line fades, tint +10%), all .3s. Inputs are under-lines only (Fraunces 300). Hero media shadow `40px 40px 80px rgb(0 0 0/.5)`; frosted card `rgb(240 226 221/.4)` + blur 10px + 1px white/50 border, rotated 2°; crisp tag shadow `6px 6px 0 #000`. Plan boxes tilt −1° / 0 / +1°.

**Mark:** the isometric box (orange top `#F07142`, red left `#F0354D`, ink right `#212121` with a blush play glyph); dark mode swaps the right face to blush. It replaces the current mark and the favicon (`src/app/icon.svg`).

**Motion kit** (values copied from the lil-boxes GSAP config; `gsap` + ScrollTrigger + SplitText, all free since 3.13; every move is off under `prefers-reduced-motion` and the page is complete without JavaScript):

| #   | Move                    | Spec                                                                                                               | Where                                                                                                                   |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Section pop             | from scale .9, rotate −0.7° (alternate boxes +0.7°), top radius 30 → 8; scrub 1, "top bottom" → "top 25px"         | every stacked box: landing, keyword/ideas pages, Your videos, pricing                                                   |
| 2   | Line stagger            | SplitText lines from y 100px, scale .95; expo.out 1s, delay .3, stagger .12; play on enter, reverse on scroll back | every page title and section heading                                                                                    |
| 3   | Typed word              | ~90ms a letter, backspace, hold, next word; caret blinks .7s                                                       | landing poster word ("UNPOSTED / ON PAUSE / TOO QUIET"), header "Let's make\|", idea placeholders on landing and Create |
| 4   | Sheet sweep             | from x −110%, scale .92, rotate 4°, radius 30; expo.inOut 1s; close is the reverse                                 | Create box on load, all Create sheets, player, voiceover editor, account sheet, delete confirm, sign-in panel           |
| 5   | Colour comes in         | from grayscale(1), scrub 1, "top bottom" → "top top"                                                               | thumbnails in Your videos, the landing showcase, the Look sheet preview                                                 |
| 6   | Press-in                | see Shape                                                                                                          | every button, link-button and icon button                                                                               |
| 7   | Stacked names           | Fraunces 300 at 50–60% white, overlapping (lh .62); hover/focus/selected: 900, navy, −4px, white 1px shadow; .3s   | landing looks, Look sheet                                                                                               |
| 8   | Step reveal             | each step from opacity 0, scale 0; expo.out 1s; last step waits 1s                                                 | video being made (Writing script → Final cut), Create a voice steps                                                     |
| 9   | Marquee + smooth scroll | endless vertical list, linear 18s; landing scroll smoothed (Lenis duration 1.2, ease `1.001 − 2^(−10x)`)           | landing only; app screens scroll natively                                                                               |

#### B.2 Every flow, screen by screen

Boards are on the B0 canvas. "Derived" means no board of its own: it is built from the named board's parts with no new pattern, so it needs no extra canvas.

| Flow / route                                                                | States that must be drawn in code                                                                                                                                                                                       | Boxes treatment                                                                                                                                                                                                                                                                                                                                                                                                                                   | Board                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Shell: header** (all signed-in pages)                                     | signed out (Sign in · Start free), signed in (New video / Your videos · credits pill · avatar), active page                                                                                                             | box mark left; press-in nav links in Inter 600 uppercase; dark `#212121` credits pill → `/pricing`; blush avatar circle. Landing header adds the typed "Let's make\|" button.                                                                                                                                                                                                                                                                     | Create, Home, Main           |
| **Shell: account menu / sheet**                                             | closed, open (desktop menu, phone bottom sheet): name, theme toggle, My voices, Pricing, Sign out                                                                                                                       | dark box sweeping in; under-line rows; theme toggle as two blush/ink pills (Light · Dark · System)                                                                                                                                                                                                                                                                                                                                                | derived (Player)             |
| **Shell: phone "+"**                                                        | visible on Your videos and voices, hidden on Create                                                                                                                                                                     | 64px ink square, 8px radius, blush plus, shadow `10 10 24 /.35`                                                                                                                                                                                                                                                                                                                                                                                   | PhoneHome                    |
| **Shell: footer** (landing, pricing, legal, keyword, ideas)                 | —                                                                                                                                                                                                                       | dark box: Urbanist "The video studio for faceless channels", footer idea form (under-line + blush Make it), handwritten "Go on... post one today!", giant SHORTCRAFT, Urbanist links split by 1px blush rules                                                                                                                                                                                                                                     | Main, PhoneLanding           |
| **Landing** `/`                                                             | signed out, signed in (form goes to Create), showcase videos present / missing (drawn frames)                                                                                                                           | blush hero box with the 3-line Fraunces headline (line stagger); SHORTCRAFT poster with look-filled letters (hover lift) and two notes; under-line idea form (GET, `?idea=` contract unchanged); ember "Your channel is UNPOSTED · We can help" box with the tilted week; blush "You bring the idea" box with marquee and frosted 3-step card; sky "Mind if we show off?" looks box; pricing teaser (3 tilted boxes from `plans.ts`); dark footer | Main, PhoneLanding           |
| **Sign in / sign up** `/login`                                              | sign in, sign up, show password, Google button, field error, wrong password, "check your email", carrying `?idea=`                                                                                                      | split: hero-gradient box with HELLO poster + "Your next Short is one idea away" + note; dark box (sweep) with Sign in / Create account pill tabs, under-line fields, Show, blush submit, Google as a press-in outline button, errors in `--ember-ink` on a blush strip                                                                                                                                                                            | Login                        |
| **Create** `/create`                                                        | empty, typing, Surprise me, first-video prefill ("Your first video is one tap away"), `?theme/idea/len/tier/voice` prefill, submitting, error + retry                                                                   | ember box sweeps in; eyebrow "New video", "What's it about?"; under-line idea input with typed placeholders; Surprise me link; 4 setting pills (Look · Length · Quality · Voice; a non-default pill gets a blush tint); blush **Make video** (Fraunces 48); cost in a dark pill under it; one cyan note                                                                                                                                           | Create, PhoneCreate          |
| Create: not enough credits                                                  | short balance                                                                                                                                                                                                           | Make video becomes "Get credits" (→ `/pricing`); dark pill reads "About 2,024 credits · you have 1,200"                                                                                                                                                                                                                                                                                                                                           | derived (Create)             |
| Create: plan-locked option picked                                           | locked length or Premium picked                                                                                                                                                                                         | pill shows a lock; under the button a blush strip "Pro unlocks 90s · €29.99" with "See the Pro plan" and "Use 30s instead"                                                                                                                                                                                                                                                                                                                        | derived (Create)             |
| Create: topic blocked                                                       | 422 `moderation_blocked`                                                                                                                                                                                                | blush strip under the input, `--red-deep` text, friendly reason; input keeps its text                                                                                                                                                                                                                                                                                                                                                             | derived (Create)             |
| **Create: Look sheet**                                                      | open, hover preview, selected, close (Done, Escape, ×)                                                                                                                                                                  | sky box sweeps in; "Pick a look"; 8 stacked names as a radio group; live 9:16 preview (colour comes in), name, blurb; blush Done                                                                                                                                                                                                                                                                                                                  | CreateLook                   |
| Create: Length sheet                                                        | 15/30/60/90/120s, locked ones with plan                                                                                                                                                                                 | blush box sweeps in; lengths as big League Gothic numbers in press-in tiles; locked tiles show a lock and the plan name                                                                                                                                                                                                                                                                                                                           | derived (CreateLook)         |
| Create: Quality sheet                                                       | Standard, Premium (locked on Starter)                                                                                                                                                                                   | blush box; two tilted choice boxes (Standard blush, Premium ember), Pro badge when locked                                                                                                                                                                                                                                                                                                                                                         | derived (Pricing)            |
| Create: Voice sheet                                                         | My voices first + "Create a voice" tile, 8 catalog voices, ▶ preview playing, Speed and Delivery segments, Done                                                                                                         | sky box; voice rows like My voices (ink ▶ circle, Fraunces name); segments as blush/ink pills; "Included in every video. No extra credits." beside Done                                                                                                                                                                                                                                                                                           | derived (Voices, CreateLook) |
| **Your videos** `/gallery`                                                  | first visit (empty: Today's idea + 3 starters), video being made, ready, posted, failed (refunded, Try again / Get credits to try again), blocked ("Try a different idea"), v2 badge, ≥12 videos (filter chips), streak | big Fraunces title + streak note; blush Today's idea box (dark Make it, Another idea, settings line) with the video being made on a frosted card (step reveal, progress, status announced); sky "This week" box, 9:16 cards with chips (Ready blush, Posted ink, Didn't finish red), colour comes in; filters as press-in pills                                                                                                                   | Home, HomeDark, PhoneHome    |
| **Player sheet**                                                            | playing, paused, posted toggled, copy done, owner vs not, v2                                                                                                                                                            | dark box sweeps in; 9:16 player with 40/40/80 shadow; Urbanist meta; Fraunces title; caption; blush Download; press-in Copy title + caption, Mark as posted, Edit voiceover; tomorrow's idea + "Make another like this"; orange note                                                                                                                                                                                                              | Player, PhonePlayer          |
| **Voiceover editor**                                                        | rows per scene, edited (blush tint + "Edited"), too long (amber count, Make new version disabled), hear this line, voice inline, submitting                                                                             | wide dark box (full screen on phones): video left; scene rows as surface strips with thumbnail, under-line Fraunces field, ▶ Hear this line, count; footer dark pill "1 scene changed · About 423 credits · you have 12,480"; blush Make new version                                                                                                                                                                                              | derived (Player, Voices)     |
| **My voices** `/voices`                                                     | none yet, list, at the limit (Create a voice disabled + notice), rename inline, delete confirm ("Videos you already made keep their voice")                                                                             | blush box: "N of M on <plan>", "My voices", rows with ink ▶, Fraunces name, meta, press-in Rename/Delete; confirm is a small dark box that sweeps in                                                                                                                                                                                                                                                                                              | Voices                       |
| **Create a voice** `/voices/new`                                            | step 1 describe (4 starter chips, refused "sounds like…" message), designing, step 2 three samples, name, saving, saved → "Make a video with it"                                                                        | ember box; "Step 1 of 2 / Describe a voice" with under-line description and blush "Hear 3 samples · 325 credits"; step 2 "Pick a voice": 3 sample boxes as a radio group (picked one blush + tilted), under-line name, blush Save voice, dark cost pill, cyan note; steps use step reveal                                                                                                                                                         | Voices                       |
| **Pricing** `/pricing`                                                      | signed out, signed in (current plan marked), checkout loading, top-ups, waiver checkbox                                                                                                                                 | title stagger + note; Starter (blush, −1°), Pro (ember, shadow), Ultra (blush, +1°) with Fraunces prices; dark top-up box with League Gothic 20K/60K/150K tiles; refund line                                                                                                                                                                                                                                                                      | Pricing                      |
| **Ideas** `/ideas`, `/ideas/[theme]`                                        | index of 8 looks; one look with its ideas                                                                                                                                                                               | index = the landing looks box (stacked names → each links to its page); theme page = hero-gradient box with the look name, ideas as blush rows each with "Make it" (→ `/create?theme&idea`), footer                                                                                                                                                                                                                                               | derived (Main)               |
| **Keyword pages** `/ai-tiktok-video-generator`, `/faceless-video-generator` | breadcrumb, sections, related links                                                                                                                                                                                     | marketing scale: hero-gradient box + heading stagger, sections as alternating blush / sky boxes with section pop, idea form, footer                                                                                                                                                                                                                                                                                                               | derived (Main)               |
| **Legal** `/terms`, `/privacy`                                              | long text, section nav                                                                                                                                                                                                  | ground page, Fraunces 72 title, Inter 17/1.6 body in a 720px column, section nav as press-in links; no motion beyond the title                                                                                                                                                                                                                                                                                                                    | derived (System)             |
| **Not found** and **error** (`not-found`, `global-error`)                   | 404, error with retry                                                                                                                                                                                                   | ember box with a League Gothic "404" / "OOPS" poster (text-shadow `#5F151F`), one Fraunces line and one blush button home / Try again                                                                                                                                                                                                                                                                                                             | derived (Main)               |
| **Theme**                                                                   | light (default), dark, system                                                                                                                                                                                           | dark partner per the token table; boxes keep their gradients except sky, which deepens                                                                                                                                                                                                                                                                                                                                                            | HomeDark                     |
| **Phones (390)**                                                            | every route above                                                                                                                                                                                                       | boxes 8px from the edge; type drops to the phone sizes in B.1; setting pills scroll sideways; sheets are full screen; the player is full screen                                                                                                                                                                                                                                                                                                   | Phone\* boards               |

#### B.3 Implementation plan (one PR, `ceo-design/boxes`, commits in this order)

The owner asked for the whole redesign in **one PR**. No API, credit, billing, provider or migration changes; every page keeps its data flow and server rendering.

- [ ] **B1 Tokens, fonts, mark:** new values in `globals.css` (same names, plus `--grad-*`, `--red-deep`, `--shadow-red`, `--sky`, `--navy`, `--yellow`), 8px/50px radii, the press-in and under-line utilities; `next/font` for Fraunces, Inter, League Gothic, Urbanist, Shadows Into Light Two in `layout.tsx`; light becomes the default in `theme.ts` and the no-flash script; new mark in `brand-mark.tsx` and `icon.svg`.
- [ ] **B2 Motion kit:** `gsap` dependency; `src/components/motion/*`: `<Pop>`, `<SplitLines>`, `<Typed>`, `<ColourIn>`, `<StepReveal>`, `<Marquee>` and `<SmoothScroll>` (landing only); `Sheet` gets the sweep. Each one renders its final state on the server and does nothing under reduced motion.
- [ ] **B3 Primitives:** `Button` (blush, ink, ember-box and press-in variants), `Badge`/chips, under-line `Field`, `Box` (ember / blush / sky / hero / dark), handwritten `Note` (`aria-hidden`).
- [ ] **B4 Shell:** header, account menu/sheet, phone "+", footer.
- [ ] **B5 Landing**, then ideas, keyword, legal, not-found and error pages.
- [ ] **B6 Sign-in / sign-up.**
- [ ] **B7 Create** and its four sheets plus every state in B.2.
- [ ] **B8 Your videos**, player sheet and voiceover editor.
- [ ] **B9 My voices** and Create a voice.
- [ ] **B10 Pricing.**
- [ ] **B11 Check:** `format:check`, `lint`, `typecheck`, `test`, `next build` in mock mode; axe on every route in light, dark and at 390px; keyboard pass on every sheet; reduced-motion pass; Lighthouse on the landing (fonts subset, `display: swap`); screenshots per route in `docs/design/boxes/` next to the matching canvas board.

### Later (out of the current charter, needs owner sign-off)

Home dashboard · fuller onboarding (beyond the one-tap first video).

---

## 5. Rules for the Design CEO routine

- **Read first:** `TheMasterPlan.md`, then this file, then `git log -20`, open and recent PRs (`gh pr list --state all --limit 20`), and the canvas comments when the canvas is reachable.
- **One item per run:** take the top unchecked item in §4 that is not already in an open `ceo-design/*` PR. Prefer improving an open design PR over starting a new one.
- **Approval gate:** never open a code PR for a screen whose canvas item is not `[✓]`. Only Tudor sets `[✓]`, through a canvas comment or an edit to this file.
- **Files it may change:** `src/app/create/**`, `src/app/gallery/**`, `src/components/**`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` + `src/components/landing/**` (landing, owner-approved 2026-10-10), `public/**`, this file, and the Design-track lines of `TheMasterPlan.md`. For journey B (owner-approved 2026-10-14) it may also change the view files of `src/app/login/**`, `src/app/pricing/**`, `src/app/voices/**`, `src/app/ideas/**`, the keyword pages, `src/app/terms|privacy/**`, `src/app/global-error.tsx`, a new `src/app/not-found.tsx`, `src/app/icon.svg` and `package.json` (for `gsap`). Small read-only data helpers for D2 are allowed. It never touches `src/features/credits|billing`, migrations, webhooks, providers or pricing.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` all pass in mock mode. Every page still works with JavaScript-light server rendering, and both themes reach AA.
- **Output:** a digest with what moved, the canvas and PR links, what is waiting on Tudor, and the next item.

---

## 6. Links

- Design canvas (D0 Direction): https://claude.ai/artifact/3gMxoCVVP4AKatSL7bJZYJ — three directions (A Paper & Ember, B Night Studio, C Sage Room), Create + Library each, light + dark. Private to Tudor; share it from its Share menu if a routine or teammate must read it.
- D1 Create canvas: https://claude.ai/artifact/P9KyYHKzwai14M61UvsKce: 16 artboards (4 layouts + 6 states × 2 themes), built on the Paper & Ember tokens, credit numbers from the real estimator. Private to Tudor.
- D2 Library canvas: https://claude.ai/artifact/SA65b6TeMc6TT139s8kPwT: 8 artboards (grid at 1440/1024, player sheet, empty Library × light/dark). Private to Tudor.
- Landing canvas: https://claude.ai/artifact/NpzYH2qhCUUdffN1vT1FcC: 4 artboards (1440 + 390, light/dark). Private to Tudor.
- D3 Mobile canvas: https://claude.ai/artifact/JSKAz555Rkng6FqWR1HbA7: 6 phone artboards (Create and Library light/dark, player sheet, Account sheet). Private to Tudor.
- Design system (Paper & Ember): https://claude.ai/artifact/VZML2hgEyRes35PbWopudn: tokens (light + dark), type, spacing, radii, shadows, brand book, mark, and Button / ChoiceCard / Segmented / Chip / Progress / VideoCard. The source of truth for every design and for the D0 code tokens.
- D2.1 blocked-card canvas: https://claude.ai/artifact/KHgF5y7UMevAQvzhu6FYYQ: 4 artboards (Library 1440 + 390, light/dark) showing the new card next to the shipped ready, in-progress and failed cards. Private to Tudor.
- Voice Studio canvas (journey V): https://claude.ai/artifact/RGGjuaD9kq5wxaQKPsg4C1: 10 artboards (journey map; Voice sheet dark/light/phone; voiceover editor dark/light/phone; Create a voice, My voices at the limit, phone describe step), Studio tokens. Private to Tudor.
- Calm & Clear canvas (journey S): https://claude.ai/artifact/9GkURdvSAnYC2obP4EdnqG: 10 artboards (journey map, Create light, look picker dark, Home light/dark, phone Create and Home, three looks), on the Paper & Ember tokens. Private to Tudor.
- Boxes canvas (journey B): https://claude.ai/artifact/Va66qwzLQpCNKmya8GwepU: 15 artboards (landing 1440 + 390, system, motion lab, Create, Look sheet, Your videos, player, voices, pricing, sign-in, Your videos dark, three phone screens), interactive where marked. Private to Tudor.
- Main CEO routine: `trig_01HJ4PZK4zLRutuBCtMST2Wx` · Design CEO routine: `trig_01T9k9zrSgLbcPa6noXKAr8P` (https://claude.ai/code/routines/trig_01T9k9zrSgLbcPa6noXKAr8P)

---

## 7. Changelog

- **2026-10-14** — Tudor approved the B0 Boxes canvas and all five recommendations. §4 B now holds the full system (tokens, type, shape, motion), a flow-by-flow table covering every route and state, and a one-PR implementation plan (B1–B11). The charter rows for "home", scope and theme are updated. (Design CEO, interactive)
- **2026-10-14** — New journey **B: Boxes** from Tudor's brief (match lil-boxes.com). Measured the site's CSS and GSAP config, mapped it onto every screen and published the B0 canvas (15 artboards, motion lab included). Waiting on Tudor's approval and the decisions in §8; no code yet. (Design CEO, interactive)
- **2026-10-13** — V2 and V3 shipped (#76, #77) and the S3 shell is on `main` (#78). V4 (Create a voice + My voices) is in review. (Design CEO, interactive)
- **2026-10-13** — S3 shell re-landed: #69 had merged into its old base branch (`ceo-design/s2-home`) instead of `main`, so its commit was reapplied onto `main` in a new PR. (Design CEO, interactive)
- **2026-10-13** — Tudor approved the V0 Voice Studio canvas and the four recommendations. V2 (Voice pill + sheet on Create) and V3 (Edit voiceover + v2 badges) are in review. (Design CEO, interactive)
- **2026-10-13** — V0 Voice Studio canvas published (10 artboards, Studio look) with a design-side implementation plan for V2–V4 and four open questions. Waiting on Tudor. (Design CEO, interactive)
- **2026-10-13** — Voice Studio added to the design scope (owner request): §4 V lists the Voice sheet, the voiceover editor and Create a voice. Canvas next. (CEO, interactive)

- **2026-10-13** — Tudor picked **Look B, Studio** and asked for every screen to adapt. Shipped as four stacked PRs: tokens (#66), Create (#67), Home (#68), shell (#69). axe found 0 violations on every screen in dark, light and at 390px. (Design CEO, interactive)
- **2026-10-13** — Pastels rejected too. Boards 8–10 replaced with three complete looks (Gallery, Studio, Soft contrast). The layout is more dynamic and less crowded: a big idea headline, the latest video large and one row of videos. (Design CEO, interactive)
- **2026-10-13** — Tudor rejected the first palette set (too similar, too crowded) and picked a soft pastel direction. Boards 8–10 now show Rose, Mint and Lavender, one sparse screen each. (Design CEO, interactive)
- **2026-10-13** — Tudor asked for a more natural palette ("seems a bit vibe coded"). Three options (Linen & Moss, Stone & Clay, Paper & Slate) added to the Calm & Clear canvas as board 8, contrast-checked in both themes. Recommended: Linen & Moss. (Design CEO, interactive)
- **2026-10-13** — New journey **S: Calm & Clear** from Tudor's brief. Audited the shipped Create and Library and published a proposal canvas (one path: idea → make → watch → post; one ember action per screen). Waiting on Tudor's approval and the open questions in §8. (Design CEO, interactive)
- **2026-10-13** — Tudor approved the four follow-ups plus real landing videos, straight to code. All five shipped the same day (PRs #55–#59). (Design CEO, interactive)
- **2026-10-13** — D2.1 shipped (PR #51). Every roadmap item in the charter is now shipped. The Design CEO routine is to be paused (decision 4) until Tudor picks one of the Later items. (Design CEO, interactive)
- **2026-10-12** — Tudor approved the D2.1 canvas. The code is in review on `ceo-design/d2-blocked-card`. Once it ships, the routine pauses (decision 4). (Design CEO, interactive)
- **2026-10-12** — D4 part 2 marked shipped (PR #45). D0–D4 are now all shipped; what is left needs a person (screen-reader run) or a paid image run (theme stills). Picked up the one design item TheMasterPlan still assigns to this track, a friendly Library card for videos the safety check stopped: canvas published for review (D2.1). (Design CEO, routine)
- **2026-10-11** — Landing (#43) and D3 (#44) shipped. D4 part 2 (phones + landing) in review on `ceo-design/d4-mobile-audit`. Left: a real screen-reader run by a person, theme sample stills (needs a live image run), and the Later items (pricing and auth screens, home dashboard). (Design CEO, interactive)
- **2026-10-11** — D3 mobile code in review on `ceo-design/d3-mobile` (stacked on the landing PR). (Design CEO, interactive)
- **2026-10-11** — Tudor approved the Landing and D3 canvases. Landing code is in review on `ceo-design/landing`; D3 code follows. (Design CEO, interactive)
- **2026-10-11** — The Landing and D3 canvases (PR #40) are still waiting on Tudor, so the routine took D4 for the shipped desktop loop. axe was clean in both themes, and 8 manual findings were fixed on `ceo-design/d4-a11y-audit` (report in `docs/design/d4-a11y-audit.md`). (Design CEO, routine)
- **2026-10-10** — D2 shipped (PR #39). Tudor added the landing page to the scope ("continue with d3 after redesigning the landing page"). Landing and D3 mobile canvases published, both waiting on approval (§8). (Design CEO, interactive)
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

- **B Boxes approved** (2026-10-14, owner: "i like it … with your recommendation … one PR, all pages"). All five recommendations accepted; the answers are in brackets:
  1. Boxes is loud by design, which reverses the charter's "calm studio, the UI stays quiet so the videos carry the colour". Replace that line with "playful boxes: bold colour blocks, big type, motion"? [yes, it is what was asked; the S layout rules keep each screen to one action, so it stays easy to use]
  2. Display face: lil-boxes uses **Humane**, a paid Pangram Pangram font. Buy a web licence, or use **League Gothic** (free, OFL, drawn on the canvas)? [League Gothic now; swap to Humane later by changing one token if you want the exact look]
  3. Light becomes the default and dark the partner (today it is dark-first Studio)? [yes, lil-boxes is light and its colour boxes need the light ground]
  4. Smooth scroll (ScrollSmoother/Lenis) on the landing only, with the app screens scrolling natively? [yes, smooth scroll fights the video player and form inputs]
  5. Keep the S copy ("Your videos", "Make video", "Today's idea") and add the handwritten notes only on the landing, Create, Your videos and pricing, at most one per screen? [yes]

- **Voice Studio in the design scope** (2026-10-13, owner: "add to the plan as recommended") → voice becomes a 4th setting pill, so it fits the S journey (pills that remember the last choice) instead of adding a new section to Create. Editing happens after the video exists, inside the player, where the creator notices the problem. Product and pricing decisions are in TheMasterPlan §11.

- **S Calm & Clear decided** (2026-10-13, owner: "lets go with look B studio dark, violet. i need all screens to adapt to the new look. start implementing"). The questions below were answered with that decision; my recommendations are in brackets:
  1. Collapse look, length and quality into three pills that open small sheets, instead of showing every option at once? [yes; the last choices are remembered, so most days nobody opens them]
  2. Drop the big phone preview on desktop Create (the look sheet shows each look instead)? [yes]
  3. Merge Tomorrow's video and the 3-idea row into one "Today's idea" card with an "Another idea" link? [yes]
  4. Hide the filter chips until a creator has 12 or more videos? [yes]
  5. On phones, replace the 3-tab bar with Home plus one floating "+" button (Account moves to the avatar)? [yes]
  6. Rename "Library" to "Your videos" everywhere? [yes]
  7. **Look and palette.** Decided 2026-10-13: **Look B, Studio** (charcoal, off-white, soft violet; Geist only). Earlier rejected: earthy naturals (too similar), soft pastels, and the Gallery and Soft-contrast looks.

     The looks are:
     - **Gallery:** white, near-black text, cobalt `#2F54EB`.
     - **Studio:** charcoal, off-white text, soft violet `#A78BFA`.
     - **Soft contrast:** warm grey, near-black, coral `#FF5B37` used only as a fill, with dark text on it.

     All three use one sans-serif (Geist) only, with neutral chrome so the videos carry the colour. All text pairings pass 4.5:1.

     Each uses a pastel button with dark text, and every text pairing passes 4.5:1. The dark versions get drawn once one is picked. The chosen palette replaces the Paper & Ember colour tokens, and the mark and favicon take its accent.

     The chosen palette replaces the Paper & Ember colour tokens in `globals.css` and the design system. The mark and favicon take the new accent.

- **D2.1 blocked-video card approved** (2026-10-12, owner: "D2.1 approved"), with the recommended answers:
  1. Blocked cards offer **"Try a different idea"** instead of "Try again" (the same topic would very likely be blocked again).
  2. **One generic reason line** ("The script asked for images Shortcraft doesn't make"), not one per category: calmer, and it never hints at what was asked.
  3. Blocked cards stay under the existing **Failed** filter (the canvas drew it as "Didn't finish"; the shipped label stays).
  4. **Pause the Design CEO routine once D2.1 ships**, as §1 says.

- **Landing and D3 canvases approved** (2026-10-11, owner: "approve everything and start implementing"), with the recommended answers:
  - Landing: (1) headline "Post a Short every day without showing your face."; (2) the hero idea box carries the idea through sign-up into Create (one change in `src/app/login`); (3) a pricing teaser with the real plans, linking to /pricing.
  - D3: (1) no big preview on phone Create; the selected theme card and the sticky cost + Generate bar carry it; (2) themes and Today's ideas scroll sideways on phones; (3) Account opens as a bottom sheet.
  - Real theme sample stills still need a paid image run, which can't happen in a mock-mode session. They stay drawn until a live run is set up.

- **Landing page added to the design scope** (2026-10-10, owner) → the landing inherits Paper & Ember and gets its own canvas → approval → code item (L). Pricing and auth screens stay in Later.

- **D4 audit runs before D3** (2026-10-11, routine) → the D3 and Landing canvases are gated on Tudor. D4's desktop half covers code that has already shipped and been approved, and it changes nothing visible, so it needs no new canvas. The mobile/landing half waits for D3 and L.

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
