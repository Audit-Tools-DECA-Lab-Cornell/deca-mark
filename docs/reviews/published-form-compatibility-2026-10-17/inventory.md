# Future authorized target inventory

This procedure is prepared but **has not run on a hosted or existing installation**.
Local read/export protection does not depend on obtaining this inventory first.
No result authorizes a record rewrite, package replacement or queue disposal.

1. Obtain explicit authorization for one named target and an approved read-only
   connection. Have its owner verify database/project identity independently.
   Use existing secure connection handling; do not copy connection secrets into this
   repository, commands, report or terminal output. Select an administrative assessment
   role that can see the intended tenants; an observer/RLS-scoped result is incomplete.
2. Inspect `database/published-form-bounds-inventory.sql` and
   `database/fields-only-inventory.sql`. Execute only those SELECTs in a transaction:

   ```sql
   BEGIN READ ONLY;
   SET LOCAL statement_timeout = '60s';
   SET LOCAL lock_timeout = '2s';
   -- Run each reviewed SELECT here, on the explicitly selected connection.
   ROLLBACK;
   ```

   For example, an operator using psql from the repository root can place
   `\i database/published-form-bounds-inventory.sql` and
   `\i database/fields-only-inventory.sql` at the comment above. Do not run any
   initialization, rehearsal, migration, reset or baseline command on that connection.
3. Save results in the owner's approved restricted evidence location, with target,
   role/scope, timestamp, transaction outcome, application artifact and SQL hash.
   These results contain research instrument definitions and identifiers. A zero result
   is meaningful only for the scope and instant actually read. A timeout is incomplete,
   not zero hits. No answer bodies or account/provider secrets are selected.
4. For each numeric-bound hit, record form UUID/code/state, exact original definition,
   question ID, bounds, requiredness and dependency expression; server observation and
   answered-question counts; package UUID/site/version/state/archive digest/current flag;
   and dependent draft count. Drafts with no frozen references can be corrected through
   ordinary conditional editing and reviewed publication. Published/retired definitions
   and their packages remain immutable.
5. Have the protocol owner assess **visibility per captured answer context**. Required
   does not mean always visible. An absent optional or hidden question can leave a
   legitimate delayed upload; an answered contradictory question, or a visible required
   one, cannot satisfy the instrument. Do not classify individual records solely from
   these aggregate SQL counts. The inventory is a bounds-defect detector, not a complete
   structural parser or answer audit. Separately assess any malformed stored structure;
   the reader deliberately continues rejecting that instead of emitting partial exports.
6. Inventory every retained device/account/project queue and in-progress collection,
   including unavailable, offline and retired devices. Account for captured form/package/
   zone IDs, body/observation UUID, state, retained package digest and any known server
   receipt. Use approved device procedures; preserve the exact body and local database.
   A server observation count cannot reveal unsent or rejected records, deleted local
   queues, a lost acknowledgement, or all package downloads. Zero server hits does not
   prove zero affected devices or justify removing either compatibility reader.

Owner decisions required after hits:

- Stop future use of the affected package/instrument; author, review and publish an
  explicit canonical successor and package for **future** collection. Confirm devices
  actually select it. A retired form and superseded package still interpret old records.
- For an unsatisfiable queue, choose a documented retention/research protocol: retain
  the original evidence and decide how to record exclusion or any explicitly approved
  later collection/correction with provenance. Existing immutable-upload APIs cannot
  rebind, alter, or repair that original record. This change adds no correction protocol.
  Do not ask a collector to invent an answer or change bounds to clear the queue.
- Define custody, backup/export, retention duration and a responsible coordinator before
  device upgrades/resets, sign-out/forgetting or disposal could lose a rejected queue.
  Tested same-schema restart/retry preserves it; arbitrary storage reset does not.
- Removing fields-only or this stored canonical protection requires a separately approved
  inventory/device-accounting/retention transition. No such removal is authorized here.

The synthetic acceptance runs this bounds SELECT under BEGIN READ ONLY, verifies its
retired form/package/digest and counts, and checks unchanged research/package snapshots.
See `historical/inventory.json` and the linked rollout evidence.
