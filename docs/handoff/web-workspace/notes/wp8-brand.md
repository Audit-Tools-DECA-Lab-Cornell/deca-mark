# wp8-brand report

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## Summary
WP8 (brand) is finished. The collector's mark is now the purple app icon instead of the black ring mark, and a test stops it drifting from the icon file. DESIGN.md and decision D29 now say the purple app icon is the one brand mark on web and mobile.
- New `mobile/src/ui/brand-artwork.ts` holds the icon's numbers in its own 1024 x 1024 space, typed as `BrandArtwork`. Everything was checked against `icon.svg` and `generate.py` and matches the values in the task: ground gradient #20223a to #161826 (cx 512, cy 430, r 760); the plan scaled 1.2 about the centre; zones #5d5294, #796cbf and #423a6a with 52 rounded corners; the path stroked #161826 at width 44 with round caps, shown only inside the zones; marker rings 128 #161826, 98 #e9e9ed and 58 #9184d9 at (520, 538).
- I added one value that is not in the icon file: a rounded corner of 230, taken from `web/public/icons/icon.svg`, so the in-app mark has the same rounded-square shape as the web icon.
- `mobile/src/ui/Logo.tsx` now draws the mark from those numbers with react-native-svg. It no longer uses the theme's accent, so it looks the same in Day and Dusk. The `Logo({wordmark, style, testID})` props, the 34 px size and the accessibility behaviour are unchanged, so no call site changed: ScreenHeader (tab roots and Account), the Welcome screen, the sign-in screens, the invitation screen, the loading screen in `app/_layout.tsx`, and the dev gallery.
- New `mobile/src/ui/brand-artwork.test.ts` (10 tests) reads `icon.svg` and checks every colour (as a set), the viewBox, the gradient, the scaling, the zones in order, the zone clip, the path's d, stroke, width, caps and clip, and the marker rings. It also checks that `web/public/icons/icon.svg` uses the same colours and the 230 corner.
- I changed five values one at a time (a zone colour, the path, the corner, a ring radius, the gradient colour); each change made the test fail. The file was restored afterwards and diffed against a backup to confirm.
- Searching `mobile/` found no other ring-mark drawing. The only other `Ellipse` is the map pin's shadow in `features/collect/pin.tsx`.
- DESIGN.md: I added a "Brand mark" bullet at the top of Navigation (the purple app icon everywhere, which files draw it, change it in `generate.py` first). I rewrote the web header line, which now reads "the purple app icon, 36 px". I added the brand-mark exception to rule 03 and to the anti-pattern row about violet in the chrome. In the same doc I also updated the gradients row and the "no hex value outside the tokens" line, because the icon's gradient and colours would otherwise break those rules.
- D29 was added to `docs/plan/decisions.md` in the file's row format: the purple app icon is the one mark on web and mobile, at the owner's request, for consistency with the installed icon, favicon and store listing. It replaces the ring mark that came with the Contour designs (D19, WEB-20, MOB-23); the rest of D19 stands. It cites WEB-22, not WEB-27, because `plan:check` rejects IDs that are not defined yet.

## Files
/home/user/Field-Maps/mobile/src/ui/brand-artwork.ts
/home/user/Field-Maps/mobile/src/ui/brand-artwork.test.ts
/home/user/Field-Maps/mobile/src/ui/Logo.tsx
/home/user/Field-Maps/mobile/assets/icon-source/README.md
/home/user/Field-Maps/DESIGN.md
/home/user/Field-Maps/docs/plan/decisions.md

## Checks
All run with Node v24.21.0 and pnpm 10.17.1 from the scratchpad toolchain:
- `pnpm mobile:check` (mobile tsc --noEmit plus biome check): exit 0. Biome checked 246 files and reported 5 infos, all useLiteralKeys in files I did not touch (`src/features/collect/CollectMap.tsx:623`, `src/packages/hosted/build.ts:137`, `src/packages/hosted/prepare.test.ts:200,202`).
- `pnpm --dir mobile test` (vitest): exit 0; 41 test files and 443 tests passed, including the 10 new brand-artwork tests.
- Five single-value changes to `brand-artwork.ts` each made the test fail (3, 1, 1, 1 and 3 failing tests); after restoring the file, all 10 passed.
- `pnpm plan:check`: passed (121 tasks across 13 files), exit 0.
- `pnpm tokens:check`: contour.css matches the contract and every contrast pair passes, exit 0. No root `pnpm install` was needed and no lockfile changed.
- biome check on `src/ui` and the icon-source README: clean.
- Visual check: a scratchpad script built SVG markup with the same structure as Logo.tsx from `BRAND_ARTWORK` and screenshotted it in headless Chromium (Playwright from web/node_modules, browsers in /opt/pw-browsers) at 34, 48 and 96 px. It was shown beside "DECA Mark" on Day and Dusk ground and island colours from `contracts/contour.json`, next to `web/public/icons/icon.svg`. The mark matched the web icon and was readable at 34 px in both themes. This is not a react-native-svg render on a device or simulator.

## Open issues
- Not checked on a device or simulator. The look was checked in Chromium with markup that copies Logo.tsx's structure, plus typecheck, lint and tests. The react-native-svg features it relies on (G scale with origin, a ClipPath on a Path inside a scaled group, a userSpaceOnUse RadialGradient) are standard, but nobody has looked at it on iOS or Android.
- Every mark uses the same fixed gradient and clip ids (`decamark-mark-ground`, `decamark-mark-zones`). If one screen draws two marks, the ids clash, but both draw identical artwork, so nothing visible changes.
- In Dusk the mark's dark square sits on a dark ground, so its edge is faint. The purple zones and marker stay clear, and logos are exempt from WCAG non-text contrast. This is the same artwork as the launcher icon.
- The mobile test also reads `web/public/icons/icon.svg`, which is a web file. If anyone changes that file's colours or its corner of 230, `pnpm mobile:test` fails. That is on purpose, to keep the web and mobile marks the same.
- Beyond the listed files: I added one paragraph to `mobile/assets/icon-source/README.md` saying to update `brand-artwork.ts` after editing `generate.py`. No other work package owns that file.
- Beyond the three named DESIGN.md lines, I also edited the hex-values line in Token names (about line 50) and the gradients row in the anti-patterns table, and added a Brand mark bullet at the top of Navigation. Without these, the doc would contradict the new mark.
- The comment at the top of `mobile/src/ui/index.ts` still says nothing in `src/ui` holds a hex value. `brand-artwork.ts` is now the documented exception (stated in its header, DESIGN.md and D29). I left `index.ts` alone because it is outside my files; WP10 may want to reword it.
- The web BrandMark (`web/src/components/shell/Brand.tsx`) still draws the ring mark, because that change belongs to WP0B. Until it lands, the web header and DESIGN.md disagree.

## Notes for screens
- **Mobile:** `Logo` is unchanged: `export function Logo({ wordmark?: boolean; style?: StyleProp<ViewStyle>; testID?: string }): JSX.Element`, exported from `mobile/src/ui` (index.ts) along with `LogoProps`. Without `wordmark`, the mark alone is labelled "DECA Mark" as an image; with it, the mark is hidden from screen readers and the text "DECA Mark" sits beside it. It is drawn at 34 px.
- **Shared artwork:** `mobile/src/ui/brand-artwork.ts` exports `BRAND_ARTWORK` (`as const satisfies BrandArtwork`) and the types `BrandArtwork`, `BrandZone` and `BrandRing`. Fields: `size` 1024, `corner` 230, `background {cx, cy, r, inner, outer}`, `scale` 1.2, `zoneCorner` 52, `zones[] {x, y, width, height, fill}`, `path {d, stroke, width}`, `marker {cx, cy, rings[] {r, fill}}`.
- **For WP0B (web BrandMark):** show `/icons/icon.svg`. That file already clips itself to a rounded square (rx 230 of 1024), so do not add CSS rounding on top. Use 36 px (`size-9`) to match DESIGN.md's header line. Keep `alt=""` / `aria-hidden` when "DECA Mark" text is beside it, and give it a "DECA Mark" label when it stands alone. Do not draw it with tokens: it is artwork and looks the same in Day and Dusk.
- **For WP7:** the home page (`app/(marketing)/page.tsx`) already uses `/icons/icon.svg` but adds `rounded-[22%]`. That class is redundant, because the file is already rounded.
- **For WP10 (docs):** D29 now exists, so the next decision is D30. The brand lines in DESIGN.md are done; no further brand edits are needed. `pnpm mobile:test` now includes `src/ui/brand-artwork.test.ts`.
