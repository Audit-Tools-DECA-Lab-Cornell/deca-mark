# Janet demonstration — October 15, 2026

**Show one complete synthetic collection story in 12 minutes.** Start with the [new QGIS demo map](../qgis/demo-playground-2026-10-15/README.md). Run its 5-minute device smoke check before the meeting; a code change or passing unit test does not establish a working physical collector or matching hosted deployment.

## Updates to describe since last week

The current [roadmap](plan/current-state.md) and owning component plans support these implementation updates. They are source/local evidence; use fresh meeting smoke checks before describing deployed or device behavior.

1. **Manager polygons:** draw, reshape and name zones in a draft; validate overlap/site coverage; publish a new immutable map version. The site's first version still starts with an uploaded QGIS map.
2. **Historical review:** view/filter/export observations by their recorded package and zone. Renaming or changing a boundary creates a new version and preserves old attribution. Whole-zone Inventory remains distinct from a point observation.
3. **Collector maps:** retained downloaded packages, exact boundary coverage and pinned sessions let unfinished/unsent work keep its original map. MOB-29 supplies the bound upload/receipt path; show it only after the actual collector smoke check passes.
4. **Manager collaboration:** invitation creation/redemption and email-outbox implementation exist. A queued invitation, provider acceptance and delivery to an inbox are separate observable states. The meeting should not claim inbox delivery from a queued status.
5. **Scope:** close the remaining zone acceptance before broad pilot readiness. The full Manager Web Flow, GIS access, identity/Storage/operations and release checks remain separate plan gates.

## Meeting checklist — 12 minutes

1. **Upload a new site map — 2 minutes.** Create **SYNTHETIC — Janet demo**, read `janet-synthetic-playground.qgz`, review its four resolved layers and select a real published play form. Enable Inventory only when a published zone-only form is available. Confirm A/B are new zone identities, then publish v1. Observable: this site's current package is v1 with the two named polygons.
2. **Draw and edit — 3 minutes.** Open the zone editor, draw C across the free north lawn, adjust a vertex and rename it. Validate and publish v2. Observable: the new map has C, with no overlap/out-of-site errors. Show a second small edit only if time permits; one complete publication is enough.
3. **Collect offline — 3 minutes.** Download the intended map on the actual mobile app. Turn off connectivity, place a point clearly inside A or C, and save an explicitly synthetic observation. Restart/resume only if rehearsed. Restore connectivity with the app open. Observable: retained local record progresses to a verified receipt and appears in manager review. Inventory is optional: its record represents the whole zone and has no event point. Do not describe closed-app background sync as working.
4. **Review the recorded version — 2 minutes.** Open that record's details and show package/zone metadata. If a v1 record was rehearsed before v2, show it still belongs to v1. Show export or a current-contract QGIS readback only through a verified path; the older helper scripts still require alignment. Observable: exported/readback identity matches the record, rather than today's polygon assignment.
5. **Invite a manager — 2 minutes, optional.** Open the project's **Team** page, choose **Invite**, and select **Manager** on a controlled demo account. Creating/sending an addressed invitation can send external email: send only when the intended recipient and send are explicitly authorized. A prepared invitation preview is sufficient otherwise. Observable for a full email claim: the recipient opens the received invitation and signs in/redeems it to gain the intended project role. Record “queued”, “provider accepted” or “received” precisely.

## Rehearsal decisions

- Use synthetic labels for the site and every saved live demo observation; keep real research projects untouched.
- Have the map ZIP/QGZ and one screenshot ready locally. If connectivity fails, show offline save and retained state; defer the online receipt claim until it is observed.
- Prioritize upload → polygon publication → one mobile save/reconnect → recorded-version review. Invitations are a useful final extension, not a prerequisite for proving zone boundaries.
- No real invitation has been sent by preparing this checklist. No hosted reset, migration or deployment is part of this artifact.

**Next:** open the [map README](../qgis/demo-playground-2026-10-15/README.md) and run the pre-meeting smoke check.
