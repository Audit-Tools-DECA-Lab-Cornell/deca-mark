# Assignment and authorization checklist

All boxes remain unchecked. The user confirmed that no completed hosted/device
acceptance records or named owners have been supplied. Deployment success does
not complete these checks. No credentials belong in this checklist.

- [ ] **Assign deletion-backlog alerts:** operator with deployment/Auth access,
  primary/backup names, alert destination and response deadline. Monitor disabled/
  unavailable worker, permission/configuration failures, repeated provider failures,
  overdue due times/expired leases and pending age over 24 hours.
- [ ] **Approve the concrete production config:** existing Render Decamark service,
  existing `7264f84` build (or exact tree-identical `0279fd3` for platform-triggered
  file deploys), private `supabase-secret-key` file, public `decamark-runtime.json`
  file and `DECAMARK_CONFIG=/etc/secrets/decamark-runtime.json`, including file-save
  deploys and final configuration deploy. Set this service's PR previews **Manual**
  before installing the Admin configuration; no preview may inherit production Auth
  credentials. See the exact JSON and sequence in README.
- [ ] **Confirm file prerequisites privately:** correct target issuer/key pairing,
  approved Auth Admin key, both files readable by UID/GID 10001:10001. Report only
  filenames and confirmation, never contents. Recheck pending UUIDs before activation.
- [ ] **Authorize healthy hosted acceptance:** synthetic project UUID, exact disposable
  account UUIDs (and creation permission if needed), approved test sessions and allowed
  synthetic observations/deletion actions. Record who runs it. No personal/demo accounts.
- [ ] **Authorize isolated failure acceptance separately:** disposable local/isolated
  database and actual test Auth target, separate test accounts/credentials, allowed
  proxy/network faults and process stops. No production Auth outages or test restarts.
- [ ] **Assign the offline-device census:** collection lead coordinating all active,
  offline, retired and unavailable devices; approve consistent read-only storage/package
  copies and custody. Supply device/build/schema/owner/queue/receipt accounting.
- [ ] **Assign unsatisfiable queue decisions:** research/data owner records each
  identified record's custody, retention duration, research disposition and any approved
  later correction/recollection protocol. Until the census, affected UUIDs/counts remain
  unknown. Preserve exact bodies and attribution; no discard, rewrite or rebind.
- [ ] **Supply or authorize missing release acceptance:** current observer/viewer/manager,
  stale form-write/publication, retained queue/replay, signed export/converter and physical
  device/QGIS evidence identified in `provider-acceptance.md` and the deployed audit.

The documentation review PR may be reviewed independently. Do not merge it or treat
it as approval to enable production. The original audit remains open until the
required operational/acceptance evidence and ownership are recorded.
