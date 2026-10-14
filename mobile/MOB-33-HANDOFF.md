# MOB-33 data interface for the mobile UI owner

Read the owning [task status](PLAN.md), [UI requirements](ZONE-BOUNDARIES-UI.md) and
[acceptance evidence](../docs/reviews/zone-boundaries-2026-10-13/mob28-mob33.md).
The interface is implemented against the sole `/v1` contract. **The Claude UI
owner acknowledged it on 2026-10-14**, recorded in MOB-33's existing status.
MOB-30 to MOB-32 have completed their code/component-test work. MOB-29 can
start its remaining upload/receipt integration; those UI tasks no longer
hold it up. Their simulator and physical-device checks remain pending.

## Public imports

```ts
import {
  useSiteVersions, useRecoveredDraft, createZoneReadModelFake,
  type SiteVersions, type Pinned, type Recovered,
} from "../packages/zone-read-models";
```

Paths above are relative to `src/`. `useFieldSession()` from
`session/context.tsx` exposes `pinned`, the durable active `recovered` draft,
`parked`, and the existing collection actions. Bundled practice is local;
its synthetic zone identities never enter the server upload path.

## Site versions

`useSiteVersions(siteId)` returns the agreed `SiteVersions` fields plus:

- `downloadPackage(packageId)`, `cancelDownload(packageId)`, `refresh()` and
  `remove(packageId)`. The action is named `downloadPackage` because `download`
  is already the progress field. Removal returns `{removed:true}` or
  `{removed:false,references}` and checks current SQL references at execution.
- `referencesProblem` reports failure to read live counts. Counts include
  `unfinished` (active **and parked**), `unsent`, `attention`, `openSession`,
  and `retained` (synced records still need local detail). Do not enable removal
  by adding only unsent counts; there is no uploaded-record eviction policy.
- `installedAt` can be null for unreadable metadata. `nextSessionPackageId`
  is the newest verified installed version, independently of `available`.
  A newer download never changes the active visit or unfinished observation.

`isStored(site)` also counts any verified package for the site in the current
account's catalog-authorized cache. A published v2, or an empty current
publication pointer, does not make verified installed v1 disappear. Missing,
unverified and another account's packages do not count.

`refreshProblem` distinguishes offline, signed out, no access and server
failures. Cached maps and lists stay on failure. A known removed membership
or site-list 404 yields no access. Last successful check is cached per
issuer/account/project. Download progress names the exact package and part;
verification failures are distinct from transport failures.

## Recovery and visits

`useRecoveredDraft()` returns `active`, `parked`, `unreadable`, `problem`,
`resume()`, `park()`, `restoreParked(id)`, `discard()`, `discardParked(id)` and
`redownload(id)`. Models use UUIDs and integer package versions, never parsed
display labels. `Recovered.formVersion` is required and comes from the retained
draft, even when its package or form is missing; it never comes from a newer
package. Only exact verified forms interpret answers. The UI owner should
use `model.formVersion` in `features/projects/recovery.ts`'s `form_missing`
line and add it to its three typed recovery fixtures before typechecking.

Park only an unresumable active draft. Parking retains its bytes and map
reference while freeing the active slot. `restoreParked` verifies the exact
package/zone/form, refuses to overwrite an active draft, then resumes it.
Known access loss disables recovery; unknown/offline permission checks retain
cached membership and data. A digest-verified package missing its exact zone
or form needs coordinator recovery, so re-download is not offered.

Exact recovery downloads wait behind any running download of the same site,
including the same current version. Cancel or account/runtime disposal also
cancels queued recovery. A failed newer download leaves the older selection
usable.

The collect route brackets its lifetime with `beginVisit()`/`endVisit()`.
During the visit the package is frozen, including before a draft is created.
`chooseZone()` selects a zone from that package and writes the changed UUID,
code and label in the same handler, before another answer or render. Inventory
uses the package's display anchor locally; bound point saves enforce closed
coverage and keep invalid points unfinished. MOB-31 can reuse `zoneCovers`
from `maps/zone-boundaries.ts`. Coverage uses a Shewchuk error-bound filter,
exact BigInt fallback and winding number. Outer edges and hole edges cover;
hole interiors do not. No epsilon or metre buffer changes attribution.

## Data decisions (2026-10-14)

- Exact orientation includes the original finite doubles, with a conservative
  fallback when the filter's bound is subnormal. Rounded product equality and
  division-based crossing were disproved by the handoff's three regressions;
  an additional collinear underflow case disproved an unguarded filter.
- Required `formVersion` exposes the already-stored draft identity. No local
  schema reset or server contract change is needed; an optional identity would
  let form-missing presentation silently lose the information again.
- Site readiness reads the existing account-scoped verified cache. It needs no
  new catalog or second selection policy; version choice remains
  `nextSessionPackageId`, and active visits retain their pinned package.
- MOB-29's historical dependency links remain in the plan because the UI work
  was a prerequisite and is now done. MOB-29's status explicitly records that
  it can start; pending UI/device evidence is not claimed as completed.

## Local follow-up verification (2026-10-14)

The three requested oracle regressions fail before the coverage fix. After it,
all 16 authored coverage cases and 5,295 independent exact-side comparisons
pass, including the additional underflow regression. Coverage, geometry,
placement and their Place/Review component suites pass 80 tests. The complete
mobile suite passes 656 tests, with one local-API acceptance test skipped.
Biome reports the existing 12 informational findings; the plan check passes
158 tasks. Expo exports iOS (4,137 modules) and Android (4,223 modules).

The full `mobile:check` TypeScript step is blocked by the three UI-owned
`Recovered` fixtures missing required `formVersion`; lint was run separately.
No native/device/server attribution acceptance is claimed by these tests.

## UI test adapter

`createZoneReadModelFake({owner,sites,active,parked})` exposes getters and a
subscription, `setOwner`, `setSite`, `setRecovered`, `park`, `restoreParked`
and reference-checked `remove`. Inject its getters at the UI hook boundary
or pass snapshots into presentational components. It performs no network,
filesystem or SQL work. A parked draft resumes only when its supplied model
is ready; the owner switch clears all visible snapshots.

No server contract changed. Local schema version 6 deliberately resets
incompatible experimental databases and package caches. Current-schema
records and drafts are preserved. MOB-29 still owns upload/receipt integration;
MOB-30 to MOB-32 own observer presentation and simulator checks. QA-07 remains
the integrated physical-device/server/QGIS gate.
