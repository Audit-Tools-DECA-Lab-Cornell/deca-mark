# verify-accessibility notes (HEAD b93a2b2; mobile/web code identical to audited 9928f53 except sync tests)

## A11Y-01 -> confirmed (partially: details off)  severity medium (keep; could be low-medium), CONFIRMED DEFECT
Verified:
- observations/index.tsx:4-6 Redirect to /records (confirmed). _layout.tsx root registers `records` as legacy route; MOB-27 (mobile/PLAN.md:524-540) is "doing" and item 1 (Observations FlatList) + item 7 (remove legacy theme/chrome/records) track exactly this.
- records.tsx:57 label, :62 title plain Text no header role, :88-130 row = 4 Texts (OBS label, Chip, meta, summary) + 5th only when syncError!=="" (so 4 stops usually, 5 only on error rows), :109 Chip, :115 numberOfLines=2 on observationSummary (free-text answer; state word + syncError are NOT truncated).
- chrome.tsx:157 LinkAction numberOfLines 2; :220-250 Chip text-only, textStyles.micro; :492 ScreenFooter numberOfLines 1; theme.ts:85 micro 11.5/17. All exact.
- PRODUCT.md:160 "Labels wrap and never truncate"; DESIGN.md Rule 02 (line 66) + Rule 05 (line 69) + anti-pattern table line 960 forbids numberOfLines.
- Contrast: I recomputed (repro/contrast.mjs): min 6.08 (footer neutral500 on bg), chips 7.49-9.52. Claim true.
- can_delete: theme.ts importers = records.tsx, chrome, screen, screen-message, session-banner only; screen-message used by auth/provider.tsx:12; session-banner used only by components/screen.tsx. True.
Corrections / caveats:
- "no max font multiplier": legacy Text has none, so text scales UNCAPPED with OS font scale (the Contour Text caps 1.8-2.0). So at AX3 the 11.5pt chip scales ~2x+ -> the "state word at least 14pt at AX3" is already met by OS scaling; the real small-text problem is default size (11.5pt) and the 2-line clamp, not large-text failure. "hardest to read ... with large text" overstated.
- Accessible-stop count is 4 normally, 5 only for rows with sync_error.
- "one screen that answers is-my-record-safe": Contour Account screen (account/index.tsx:104-126) already shows per-state counts with StateBadge; only the per-record list is legacy. Overstated but per-record state is only on legacy screen.
- Arrow glyph "←" read aloud: plausible (VoiceOver reads "leftwards arrow"), not device-verified.
- Aside: Account copy "This version does not upload yet" (account/index.tsx:135, sign-out.tsx:128) is stale vs SyncProvider/createBoundUpload being wired (MOB-29 doing). Not part of finding.
- Needs-attention state reachable (uploader wired: sync/provider.tsx:88).

## A11Y-02 -> confirmed  severity medium (defensible; arguably low since defaults work and OS text scale works; tracked as MOB-27 item 4 which is unbuilt), CONFIRMED DEFECT
Verified:
- preferences.tsx:20-26 type, :28-34 defaults, provider :73-98 (exact enough).
- usePreferences().set callers: only (dev)/gallery.tsx:257,855,861,881 and (dev)/states.tsx:232 (grep over app+src, non-test). mapPalette also has NO setter anywhere (extra: finding omits; PRODUCT.md:166 promises map palette too).
- theme.tsx:19-20,71 larger-text step 4 for question/answer roles; CollectScreen.tsx:76 hand read, :489 row-reverse for left; haptics.ts:11. Confirmed.
- Account (account/index.tsx:140-160) exposes only orientation. Confirmed.
- (dev) group: _layout.tsx `Stack.Protected guard={PREVIEW_ALLOWED}`; PREVIEW_ALLOWED = __DEV__ || EXPO_PUBLIC_PREVIEW_TOOLS==="1" (data-source.tsx:30). eas.json: no profile sets it AND every profile sets EXPO_NO_DOTENV=1, so release/preview EAS builds have no preview tools. Confirmed.
- Appearance.setColorScheme(preferences.screen==='dusk'?'dark':'light') so OS dark mode ignored. Confirmed.
- Text.tsx MAX_SCALE question/answer 1.8 (confirmed cap). contour.json question size 26 -> +4 = 30 (confirmed).
- PRODUCT.md:160 ("Larger question text is a preference"), :166 collector preferences. Confirmed.
Caveat: MOB-27 item 4 (PLAN.md:535) already plans exactly this Preferences UI; status doing. So it is a tracked gap, not a surprise.

## A11Y-03 -> confirmed (partially: platform label off for save duplicate)  severity medium, CONFIRMED DEFECT
Verified:
- PlaceStep.tsx:125-137 readout View accessible + accessibilityLiveRegion="polite" (finding said 124-136; off by one). onNudge (CollectScreen.tsx:327-330) = haptics.selection() + mapRef.nudge only; no announce. canPlace/disabledReason from placement (placement.ts) -> Button hint (Button.tsx:185) read only on focus.
- RN 0.86.3: ViewAccessibility.d.ts:238-245 "@platform android"; grep of node_modules/react-native for liveRegion in .m/.mm/.swift = zero hits (only C++ prop parsing). iOS ignores accessibilityLiveRegion. Confirmed.
- CollectMap.tsx:878 callout live region, OnlineIndicator.tsx:63-70 live region: confirmed, no iOS fallback anywhere (grep announce: only StatusLine/Note/Field + explicit calls). ScreenState.tsx:84 also Android-only live region (extra).
- StatusLine.tsx:75-81 and Note.tsx:90-97 have the iOS-only announce() fallback. Confirmed.
- Duplicates: CollectScreen.tsx:108-112 announce(`OBS saved on this device.`) AND StatusLine live (CollectScreen.tsx:424-440, text is a plain template string, mounted at :492/:500) -> on iOS StatusLine's iOS fallback announce() fires too, so the save is spoken twice on iOS AS WELL as Android (Android: live region + announce). Finding's platform tag ("Android for the duplicates") understates. Field.tsx:94-97 announce(error) + :161 live region polite: Android only doubles (iOS announce only) - Android doubling not device-verified.
- PRODUCT.md:163-164 promises live regions + VoiceOver covers place. No test asserts any of this.
Caveat: task not blocked (hint on disabled Place button carries reason); WCAG 4.1.3 gap on iOS in core flow.

## A11Y-09 -> partially_confirmed, MEASUREMENT NEEDED  severity low-to-medium (I say low: nothing shown broken; all items already tracked as pending in plans)
Verified true:
- mobile/PLAN.md:406-419 MOB-18 "Status: todo" (text itself stale, cites legacy app/field.tsx); PLAN.md:575 MOB-31 simulator VoiceOver walkthrough "pending (user)"; mobile/README.md:3 and :193 VoiceOver/simulator pending; web/PLAN.md:512 "Pending (user) ... manual matrix: keyboard-only, VoiceOver with Safari and NVDA, iPad Safari, reduced motion". Matrix never run: confirmed.
- scan.ts:171-176 axe tags exactly wcag2a/wcag2aa/wcag21a/wcag21aa; no wcag22 anywhere in web (grep). scanRoute (scan.ts:279,283) axe at page-load, Day then Dusk; playwright.config.ts projects with metadata axe:true only desktop-1440 and phone-390 (tablet-1024/768 axe false). True.
- RouteFocus.tsx:16-22: focuses #page-title else #main immediately on pathname change; h1 lives in each page's PageHeader (not layout; ProjectLayout renders only ShellMain <main id=main tabIndex=-1>); loading.tsx (ScreenState loading) renders no h1 -> falls back to main when the loading shell commits first. Plausible; runtime unverified.
- QuestionStep.tsx:266-277 is the only setAccessibilityFocus (grep). CollectScreen does announce on Place->Answer (:225 "Point placed. First question.") and on save, but nothing on Answer->Review, Review->back, Saved->Place. 6 map IconButtons at CollectMap.tsx:763-804 precede panel; hand=left uses row-reverse (visual order only).
- TabDock.tsx:153-157 role tab + label "..., tab, N of M". RCTViewManager.m:105 maps "tab" to UIAccessibilityTraitNone (iOS reads label's "tab" once). ReactAccessibilityDelegate.kt:704-705 sets roleDescription R.string.rn_tab_description on Android -> likely "tab" twice. Plausible, not device-verified.
- Only TextInput draws a focus ring (TextInput.tsx:53,63); DESIGN.md:253,261 promises ring on every control incl. hardware keyboard on mobile.
REFUTED sub-claim: "axe is never run on ... mid-edit editor states". web/e2e/specimen/zone-editor.specimen.ts:515-540 runs AxeBuilder with a zone + point selected (Day and Night map palette) and zone-drawing.specimen.ts:273-295 runs it while drawing. Caveats: against the dev-only /dev/zone-editor specimen (no API), not the real editor; same 4 tags; and both tests close the Layers popover (Escape + wait hidden) before axe, so open popover/menu/dialog states are still unscanned. So the "never open dialogs, menus, Layers popover" part stands; "mid-edit editor" part is wrong for the specimen.
