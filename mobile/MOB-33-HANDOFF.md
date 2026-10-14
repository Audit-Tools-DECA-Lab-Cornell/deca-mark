# MOB-33 data interface for the mobile UI owner

Read the owning [task status](PLAN.md), [UI requirements](ZONE-BOUNDARIES-UI.md) and
[acceptance evidence](../docs/reviews/zone-boundaries-2026-10-13/mob28-mob33.md).
The interface is implemented against the sole `/v1` contract. **UI-owner
acknowledgment is pending**; record that acknowledgment in MOB-33's existing
status before starting MOB-30 to MOB-32.

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

`refreshProblem` distinguishes offline, signed out, no access and server
failures. Cached maps and lists stay on failure. A known removed membership
or site-list 404 yields no access. Last successful check is cached per
issuer/account/project. Download progress names the exact package and part;
verification failures are distinct from transport failures.

## Recovery and visits

`useRecoveredDraft()` returns `active`, `parked`, `unreadable`, `problem`,
`resume()`, `park()`, `restoreParked(id)`, `discard()`, `discardParked(id)` and
`redownload(id)`. Models use UUIDs and integer package versions, never parsed
display labels. Only exact verified forms interpret answers.

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
from `maps/zone-boundaries.ts`; its 16 shared coverage cases already pass.

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
