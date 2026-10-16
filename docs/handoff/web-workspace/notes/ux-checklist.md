# DECA Mark web manager screens: UX checklist (Contour)

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

Sources: DESIGN.md (wins on any conflict), PRODUCT.md (glossary, honesty), ui-ux-pro-max (admin/dashboard rules), the code in `web/src/components/contour`. Read DESIGN §5 to §7, §10 and §11 before building. The reader is a researcher who manages a study (Janet). Every word must be true for live API data.

## 1. Primitives: `import { … } from "@/components/contour"` (one index for all of them, server components included)

**Actions**
- `Button`: `variant` primary | ink | outline | soft | danger | danger-solid | ghost; `size` md (46) | sm (36) | lg (56); `icon`, `iconRight`, `fullWidth`; `busy` + `busyLabel` (keeps its width, no spinner); `disabledReason` (draws the visible reason line and wires aria-describedby). `ButtonLink` has the same look with `href`.
- `IconButton`: `icon`, `label` (required name), `variant` map | plain | ink | outline, `size` md | sm, `active`.
- `TextLink`: `href`, `tone` accent | ink, `arrow` right | left | false, `icon`. `Icon`: `name: IconName` (Lucide registry + `held`), `isIconName()`.

**Containers**
- `PageHeader`: `title`, `lead`, `breadcrumbs: Crumb[]`, `actions`, `titleAddon`, `titleMono`. It renders the h1 (`PAGE_TITLE_ID`).
- `Island`: `title`, `meta` (count or StateBadge on the right), `actions`, `flush` (edge-to-edge table or list; turns on `divided`), `footnote`, `tone="danger"`, `titleIcon`, `headingLevel` 2 | 3. `IslandSection` (`rule`) adds padded blocks inside a flush island.
- `InnerPanel`: `tone` plain | well, `dashed` (a slot for something that does not exist yet), `flush`. Use it in place of an island inside an island.
- `Note`: `tone` saved | waiting | uploaded | attention | held | neutral, `title` (the bold first sentence), `icon`, `live` (set it when the note appears after an action). Not dismissible.
- `ProposalNote`: `code` ("U5"), `inline` for the page-header form; children are one plain sentence.
- `FactsList`: `items: {label, value, mono?}[]`, `labelWidth`; renders a `<dl>`. `Dialog`: `open`/`onOpenChange` or `trigger`, `title`, `description`, `footer` (outline cancel, then the one filled action), `size` sm | md | lg; `DialogClose`.
- `Menu`: `MenuTrigger`, `MenuContent`, `MenuItem` (`icon`, `onSelect`, `href`, `tone="danger"`, `shortcut`, `disabled`), `MenuRadioGroup`/`MenuRadioItem`, `MenuCheckboxItem`, `MenuLabel`, `MenuSeparator`. Also `Popover*`, and `Tooltip` (`content`, `side`, `align`) inside `TooltipProvider`.

**State, data and charts**
- `StateBadge`: `kind` queue | review | form | package | check | coverage | readiness | project | invitation | connection | proposal | role, `state` (a key from contracts/contour.json; an unknown key throws), `label` (word plus a qualifier: "Waiting · sent Sep 30"), `size` md | sm.
- `Table` (`caption`, sr-only), `THead`, `TBody`, `Tr` (`selected`, `onSelect`, `href`, `interactive`), `Th` (`numeric`), `Td` (`mono`, `numeric`, `nowrap`). `useRovingRows({count, selectedIndex, onSelect, onOpen})` returns `{bodyProps, rowProps(i)}`: spread them on TBody and Tr.
- `ScreenState`: `kind` loading | empty | filtered | error | offline | no-access, `title`, `body`, `actions` (2 at most), `icon`, `loadingLabel`, `rows`, `loadedAt`, `headingLevel`, `children` (the content kept under the offline banner). `Skeleton`: `className`.
- `TypeBars`: `rows: {label, value}[]`, `max`. It does not sort, so sort descending before passing rows. `CoverageDots`: `values: boolean[]`, `layout`, `tone` ink | map, `label`; `coverageSummary()`. `ProgressBar`: `value`, `max`, `label`, `detail`. `Timeline`: `items: {tone, title, detail, time}[]`.
- `Mono`: `variant` data | label | code | title, `as`. `Avatar`: `initials`, `tone` ink | well, `size`, `label`. `RoleLabel` (header only). `Kbd`, `ShortcutHint`.
- `useToast().toast({title, description, tone, action: {label: "Undo", onClick}, duration})`, rendered inside `ToastProvider`.

**Inputs**
- `Field`: `label`, `htmlFor` (= the control's id), `hint`, `error` (replaces the hint), `success`, `optional`, `counter`. Every control goes inside one.
- `TextInput`: `invalid`, `leadingIcon`, `trailing`. `Textarea`: `showCount`. `PasswordInput`. `Select` (native, `invalid`). `CodeInput`: `id`, `length` 6 | 8, `kind` otp | join, `value`, `onChange`, `onComplete`.
- `Checkbox` and `Switch`: `id`, `checked`, `onCheckedChange`, label (`children` or `label`), `description`. `Segmented`: `value`, `onValueChange`, `options: {value, label, icon?}[]`, `label`, `fullWidth`. `RadioRows`: `options: {value, label, description?, disabled?}[]`, `label`. `NumberStepper`: `value`, `onChange`, `min`, `max`, `label`. `StepBar`: `steps: {key, label, href?}[]`, `current`, `done[]`, `label`.

**Shell and helpers outside the index**
- `@/components/shell/LoadFailure`: `failure` (from `settle()`), `what` ("the team"), `noAccess`, `bare`. A failed read is never shown as an empty list.
- `@/components/shell/NotAvailable`: `title`, `reason`, `instead`. Use it wherever a button would not work.
- `@/components/shell/PlaceRows`: link rows `{href, icon, title, detail}` (DESIGN's ListRow).
- `@/features/team/StackedRows`: table rows as cards below 640 px. If a second screen needs it, move it to a shared location.
- `@/lib/labels`: `shortLabel(id)` ("OBS-3F2A1B"), `roundLabel`/`roundName`, `ROUND_TYPES`, `zoneName`, `NO_ZONE`, `formatBytes`. `@/lib/format`: `formatDateTime`/`formatDate`/`formatTime` (24 h, in the site's time zone), `formatCount`, `plural`. Never format dates or counts by hand.
- **Do not import** `components/nocturne`, `components/studio` or `components/app-shell`, and do not use `lib/states.ts`. They hold Nocturne-era words and glyphs ("In database", "Flagged", ⚠).

## 2. Where the code differs from DESIGN.md (follow DESIGN's intent through the code that exists)
- DESIGN's `danger-filled` is `danger-solid` in code. DESIGN's `StateText` is `StateBadge` (an icon and a word, with no pill). Do not use `ghost` or `soft`; prefer `outline`.
- `Island` has no `state` prop. Render `<ScreenState>` as the children of a `flush` Island, so the header stays.
- `Table` only scrolls sideways. DESIGN wants cards below 640 px, so wrap the table in `hidden sm:block` and add `StackedRows`.
- `Segmented` has no `chips` variant. For a filter with more than 4 options, use a native `Select` inside a `Field`.
- IDs from live data have 6 hex characters ("OBS-3F2A1B"), not the 4 digits of the fixtures. Always build them with `shortLabel()`.
- Decision D26 replaced numbered rounds with Standard, Reliability and Inventory. Anything in DESIGN that says "Round 1", "Round 3" or "rounds 1–3" is stale. CoverageDots ("2 of 3 rounds met the target") applies only where a project sets a target. Otherwise leave it out; never invent one.
- `ScreenState`'s built-in wording is about observations and map packages. On any other subject, always pass `title`/`body`/`loadingLabel`.

## 3. Checklist

**Layout**
- [ ] `PageHeader`, then islands with a 24 px gap, at most 1440 px wide. At 1024 px the islands stack; at 768 px Data shows the map and the table, with the selected record in a `Dialog`.
- [ ] One `primary` button per screen. The strong second action is `ink`, the rest are `outline`. Selection, tabs and focus are ink, never magenta.
- [ ] No island inside an island (use `InnerPanel` or `Note`). The only depth is `shadow-ledge` on islands and map overlays. No gradients, blur, soft shadows or side stripes; the one exception is the selected row's ink bar.
- [ ] Spacing uses only Tailwind 1, 2, 3, 4, 5, 6, 8, 10 and 14. Colours are tokens only (`bg-island`, `text-ink-2`, `border-rule`, `text-saved`…). No hex, no `opacity-*` on text that carries meaning.
- [ ] No KPI tiles. Lead with a sentence and its caveat ("14 observations across three zones." / "Records still on devices are not counted here."), then bars or tables.
- [ ] Every map has a table or list beside it. Inventory records sit at their zone's centre, so label them ("Zone inventory") and never read them as places where play happened.

**Tables at 390 px**
- [ ] The page never scrolls sideways at 390. The table stacks into `StackedRows` below 640: the ID and state on top, then label and value lines, then actions last.
- [ ] Nothing is truncated: no `truncate`, `line-clamp` or ellipsis. Use `nowrap` only on short values (IDs, times, versions). Numbers are `numeric`; IDs, versions and sizes are `mono`.
- [ ] At sm and up, rows are 54 px or taller with monoLabel column headers. A row that opens has a real link in it (the OBS ID or the zone name); `Tr href` alone is not enough.
- [ ] Filter rows wrap or stack full width at 390. A filtered table shows its count ("14 of 14 shown") in a live region beside the filters.

**States: every data island has all six**
- [ ] Loading: `ScreenState kind="loading"` with rows shaped like the content and a `loadingLabel` that names the subject ("Loading the team…"). It waits 400 ms, never shimmers, and the region is aria-busy.
- [ ] Empty after filtering: `ink` "Clear filters", which returns focus to the first filter. Nothing made yet: one action, if the action exists ("Upload package"); otherwise say what will make it appear.
- [ ] Error: use `LoadFailure`, which says what happened, what is safe and what to do, with `ink` "Try again". Offline: `kind="offline"` with `loadedAt`; disable changing actions and give the reason.
- [ ] No access: name the role, what it can do, and who can change it. Not built yet: `NotAvailable`, never a dead button. Each state can be previewed with `?preview-state=`.
- [ ] Live screens never say "sample", "Preview data" or "demo". Proposal concepts (U2 to U7) carry a `ProposalNote` every time.

**Forms and validation**
- [ ] Every control sits in a `Field` with a visible label. The hint says what the value is for or where it goes ("Short and unique. It appears in export file names."). Placeholders are examples, never the label.
- [ ] Validate on blur or submit, never on each keystroke. Positive live counters are fine ("✓ 8 of 8"). An error replaces the hint, says what is needed ("Enter up to 10 uppercase characters") and is announced.
- [ ] When a submit fails, focus moves to the first invalid field. A server failure becomes a `Note tone="attention"` beside the action that says what was kept.
- [ ] Every disabled button sets `disabledReason` ("Only project managers can invite members."). A running action uses `busy` + `busyLabel` ("Inviting…", "Uploading 1 of 3").
- [ ] Destructive flow: a `danger` button opens a Dialog that lists every affected item, then type-to-confirm, then `danger-solid`. Never "Are you sure?". A reversible change gets a Toast with Undo.
- [ ] Use `type="email" autoComplete="email"` for invitations. Settings show "Unsaved changes", and leaving the page asks first.

**Bars and charts**
- [ ] Use `TypeBars` (ink bar, count as monoData text) under a monoLabel eyebrow ("BY ROUND"). Sort descending; zero rows stay visible. Use no pie charts and no colour per category in the chrome.
- [ ] Every chart has its numbers as text or a table, and an empty set shows a ScreenState, not empty axes. Targets say "(illustrative)". Map violet appears outside the map only in a map legend.

**Focus and keyboard**
- [ ] Never remove the global `:focus-visible` ring. Tables use `useRovingRows`: one tab stop, ↑ ↓ j k Home End, Enter opens. `a`/`x` work on Data only, and shortcuts never fire inside a field.
- [ ] Every IconButton has a name ("Zoom in"); icons beside words are aria-hidden. Dialogs trap focus, close on Esc and return focus to the trigger. Headings go h1 (PageHeader), then h2 (Island), then ScreenState one level below.
- [ ] Live regions announce filter counts, cleared selections ("OBS-3F2A1B is not in this view"), saves and toasts. A Tooltip never holds information the person needs.

**Contrast**
- [ ] Check Day and Dusk (`data-theme="dusk"`). Text is 4.5:1 and UI parts 3:1; `pnpm tokens:check` passes, and axe finds nothing serious. `line` is never the only edge of a control. Every state is a glyph, a word and a colour (`StateBadge`).

**Copy: sentence case; verb + object buttons; " · " between facts; no "Oops", "!", "successfully" or emoji**

| Subject | Write | Not |
|---|---|---|
| Sites | "Riverside · 3 zones · Map package v3"; empty: "No sites yet" + what a site is for | "Locations", "Places", "Site 1" |
| Zones | "North meadow · 7 observations"; records without a zone: "No zone" | "Region", "Polygon 3", "Unassigned area" |
| Map packages | "Activate v4" + "v3 becomes Archived."; upload: "Sends this package to the DECA Mark API." | "Basemap", "Tiles", "Bundle uploaded successfully!" |
| Forms | "`demo-v2` Draft · 2 changes", "Publish demo-v2", reason until the box is ticked | "Survey", "Instrument", "Submit", "Save Changes" |
| Rounds | Cell "Reliability"; sentence "Reliability round"; Inventory: "Zone inventory · one per zone" | "Round 1", "Visit", "Shift", "Scheduled", "Assigned to you" |
| Observations | `OBS-3F2A1B` (mono, linked); "OBS-3F2A1B approved · Undo"; Not yet reviewed / Approved / Excluded | "Entry", "Submission", "Response #12", "Accepted", "Rejected" |
| Observers | "Observer PS"; "Observer code · Up to ten uppercase characters. Changes apply to future observations only." | "User ID", "Username", "Anonymous" |
| Team | Role words from `kind="role"`; "Invite member"; "Waiting · sent Sep 30" / "Accepted" / "Revoked" | "Pending", "Invite sent!", "Remove user?" |
| Uploads | "Uploaded" only after the server acknowledges; "5 records not uploaded" | "Synced", "Sent", "Failed", "Error" |
| Errors | "We could not load the team. Nothing was removed. Check your connection and try again." | "Something went wrong. Please try again." |
| Readiness | "Ready offline, as last reported · Yesterday · may be stale" | "All devices ready" |

- Use numerals with "X of Y" for progress and filters ("4 of 6") and "X / Y" in table cells. Use an en dash for ranges ("0–25 m"). A loading label ends with one "…", and nothing else uses an ellipsis.
- State words come from the vocabulary and are never rephrased. "Record" appears only in sentences about storage or upload; tabs and titles say "Observations".
- Before shipping, read each screen as Janet: every label names a real thing in her study, every number says what it counts and what it leaves out, and nothing promises an action the API does not perform.
