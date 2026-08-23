# Handover — UI redesign (dashboard → newspaper)

Working doc for whoever picks this up. Approved plan lives at
`~/.claude/plans/other-hazy-blossom.md`; this file tracks execution against it.

**Last updated:** 2026-08-23
**Branch:** `redesign/phase-1-foundation` (branched from `main` @ `96dd730`)
**State:** All three phases implemented and verified.

---

## Why this work exists

The functional bug-fix round is merged (PR #1). The user then asked twice for a "state of the art
news app" and said the current UI "won't look good to recruiters" — this is a **portfolio piece**,
so the UI is the deliverable. The app currently reads as a dark admin dashboard that happens to
contain news.

### Decisions already made with the user (do not relitigate)

| Question | Chosen |
|---|---|
| Styling approach | **Adopt Tailwind** (it was already installed and configured but unused) |
| Ambition | **Refactor + editorial redesign** — not a bugfix-only pass, not a full rebuild |
| Empty pages | Auto-load `/stocks` + `/weather`, **add a price chart**, **add a watchlist** |
| Landing page | **Replace with a real front page** (lead story + grid + markets/weather strip) |

**Also standing:** the user does not want AI attribution in commits or PR bodies for this repo —
no `Co-Authored-By: Claude`, no "Generated with Claude Code" footer. It's a portfolio repo that
recruiters read. See `~/.claude/projects/.../memory/no-ai-coauthor-in-commits.md`.

---

## Phase 1 — Foundation ✅ DONE

| File | What changed |
|---|---|
| `tailwind.config.js` | Rewritten: `darkMode: "class"`, semantic colors → CSS vars, `fontFamily` mapping, 1.25-ratio `fontSize` scale, `maxWidth.page` |
| `app/globals.css` | Design tokens as CSS vars (`:root` dark + `.light`), `:focus-visible` ring, `prefers-reduced-motion`, `.no-scrollbar`, `.tabular` |
| `app/layout.tsx` | Registered `Newsreader` serif; moved font vars to `<html>`; fixed pre-existing `React.ReactNode` lint error |
| `components/ui/*` | **New** — `cn`, `Card`, `Button`, `SelectField`/`TextField`, `PageHeader`/`EmptyState`/`ErrorBanner`/`Skeleton`, `Icon` (14 SVG icons) |
| `components/Header.tsx` | Rewritten in Tailwind; **mobile nav overflow fixed** |
| `components/ArticleCard.tsx` | Deleted (was dead) then **rewritten** with `lead`/`feature`/`compact` variants |
| `components/Navbar.tsx` | **Deleted** — was dead code, byte-identical to Header's nav |
| `lib/format.ts` | **New** — `relativeTime`, `truncate`, `PLACEHOLDER_IMAGE`, `money`, `compactNumber`, `percent` |
| `package.json` | Dropped `d3` + `@types/d3` (zero usage; all charts are recharts) |

### Gotchas already hit and solved — do not regress these

1. **Fonts: Preflight vs next/font.** Geist rendered as **Times**. Tailwind Preflight sets
   `font-family` on `<html>`, but `next/font` puts `--font-geist-sans` on whatever element gets its
   generated class. With the class on `<body>`, the variable was undefined at `<html>`, the whole
   declaration was invalid, and everything inherited the browser default serif. **Fixed two ways:**
   font variable classes moved to `<html>`, *and* an explicit `font-family` on `body` in
   `globals.css`. Verify with `getComputedStyle(document.body).fontFamily` → must start `Geist`.

2. **Tailwind v3.4 cannot do opacity modifiers on `currentColor`.** `border-current/40` and
   `bg-current/10` silently do nothing. Use a real token (`border-danger-line`, `hover:bg-danger-line/20`).

3. **`line-clamp-*` is built into Tailwind 3.3+.** Hand-rolled `@layer utilities` versions were
   removed — re-adding them shadows the real ones.

4. **Contrast was verified numerically, not by eye.** Every text/background pair in both themes
   clears WCAG AA 4.5:1. Light-mode `--positive` had to be darkened `#15803d` → `#166534` (was 4.40:1
   on `raised`). If you change a token, re-run the check in "Verification" below.

---

## Phase 2 — Rebuild pages on the primitives ✅ DONE

- [x] `components/Header.tsx`
- [x] `components/ArticleCard.tsx` + `components/ArticleThumb.tsx`
- [x] `app/news/page.tsx` (625 → 458 lines)
- [x] `app/stocks/page.tsx`
- [x] `app/weather/page.tsx`
- [x] The three recharts components — colours moved onto theme tokens, emoji headings replaced

**Result: 190 inline `style={{}}` objects across the four pages → 1** (the weather condition
gradient, which is legitimately dynamic). `className` went 0 → 124.

### What the news page rewrite did (for reference)

- Keep **all existing logic untouched**: URL-backed category state, `fetchArticles`, cursor
  pagination, search, the dev-only ingest button. This is a presentation change.
- Swap inline styles → Tailwind; delete every `onMouseOver`/`onMouseOut` in favour of
  `hover:`/`focus-visible:` (this is what finally makes hover keyboard-reachable).
- **Hierarchy:** article 0 → `lead`, next few → `feature`, tail → `compact`.
- **Category strip** must be a horizontally scrollable row (`.no-scrollbar`), *not* wrapping — at
  390px it currently collapses into a ragged 3-row block with the search button stranded mid-row.
- **Article grid:** `minmax(320px, …)` overflows sub-360px phones. Use `minmax(280px, …)` / single
  column below 400px.
- **Finish the ARIA tabs**: they have `role="tab"` + roving tabindex + arrow keys, but **no
  `aria-controls` and no `role="tabpanel"`** — currently an incomplete widget.
- Give the emoji-only buttons (`🔍` toggle, `✕` close, `📰` dev ingest) real `aria-label`s and
  replace the emoji with `<Icon>`.
- Move `relativeTime`/`truncate`/`PLACEHOLDER_IMAGE` imports to `@/lib/format` (already extracted).

---

## Phase 3 — Empty pages + front page ✅ DONE

### `/stocks` — verified API facts (checked live, don't re-derive)

- Free tier limit is **100 requests/day** (`x-api-ratelimit-limit: 100`). Ten per-symbol quote calls
  per page load would exhaust it in ten visits.
- **`GET /v1/stocks/bulkquotes/?symbols=A,B,C…` returns all symbols in ONE request** and came back
  HTTP 203 with `x-api-ratelimit-consumed: 0` (delayed data, not billed). Response is parallel
  arrays: `{s, symbol[], last[], change[], changepct[], volume[], …}`.
- **`GET /v1/stocks/candles/D/{symbol}/?from=&to=`** works — returns `{s, t[], o[], h[], l[], c[], v[]}`;
  22 daily points for a one-month range. This is what the chart uses.
- **Therefore:** one cached route (`revalidate: 60`) doing one bulk call. **Never fan out per symbol.**
- New routes to add: `app/api/stocks/watchlist/route.ts`, `app/api/stocks/[symbol]/candles/route.ts`.

### `/weather`

One-line behavioural fix: `loadUserLocation()` already resolves coordinates and prefills the search
box but deliberately does **not** fetch. Call `searchByCoords()` with those coordinates so the page
shows weather on arrival instead of an empty "Search for a City" screen.

### `/` front page

Replace the SaaS hero + "Features" checklist with a real front page. Note the current copy is
**factually wrong**: it advertises "NYT, NewsAPI and more" (NewsAPI is dev-only in production; BBC
is now a primary source) and "With Recharts visualizations" (names an internal library to end users).
Removing the three copy-pasted 29-line blocks and six 11-line feature rows drops ~71 lines. Can
become a Server Component once the hover handlers are gone.

---

---

## How to verify

```bash
cd "/Users/owner/Dropbox/My Resume/Code/newspaper/newspaper-nextjs"
npx tsc --noEmit
npx eslint app components lib
npm run build && npm run start      # production build ≈ what Vercel serves
```

Note `.env.local` points at the **production MongoDB** — local runs read and write live data.

### Driving a browser

The `claude-in-chrome` extension was **not connected** in this session. Two workarounds that worked:

1. `chrome-devtools` MCP tools — worked initially, then became unresponsive after several tabs.
2. **Headless Chrome over CDP — most reliable.** Launch it yourself and talk to it directly:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9222 --user-data-dir=/tmp/ui-profile --no-first-run --disable-gpu about:blank &
```

A ready-made driver is at `/tmp/shot.mjs` (may be gone if `/tmp` was cleared — it's ~20 lines using
Node's global `WebSocket`; args: `url out.png width height [jsExpression]`, `out` of `-` skips the
screenshot). Node 25 has `WebSocket` built in, so no `ws` dependency is needed. `Emulation.setGeolocationOverride`
+ `Browser.grantPermissions` is how the weather geolocation path gets tested.

Before/after screenshots of the **old** UI are in `/tmp/ui-shots/`; new ones in `/tmp/ui-after/`.

### Contrast check (re-run if you touch a colour token)

Compute WCAG ratios for every `ink`/`accent`/`positive`/`negative` against `canvas`/`surface`/`raised`
in both themes; all must be ≥ 4.5:1.

### Must not regress (from the merged bug-fix round)

All 7 category tabs return articles · load-more paginates without duplicates · search scopes to
category · currency dropdown has ~30 options · `BRK.A` converts · weather autofills
"North Vancouver, British Columbia, CA" and resolves.

---

## Gotchas hit during Phase 2/3 — do not regress

5. **Server Components cannot receive event handlers.** The front page is a Server Component, and
   `ArticleCard`'s `<img onError>` broke it with *"Event handlers cannot be passed to Client
   Component props"*. Fixed by extracting `components/ArticleThumb.tsx` as a `"use client"` island
   so `ArticleCard` — and the front page — stay server-rendered. Don't inline the img back.

6. **`md:h-full` on a grid child resolves against an auto-height row**, falls back to `auto`, and the
   image then uses its intrinsic height — the lead story rendered ~620px tall. Lead images use a
   fixed `aspect-[16/10]` at every breakpoint instead.

8. **Recharts colours tooltip item text with the series/slice fill.** On the pie, a dark slice
   (Fog `#64748b`) on a dark tooltip was unreadable. Every chart now pins
   `itemStyle`/`labelStyle` to `var(--ink)` / `var(--ink-muted)` rather than relying on the default.
   The pie also still had a `rgba(0,0,0,0.8)` tooltip background that the first theming sweep missed.

9. **Article counts are chosen so grid rows fill.** 1 lead + **9** cards = three complete rows of
   three. It was 8, which left the last row with a gap. If the grid ever becomes 4-up, this needs
   to change with it.

7. **The weather condition gradients used to paint the whole page**, and two of them (`fog`, `snow`)
   ended near-white under hardcoded white text. They are now scoped to the hero card and every stop
   is dark enough to carry white text.

---

## Open items / judgement calls left

- **Light mode has tokens but no toggle yet.** The `.light` class is defined and AA-verified;
  nothing sets it. Plan flags the toggle as the easiest thing to cut.
- **Weather page gradient hazard (pre-existing):** `app/weather/page.tsx` sets a data-driven
  background, some gradients light (`fog`, `snow`), with hardcoded white text over them. Should be
  resolved by the token work rather than carried forward.
- **Not committed yet.** Ask before committing/pushing. The plan called for three PRs matching the
  phases; since all three are now implemented together, either split them back out or land as one
  reviewed PR — the user's call.
- **Chart axis labels on /weather are cramped and rotated** at narrow widths. Cosmetic, not fixed.
- **The `compact` variant is text-only by design.** A long single-column list of image cards read as
  though the design had given up partway down; it is now an "In brief" section in 2–3 columns, which
  is a deliberate second register and scales to any tail length. Home and /news share it.
- `PROJECT_SUMMARY.md` is stale (documents `/api/weather?location=`, predates several routes).
  Out of scope unless asked.
