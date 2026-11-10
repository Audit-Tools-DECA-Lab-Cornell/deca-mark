# QGIS-first map setup — local implementation evidence

Implemented on 2026-11-10. The normal manager route is Add map → Set boundaries → Review and publish. A private unfinished setup can have no outline, no zones and no form. Projects still need their actual supported source datasets; remote imagery and QGIS styling are not rendered.

## What changed

1. A single project intake reads the project, explains missing sources and supports an optional GeoJSON route. Layer roles are reviewed per feature or in compatible groups, beside a map preview.
2. Managers can draw or edit the site outline and observation zones, including coordinate-based keyboard creation. First-map zone codes remain editable; replacements retain published identities unless deliberately changed.
3. A separate manager-only setup lifecycle saves incomplete work, resumes confirmed saves, detects stale revisions, stages source replacement and publishes atomically through the existing immutable package pipeline.
4. Source updates retain manual geometry, use stable source/feature identities and replay the original confirmed request after a lost response. Publication and discard clear private draft source data only after successful completion.
5. Site/Zones navigation, empty states, forms failures and save/publication messages distinguish unfinished, acknowledged, refused and uncertain work. The current published map remains available during replacement.

## Verification

Raw command output for local acceptance lives with the disposable stack logs under `database/.local/`. Test files use synthetic local accounts and geography; no hosted acceptance is implied.

| Check | Observed result |
| --- | --- |
| Setup API, geometry, authorization, replay and source limits | 60 passed on disposable PostGIS (`database/zone-api-rehearsal.sh`) |
| OpenAPI / contract generation | Regenerated; web and mobile declarations match |
| Web unit suite | 546 passed |
| Web / mobile static checks | `pnpm check` and Python Ruff/BasedPyright clean |
| Tokens and plan consistency | `pnpm tokens:check` and `pnpm plan:check` passed |
| Browser map setup | 22 passed at desktop-1440 and phone-390 (`e2e/map-setup.spec.ts`), including first-map draft, touch/keyboard drawing, resume, lost publish replay, observer redirect, remote-only recovery, URL canonicalization and conflict resolution |
| Existing package / identity regressions | Focused desktop and phone reruns of self-contained QGIS upload and stale-current refusal passed after the advanced-upload retitle |
| Collector package rehearsal | `database/mobile-package-rehearsal.sh` passed (`test_current_mobile_package_survives_restart`); physical devices not exercised |
| SQL lifecycle | Forward migrations `20261110090000_map_setups.sql` and `20261110103000_map_setup_replay_result.sql` applied on the local test stack; manager-only access, competing saves/publications and cleanup covered by database tests |

Final hardening also remounts boundary editors after conflict adoption, refuses inventory publication when the selected form definition is unavailable, retries an exact lost initial import once, returns lightweight setup summaries on list, and reports create/import as 201 new or 200 replay.

## Release handoff

Apply both map-setup migrations to the explicitly approved deployment target before releasing the matching API and web. Verify the actual site URL against that API with a signed-in synthetic first-map smoke test. Hosted migration/deployment and physical-device checks remain separate gates. Prefer `[skip render]` on the merge commit until the hosted migration has run (D36).

Keep the additive tables and saved setups if rolling back the application. Do not delete published packages, historical observations or private unfinished setups as a rollback technique. New web clients must show a truthful unavailable state when the required API capability is absent.

## Visual evidence

[Import review](screenshots/import-review.png), [desktop boundaries](screenshots/boundaries-desktop.png), [phone boundaries](screenshots/boundaries-phone.png), [tablet boundaries](screenshots/boundaries-tablet.png), [Dusk](screenshots/boundaries-dusk.png), [published confirmation](screenshots/first-map-published.png), and [source recovery](screenshots/source-recovered.png). These are actual browser captures of local synthetic data.
