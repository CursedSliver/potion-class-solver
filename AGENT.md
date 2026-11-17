# AGENT.md

Web app for solving the potion-recipe problem described in `README.md`. Design decisions are
documented in `REPORT.md`.

## Commands

- `npm run dev` — esbuild watch + static server on http://localhost:3000. The server sends
  `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers because Z3's WASM build
  uses pthreads and needs `SharedArrayBuffer` (a cross-origin-isolated page).
- `npm run build` — production build into `dist/` (also copies the Z3 script/WASM).
- `npm run typecheck` — `tsc --noEmit` (esbuild does not typecheck)
- `npm run test:solver` — bundles the real solver + Z3 into a temporary ESM module and runs the
  regression suite in `tools/test-solver.mjs` (Z3-only true/false backbone fixtures, a
  propagation-only baseline, an independent brute-force oracle, recommendation/error contracts)
- `node tools/extract-trials.mjs <save-file> [--list]` — print the trials found in a Cookie
  Clicker save (bundles `src/saveImport.ts` on the fly, so it always matches the app)

## Architecture

- Vanilla TypeScript, no framework. Entry `src/app.ts`; whole UI is one page.
- Layout is four cards: "Import save" (paste a Cookie Clicker save, full-width Import button),
  "Manual input" (recording form), "Recorded potions"
  (fixed-height, scrollable list plus export/import), and "Checking" (full-width Solve button;
  a collapsible boxed "Configure reagent preference" subsection sits directly below the button,
  a "Pairing progress" bar sits below that and appears after the first successful Solve, and the
  "Likely potions" / "Recommendations" sections below stay hidden until the first Solve
  press). Manual input, Recorded potions, and the preference subsection are
  collapsible via `section-toggle` buttons (all start collapsed). In
  Manual input,
  "Mixtures" (best to worst: Complete potion, extraordinary, very, promising, useless) sits
  above a boxed "Potions" section that starts collapsed behind an Unhide button and spoiler
  warning.
- The page ends with a footer holding one button per level-2 section of `src/info.md` (four equal-width
  columns with equal gaps, in file order). Clicking one opens a wide prompt whose body renders that
  section's Markdown verbatim.
- Reagent preferences: one box per reagent in easy-to-hard order, with a preferred/green,
  neutral/gray, avoid/red slab strip above the icon. The box background is tinted with a faded
  version of the current classification (the plain cell background for neutral), and the matching
  slab stays raised; hovering a slab lifts it slightly further to show it is clickable. The slab
  color is painted by a pseudo-element while the button itself stays put, so lifting the slab
  never moves its hitbox. Clicking a
  slab sets that classification. Preferences are persisted and reorder the solver's recommendation
  search: `sortReagentsByPreference` stably partitions `ReagentsSortedFromEasyToHard` into
  preferred → neutral → avoid before it is fed to `solve`. Editing a preference does not re-solve
  on its own; it marks the visible results stale and shows a hint under the Solve button until the
  player presses Solve.
- Checking result rows end with quick outcome buttons: recommendations offer complete potion plus
  the four mixtures (5), while guaranteed extraordinary rows offer complete potion and
  extraordinary promising (2). Each button records that row's triple with the chosen outcome
  through `state.recordCombination`, then re-solves only the pair truth table in the background
  (never the visible result lists). The resolved box becomes a same-size temporary notice
  showing `+N extra cells` when that brew determined any new pairs; it holds for ~1.5s, fades,
  and the remaining boxes slide up. The progress bar animates its fill and count at the same
  time. If no new cells were determined (always the case for the already-known pairs of a
  guaranteed triple), the row is removed immediately. Buttons use a shortened tooltip (name +
  action hint + description, no flavor quote). Reagent badges in recorded rows and result rows
  are not interactive, so their tooltip omits the "Click to add." action hint.
- `src/state.ts` — app state, pub/sub (`subscribe`), `localStorage` persistence of recorded
  potions and reagent preferences, `getReagentPreference` / `setReagentPreference`,
  `replaceRecorded` (wholesale list replacement — used by share-code import and save import),
  `recordCombination` (records an explicit triple + outcome — used by the checking quick
  buttons), and `outcomeToResult` (known potion → `COMPLETE`, filler → mixture result).
- `src/z-solver-ready.ts` — lazily initializes `z3-solver`'s WASM module and creates one shared
  Z3 `Context`. `begin()` caches the promise (so the expensive init happens once), evicts a
  failed init so it can be retried, and is passed into `solve`.
- `src/solver/solver.ts` — async Z3-backed solver. Its 4th argument is the `begin()` promise;
  it rejects with a clear error when the recorded outcomes are inconsistent or the constraints
  are unsatisfiable.
- `src/recorded.ts` — shared validation/normalization of recorded potion entries, used by both
  `localStorage` loading and export/import decoding; accepts real potion ids and
  `COMPLETE_POTION.id`.
- `src/share.ts` — base64 export/import codec for recorded potions (versioned JSON payload).
- `src/saveImport.ts` — decodes a Cookie Clicker save back to trial history: unescape → strip
  `!END!` → base64/UTF-8 → mod data after the last `|` → `JustNaturalExpansionMod:` entry
  (`[P]`/`[S]` unescapes) → `pm` potions save → 1540-bit tried-combination bitset. The save
  stores no per-trial outcome, so results are recomputed from saved state (unlocked potions,
  `rm` randomized recipes) with the minigame's own tier rules. Discoveries import as
  `COMPLETE_POTION` unless the "Use complete potions" checkbox beside the Import button is
  cleared, in which case the real potion id is recorded.
- `src/ui/prompt.ts` — reusable prompt/modal system (single open prompt, wide variant, body
  content, action buttons, inline status, focus trap, Escape/backdrop dismissal, background
  inert). Add new dialogs by calling `openPrompt` with options rather than writing modal markup.
- `src/info.ts` — imports `src/info.md` as raw text (esbuild's `text` loader) and splits it into its
  level-2 (`##`) sections; `INFO_SECTIONS` drives the footer buttons and prompt bodies in file
  order, so editing `src/info.md` updates both without touching code.
- `src/ui/markdown.ts` — dependency-free, HTML-safe Markdown → DOM renderer for the info prompts.
  It covers headings, paragraphs, lists, fenced code, blockquotes, rules, emphasis, inline code,
  and links; raw HTML is escaped and links are restricted to http(s)/mailto.
- `src/ui/clipboard.ts` — clipboard copy with a legacy `execCommand` fallback.
- `src/ui/icons.ts` — sprite icons from `assets/*.png` (48px tiles: `[column, row, sheet]`).
- `src/ui/tooltip.ts` — single global element-anchored tooltip; hide it on any state change.
- `src/ui/format.ts` — brew-time / percent formatting.
- `src/styles/` — SASS partials composed by `src/index.scss`; all colors live in
  `_variables.scss`, no hardcoded colors in other partials. `_prompt.scss` styles the prompt
  system, `_preferences.scss` styles the reagent preference slabs and their classification tints,
  `_progress.scss` styles the pair-progress bar plus the resolved-row count notice,
  `_footer.scss` styles the project-info button row, and `_markdown.scss` styles rendered
  Markdown inside prompts.
- Data: `src/reagents.ts` (`REAGENTS` array order MUST match the `Reagent` enum — asserted at
  startup; also exports `ReagentsSortedFromEasyToHard`, `ReagentPreference`, and
  `sortReagentsByPreference`), `src/complete-potions.ts` (`POTIONS`, `MIXTURE_TYPES`,
  spoiler-free `COMPLETE_POTION` pseudo-potion).

## Solver contract (`src/solver/solver.ts`)

- `solve(potions, recommendationsCount, reagentsSortedFromEasyToHard, zSolver)` returns a
  `Promise<SolveResult>`; callers must `await` it. `zSolver` is the promise returned by
  `begin()` (`src/z-solver-ready.ts`), which owns the single shared Z3 context.
- Input `Set<Potion>` with `first < second < third` (it sorts internally, but store sorted), a
  `recommendationsCount` cap for the recommendation list, and
  `reagentsSortedFromEasyToHard: Reagent[]`. The app passes
  `sortReagentsByPreference(state.reagentPreferences)`, which stably partitions the
  `ReagentsSortedFromEasyToHard` export into preferred → neutral → avoid; recommendation
  triples therefore come back in preference-aware order, not ascending reagent-index order.
- `COMPLETE`/`EXTRAORDINARY` → pairs "yes"; `VERY`/`PROMISING` → constraint propagation;
  `USELESS` → pairs "no". Contradictory outcomes (for example a complete and a useless triple
  sharing a pair) reject with `Recorded outcomes are inconsistent` instead of silently
  overwriting a known pair.
- Output `SolveResult { extraordinary, recommendedForMaxInfo, truthinessObjects, pairingTable }`.
  `extraordinary` holds triples guaranteed to be at least extraordinarily promising;
  `recommendedForMaxInfo` holds unknown triples whose three pairs are all unresolved (brewing
  one tests three unknown pairs at once). `pairingTable` is the full triangular table
  (`pairingTable[larger][smaller]`) of yes/no/maybe cells; the UI counts cells that are not
  `truthinessObjects.maybe` to show `<solved>/<total>` in the progress bar. The UI normalizes
  recommendation triples to ascending reagent indices (the recorded key format) without
  re-sorting the preference-aware list.
- The UI renders `extraordinary` under "Likely potions" and up to
  `RECOMMENDATION_LIMIT` (3) entries from `recommendedForMaxInfo` under "Recommendations". The
  guaranteed-combinations list is capped at a max height and scrolls when it overflows (`.results__list--guaranteed`). Both
  lists filter out already-recorded triples (recorded VERY/PROMISING triples can otherwise
  reappear as recommendations), and both keep showing their previous output with a "press Solve
  to refresh" note when the recorded set changes through normal recording. Resolving a
  recommendation through its quick outcome buttons is the exception: only that row is removed,
  the other recommendations stay exactly as they were, and the list is neither re-solved nor
  marked stale. Preference edits likewise never re-solve automatically: they mark the output
  stale and reveal a "Preferences changed — press Solve to update the recommendations." hint under
  the Solve button. The hint clears once a successful Solve renders results produced with the
  current preferences; Solve snapshots the preferences when it starts and marks its output stale
  if they changed while it ran.
- Because solves are async, the app serializes them through `requestSolve`/`drainSolveQueue`: a
  newer request replaces a queued one, so an older (slower) solve can never overwrite fresher
  results. The Solve button is disabled while solving, `aria-busy` is set, and the inline status
  line reports "Solving…" or the failure message. A Z3/solver failure leaves any previous
  results in place and displays `Could not solve: …`.

## Build gotchas

- esbuild ≥0.25 has no built-in Sass; `.scss` compiles via `esbuild-sass-plugin` +
  the `sass` dev dependency. Keep both installed.
- Z3 needs two files served beside the page: `z3-built.js` (a classic script that defines the
  `initZ3` global) and `z3-built.wasm`. `esbuild.config.mjs` copies both from
  `node_modules/z3-solver/build/` into `dist/`, and `index.html` loads
  `./dist/z3-built.js` before the app module. Do not bundle `z3-built.js`; Emscripten resolves
  its WASM and worker script relative to that file.
- The browser bundle needs `define: { global: 'globalThis' }`: `z3-solver/browser.js` reads
  `global.initZ3`, and esbuild does not polyfill the Node.js `global` alias.
- Z3's Emscripten build uses pthreads, which require `SharedArrayBuffer`; browsers only expose
  it on cross-origin-isolated pages. The dev server sends
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
  Other hosts must send those headers too, or use the service worker described below.
- Sprite PNGs use the `file` loader; `publicPath: './dist/'` is required because icons are set
  through inline `background-image` styles (they resolve against the document, not the CSS).
- `src/info.md` is bundled as a string through esbuild's `text` loader (`.md` in
  `buildOptions.loader`, plus the `*.md` declaration in `src/types.d.ts`); keep both when moving
  or extending the project info content.
- `index.html` references `./dist/app.js` and `./dist/index.css`; serve the repo root, not `dist/`.
  All asset URLs are relative so the built site also works under a GitHub Pages project subpath.
- GitHub Pages cannot set COOP/COEP headers. `coi-serviceworker.js` (vendored at the repo root,
  MIT) is loaded as a classic script in `index.html` before `z3-built.js`; it registers a service
  worker that adds the headers and reloads the page once. It must stay a separate same-origin file
  (never bundle it or load it from a CDN), and it must live at or above `index.html` so its
  default service-worker scope covers the page. On hosts that already send the headers the script
  does nothing.
- The `Build` workflow stages `index.html`, `coi-serviceworker.js`, and `dist/` into `_site`, uploads
  that as a build artifact, and deploys it to GitHub Pages on `main`. Pages must be enabled with
  **Source: GitHub Actions**. Relative paths mean no repository-name base-path configuration is
  needed.
- The `[hidden]` rule in `_base.scss` uses `!important` on purpose — component `display` values
  would otherwise override the attribute.
