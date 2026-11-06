# Contour, the DECA Mark design system

This file is the design source of truth for the web workspace and the mobile collector: how DECA Mark looks, moves and speaks on screen. Every screen is built against it. [PRODUCT.md](PRODUCT.md) owns who the product is for, the honesty rules, the register by audience and the glossary. Token values and the state vocabulary are data in [`contracts/contour.json`](contracts/contour.json). If a value here disagrees with that file, the file wins and this one is corrected.

The designs are four PDFs: Contour system (12 pages), Project workspace (19), Organization, auth and public pages (19) and Mobile collector (31). A reference such as *System 4*, *Project 10*, *Org 13* or *Mobile 16* is a page in that order.

1. [What Contour is](#1-what-contour-is)
2. [The six rules](#2-the-six-rules)
3. [Colour](#3-colour)
4. [Type, shape and space](#4-type-shape-and-space)
5. [Components](#5-components)
6. [State vocabulary](#6-state-vocabulary)
7. [Screen states](#7-screen-states)
8. [Motion and interaction](#8-motion-and-interaction)
9. [Maps](#9-maps)
10. [Copy](#10-copy)
11. [Accessibility and anti-patterns](#11-accessibility-and-anti-patterns)

## 1. What Contour is

Contour is one light system for the collector and the workspace. It has a pale lichen ground, white islands standing on a hard 6 px ledge, ink navigation, fully round controls and one magenta action per screen. Everything is flat colour, borders and type, so it builds directly in React Native and Tailwind. No screen needs blur, a gradient or animation to be read. Contour replaces Nocturne (D19, which closes Q8). **Day** is the default everywhere. **Dusk** gives the same roles for low light and is a preference: the web account menu, and "Screen: Day · Dusk" in mobile Preferences. Map canvases do not use these colours. They keep their own palette from [`contracts/map-palettes.json`](contracts/map-palettes.json) (Day, the default, and Night), switched by its own setting (D18).

**Kept from Contour** (the designs call this cut "Contour · Simplified", *System 1*):

| Trait | What it means |
|---|---|
| Lichen ground | A pale green-grey page that stays quiet in daylight. |
| White islands with a hard ledge | Depth comes from a 6 px solid edge. No blur, no soft shadow. |
| Pill controls | Buttons, tabs and tags are fully round and 44 px or taller. |
| Ink navigation | One dark pill holds the tabs on the web and the dock on mobile. |
| One magenta action | The thing to do now, once per screen. |
| Two typefaces | Geologica for words, Spline Sans Mono for IDs and versions. |

**Left for later:** animated isolines (the moving contour field behind screens), blurred glass layers (translucent panels over the map) and depth ramps (stacked tinted layers that suggested elevation). "Nothing in this system depends on them. They can be added over these tokens without changing a screen." Do not build them now, and do not approximate them with a static gradient, a backdrop blur or stacked shadows.

### Where Contour lives

| Path or command | Role |
|---|---|
| `contracts/contour.json` | Day and Dusk colours, type, space, radius, sizes, motion and the state vocabulary. Edit tokens here and nowhere else. |
| `scripts/contour-tokens.mjs` | Generates `web/src/styles/contour.css`. With `--check` it fails on drift and on WCAG contrast: 4.5:1 for text and 3:1 for UI, in both themes. |
| `pnpm tokens` / `pnpm tokens:check` | Root scripts for generating and for checking. |
| `web/src/styles/contour.css` | Generated and checked in. Never edited by hand. |
| `mobile/src/ui/tokens.ts` | The collector reads `contour.json` here. |
| `contracts/map-palettes.json` | Map canvas palettes. Not part of the UI theme. |
| `web/src/components/contour/*` | Web primitives (WEB-20). Shell parts such as the header, switchers, `LoadFailure`, `NotAvailable` and the auth split live in `web/src/components/shell/*`. |
| `mobile/src/ui/*` | Mobile primitives (MOB-23). |
| Web `/dev/contour`, mobile `app/(dev)/gallery` | Galleries showing every primitive in Day and Dusk. The web gallery is `noindex` and exists only in dev and preview builds. |

**Token names.** Keys are camelCase in `contour.json` and in mobile code. On the web each key becomes a custom property `--ct-` plus kebab case, and a digit becomes its own segment: `accentSoft` → `--ct-accent-soft`, `ink2` → `--ct-ink-2`. The Tailwind utilities from `@theme inline` drop the prefix, giving `bg-island`, `text-ink-2`, `bg-saved-soft`, `border-line` and `shadow-ledge`. No hex value appears outside `contour.css`, `tokens.ts` and `map-palettes.json`, except in the brand mark's artwork: the app icon files and `mobile/src/ui/brand-artwork.ts` (D29).

**Themes.**

- **Day is the default.** Contour does not follow the operating system's dark mode. Day stays until the person picks Dusk (rule 06).
- **On the web,** Dusk is `data-theme="dusk"` on `<html>`. An inline head script sets it before first paint from `localStorage["fm-theme"]`.
- **On mobile,** the preference is read synchronously, so the first frame never flashes. `Appearance.setColorScheme()` makes native alerts and pickers follow it.
- **Forced Day.** A nested `data-theme="day"` forces Day for the printed report and for the collector preview in the form editor.
- **The screen theme and the map palette are separate.** Dusk never switches the map to Night, and Night never switches the screen to Dusk. The Dusk Overview (*System 8*) happens to show the Night plan; that is a choice, not a link.
- **What Dusk changes.** "The same roles for low light. Ink fills become light fills, and the accent lightens so dark text sits on it."

## 2. The six rules

| # | Rule | As designed (*System 3*) | In practice |
|---|---|---|---|
| 01 | **One filled magenta button per screen** | The thing to do now. In the collector the chosen answer is magenta too. Table selection, focus and navigation use ink. | `primary` once. `ink` for the strong second action, `outline` for the rest. On an answer step the chosen tile is the magenta, so the step's own action ("Review") is ink. Accent text links may appear beside it. On a screen whose one action is destructive, `danger-filled` takes the magenta's place. A dev-only check warns when two primary buttons are mounted. |
| 02 | **State is a glyph, a word and a colour** | Never colour alone. The five queue states keep the same glyph everywhere. | Render every state through `StateText` or `StateBadge` from the generated vocabulary (§6). Never hand-write a state, and never show a coloured dot without its word. |
| 03 | **Map colours stay on the map** | Zones and observations are violet. Interface state colours never appear on the plan. | No saved, waiting, uploaded, attention or held colour inside a map canvas. Violet appears outside a map only in a legend that describes the map, and in the brand mark, which is the purple app icon (D29). |
| 04 | **Mono for things you might read aloud** | IDs, versions, counts and codes. Sentences stay in Geologica. | `OBS-0248`, `v3`, `demo-v1`, `DECA2026`, `84 MB`, "4 of 6", "2 / 3". A count inside a sentence or heading stays in Geologica: "14 observations across three zones." |
| 05 | **Labels wrap** | Long answer labels grow the tile. Nothing truncates with an ellipsis. | No `text-overflow: ellipsis`, no `line-clamp`, no `numberOfLines`. Rows and tiles grow. Tab bars and chip rows scroll sideways instead of cutting a label. |
| 06 | **Day first** | The collector opens in Day. Dusk is a choice in Preferences, and the map palette switches on its own setting. | Day everywhere by default, on both apps. Dusk is reviewed screen by screen, but nothing is designed Dusk-first. |

## 3. Colour

Contrast is measured against the surface each colour is used on. Body text is 4.5:1 or better everywhere. Ratios below are computed from `contour.json`. `pnpm tokens:check` enforces the text and UI pairs listed in its `contrast` block. *derived* marks a token the design did not specify. It was derived for Contour and is listed for the designer to confirm.

### Surfaces and lines

| Token | Day | Dusk | Role |
|---|---|---|---|
| `ground` | `#F0F3EC` | `#0F1A17` | Page background. |
| `island` | `#FFFFFF` | `#1A2925` | Raised surfaces: islands, inputs, answer tiles, outline buttons, the map's label pills and controls. |
| `well` | `#E7ECE2` | `#24352F` | Insets, tracks, selected rows, read-only fields, still placeholders, disabled fills and icon discs. |
| `ledge` | `#D5DDD3` | `#08110E` | The 6 px solid edge under an island. |
| `line` | `#B9C6BE` | `#3B4D46` | Island outlines and the outlines of header pills and segmented tracks. 1.8:1 on island in Day, so it is never the only cue. |
| `rule` | `#DDE4DC` | `#2A3A34` *derived* | Rows and dividers inside an island. |
| `edge` | `#6F8278` | `#7D9188` *derived* | Tag outlines and dashed slots. 4.1:1 (Day) and 4.5:1 (Dusk) on island. |

### Text and accent

| Token | Day | Dusk | Role | Contrast, Day / Dusk |
|---|---|---|---|---|
| `ink` | `#132019` | `#E9EFE9` | Text, control borders and ink fills | 16.8 / 13.0 on island; 15.0 / 15.2 on ground; 14.0 / 11.1 on well |
| `ink2` | `#4A5A50` | `#B5C4BB` | Secondary text and the held state | 7.3 / 8.3 on island; 6.5 / 9.8 on ground |
| `onInk` | `#FFFFFF` *derived* | `#0F1A17` *derived* | Text and icons on ink fills | 16.8 / 15.2 |
| `accent` | `#A3156B` | `#F58CC8` | The one action, links and the chosen answer | 7.3 / 6.8 on island; 6.5 / 8.0 on ground |
| `accentSoft` | `#F8E7F0` | `#3B1E2F` *derived* | The chosen row in a short list | ink on it 14.2 / 12.7 |
| `onAccent` | `#FFFFFF` *derived* | `#0F1A17` | Text on accent fills | 7.3 / 8.0 |

### Navigation, focus and overlay

| Token | Day | Dusk | Role |
|---|---|---|---|
| `nav` | `#132019` *derived* | `#24352F` | The pill that holds the web tabs and the mobile dock |
| `onNav` | `#FFFFFF` *derived* | `#E9EFE9` *derived* | Tab labels and icons on `nav` (16.8 / 13.0) |
| `navCurrent` | `#FFFFFF` *derived* | `#E9EFE9` *derived* | The current tab's pill |
| `onNavCurrent` | `#132019` *derived* | `#0F1A17` *derived* | The current tab's label (16.8 / 15.2) |
| `focus` | `#132019` *derived* | `#E9EFE9` *derived* | The keyboard focus ring (15.0 / 15.2 on ground) |
| `focusGap` | `#FFFFFF` *derived* | `#0F1A17` *derived* | The ring colour inside an ink-filled container (see Focus in §5) |
| `scrim` | `#13201952` *derived* | `#00000080` *derived* | Behind dialogs and sheets |

### State families

Each state has a strong colour for its glyph and word, and a soft fill for notes, the needs-attention row and the danger panel. Ink on every soft fill is 14.0:1 or better in Day and 11.1:1 or better in Dusk.

| Family | Day strong · soft | Dusk strong · soft | Strong on island, then on its soft fill (Day / Dusk) | Covers |
|---|---|---|---|---|
| `saved` | `#1B6E3C` · `#E2F0E6` | `#7FD69B` · `#1D3528` | 6.3, 5.3 / 8.6, 7.5 | On this device, ready offline, verified, complete, approved, passes, active |
| `waiting` | `#805400` · `#FAEFD6` | `#F2C14E` · `#3A3018` | 6.6, 5.8 / 9.0, 7.7 | Waiting, draft, proposal, not yet reviewed, below the example target, offline |
| `uploaded` | `#1E55A6` · `#E3ECF8` | `#9CC0FF` · `#1D2C44` | 7.2, 6.1 / 8.2, 7.6 | Uploading, uploaded, downloading, connected |
| `attention` | `#B3350F` · `#FBE7E0` | `#FF9E7A` · `#40241B` | 6.1, 5.1 / 7.5, 7.0 | Needs attention, below target, excluded, fails, destructive actions |
| `held` | `#4A5A50` · `#E7ECE2` | `#B9C4BE` · `#24352F` | 7.3, 6.1 / 8.4, 7.2 | Held, retired, archived, revoked, training |

`onAttention` (`#FFFFFF` in Day, `#0F1A17` in Dusk, both *derived*) is the text on an attention fill: the danger-filled button and the dock badge. It reaches 6.1:1 in Day and 8.8:1 in Dusk.

### Derived tokens and open questions for the designer

- **Derived in Day:** `onInk`, `onAccent`, `nav`, `onNav`, `navCurrent`, `onNavCurrent`, `focus`, `focusGap`, `scrim`, `onAttention`.
- **Derived in Dusk:** `rule`, `edge`, `onInk`, `accentSoft`, `onNav`, `navCurrent`, `onNavCurrent`, `focus`, `focusGap`, `scrim`, `onAttention`.
- **Settled against the design pages (2026-10-03).** Day `waiting` is `#805400` (*System 1*). Dusk `nav` is the Dusk well, `#24352F` ("Insets, nav pill"). Dusk `onAccent` is the Dusk ground, `#0F1A17` (8.0:1). The Dusk `ledge` sits darker than the ground, `#08110E`, as the Dusk Overview draws it.

## 4. Type, shape and space

### Typefaces

- **Faces.** Geologica (400, 500, 600) is for words. Spline Sans Mono (400, 500, 600) is for IDs, versions, codes and counts. Both are free on Google Fonts. The web loads them through `next/font`, with vendored woff2 files as the fallback. Mobile loads them with `@expo-google-fonts`. There is no 700 weight.
- **Sizes are minimums.** Text follows browser zoom on the web (sizes in `rem`) and the device text size on mobile (`maxFontSizeMultiplier` per role). The "Larger question text" preference adds to the device size.
- **Tracking** is in em.
- **Mono label case.** The mono label is uppercase by style. Type its text in normal case, so screen readers read words, not letters.

**Web** (`type.web`)

| Role | Size / line | Weight | Tracking | Face | Used for |
|---|---|---|---|---|---|
| `display` | 72 / 70 | 600 | −0.025 | Geologica | The landing headline: "The observation. The place. The evidence." |
| `hero` | 56 / 58 | 600 | −0.022 | Geologica | Whole-page states: "This page is not on the map.", "Something went wrong." |
| `auth` | 44 / 48 | 600 | −0.02 | Geologica | Sign-in, account and collector onboarding titles: "Welcome back" |
| `page` | 36 / 42 | 600 | −0.018 | Geologica | Workspace page titles: "What came back from the field" |
| `section` | 26 / 32 | 600 | −0.012 | Geologica | A statement heading inside an island: "14 observations across three zones." |
| `question` | 26 / 32 | 600 | −0.012 | Geologica | Form questions in the collector preview |
| `island` | 19 / 26 | 600 | −0.005 | Geologica | Island titles and screen-state titles: "Zones and coverage" |
| `lead` | 18 / 28 | 400 | 0 | Geologica | Page subtitles: "One filter set for the map, table and export." |
| `answer` | 17 / 22 | 500 | 0 | Geologica | Answer tiles in the collector preview |
| `body` | 16 / 24 | 400 | 0 | Geologica | Body text, inputs and table cells. Buttons and field labels use it at 600. |
| `small` | 14 / 20 | 400 | 0 | Geologica | Meta lines, hints, footnotes and reasons |
| `monoLabel` | 13 / 18 | 500 | +0.06, caps | Spline Sans Mono | Eyebrows, column labels, the header role (MANAGER), "PROPOSAL U5" |
| `monoData` | 14 / 20 | 400 (up to 600) | 0 | Spline Sans Mono | "OBS-0248 · MAP v3 · FORM demo-v1 · 84 MB" |
| `monoCode` | 40 / 48 | 600 | +0.14 | Spline Sans Mono | Verification and join codes: `DECA2026` |
| `monoTitle` | 40 / 46 | 600 | −0.01 | Spline Sans Mono | An ID as a page title: `OBS-0244` |

**Mobile** (`type.mobile`)

| Role | Size / line | Weight | Tracking | Used for |
|---|---|---|---|---|
| `display` | 40 / 44 | 600 | −0.02 | Welcome: "Fieldwork starts here." |
| `page` | 32 / 38 | 600 | −0.018 | Screen titles: "Projects", "Before you begin" |
| `question` | 26 / 31 | 600 | −0.012 | The question being answered: "Primary play type" |
| `island` | 19 / 25 | 600 | −0.005 | Island and panel titles: "Recorded answers" |
| `answer` | 17 / 22 | 500 | 0 | Answer tiles and radio rows. Collector buttons use it at 600. |
| `body` | 16 / 23 | 400 | 0 | Body text and inputs |
| `bodyStrong` | 16 / 23 | 600 | 0 | Field labels and list-row titles |
| `small` | 14 / 19 | 400 | 0 | Meta lines and hints |
| `smallStrong` | 14 / 19 | 600 | 0 | State words in rows, dock labels |
| `monoLabel` | 13 / 17 | 500 | +0.06, caps | "NEXT OBSERVATION", "QUESTION 2 · PLAY" |
| `monoData` | 14 / 19 | 400 | 0 | "MAP v3", "2 on device", "60 of 126 MB" |
| `monoCode` | 28 / 34 | 600 | +0.14 | Code fields: `730518`, `DECA2026` |
| `monoTitle` | 34 / 40 | 600 | −0.01 | An ID as a title: `OBS-0249` on the Saved card |

### Shape

| Shape | Web | Mobile | Anatomy |
|---|---|---|---|
| Island | r 24 | r 22 | `island` fill, 1 px `line`, ledge `0 6 0` |
| Inner panel | r 20 | r 20 | 1 px `line`, no ledge |
| Answer tile | r 16 | r 16 | 2 px `ink`, 60 tall |
| Note | r 16 | r 16 | Soft fill, no border |
| Input | r 12, 46 tall | r 14, 54 tall | `island` fill, `ink` border |
| Thumbnail and map label | r 14 | r 14 | Plan thumbnails, the map's overlay label |
| Pill | r 999, 46 tall | r 999, 56 tall | Buttons, tabs, tags, switchers, search, chips |

- **The ledge** is a 6 px solid `ledge` colour offset straight down, with no blur and no spread. On the web it is `box-shadow: 0 6px 0 var(--ct-ledge)`. On mobile it is the same solid offset (a `boxShadow` with no blur, or an underlay view).
  - It sits under islands, and under things that float on a map: the overlay label, the zoom buttons and the scale chip.
  - Nothing else has one: no inner panel, note, button, input or tile. The printed report drops ledges.
- **Borders.**
  - 1 px `line` (`size.border`) for islands, inner panels, header pills and segmented tracks.
  - 2 px `ink` (`size.tileBorder`) for outline buttons, answer tiles, radio rows, checkboxes, the switch's off track, the number stepper and the code field.
  - Text inputs and selects take 1.5 px `ink` on the web, as drawn, and 2 px in the collector.
  - Slots use a dashed `edge`.

### Space and layout

Spacing steps are **4, 8, 12, 16, 20, 24, 32, 40 and 56**, and only these. Tailwind's default 4 px scale already covers them (1, 2, 3, 4, 5, 6, 8, 10, 14).

| | Web | Mobile |
|---|---|---|
| Page gutter | 32 | 20 |
| Island padding | 24 | 16 |
| Gap between islands | 24 | 16 |
| Max content width | 1440 | — |
| Header height | 72 | — |
| Tab dock | — | 68 tall, at most 420 wide, centred on tablets, hidden only while collecting |

### Control heights and touch targets

| Control | Web | Mobile |
|---|---|---|
| Button, segmented control, switcher, search | 46 (`control`) | 56 (`control`). The collect flow's main actions are 60 (`collector`). |
| Small pill: StateBadge, tag | 36 (`controlSm`), with a 44 hit area | — |
| Text input, select | 46 | 54 (`input`) |
| Answer tile | 60 in the preview | 60 or taller (`answerTile`) |
| Radio row | 48 or taller | 48 or taller |
| Icon button: map controls, close, back | 44 | 48 |
| Table: island header / body row | 60 (`tableHeader`) / 54 or taller (`tableRow`) | List rows 48 or taller |
| Smallest touch target | 44 (`touch`) | 48 (`touch`); 48–60 in the collect flow |

### Responsive behaviour

- **Web at 1024:** islands stack, and search becomes an icon button.
- **Web at 768:** Data shows the map and the table, with the selected record in a dialog.
- **Web at 390:** one column, a merged org and project switcher, and tables as row cards. Tables stack below 640.
- **Web tabs:** when the tabs do not fit, they scroll sideways with edge fades. They never wrap or truncate.
- **Phone, portrait:** the collect map island sits above the panel, and Saved replaces the panel with a full card.
- **Tablet, landscape:** a 58/42 split, with the panel on the preferred hand's side. Saved becomes a "Last saved on this device" card in the Place panel. Phone landscape follows *Mobile 6*.

## 5. Components

Names are the same in both apps unless the table says otherwise. Every primitive renders in Day and Dusk and appears in both galleries. Screens compose primitives and do not restyle them.

| Group | Primitives | Web only | Mobile only |
|---|---|---|---|
| Actions | `Button`, `IconButton`, `TextLink`, `Icon` (with `HeldGlyph`) | | |
| Containers | `Island` (+ `Header`, `Body`, `Table`, `Footnote`), `InnerPanel`, `Note`, `FactsList` | | `ProposalNote` |
| State | `StateText`, `StateBadge`, `CoverageDots`, `TypeBars`, `Timeline`, `ProgressBar` | | |
| Inputs | `Field`, `TextInput`, `PasswordInput`, `Textarea`, `CodeInput`, `Checkbox`, `Switch`, `Segmented`, `RadioRow`, `AnswerTile`, `NumberStepper` | `Select` (native) | |
| Navigation | `ModeStrip`, `StepBar`, `RoleLabel` | `InkTabs`, `Breadcrumbs`, `Switcher`, `CommandPalette`, `Kbd` | `TabDock` |
| Data | `ListRow`, `Avatar`, `Mono` | `DataTable` | |
| Feedback | `ScreenState`, `Skeleton` | `Toast`, `Dialog`, `Menu`, `Tooltip` | `StatusLine`, `Sheet` (a native `formSheet` route) |
| Map | | `SitePlan`, `MapFrame` | `FieldMap`, `PlanThumbnail` |

States named below: **default**, **hover** (web pointer only), **focus**, **pressed**, **disabled** (always with a reason), **busy**, **error** and **selected**. Not every primitive has every state.

### Focus

- **The ring.** A 3 px ring with a 3 px gap, on every control. On the web it is `outline: 3px solid var(--ct-focus); outline-offset: 3px`, so the gap shows the surface behind.
- **Ring colour.** The ring contrasts with the surface it is drawn on:
  - `focus` (ink) on ground, island and well;
  - `onNav` inside the tab bar and the dock;
  - `focusGap` inside any other ink-filled container.

  In Day that is the design's "white inside ink fills".
- **When it shows.** The web uses `:focus-visible`: keyboard focus always shows the ring, and a mouse click does not. Inputs show the ring while focused. Full-bleed table rows draw the ring inset by 3 px.
- **On mobile,** the same ring shows when a hardware keyboard or switch control moves focus. VoiceOver and TalkBack draw their own cursor.

### Shared interaction states

- **Hover** changes colour only, over `quick` (120 ms). Nothing lifts or casts a shadow. Filled buttons mix 10% toward `ground`. Outline and soft buttons take a `well` fill. Danger takes `attentionSoft`. Nav items mix 12% toward `onNav`. Links underline. Every label stays at 4.5:1 or better: the lowest case is 4.6:1, on the pressed attention fill in Day. The designs do not draw hover; this is the Contour rule.
- **Pressed** applies over `press` (90 ms): filled buttons mix 18% toward `ground`, and outline and soft buttons take `ledge`. There is no scale and no translate.
- **Disabled, with a reason.** The fill turns `well` and the label `ink2`, with no border. A save action may swap its icon for `lock` ("Save new password").
  - The reason sits on the line directly below in `small` `ink2`: "The button turns on when both passwords match.", "You are an Admin. Ask Janet Loebach to start a transfer.", "Only the owner can delete the organization."
  - On the web: `aria-disabled="true"` (the control stays focusable) and `aria-describedby` pointing to the reason. On mobile: `accessibilityState.disabled` and a hint carrying the reason.
  - A disabled control without a visible reason is a bug.
- **Busy.** The label changes to the in-progress wording ("Verifying email…", or "Uploading 1 of 3" when progress is countable). The control keeps its resting width, ignores presses and sets `aria-busy`. There is never a spinner.
- **Error.** A control has no error colour of its own. The error is a field message or a Note beside it.

### Button

A pill with a verb + object label (`body` at 600 on the web, `answer` at 600 in the collector) and an optional 18 px (web) or 20 px (mobile) icon, 8 px from the label. A leading icon names the action (check, upload, plus, download, trash-2). A trailing `arrow-right` means it navigates ("Review observations →"). A leading `arrow-left` means back. Heights: 46 on the web; 56 on mobile; 60 for the collect flow's main actions ("Place a point", "Save on this device", "Place the next observation", "Start collection"). Buttons hug their label on the web, and fill the width in mobile panels and in web auth forms.

| Variant | Look | Use it for | Designed examples |
|---|---|---|---|
| `primary` | `accent` fill, `onAccent` label | The thing to do now. Once per screen. | "Review observations →", "Save on this device", "Activate v4", "Publish demo-v2", "Invite member" |
| `ink` | `ink` fill, `onInk` label | The strong second action. Also a state's main action where magenta would overclaim: retry, leave, or Review when the chosen answer is already magenta. | "Approve" beside "Exclude", "Try again", "Clear filters", "Copy code", "Review" |
| `outline` | `island` fill, 2 px `ink` border, `ink` label | Every other action | "Map packages", "Save view", "Exclude", "← Back", "Return to projects", "Review role" |
| `soft` | `well` fill, `ink` label | A quiet action on a busy surface. No designed screen uses it; prefer `outline`. Its fill is the disabled look, so never place it beside a disabled button. | — |
| `danger` | `island` fill, 2 px `attention` border, `attention` label | Opens a destructive flow. It never destroys anything by itself. | "Review deletion", "Review account deletion" |
| `danger-filled` | `attention` fill, `onAttention` label, `triangle-alert` | The final irreversible step, after the consequences are listed and typed confirmation is given. It is that screen's one filled action. | "Request account deletion" |
| `link` | See `TextLink` | Inline actions and navigation that are not buttons | "Open North meadow →", "Edit description" |

### IconButton

- **Shape.** Round, 44 on the web and 48 on mobile. `island` fill, 1 px `line`, a 20 px `ink` icon.
- **Name.** An accessible name is required: "Zoom in", "Zoom out", "Map layers", "Close", "Back".
- **On a map,** the zoom buttons float with a ledge. Layers has a 2 px `ink` border because it opens a menu.
- **In the collector,** close (`x`) and back (`arrow-left`) sit top-left.
- **States.** Hover `well`, pressed `ledge`, and the focus ring. When disabled (for example, at the zoom limit), the icon turns `ink2` and the name says why: "Zoom in, closest zoom reached".

### TextLink

- **`accent`** (the default): accent text at 600, with no underline at rest and an underline on hover. It may carry a leading icon or a trailing `arrow-right`. It is for an action or a way forward that is not the screen's one button: "Open Riverside →", "Explain this question", "Adjust point", "Edit", "Resend", "Skip for now", "Stay signed in", "Read every protocol note".
- **`ink`**, underlined: references and escape hatches. Examples: table entity links (zone names, `OBS-` IDs), breadcrumb ancestors, "Privacy", "Data deletion", "Discard draft", "Cancel download", "Save and finish later".
- **`ink`, not underlined:** an in-place action inside a dense row: "Clear filters", "Revoke".

### Icon and HeldGlyph

- **Lucide everywhere** (D22). The web uses `lucide-react` and mobile `lucide-react-native`, through one semantic registry, so screens ask for `upload` or `place`, not a file.
- **Stroke and size.** Stroke 2. Sizes: 16 beside small text, 18 on web controls, 20 in the collector, 24 in the tab dock.
- **`HeldGlyph`** is the custom Held mark: two vertical bars on Lucide's 24 grid, with the same stroke and round caps.
- **Icons beside a word are decorative** (`aria-hidden`). An icon alone needs a name.

| Meaning | Lucide name |
|---|---|
| Go to, continue / back | `arrow-right` / `arrow-left` |
| Confirm, approve, passes, done | `check` |
| Exclude, close, clear, cancel | `x` |
| Create, add, zoom in / zoom out | `plus` / `minus` |
| Upload, upload now, correct and send again / download, export | `upload` / `download` |
| Map packages, the layers menu, an empty map | `layers` |
| Place a point, start collection, the Observer role | `crosshair` |
| Place at map centre, adjust point | `map-pin` |
| Explain this question, field guide | `book-open` |
| Review, not yet reviewed, the Viewer role | `eye` |
| Edit, draft | `pencil` |
| Review deletion | `trash-2` |
| Try again, retry connection, resend code | `rotate-cw` |
| Lists, review or view observations, the Observations tab | `list` |
| The Projects tab, Sites, 404 | `map` |
| The Account tab, the Member role | `user` |
| Search / switcher and select / breadcrumb and list row | `search` / `chevron-down` / `chevron-right` |
| Copy code / scan a QR invitation / send a code by email / sign out | `copy` / `qr-code` / `mail` / `log-out` |
| A neutral note | `info` |
| Published, locked for this session, owner only | `lock` |
| Proposal, protocol note | `flag` |
| States | As listed in §6 (`smartphone`, `cloud-check`, `triangle-alert`, `clock`, `wifi`, `wifi-off`, `key-round`, `shield-check` and others) |

### Island

- **Anatomy.** `island` fill, 1 px `line`, r 24 (web) or 22 (mobile), the ledge, and padding of 24 or 16.
- **`Island.Header`.** The title (`island` role) on the left. On the right, one of:
  - a count in `small` `ink2` ("3 items", "1 waiting");
  - a `StateText` ("Shown once", "Active", "Not active yet");
  - an accent `TextLink` ("Open Riverside →").

  The header is 60 tall when a table or list follows, with a `rule` under it.
- **`Island.Table`** runs edge to edge. Its first and last cells align with the island padding.
- **`Island.Footnote`.** "Footnotes sit inside the island, under a rule." Set in `small` `ink2`, for example "An offline device cannot report its current state. …"
- **The `state` prop** swaps the body for a `ScreenState` and keeps the header.
- **Variants.**
  - **`danger`:** no fill (the ground shows through), 2 px `attention` border, no ledge, and a title in `attention` with `triangle-alert`. Used for "Delete organization" (*Org 4*).
  - **Collector needs-attention panel:** `attentionSoft` fill and a 2 px `attention` border (*Mobile 16*).
  - **Unfinished observation:** a 2 px `accent` border with an accent mono label (*Mobile 10*).
  - **Saved card:** a 2 px `saved` border (*Mobile 5*).
- **No island inside an island.** Use an `InnerPanel`.

### InnerPanel and slot

- **`InnerPanel`.** r 20, 1 px `line`, no ledge, `island` fill. It holds a map frame or the selected-record panel inside an island.
- **The `well` variant** has a well fill and no border. It is for a code shown once ("COPY THIS CODE NOW · `DECA2026`"), the workspace address, and the review panel's "Scroll · 2 more answers" hint.
- **A dashed slot** marks where something will appear: a dashed `edge` border, a centred icon and a `small` `ink2` line. Examples: "QR for the redeem link appears here", and "The map appears here once the package is on this device."
  - The collector's empty map slot carries faint, still contour lines.
  - A slot is not a control and has no hover.

### Note and ProposalNote

- **`Note`.** r 16, the tone's soft fill, no border. It has an 18 px leading icon in the tone's strong colour and `body` text in `ink`. It may open with one sentence at 600: "**5 records are waiting on this device.** They upload only from their owner's account."

  | Tone | Icon | Example |
  |---|---|---|
  | `saved` | `check` | "Required answers are complete. Saving stores it on this device." |
  | `waiting` | `smartphone`, `wifi-off` or `clock` | "5 records are waiting on this device. They upload only from their owner's account." |
  | `uploaded` | `upload` | "Uploading 1 of 3. Keep the app open." |
  | `attention` | `triangle-alert` | "The observer code is missing from this record. Add it, then send it again." |
  | `neutral` | `info` in `ink2`, `well` fill | "The target is illustrative, not a scheduled assignment." |

  Notes are not dismissible and not clickable. A note that appears in response to an action is a `role="status"` live region.
- **`ProposalNote`.** `waitingSoft` fill and a `flag` icon. "PROPOSAL U5" is set in `monoLabel` at 600 in `waiting`, followed by the body in `ink`: "The Approved-only gate is optional and not decided."
  - It also has a one-line form for a page header: "PROPOSAL U2 · QGIS remains the pilot's geometry authority. …"
  - On mobile, every screen that shows a U2–U7 concept carries one. The concepts are U2 zone editing, U3 web join and observer handoff, U4 form templates, U5 review and publication scope, U6 rounds, and U7 reports and saved views.
  - The web has no such primitive since D30. A concept it does not build is a `NotAvailable` note, never a proposal flag.
  - Inside tabs and rows the flag shrinks to `StateText` "Proposal U6".

### FactsList

- **Rows.** Label and value pairs: the label in `ink2` in a left column of about 40%, the value in `ink`. A `rule` separates rows, and values wrap.
- **Values.** IDs, versions and sizes are `monoData` ("v3", "84 MB", "demo-v1"). A state value is a `StateText` ("Active"). A missing value is the word in `attention` ("Missing").
- **Markup.** `<dl>` on the web. On mobile each row is read as "Label, value".
- **Used in** "Facts list", "Active map package", the selected record, the package inspection, and the Saved card's "Carried forward / Cleared / Upload".

### StateText and StateBadge

- **`StateText`.** An icon (16–18 px) and a word, both in the tone's strong colour, at 600, in `small` or `body` size. An optional qualifier follows " · ": "Waiting · sent Sep 30", "Draft · 2 changes", "Uploaded 11:29".
- **`StateBadge`.** A 36 px pill with a 1 px `line` border and `island` fill. An optional mono ID can lead it: "`demo-v1` Published", "`demo-v2` Draft · 2 changes".
- **Source.** Both read the generated vocabulary by kind and key (`kind="queue" state="attention"`). Labels are never typed by hand.
- **Accessibility.** The accessible name is the word and its qualifier, and the icon is hidden.
- **On a soft fill,** the strong colour is still used for the glyph and word.
- **A tag** is the same pill without a state: an `edge` border with `ink2` text ("Required", "Optional"). The landing uses mono caps tags ("DAYLIGHT FIRST").

### CoverageDots

- **The dots.** One dot per target round. A filled dot means the round met the target; a hollow ring means it is below.
- **Colour.** In tables the dots are `ink`. In a map's zone label and in the legend beside a map they take the palette's observation violet (rule 03).
- **Never alone.** The dots always sit with the mono fraction ("2 / 3") and a status `StateText` ("1 round below target"). The legend reads "Round met the target · Round below target", and the footnote says the target is illustrative.
- **Accessible name:** "2 of 3 rounds met the target".

### TypeBars

- **Rows.** A label (`body`), a bar, and the count (`monoData`) aligned right. The bar is a pill: an 8 px `well` track with an `ink` fill. The longest bar is the largest count.
- **Eyebrow.** The set sits under a mono label ("BY PRIMARY PLAY TYPE").
- **Markup.** Exposed as a list or table with text counts. There are no animated counters or growing bars.

### Timeline

- **Rows.** Each event is a ring dot (12 px, with a 2.5 px ring), a title at 600, a detail line in `small` `ink2`, and the time in `monoData` on the right. A 1 px `rule` connector runs between the dots.
- **Ring tone.** The ring takes the event's tone: `attention` for "Upload rejected", `uploaded` for "Observation received", `ink` for the rest. The title always carries the word, so colour is never the only cue.

### ProgressBar

- **Determinate only.** An 8 px pill with a `well` track. The fill is `uploaded` for downloads and uploads.
- **Caption.** Under the bar: `monoData` "60 of 126 MB" on the left and "48%" on the right.
- **Motion.** The fill moves linearly.
- **Markup.** `role="progressbar"` with `aria-valuenow` and `aria-valuetext="60 of 126 MB"`.
- **No indeterminate form.** When progress cannot be measured, say what is happening in words.

### Field and inputs

- **`Field`** wraps every input.
  - **Label.** Above the input, `body` at 600 (web) or `bodyStrong` (mobile).
  - **Hint.** Below, in `small` `ink2` ("Short and unique. It appears in export file names.").
  - **Counter.** On the right of the hint line, in `monoData`: "69 / 1000", "4 of 6". It turns into `saved` "✓ 8 of 8" when complete.
  - **Error.** Below, replacing the hint: `triangle-alert` and `smallStrong` text in `attention` ("Enter up to 10 uppercase characters"), with the input border in `attention`. Errors are linked with `aria-describedby` and announced.
  - **Read-only.** A `well` fill and a 1 px `line` border. A read-only ID is mono (`age_range`), with its hint "Read-only. Stable across wording edits."
- **`TextInput`.** 46 tall on the web (r 12) and 54 on mobile (r 14). `island` fill, `ink` border, `body` text. Placeholder in `ink2` ("e.g. PS"). The focus ring is drawn outside the border.
- **`PasswordInput`.** A TextInput with an accent "Show" / "Hide" text button inside, on the right.
  - Live checks sit under it: "✓ 16 characters · Use at least 8." (the count in `saved`, the rule in `ink2`) and "✓ Passwords match".
  - A mismatch shows only after the field loses focus: "Does not match yet".
- **`Textarea`.** At least four lines, with a counter. The hint states where the text goes: "Saved to the draft as you type".
- **`CodeInput`.** One wide mono field, not separate boxes. `monoCode` text, letter-spaced and centred, 2 px `ink` border, a counter ("4 of 6", then "✓ 6 of 6").
  - A paste is cleaned of spaces and dashes.
  - A 6-digit code submits by itself at the sixth digit, and a wrong code reselects the field.
  - An 8-character join code is uppercased as it is typed.
  - Use `autocomplete="one-time-code"` and a numeric keyboard for 6-digit codes.
  - "Resend in 0:24" counts down in mono.
- **`Select`** (web only). The native `<select>`, styled as a TextInput with a `chevron-down`. On mobile, use `RadioRow` or `Segmented` instead.
- **`Checkbox`.** A 22 px square with r 6 and a 2 px `ink` border. When checked: `ink` fill and an `onInk` check. The label sits to the right in `body` and wraps, and the whole row is the 44 or 48 px target. A label may contain a link ("I have read the privacy information …").
- **`Switch`.** It always shows "On" or "Off" as a word beside the track.
  - On: `ink` track with an `onInk` knob on the right. Off: `island` track with a 2 px `ink` border and an `ink` knob on the left. The knob moves over `base` (160 ms).
  - It sits in a settings row: a title at 600, a description in `small` `ink2`, then the word and the switch.
- **`Segmented`.** An `island` track with a 1 px `line` border; options are equal width. The selected option is an `ink` pill with a `check` and an `onInk` label ("✓ Right hand").
  - 46 tall on the web, 56 on mobile. The pill slides over `base`.
  - The `chips` variant (the zone filter in Observations) has a selected `ink` pill, unselected options outlined in `line`, and a row that scrolls sideways.
- **`RadioRow`.** 48 or taller, r 16, 2 px `ink` border, a 22 px radio and an `answer` label that wraps.
  - **Chosen, for collector choices** (the zone in the session brief): `accentSoft` fill, `accent` border and an accent dot.
  - **Card variant, for settings** (the map palette in Preferences): a `PlanThumbnail` above the label. Chosen is shown with a 2 px `ink` border and an `ink` dot; unchosen has a `line` border.
- **`AnswerTile`.** 60 or taller, r 16, 2 px `ink` border, an `answer` label centred. Long labels grow the tile.
  - Chosen: `accent` fill, `onAccent` label, a leading `check`.
  - Tiles sit two per row, or three for short labels in landscape ("0–2 yrs · 3–5 yrs · 6–8 yrs").
  - A single choice advances after 160 ms.
- **`NumberStepper`.** 2 px `ink` border and r 14, divided into three cells: `minus`, the value, `plus`. Cell dividers are `line`. A button at the limit is disabled, and the hint says why.

### Navigation

- **The brand mark** is the purple DECA Mark app icon, everywhere: the web header, favicon and install icon, the collector's headers, Welcome and loading screens, the phone's launcher and the store listing (D29). It is drawn as a rounded square, the shape a launcher gives the icon. It is artwork, not tokens, so it is the same in Day and Dusk. The web draws `web/public/icons/icon.svg`; the collector's `Logo` draws `mobile/src/ui/brand-artwork.ts`, which a test holds to `mobile/assets/icon-source/icon.svg`. Change the icon in `generate.py` first. There is no second mark.
- **Web header.** 72 tall.
  - Left: the brand mark (the purple app icon, 36 px) and "DECA Mark", then the org `Switcher`, "/" in `ink2`, and the project `Switcher`.
  - Right: the `CommandPalette` field, the `RoleLabel` ("MANAGER") and the `Avatar`, which opens the account menu with Day / Dusk.
  - The 404, error and observer-handoff pages show the org header without tabs.
- **`InkTabs`** (web).
  - **The bar.** A `nav` pill about 56 tall with 6 px padding. Each tab is a 44 px pill with an `onNav` label in `body` at 600. The current tab is a `navCurrent` pill with an `onNavCurrent` label.
  - **The pill moves.** It slides over `slide` (200 ms). Its position is written to CSS variables, and it does not slide on first paint.
  - **Markup.** Links with `aria-current="page"`.
  - **Project tabs:** Overview, Data, Sites, Forms, Team, QGIS, Reports, Settings. Their URLs (D21) are the project root, then `data`, `sites`, `forms`, `team`, `qgis`, `reports`, `settings`.
  - **Org tabs:** Projects, Members, Settings, at `/o/[org]`, `members`, `settings`. Members and Settings are for owners and admins.
  - The Viewer role hides Team and Settings.
- **`TabDock`** (mobile).
  - **The dock.** A floating `nav` pill, 68 tall, at most 420 wide and centred, above the safe area.
  - **Tabs.** Projects (`map`), Observations (`list`) and Account (`user`): a 24 px icon over a `smallStrong` label. The current tab is a `navCurrent` pill that slides over `slide`.
  - **The badge** is an `attention` circle with an `onAttention` number. It counts records that need attention and is hidden at zero. The tab's accessible name includes it: "Observations, 1 needs attention".
  - The dock hides only while collecting.
- **`ModeStrip`.** An `island` pill with a 1 px `line` border, holding "1 · Place", "2 · Answer" and "3 · Review". The current step is an `ink` pill that slides over `base`. A finished step can be tapped to go back. It is announced as "Step 2 of 3, Answer".
- **`StepBar`.**
  - **Web** (no screen uses it since the set-up flow went, D30; it stays in the gallery): the ModeStrip's shape on a wide track. A done step shows a `check` and its label, and stays clickable. The current step is an `ink` pill ("2 Project"). Upcoming steps show their number and label in `ink2`.
  - **Mobile** (onboarding): "STEP 1 OF 2" in `monoLabel` over segment bars, `ink` for done and current, `line` for upcoming.
- **`Breadcrumbs`** (web). `small` text: underlined `ink2` ancestors, `chevron-right` separators, and the current page as plain text with `aria-current`. They follow the URL nesting: "Sites › Riverside › Map packages", "Forms › Form versions › Draft › Publish".
- **`Switcher`** (web). A 46 px header pill: `island` fill, 1 px `line`, the name at 600 and a `chevron-down`. It opens a menu with typeahead, showing each item's role and state. Creating a project is on the organization's Projects page. At 390 the two switchers merge into one.
- **`CommandPalette`** (web). A "Search or jump to" pill in the header with `search` and a `Kbd` showing "⌘K", or "Ctrl K" on other platforms. It opens as a `Dialog`. The palette's contents are in §8.
- **`RoleLabel`.** In the header, `monoLabel` in `ink2` ("MANAGER", "ADMIN", "OBSERVER"). In tables, an icon and a word in `ink`: Owner `key-round`, Admin and Manager `shield-check`, Member `user`, Observer `crosshair`, Viewer `eye`.
- **`Kbd`.** Mono text in a small chip: 1 px `line`, r 6, `ink2` text. "Or press ⌘K to search and jump anywhere."
- **`NotAvailable`** (web shell, D30). A neutral `Note` with the `info` icon, standing where a button would have been. The title is "<Feature> is not available yet." The body is one sentence on why and one on what to do instead. It never sits beside a disabled or fake button. The web has no Preview data marker and no sample data: every page is live.

### Data

- **`DataTable`** (web).
  - **Rows.** Column labels in `monoLabel` `ink2`. Body rows are 54 or taller, separated by `rule`. Cells are `body` `ink`, with an optional second line in `small` `ink2` ("Woodland edge" over "Round 3 · 11:28"). `OBS-` IDs are mono, underlined `ink` links, and the state column is a `StateText`.
  - **Hover:** a `ground` fill.
  - **Selected:** a `well` fill and a 4 px `ink` bar on the leading edge. This is the only side stripe in Contour.
  - **Keyboard.** The table is one tab stop with roving focus. ↑ / ↓ or `j` / `k` move the selection and Enter opens the row. On Data, `a` approves and `x` excludes.
  - **Stacking.** Below 640, each row becomes a card: the ID and state on top, the other columns as label and value lines.
- **`ListRow`.**
  - **Anatomy.** An optional 40 px icon disc (`well`) or an avatar; a title (a mono ID, or `bodyStrong`); a meta line in `small` `ink2`; then a `StateText` and/or a `chevron-right`.
  - **Target.** The whole row is one target, 48 or taller on mobile. Rows sit in an island, separated by `rule`.
  - **Needs attention.** A row that needs attention takes an `attentionSoft` fill (*Mobile 15*).
  - **Used for** Observations, Projects, "Before you leave", and the 404 page's "Places that do exist".
- **`Avatar`.** A circle with two initials at 600. 32 px in rows, with a `well` fill and `ink` initials. 44 px in the web and mobile headers, with an `ink` fill and `onInk` initials. As the header account button it needs a name: "Account, Pratyush Sudhakar".
- **`Mono`.** Inline mono text, `monoData` by default.

### Feedback and overlays

- **`Toast`** (web). The designs do not draw it; this is the Contour rule.
  - **Look.** A pill in `nav` colours: the message in `body` and an "Undo" text button in underlined `onNav`, e.g. "OBS-0244 approved · Undo". One at a time, at the bottom centre.
  - **Timing.** It enters over `enter` (fade with an 8 px rise) and exits over `exit`. It stays for `toast` (6 s) and pauses while hovered or focused.
  - **Behaviour.** It is announced in a polite live region, and focus never moves to it. ⌘Z also undoes. The toast confirms a change, not a celebration.
- **`StatusLine`** (mobile). The line under the collect map island. On the left, a `StateText` ("OBS-0249 saved on this device", "Draft kept on this device", "Ready offline"). On the right, a `monoData` count in `ink2` ("2 on device"). Changes are announced to the screen reader.
- **`Dialog`** (web, Radix).
  - **Look.** An island surface (r 24, `line`, ledge) at most 560 wide, over `scrim`. The title is in `island` or `section`, then the body, then the actions on the right: `outline` cancel before the one `primary` or `danger-filled`.
  - **Focus.** Focus moves into the dialog and is trapped. Esc closes it, and focus returns to the trigger.
  - **Motion.** It enters over `enter` and exits over `exit`, with a fade and an 8 px rise and no scale.
  - **Content rules.** An export dialog repeats the scope. A destructive dialog lists every affected resource before the type-to-confirm field.
- **`Menu` and popovers** (web). An island surface (r 16, `line`, ledge) with 44 px items, a `check` on the current item, and typeahead. Fade over `quick`.
- **`Sheet`** (mobile).
  - "Explain this question" is a native `formSheet` route.
  - Destructive confirmations the designs do not cover (discard draft, remove download) use `Alert.alert`, with verb + object buttons ("Discard draft" / "Keep draft").
- **`Tooltip`** (web). A small pill in `nav` colours with `small` text. It shows after a short hover delay or on focus, and fades over `quick`. It never holds information the person needs: a disabled reason is a visible line, not a tooltip.
- **`ScreenState` and `Skeleton`:** see §7.

### Map primitives

- **Web.** `SitePlan` is a pure, server-renderable SVG drawn from the palette and the site GeoJSON. `MapFrame` adds zoom, pan, the controls, the overlay label, the scale chip, hatching and markers. The same pair renders thumbnails, the auth hero, the printed report and the preview of an uploaded package.
- **Mobile.** `FieldMap` is MapLibre restyled to the palette. `PlanThumbnail` draws small plans, as on the Preferences cards.

The look is in §9.

## 6. State vocabulary

Generated from the `states` block of `contracts/contour.json`. Every state is a glyph, a word and a colour. `icon` is a Lucide name, or `held` for the Contour two-bar glyph. `tone` is a colour family from §3; `ink` means `ink` text and icon. The words are fixed: render them from the vocabulary, and do not rephrase them. Each word is a promise: "Uploaded" only after the server acknowledges the record, "Ready offline" only when all four package parts verify, and device readiness only "as last reported" ([PRODUCT.md § Honesty](PRODUCT.md#honesty)).

**Queue: always in this order.** The same glyph everywhere.

| Key | Label | Icon | Tone | Meaning |
|---|---|---|---|---|
| `onDevice` | On device | `smartphone` | saved | Stored locally. Not sent yet. |
| `uploading` | Uploading | `upload` | uploaded | Being sent now. |
| `uploaded` | Uploaded | `cloud-check` | uploaded | The server has acknowledged it. |
| `attention` | Needs attention | `triangle-alert` | attention | Rejected. Says what to fix. |
| `held` | Held | `held` | held | Waiting on the project, not on the observer. |

**Review.** Upload state and review are separate.

| Key | Label | Icon | Tone |
|---|---|---|---|
| `notReviewed` | Not yet reviewed | `eye` | waiting |
| `approved` | Approved | `check` | saved |
| `excluded` | Excluded | `x` | attention |

**Form version**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `draft` | Draft | `pencil` | waiting |
| `published` | Published | `lock` | ink |
| `retired` | Retired | `held` | held |

**Map package**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `active` | Active | `check` | saved |
| `inspecting` | Inspecting | `clock` | waiting |
| `notActive` | Not active yet | `clock` | waiting |
| `archived` | Archived | `held` | held |
| `bundled` | Bundled | `package` | ink |

**Package check**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `passes` | Passes | `check` | saved |
| `checking` | Checking | `clock` | waiting |
| `fails` | Fails | `triangle-alert` | attention |

**Coverage**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `complete` | Complete | `check` | saved |
| `meets` | Meets the example target | `check` | saved |
| `roundBelow` | 1 round below target | `clock` | waiting |
| `belowExample` | Below the example target | `clock` | waiting |
| `below` | Below target | `triangle-alert` | attention |
| `none` | No observations yet | `clock` | waiting |
| `training` | Training | `held` | held |

**Readiness** (device and download)

| Key | Label | Icon | Tone |
|---|---|---|---|
| `readyOffline` | Ready offline | `check` | saved |
| `verified` | Verified | `check` | saved |
| `downloaded` | Downloaded | `check` | saved |
| `formAvailable` | Form available | `check` | saved |
| `downloading` | Downloading | `download` | uploaded |
| `notDownloaded` | Not downloaded | `download` | waiting |
| `waiting` | Waiting | `clock` | waiting |
| `unknown` | Unknown | `clock` | waiting |
| `alwaysAvailable` | Always available | `check` | saved |

**Project**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `active` | Active | `check` | saved |
| `preparing` | Preparing | `pencil` | waiting |
| `practice` | Practice | `check` | saved |
| `archived` | Archived | `held` | held |

**Invitation**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `waiting` | Waiting | `clock` | waiting |
| `accepted` | Accepted | `check` | saved |
| `revoked` | Revoked | `x` | held |

**Connection**

| Key | Label | Icon | Tone |
|---|---|---|---|
| `online` | Online | `wifi` | ink |
| `connected` | Connected | `wifi` | uploaded |
| `offline` | Offline | `wifi-off` | waiting |

**Proposal.** "A proposal is an open product decision carried over from the prototype."

| Key | Label | Icon | Tone |
|---|---|---|---|
| `open` | Proposal | `flag` | waiting |
| `notStored` | Not stored | `flag` | waiting |
| `protocolNote` | Protocol note | `flag` | waiting |

**Role**

| Key | Label | Icon | Tone | Allows |
|---|---|---|---|---|
| `owner` | Owner | `key-round` | ink | Manage the organization, transfer ownership, manage projects |
| `admin` | Admin | `shield-check` | ink | Manage members and projects |
| `member` | Member | `user` | ink | Project-scoped membership |
| `manager` | Manager | `shield-check` | ink | Manage forms, maps, team and publication |
| `observer` | Observer | `crosshair` | ink | Collect observations in the native app |
| `viewer` | Viewer | `eye` | ink | Read data and reports; export the permitted scope |
| `practice` | Practice | `crosshair` | ink | Collect practice records |

## 7. Screen states

"What every list, table and screen shows when it is not full of data. Plain words, one action, no illustrations. Loading uses still placeholders; nothing shimmers." (*System 6*)

### Rules

- **Every data area has every state:** loading, empty after filtering, empty with nothing made yet, error, offline and no access. On the web, the state replaces the island's content and keeps the page header and navigation in place. On the phone, the screen title stays.
- **Loading** uses still placeholders: `well` pill bars laid out like the content they replace. Nothing shimmers or pulses. Placeholders appear only after `skeletonDelay` (400 ms), so a fast load shows nothing in between. A line under them names what is loading, and the region is `aria-busy`.
- **Anatomy of a `ScreenState`:**
  - a round icon disc, about 48 px;
  - a title in `island` 19/600;
  - a body in `ink2`;
  - at most two actions.

  It aligns to the start of the island, and has no illustration.
- **Disc tones follow meaning:** `well` for neutral states (filter, layers, lock); `attentionSoft` with `attention` for a web error; `savedSoft` with `saved` for the collector error, because the work is safe; `island` with a `line` border for an empty list.
- **On the phone, the first line of an error says where the draft or record is.** An error never hides that the work is safe.
- **Preview.** The web previews each state with `?preview-state=loading|empty|filtered|error|offline|no-access`. The mobile `(dev)/states` screen switches them.

### Web

| State | Title | Body | Actions |
|---|---|---|---|
| Loading | — | Still placeholder rows, then "Loading observations…" | — |
| Empty after filtering | No observations match this view | Change your filters to see more observations. Your underlying records are unchanged. | `ink` "Clear filters" (`x`), `outline` "Open saved views" |
| Empty, nothing made yet | No map package yet | This site has no map. Upload a QGIS package to give observers something to collect on. | `primary` "Upload package" (`upload`) |
| Error | We could not load this page | Nothing was removed. Check your connection and try again. | `ink` "Try again" (`rotate-cw`), `outline` "Return to projects" |
| Offline | A `waitingSoft` banner at the top of the island, with `wifi-off`: "**You are offline.** Showing what loaded at 11:36. Changes cannot be saved." | The loaded content stays below it. | Changing actions are disabled ("Approve"); `outline` "Retry connection" (`rotate-cw`) |
| No access | You do not have access to this page | Your current role can view project observations, but cannot change this area. Ask a project manager to review your access. | `ink` "Return to projects" (`arrow-left`) |

### Collector

| State | Title | Body | Action |
|---|---|---|---|
| Loading | (screen title stays: "Observations") | Still placeholder rows, then "Reading records from this device…" | — |
| Empty | No observations yet | Records you save appear here, with their upload state. | `primary` "Go to projects" (`arrow-right`) |
| Error in the collector | Your draft is still on this device | The screen could not load, but the point and answers you entered are kept. | `ink` "Try again" (`rotate-cw`) |
| Offline | A `waitingSoft` banner with `wifi-off`: "**Offline.** Records remain on this device and upload later." | "Riverside · Ready offline", then two panels: "Collecting works as usual · Map v3 and form demo-v1 are on this device." and "Not available offline · Downloading Fall Creek, joining a project, uploading." | `primary` "Start collection" (`crosshair`) |
| No access | This site is not open to you | Your role does not include this site. Ask your coordinator to add you. | `outline` "Back to projects" (`arrow-left`) |

### Whole-page states

- **Web 404** (*Org 18*). The org header without tabs. An icon disc (`map`). "404 · PAGE NOT FOUND" as the eyebrow, then "This page is not on the map." in `hero`.
  - Body: "The link may be outdated or the page may have moved. Return to your projects to continue."
  - `primary` "Return to projects", then "Or press ⌘K to search and jump anywhere."
  - Beside it, an island "Places that do exist" lists `ListRow`s.
- **Web error** (*Org 19*). "REQUEST INTERRUPTED", then "Something went wrong." in `hero`.
  - Body: "Your records remain available. Try again or return to the workspace."
  - A "What we know" facts list: Page, When, What failed, Your data, Reference `REQ-7F3A-21`. Under it: "If it keeps happening, send the reference to your organization owner." and "Records on devices are not affected by a web error."
  - Actions: `ink` "Try again", `outline` "Return to projects".
- **Mobile 404** (*Mobile 22*). "This page is not on the map." with the note "Nothing was lost. The 5 records on this device and your unfinished observation are still here." The dock stays.

## 8. Motion and interaction

Motion conveys state, never decoration. Tokens are in `contour.json` → `motion`.

| Token | Duration | Use |
|---|---|---|
| `press` | 90 ms | The pressed fill |
| `quick` | 120 ms | Colour and badge changes, popovers and menus, tooltips, the next question fading in, the selected marker scaling |
| `reveal` | 140 ms, ease-out, height + opacity | Revealed follow-up questions and accordions (Handoff) |
| `base` | 160 ms | The switch knob, the Segmented pill, the ModeStrip pill, the collector's auto-advance delay, the point dropping in |
| `slide` | 200 ms | The InkTabs and TabDock pill |
| `enter` / `exit` | 200 / 150 ms | Dialog, ⌘K, toast, sheet |
| `camera` | 240 ms | The map easing to a selection, the zoom buttons |
| `skeletonDelay` | 400 ms | Placeholders appear only after this |
| `toast` | 6000 ms | A toast with Undo stays this long |
| `copied` | 1600 ms | "Copied ✓" before the label returns |

| Easing | Value | Use |
|---|---|---|
| `standard` | `cubic-bezier(.2, 0, 0, 1)` | Everything that enters or moves |
| `exit` | `cubic-bezier(.4, 0, 1, 1)` | Things leaving |
| `reveal` | `cubic-bezier(0, 0, .2, 1)` | Revealed questions and accordions |
| `linear` | `cubic-bezier(0, 0, 1, 1)` | Progress bars |

- **The web uses CSS only:** tokens, `@starting-style`, a `grid-template-rows` reveal, and Radix `data-state` keyframes. There is no motion library and no View Transitions.
- **Mobile** uses Reanimated 4.
- **Reduced motion** (`prefers-reduced-motion`; the OS setting on mobile):
  - movement becomes 0;
  - fades stay at or under `reducedFade` (100 ms);
  - camera moves jump.

  Every movement has this fallback.
- **What never moves:**
  - no shimmer or pulse;
  - no hover lift and no shadow on hover;
  - no overshoot or bounce;
  - no animated counters or growing numbers;
  - no simulated latency;
  - no parallax and no animated isolines;
  - no page transition between repeated observations;
  - the GL map view is never resized by animation (the collect map island's height changes instantly);
  - no celebration.

### Handoff rules for the collector

- **Screen change: no slide, no fade.** "Repeated collection is faster without transitions between observations." "Place the next observation" returns to Place at once.
- **Reveal: 140 ms ease-out, height and opacity.** "Long enough to see a question appear, short enough not to delay the next tap."
- **Progress: determinate, never a spinner.** "A spinner cannot distinguish stalled from working." Uploads and downloads show a bar or a count; a busy button shows its busy label.

### Signature interactions: web

- **Navigation.**
  - The white current-tab pill slides inside the ink bar. Its position is in CSS variables, with no slide on first paint. On narrow screens the tabs scroll with edge fades.
  - The org and project switchers are menus with typeahead, role and state.
- **⌘K "Search or jump to".**
  - It jumps to tabs, organizations, projects and the account. It does not search sites, zones, form versions, people or `OBS-` IDs yet.
  - Its actions are Day/Dusk, the map palette, "Export current view" and "Invite member".
  - It also lists recent items.
- **Shortcuts.** `g` then `o` / `d` / `s` / `f` / `t` / `q` / `r` for the tabs. `?` lists the shortcuts, and `/` focuses search.
- **Linked selection on Data.**
  - Selecting a map marker selects its table row, and the reverse. The row scrolls into view. The map eases (`camera`) only when the marker is off screen.
  - The selected marker scales from 1 to 1.15 with a ring.
  - The selection survives a filter change if the record still matches. Otherwise it clears, with the announcement "OBS-0244 is not in this view".
- **Review on Data (not built, D30).** Reviewing or excluding observations is not available yet. A record page says so in a `NotAvailable` note, and every uploaded observation is in the exports.
- **Filters** update instantly. "14 of 14 shown" sits in a live region, and "Clear filters" returns focus to the first filter.
- **New invitation.**
  - The link (`/invite#t=…`) and the 8-character code appear once, each with a Copy button. Copy turns into "Copied ✓" for `copied`.
  - The note reads "DECA Mark does not send email. Send the link or the code yourself. It is shown only once."
- **Publishing.** The confirm checkbox enables "Publish demo-v2", and the reason shows until it is ticked. Afterwards the version history updates.
- **Map packages.**
  - The step lives in `?step=`, so Back works.
  - The newest ready package is current; older ready ones show as Archived. Nothing is activated by hand.
- **Zone editor (not built, D30; zones come from QGIS). These rules are for a future editor.**
  - Handles are focusable buttons. Arrows nudge 1 map unit, and Shift + arrow nudges 10.
  - Delete removes a vertex but keeps at least three.
  - Edits sync both ways with the vertex table. ⌘Z undoes, and "Discard changes" asks for confirmation first.
- **Settings.**
  - Unsaved changes swap "Last saved yesterday by JL" for "Unsaved changes", and leaving the page asks first.
  - Deleting a project is not available yet. Archive and Unarchive only mark the project finished.
- **Auth.** Covered under `CodeInput` and `PasswordInput` in §5. A disabled button always carries its reason.
- **No preview actions (D30).** Every control does what its label says, and a missing feature is a `NotAvailable` note. Nothing changes session-only state.

### Signature interactions: collector

- **Steps.** The ModeStrip pill slides. A finished step can be tapped to go back.
- **Arming a point.** The map island gets a 3 px `accent` border, and the overlay label turns `accent` with "Tap where the play happened / One tap places the point". The panel shows "PLACEMENT ARMED". Panning is off, and ordinary map taps never create an observation.
- **Placing a point.**
  - The point drops in (scale 0.6 → 1, `base`) with a light haptic.
  - "Place at map centre" uses the camera centre.
  - "Adjust point" re-arms placement, with a nudge pad of at least 44 pt.
- **Answers.**
  - A single choice shows the filled tile, then advances after 160 ms.
  - The next question fades in (`quick`), and focus moves to its heading.
  - A revealed follow-up appears below the current question (`reveal`).
- **Saving.**
  - The Saved card's check scales in, with a success haptic, and the save is announced.
  - "Place the next observation" returns with no transition. MapLibre stays mounted across the steps.
- **Leaving.** X and Android back ask "Leave? Your draft stays on this device". Back also steps through the internal states.
- **Haptics** fire only when "Haptics on save" is on.
- **Elsewhere.**
  - The offline note appears inside the flow.
  - The dock badge counts records needing attention.
  - A download advances linearly, and each asset row moves Waiting → Downloading → Verified. "Set up this session" turns on once all four verify.
  - Pull to refresh on Observations calls the real `wake()`.
  - In landscape, the answer panel sits on the preferred hand's side.

## 9. Maps

Maps are drawn site plans in the colours of `contracts/map-palettes.json`, not tile maps. The web draws them as SVG (`SitePlan`) and the collector with styled MapLibre layers (`FieldMap`), from the same site GeoJSON, so a site looks the same to the observer and the manager. Day is the default palette and Night the low-light one. Aerial imagery is a photo with no palette. **The palette is a separate preference from the UI theme.** It switches from the Layers menu on the web and from "Map palette" in mobile Preferences.

### The plan

| Layer | Palette key | Day | Night |
|---|---|---|---|
| Background | `background` | `#eceae4` | `#1b1d2b` |
| Site boundary | `site.fill` / `site.edge` | `#f8f7f3` / `#9a9ca6` | `#20233a` / `#2f3350` |
| Grass, mulch, dirt, path, blacktop | `surfaces.*` | `#cfe2c2`, `#dcc3a6`, `#e6d9bd`, `#dedfe3`, `#c4c7cf` | `#1e2a23`, `#2d2520`, `#2c2a22`, `#2b2d3b`, `#22232b` |
| Structure | `structure` | `#d6d8df` | `#24273a` |
| Equipment | `equipment` | `#cbc5ee` | `#2d3042` |
| Trees (circles, opacity 0.85) | `tree` | `#a9cc99` | `#2b3527` |
| Paths (wide lines) | `path.line` | `#b3b6bf` | `#2f3243` |
| Zone | `zone` | edge `#5d5294`, fill `#796cbf` at 8%, label `#423a6a` | edge `#796cbf`, fill `#9184d9` at 6%, label `#75798c` |
| Observation | `observation` | fill `#5d5294`, ring `#ffffff`, selected `#2b2741` | fill `#5d5294`, ring `#d2cefd`, selected `#b5abfc` |

Each surface also has an `edge` colour in the file. The values above are copied for reading only. The file is the source, and its keys stay identical across palettes.

- **Zones.** A dashed `zone.edge` outline over a faint `zone.fill`. The label sits in a pill centred in the zone: white with `zone.label` text at 600 in Day, and a dark pill with light text in Night (*System 3*). The Overview and Site maps add `CoverageDots` in the zone's label pill, in observation violet.
- **Hatched focus zone.** 45° hatching in `zone.edge`, with the dashes drawn heavier. It marks:
  - the session's zone while collecting;
  - the boundary being edited;
  - a boundary changed in a package preview ("Hatched: boundary changed since v3").

  The collector uses an 8 × 8 hatch image through `fill-pattern`, falling back to fill opacity.
- **Observation dots.** `observation.fill` with a 2 px `observation.ring`. Selected: the dot scales 1 → 1.15 and gains a ring and a halo in `observation.selected`. The collector's placed point adds four crosshair ticks.
- **Controls.** Top right: round `+` and `−` `IconButton`s with a ledge, and the Layers button with a 2 px `ink` border. Layers opens the menu for the Day/Night palette and the layer toggles. 44 on the web, 48 on mobile. On the web the map is keyboard operable: `+` / `−` zoom and the arrows pan when the map has focus.
- **Overlay label.** A small island at the top left (r 14, ledge): a title at 600 and a `small` `ink2` detail.
  - Examples: "Riverside · Day plan / Map v3", "Point placed / Drag it to adjust", "14 of 14 shown / Selected: OBS-0244", "riverside-v4.zip · preview / Hatched: boundary changed since v3".
  - The plan's name always says which palette is showing ("Day plan", "Night plan").
  - While a point is armed, the label turns `accent` (see §8).
- **Scale chip.** A pill at the bottom left: "0–25 m" in mono over a 2 px `ink` scale bar, then "Map v3 · north ↑". As one string: "0–25 m · Map v3 · north ↑".
- **The frame.** In a web island the map sits in an `InnerPanel` (r 20, 1 px `line`). In the collector the map is its own island. The map island's height changes instantly, and the GL view is never animated.
- **Map colours stay on the map (rule 03).** No UI state colour appears inside a plan. Review and upload states show in the table, the label and the record, never as dot colours. The UI theme never recolours a plan.
- **A text equivalent for every map.** Every map has a table or list beside it (the Data table, the zones table, the zone editor's vertex table "5 points · map units"). Markers are buttons with names ("OBS-0244, Woodland edge, Round 3").

## 10. Copy

[PRODUCT.md](PRODUCT.md#voice-and-copy) holds the voice, the register by audience, the glossary's words to avoid, and the table of old wording against Contour wording. This section is the checklist a screen's copy is held to, with examples from the designs.

### Rules

| Rule | Write | Not |
|---|---|---|
| **Say where the work is.** On this device, uploading, uploaded or held. | "Saved on this device", "Draft kept on this device", "5 only on this device · 4 uploaded" | "Saved", "Synced", "Done" |
| **Buttons are verb + object, in sentence case.** In a flow, step controls may be one word: Back, Continue, Review. | "Save on this device", "Correct and send again", "Place the next observation", "Activate v4", "Return to projects" | "Submit", "OK", "Yes", "Save Changes" |
| **Errors say what happened, what is safe, then what to do.** | "We could not load this page. Nothing was removed. Check your connection and try again." | "Something went wrong. Please try again." |
| **On the phone, an error's first line says where the work is.** | "Your draft is still on this device" | "Error loading screen" |
| **Say what is needed. No blame, no "Oops", no exclamation marks, no "successfully".** | "Up to ten uppercase characters." | "Invalid initials!", "Oops", "Saved successfully" |
| **Validate late, confirm early.** | "✓ 16 characters · Use at least 8." while typing; "Does not match yet" after the field loses focus | "Passwords don't match!" on every keystroke |
| **A disabled control says why, right below it.** | "The button turns on when both passwords match." | A grey button with no reason |
| **Consequences come before the irreversible step.** | "Deletion must respect research-retention rules. You see every affected project, form and record before anything is removed." then "Type DELETE to confirm" | "Are you sure?" |
| **Never claim more than the system knows.** | "Device readiness, as last reported", "Yesterday · may be stale", "Records still on devices are not counted here." | "All devices ready" |
| **Illustrative numbers say so.** | "Target: 3 rounds per zone, 2 or more observations in each (illustrative)" | "Target: 3 rounds per zone" |
| **Nothing is implied that does not exist.** | "Store links and the install QR code appear after the first signed app release. Nothing here points to a store that does not exist yet." | A dead store badge |
| **Field language for observers, research language for managers.** | Collector: "Place a point", "Ready offline". Web: "Coverage is compared with an illustrative target of 3 rounds per zone. Record abundance is not completeness." | Research jargon on the phone, chatty copy on the web |

### Formatting

- **Separator:** " · " (a middle dot with spaces) between facts: "North meadow · Round 1 · 11:34", "DECA Lab · 2 sites · observer access". Steps use it too: "1 · Place".
- **Flows** use "→": "QGIS → upload → inspect → download." Breadcrumbs use the `chevron-right` icon, not a character.
- **Ranges** use an en dash: "0–25 m", "6–8 yrs", "rounds 1–3".
- **Counts.** "X of Y" for progress and filters: "4 of 6", "14 of 14 shown", "60 of 126 MB", "3 of 8 answered". "X / Y" for a fraction in a table cell and for a character counter: "2 / 3", "69 / 1000".
- **Times** use the 24-hour clock in the project's timezone (America/New_York for Play Study): "11:34", "Oct 02 · 11:32", "Today 11:25", "Yesterday", "Sep 30".
  - A time in its own column or in the timeline gutter is mono.
  - A time inside a sentence or a meta line stays in Geologica: "Showing what loaded at 11:36."
- **Loading text** ends with one ellipsis character: "Loading observations…". Nothing else uses an ellipsis.
- **Mono strings.** IDs are `OBS-0244` and references `REQ-7F3A-21`. Versions are `v3` and form IDs `demo-v1`, `janet-test-v1`. Codes are `DECA2026`. In headers and eyebrows they read "MAP v3 · FORM demo-v1", with the label part uppercase and the ID as it is.
- **Eyebrows** are `monoLabel` and uppercase by style: "REVIEW · BEFORE SAVING", "PLAY STUDY · SITE", "QUESTION 2 · PLAY".
- **Proper names keep their case:** Play Study, DECA Lab, Riverside, North meadow.
- **No emoji.** The only symbols are those the designs use: ✓ in a confirmed counter or "Copied ✓", ↑ in "north ↑", ⌘ in shortcuts, and →.

### Vocabulary

One set of words in both apps (U1). The full glossary, with the words to avoid, is in [PRODUCT.md § Glossary](PRODUCT.md#glossary-u1).

| Word | How it appears | Example |
|---|---|---|
| **Project** | Never "Study" or "Assignment" | "Projects · Research spaces you have joined." |
| **Site** | One real place | "Riverside", "Sites › Riverside" |
| **Zone** | A named area of a site | "North meadow", "Zone A · 7 observations" |
| **Form**, with **versions** | The version ID in mono, with its state word | "`demo-v1` Published", "`janet-test-v1` Draft · protocol incomplete" |
| **Map package** | Versioned per site, with the version in mono | "Map package v3", "MAP v3", "Riverside map packages" |
| **Observation** | `OBS-` plus 4 digits. "Record" only in sentences about storage and upload. | "14 observations", "5 records not uploaded" |
| **Round** | The protocol round the observer picks. Nothing is scheduled. | "North meadow · Round 1", "No scheduled assignment is implied." |
| **Observer code** | The initials, mono where they are data | "Observer PS", "Observer code · Up to ten uppercase characters." |

**State words are fixed.** They come from the vocabulary in §6 and are never rephrased: "Uploaded", not "Synced"; "Needs attention", not "Failed"; "Held", not "Paused". A qualifier follows " · ": "Waiting · sent Sep 30", "Upload waiting · offline", "Unknown · AK last reported yesterday".

**Honesty copy is fixed too.**

- A feature with no backend reads "X is not available yet."
- A count or export taken from a capped list reads "Based on the newest 500 observations."
- On mobile, proposal flags read "PROPOSAL U2" to "PROPOSAL U7", followed by one plain sentence about what is undecided.

## 11. Accessibility and anti-patterns

### Checklist

Every screen passes these in Day and in Dusk before it is done.

**Colour and contrast**

- [ ] Text is 4.5:1 and UI parts are 3:1 against the surface they sit on. Only tokens are used, and `pnpm tokens:check` passes.
- [ ] Every state is a glyph, a word and a colour (rule 02). Coverage dots, timeline rings and map markers have words beside them or accessible names.
- [ ] `line` (1.8:1) is never the only thing separating a control from its surface. Controls carry `ink` borders or fills.

**Focus and keyboard**

- [ ] The focus ring (3 px, 3 px gap, `onNav` or `focusGap` inside ink fills) shows on every interactive element. Nothing removes outlines.
- [ ] Web: a "Skip to content" link comes first. Focus moves to the page heading on navigation.
- [ ] Tables use roving focus as one tab stop, with ↑ / ↓ / `j` / `k` and Enter.
- [ ] Dialogs trap focus, close on Esc and return focus to their trigger.
- [ ] The map and zoom are fully keyboard operable, and every map has a table or list beside it.
- [ ] The tabs, ⌘K, the menus and the switchers are reachable and usable by keyboard. Shortcuts never fire while typing in a field.

**Touch and text**

- [ ] Targets are at least 44 on the web and 48 in the collector; answer tiles and the collect flow's actions are 60.
- [ ] Text follows browser zoom to 200% and the largest device text size. Labels wrap; nothing truncates or overlaps.
- [ ] Mono labels are typed in normal case.

**Names and announcements**

- [ ] Every icon-only control has an accessible name. Decorative icons are hidden.
- [ ] Every input has a visible label. Hints, counters and errors are linked with `aria-describedby`, and errors are announced.
- [ ] A disabled control keeps focus where the platform allows and exposes its visible reason.
- [ ] Live regions announce saves, uploads, filter counts ("14 of 14 shown"), selection changes ("OBS-0244 is not in this view"), validation and toasts. Mobile announces through the platform API.
- [ ] VoiceOver and TalkBack cover sign in → join → place → answer → review → save. The ModeStrip and StepBar announce "Step 2 of 3".

**Motion, sensory and print**

- [ ] With reduced motion, nothing moves, fades stay at or under 100 ms, and camera moves jump.
- [ ] Haptics fire only when the preference is on. No information is given by haptics alone.
- [ ] Printed and PDF output is forced to Day, has no ledges, and fits its page.
- [ ] Axe reports no serious or critical findings on the web, in both themes.

### Anti-patterns to refuse

| Refuse | Because | Instead |
|---|---|---|
| Side-stripe accents (a coloured border on one side of a card, note or row) | Decoration that reads as a state with no word | The only side stripe is the 4 px `ink` bar on a selected table row |
| Gradients, including gradient text and gradient buttons | Contour is flat colour. A gradient is not a token and fails contrast checks unpredictably. | A token fill. The exceptions are the edge-fade mask on scrolling tabs, which signals scrolling, and the brand mark, which keeps the app icon's own gradient ground (D29). |
| Glass: backdrop blur, translucent panels over the map | Left for later. It fails in sun and is costly in React Native. | `island` surfaces with a ledge |
| Soft or stacked shadows, elevation ramps | Depth comes from the ledge alone | The 6 px solid ledge, on islands and map overlays only |
| Hero metrics: rows of big-number KPI tiles | Record abundance is not completeness, and numbers without context overclaim | A sentence ("14 observations across three zones.") with its caveat, plus `TypeBars` and coverage tables |
| Card in card: an island inside an island, or ledges on nested surfaces | Breaks the one layer of depth | `InnerPanel` (flat, `line`, no ledge) or a `Note` inside an island |
| Decorative motion: shimmer, pulse, hover lift, bounce, parallax, animated counters, celebration | Motion conveys state, never decoration | The tokens in §8, each with a reduced-motion fallback |
| Two magenta buttons on one screen | Rule 01 | One `primary`, then `ink` and `outline` |
| Accent for selection, focus or navigation | Magenta means "do this now" | `ink` for table selection, focus, tabs and settings choices. The only selections shown in magenta are the collector's chosen answer and the session's zone. |
| Colour-only state: dots, chips or row tints with no word | Rule 02 | `StateText` or `StateBadge` from the vocabulary |
| Truncation: ellipses, line clamps, `numberOfLines` | Rule 05: labels wrap | Rows and tiles grow; tab and chip rows scroll |
| UI state colours inside a map, or violet in the UI chrome | Rule 03 | Palette colours on the map; state in the table, label and record. The one violet in the chrome is the brand mark, the purple app icon (D29). |
| Spinners and indeterminate progress | A spinner cannot tell stalled from working | A determinate `ProgressBar`, a count, or a busy label |
| Illustrated empty states | Plain words, one action, no illustrations | `ScreenState` with an icon disc |
| A disabled control with no reason | The person cannot tell what to do | A visible reason line under it |
| Sample data, fixtures, or a marker that says so | The web is live (D30) | Real data, or one `NotAvailable` note where there is no backend |
| Dark by default, or following the OS dark mode | Rule 06: a dark screen turns into a mirror in direct sun | Day by default; Dusk only by choice |
| Hex values in components | Two sources of truth drift | Tokens from `contour.json`, and `map-palettes.json` for maps |
