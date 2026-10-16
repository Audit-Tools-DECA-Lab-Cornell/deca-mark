# MOB-07 handoff to the mobile data agent

2026-10-15, from the Claude mobile UI owner. MOB-07's Account tab, sign-out and account deletion are built on the UI side ([plan](PLAN.md)). The original three requests and tested proposal are retained below; the data-agent response supersedes their statements about missing code.

## Data-agent response (2026-10-15)

- `src/storage/account-removal.ts` exports `removeAccountData(db: LocalDatabase, issuer: string, userId: string): Promise<RemovedAccountData>`. It atomically deletes the seven owner-scoped tables below across every API/project scope of that issuer/account and returns each table's deleted count. Other issuers/accounts, `local` rows and immutable content remain. The supplied patch passes `git apply --check`; the implementation uses parsed count results instead of type assertions, with broader seven-table and rollback coverage. Call after sign-out or confirmed/recorded account deletion, once account-owned writers are stopped; remove the auth-owned summary/last-account marker in the UI flow. Do not call after a failed server deletion.
- **Ledger decision:** MOB-11's current-schema PowerSync transition and its ledger do not exist yet. Do not create an obsolete migration ledger now. Add the completed-cleanup transition write atomically when that transition exists.
- **File decision:** defer physical file garbage collection to a retention pass. Current package removal deliberately retains immutable content. Database cleanup drops this account's grants/selections/references only; a file can go only after every account's references and active leases are checked. This change does not introduce an orphan-file collector.
- `src/storage/last-received-at.ts` exports `lastReceivedAt(db: LocalDatabase, scope: string): Promise<string | null>`. Pass the exact `useAccount().key`, refresh on `useSync().revision`/focus, and fence the result on account change. It returns the newest receipt's `received_at` from synced rows only, or null before an acknowledgment. It uses server acknowledgment time, never record creation time or a wake attempt.
- **MOB-29 is connected on master** (`3612b17`, included after PR #28's merge). `useSync().wake(): void` starts the foreground, online, current-account drain; `useSync().retry(): Promise<void>` resets eligible pending/needs-attention backoff and wakes that drain. Neither means uploads have finished: observe queue states/revision and wait for no eligible pending work before sign-out/deletion. The UI owner can now add "Upload now", "Upload eligible records first" and "Upload N records first", and remove "This version does not upload yet." Held practice never uploads; signed-out/offline/background calls preserve local rows. Simulator/device acceptance stays **pending (user)**.

## 1. Original request: remove one account's data (answered above)

MOB-07 step 4 ("the shared remove this account's data routine") and its Done-when ("a test with two accounts' records in the legacy file shows that deleting one account leaves the other's records intact") need a storage function. No storage function deletes by owner today, so the UI does not offer "Remove account from this device", and after an account is deleted its records stay on the device as a deleted account's records ("they cannot upload"), which is what welcome already says.

The patch below adds `removeAccountData(db, issuer, userId)`. In one transaction it deletes every row whose `owner_scope` names this issuer and user id, across every scope the user owns (the API url and project changed between builds), from `observations`, `observation_drafts`, `parked_observation_drafts`, `active_sessions`, `package_selections`, `package_authorizations` and `available_current_packages`. `'local'` rows and other accounts' rows stay. Package contents and files are device-level and are left to your retention routines (a package goes only when no account references it).

Tested in this branch's worktree, then removed from it: `pnpm --dir mobile exec vitest run src/storage/account-removal.test.ts` 2 of 2 (two accounts, one of them across two scopes, plus a practice row: removing A leaves B and the practice row; another issuer removes nothing); `tsc --noEmit` clean; Biome clean. `git apply --check` passes on this branch.

Once it exists, the UI owner will:
- call it after a deletion answered 204 or was recorded, before the deleted-account marker, so a deleted account leaves nothing behind;
- add "Remove account from this device" behind a dialog naming the unsent records it destroys;
- remove the per-account summary (`src/auth/account-summaries.ts`) in the same step.

Two questions for you: should the routine also upsert the MOB-11 ledger (`removed`) now, or only once the ledger exists? And should package files that no account references any more go in the same call, or in your retention pass?

```diff
diff --git a/mobile/src/storage/account-removal.test.ts b/mobile/src/storage/account-removal.test.ts
new file mode 100644
index 0000000..8dc30cb
--- /dev/null
+++ b/mobile/src/storage/account-removal.test.ts
@@ -0,0 +1,116 @@
+import { DatabaseSync } from "node:sqlite";
+import { describe, expect, it } from "vitest";
+import { shellObservationSchema } from "../domain/observation";
+import { removeAccountData } from "./account-removal";
+import { initializeDatabase } from "./database-migrations";
+import { type LocalDatabase, listObservations, saveObservation } from "./observation-store";
+
+function adapter(database: DatabaseSync): LocalDatabase {
+  return {
+    async execAsync(sql) {
+      database.exec(sql);
+    },
+    async runAsync(sql, ...parameters) {
+      return database.prepare(sql).run(...parameters);
+    },
+    async getAllAsync(sql, ...parameters) {
+      return database.prepare(sql).all(...parameters);
+    },
+  };
+}
+
+const ISSUER = "http://127.0.0.1:54321/auth/v1";
+const A = "50000000-0000-4000-8000-00000000000a";
+const B = "50000000-0000-4000-8000-00000000000b";
+const scope = (user: string, project: string, api = "http://127.0.0.1:8000") =>
+  JSON.stringify([api, ISSUER, user, project]);
+const PROJECT_1 = "10000000-0000-4000-8000-000000000002";
+const PROJECT_2 = "10000000-0000-4000-8000-000000000003";
+
+function record(id: string) {
+  return shellObservationSchema.parse({
+    id,
+    siteId: "sample-garden",
+    formVersion: "shell-v1",
+    coordinates: [-76.485, 42.448],
+    observer: "JL",
+    people: 2,
+    notes: "",
+    createdAt: "2026-10-15T10:00:00.000Z",
+    storageStatus: "pending",
+  });
+}
+
+describe("removing one account's data from the shared database (MOB-07)", () => {
+  it("removes every scope of one account and leaves the other account and practice rows", async () => {
+    const db = adapter(new DatabaseSync(":memory:"));
+    await initializeDatabase(db);
+    // A owns rows under two scopes (another API url and project), B one, and one practice row.
+    await saveObservation(db, record("00000000-0000-4000-8000-0000000000a1"), scope(A, PROJECT_1));
+    await saveObservation(
+      db,
+      record("00000000-0000-4000-8000-0000000000a2"),
+      scope(A, PROJECT_2, "https://api.example.test"),
+    );
+    await saveObservation(db, record("00000000-0000-4000-8000-0000000000b1"), scope(B, PROJECT_1));
+    await saveObservation(db, record("00000000-0000-4000-8000-00000000000c"), "local");
+    for (const [owner, id] of [
+      [scope(A, PROJECT_1), "draft-a"],
+      [scope(B, PROJECT_1), "draft-b"],
+      ["local", "draft-local"],
+    ] as const) {
+      await db.runAsync(
+        "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload) VALUES (?, ?, ?, ?)",
+        owner,
+        id,
+        "2026-10-15T10:00:00Z",
+        "{}",
+      );
+    }
+    await db.runAsync(
+      "INSERT INTO parked_observation_drafts (owner_scope, id, updated_at, payload) VALUES (?, ?, ?, ?)",
+      scope(A, PROJECT_1),
+      "parked-a",
+      "2026-10-15T10:00:00Z",
+      "{}",
+    );
+    await db.runAsync(
+      "INSERT INTO package_authorizations (owner_scope, content_key) VALUES (?, ?), (?, ?)",
+      scope(A, PROJECT_1),
+      "content-1",
+      scope(B, PROJECT_1),
+      "content-1",
+    );
+
+    const removed = await removeAccountData(db, ISSUER, A);
+
+    expect(removed).toMatchObject({
+      observations: 2,
+      observation_drafts: 1,
+      parked_observation_drafts: 1,
+      package_authorizations: 1,
+    });
+    expect((await listObservations(db, scope(A, PROJECT_1))).map((row) => row.id)).toEqual([]);
+    expect((await listObservations(db, scope(B, PROJECT_1))).map((row) => row.id)).toEqual([
+      "00000000-0000-4000-8000-0000000000b1",
+    ]);
+    expect((await listObservations(db, "local")).map((row) => row.id)).toEqual([
+      "00000000-0000-4000-8000-00000000000c",
+    ]);
+    expect(
+      (await db.getAllAsync("SELECT id FROM observation_drafts ORDER BY id")).map(
+        (row) => (row as { id: string }).id,
+      ),
+    ).toEqual(["draft-b", "draft-local"]);
+    expect(await db.getAllAsync("SELECT content_key FROM package_authorizations")).toHaveLength(1);
+  });
+
+  it("removes nothing of an account from another sign-in service", async () => {
+    const db = adapter(new DatabaseSync(":memory:"));
+    await initializeDatabase(db);
+    await saveObservation(db, record("00000000-0000-4000-8000-0000000000a1"), scope(A, PROJECT_1));
+    const removed = await removeAccountData(db, "https://other.supabase.co/auth/v1", A);
+    expect(removed.observations).toBe(0);
+    expect(await listObservations(db, scope(A, PROJECT_1))).toHaveLength(1);
+  });
+});
diff --git a/mobile/src/storage/account-removal.ts b/mobile/src/storage/account-removal.ts
new file mode 100644
index 0000000..d0c729c
--- /dev/null
+++ b/mobile/src/storage/account-removal.ts
@@ -0,0 +1,48 @@
+import { databaseTransaction } from "./database-write";
+import type { LocalDatabase } from "./observation-store";
+
+/**
+ * Removes one account's data from the shared collector database (MOB-07 step 4), and nothing of any
+ * other account's: every row whose owner scope names this issuer and user id, across all of its scopes
+ * (one user can own several: the API url and project changed between builds). Signed-out practice rows
+ * (`'local'`) and other accounts' rows stay. Package contents and files are device-level and are left to
+ * the package retention routines, which remove a package only when no account references it.
+ */
+
+/** The tables keyed by an owner scope, `[apiUrl, issuer, userId, projectId]` as JSON, or `'local'`. */
+const OWNED_TABLES = [
+  "observations",
+  "observation_drafts",
+  "parked_observation_drafts",
+  "active_sessions",
+  "package_selections",
+  "package_authorizations",
+  "available_current_packages",
+] as const;
+
+/** Rows of this owner: valid JSON only (never `'local'`), compared on issuer and user id. */
+const OWNER_MATCH = `CASE WHEN json_valid(owner_scope)
+  THEN json_extract(owner_scope, '$[1]') = ? AND json_extract(owner_scope, '$[2]') = ?
+  ELSE 0 END`;
+
+export type RemovedAccountData = Readonly<Record<(typeof OWNED_TABLES)[number], number>>;
+
+export function removeAccountData(
+  db: LocalDatabase,
+  issuer: string,
+  userId: string,
+): Promise<RemovedAccountData> {
+  return databaseTransaction(db, async () => {
+    const removed: Record<string, number> = {};
+    for (const table of OWNED_TABLES) {
+      const [row] = (await db.getAllAsync(
+        `SELECT COUNT(*) AS n FROM ${table} WHERE ${OWNER_MATCH}`,
+        issuer,
+        userId,
+      )) as { n: number }[];
+      await db.runAsync(`DELETE FROM ${table} WHERE ${OWNER_MATCH}`, issuer, userId);
+      removed[table] = row?.n ?? 0;
+    }
+    return removed as RemovedAccountData;
+  });
+}
```

## 2. Original request: the last acknowledged upload (answered above)

MOB-07 step 1 asks the Account screen for "last successful sync". The receipt's `received_at` is stored in `observations.server_receipt`, but no read model exposes it, so the screen leaves the line out rather than guess. A small read would do: for example `lastReceivedAt(db, scope): Promise<string | null>` (the newest `received_at` among this scope's synced rows), or a `receivedAt` on the listed records. The UI would then say "Last upload acknowledged Oct 15 · 11:32".

## 3. Uploading (MOB-29)

The request predates `3612b17`: `src/sync/provider.tsx` now connects the bound foreground uploader. `wake()` starts real uploads when online, foreground and authenticated as the current account. The three UI actions and stale Account copy remain UI-owner work; see the data-agent response above for completion semantics. This response records source inspection and the automated provider/transport/coordinator tests rerun during this change; earlier disposable API/QGIS results retain their original evidence and are not new verification from this session.
