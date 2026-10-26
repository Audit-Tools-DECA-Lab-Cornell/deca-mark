import { describe, expect, it } from "vitest";
import { removeAccountData } from "./account-removal";
import { memoryDatabase } from "./package-store.fixture";

const issuer = "http://127.0.0.1:54321/auth/v1";
const accountA = "50000000-0000-4000-8000-00000000000a";
const accountB = "50000000-0000-4000-8000-00000000000b";
const scope = (user: string, project: string, api = "http://127.0.0.1:8000") =>
  JSON.stringify([api, issuer, user, project]);
const firstScope = scope(accountA, "project-1");
const secondScope = scope(accountA, "project-2", "https://api.example.test");
const otherScope = scope(accountB, "project-1");
const anotherIssuer = JSON.stringify([
  "https://api.example.test",
  "https://other.test/auth/v1",
  accountA,
  "project-1",
]);
const tables = [
  "observations",
  "observation_drafts",
  "parked_observation_drafts",
  "package_authorizations",
  "available_current_packages",
] as const;

async function seededDatabase() {
  const fixture = await memoryDatabase();
  for (const [index, owner] of [
    firstScope,
    secondScope,
    otherScope,
    anotherIssuer,
    "local",
  ].entries()) {
    const id = `synthetic-${index}`;
    await fixture.db.runAsync(
      "INSERT INTO observations (id, created_at, payload, owner_scope) VALUES (?, '', '{}', ?)",
      id,
      owner,
    );
    for (const table of ["observation_drafts", "parked_observation_drafts"] as const)
      await fixture.db.runAsync(
        `INSERT INTO ${table} (owner_scope, id, updated_at, payload) VALUES (?, ?, '', '{}')`,
        owner,
        id,
      );
    await fixture.db.runAsync(
      "INSERT INTO package_authorizations (owner_scope, content_key) VALUES (?, 'shared-content')",
      owner,
    );
    await fixture.db.runAsync(
      "INSERT INTO available_current_packages (owner_scope, project_id, site_id, payload) VALUES (?, 'project', 'site', '{}')",
      owner,
    );
  }
  await fixture.db.runAsync(
    "INSERT INTO package_contents VALUES ('shared-content', ?, 'project', 'site', 'package', 'digest', '{}')",
    issuer,
  );
  return fixture;
}

describe("removeAccountData (MOB-07)", () => {
  it("removes all five tables across an account's scopes while retaining other accounts, issuers and practice", async () => {
    // Given two API/project scopes for A and shared content also used by B.
    const { db, sqlite } = await seededDatabase();
    try {
      // When A is removed from this issuer.
      const removed = await removeAccountData(db, issuer, accountA);
      // Then every owned table retains exactly the other account, issuer and practice rows.
      expect(removed).toEqual(Object.fromEntries(tables.map((table) => [table, 2])));
      for (const table of tables)
        expect(
          await db.getAllAsync(`SELECT owner_scope FROM ${table} ORDER BY owner_scope`),
        ).toEqual(
          [otherScope, anotherIssuer, "local"].sort().map((owner_scope) => ({ owner_scope })),
        );
      expect(await db.getAllAsync("SELECT content_key FROM package_contents")).toEqual([
        { content_key: "shared-content" },
      ]);
      expect(await removeAccountData(db, issuer, accountA)).toEqual(
        Object.fromEntries(tables.map((table) => [table, 0])),
      );
    } finally {
      sqlite.close();
    }
  });

  it("removes nothing when the issuer does not match", async () => {
    const { db, sqlite } = await seededDatabase();
    try {
      expect(await removeAccountData(db, "https://absent.test/auth/v1", accountA)).toEqual(
        Object.fromEntries(tables.map((table) => [table, 0])),
      );
      for (const table of tables)
        expect(await db.getAllAsync(`SELECT owner_scope FROM ${table}`)).toHaveLength(5);
    } finally {
      sqlite.close();
    }
  });

  it("rolls back every deletion if a later table fails", async () => {
    const { db, sqlite } = await seededDatabase();
    try {
      sqlite.exec(
        "CREATE TRIGGER fail_removal BEFORE DELETE ON package_authorizations BEGIN SELECT RAISE(ABORT, 'synthetic interruption'); END;",
      );
      await expect(removeAccountData(db, issuer, accountA)).rejects.toThrow(
        "synthetic interruption",
      );
      for (const table of tables)
        expect(await db.getAllAsync(`SELECT owner_scope FROM ${table}`)).toHaveLength(5);
    } finally {
      sqlite.close();
    }
  });
});
