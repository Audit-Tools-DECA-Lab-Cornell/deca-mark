# MOB-30 to MOB-32 handoff: resolved data follow-ups

Reconciled 2026-10-15. The four requests raised by the mobile UI owner on 2026-10-14 are **resolved**. They do not block starting MOB-29. Current task status belongs in [PLAN.md](PLAN.md); the acknowledged interface is [MOB-33-HANDOFF.md](MOB-33-HANDOFF.md), and the next sequence is in the [current roadmap](../docs/plan/current-state.md).

## Resolution evidence

| Original request | Resolution and current source |
| --- | --- |
| Exact `zoneCovers` on sloping/shared edges | `d529134` replaces floating-point equality/ray division with filtered orientation, exact BigInt fallback and winding coverage in `src/maps/zone-boundaries.ts`. `src/maps/zone-boundaries.test.ts` retains the oracle regressions, including underflow. |
| Retained form identity in `Recovered` | `Recovered.formVersion` in `src/packages/zone-model-types.ts` comes from the retained draft even if its map/form is missing. `a76d445` retains the form identity; see the follow-up evidence in [MOB-33-HANDOFF.md](MOB-33-HANDOFF.md#local-follow-up-verification-2026-10-14). |
| Readiness from any verified installed version | `isStored` in `src/packages/hosted/context.tsx` uses account-authorized verified catalog content; publishing v2 does not make downloaded v1 disappear. |
| Record UI-owner acknowledgment | The acknowledgment is recorded in MOB-33 in [PLAN.md](PLAN.md#mob-33-provide-bound-session-and-package-read-models), dated 2026-10-14. |

The original geometry request demonstrated three exact-oracle failures: the Fall Creek shared diagonal, Kettner’s near-diagonal grid and a one-double step above `y = x`. These were the pre-fix failures. The recorded follow-up passes all 16 authored coverage cases and 5,295 independent exact-side comparisons; the complete recorded mobile suite passed 656 tests with one local-API acceptance test skipped. These are 2026-10-14 local results, not a fresh test run or native/server parity acceptance.

## Remaining acceptance

MOB-30 to MOB-32 have component-tested screens, but simulator screenshots, phone/tablet VoiceOver and force-quit recovery checks are pending. `src/features/projects/recovery.ts` still uses generic form-missing copy rather than the retained `formVersion`; the field is available for that UI follow-up, with no data-interface blocker.

MOB-29’s sole bound uploader, exact receipt/rejection integration and foreground reconnect/resume/retry are implemented and locally verified through automated and disposable API/QGIS acceptance ([evidence](../docs/reviews/mob29-2026-10-15/README.md)). The physical iPad/Android collector scenario remains pending: retain a v1 draft across v2 publication and process restart, upload its original bindings, then verify server/QGIS attribution. [QA-07](../docs/plan/verification.md) remains the integrated feature gate. No hosted rollout or physical-device acceptance is established by these resolutions.
