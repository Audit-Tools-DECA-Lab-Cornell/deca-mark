import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({ directory: "" }));
vi.mock("expo-file-system", () => ({
  Paths: {
    get document() {
      return device.directory;
    },
  },
  Directory: class {
    readonly path: string;
    constructor(...parts: string[]) {
      this.path = join(...parts);
    }
    create() {
      mkdirSync(this.path, { recursive: true });
    }
  },
  File: class {
    readonly path: string;
    constructor(...parts: string[]) {
      this.path = join(...parts);
    }
    get exists() {
      return existsSync(this.path);
    }
    textSync() {
      return readFileSync(this.path, "utf8");
    }
    write(value: string) {
      writeFileSync(this.path, value);
    }
    delete() {
      rmSync(this.path);
    }
  },
}));

import { shellObservationSchema } from "../domain/observation";
import {
  initializeDatabase,
  type LocalDatabase,
  listObservations,
  saveObservation,
} from "../storage/observation-store";
import { readOwnerScope } from "../sync/receipt";
import { cachedAccount, forgetAccount, rememberAccount } from "./cached-account";
import { persistDeliberateSignOut, restoreAccount } from "./deleted-session";
import { accountWorkspace, sessionChange, signInRecovery } from "./session-retention";

const issuer = "https://auth.example.test";
const connection = { apiUrl: "https://api.example.test", supabaseUrl: issuer };
const accountA = { id: "50000000-0000-4000-8000-000000000001", email: "a@example.test" };
const accountB = { id: "50000000-0000-4000-8000-000000000002", email: "b@example.test" };
const record = shellObservationSchema.parse({
  id: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
  siteId: "sample-garden",
  formVersion: "shell-v1",
  coordinates: [-76.485, 42.448],
  observer: "JL",
  people: 2,
  notes: "retained",
  createdAt: "2026-09-17T10:00:00.000Z",
  storageStatus: "local-only",
});
function adapter(database: DatabaseSync): LocalDatabase {
  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async runAsync(sql, ...parameters) {
      return database.prepare(sql).run(...parameters);
    },
    async getAllAsync(sql, ...parameters) {
      return database.prepare(sql).all(...parameters);
    },
  };
}

it("keeps only account A's records after a failed refresh and an app restart", async () => {
  // Given two accounts' queued records and a remembered signed-in account A.
  device.directory = mkdtempSync(join(tmpdir(), "decamark-session-"));
  const filename = join(device.directory, "observations.db");
  let database = new DatabaseSync(filename);
  try {
    await initializeDatabase(adapter(database));
    await saveObservation(adapter(database), record, accountWorkspace(accountA, connection).key);
    await saveObservation(
      adapter(database),
      { ...record, id: "93f254b5-8a7b-4b71-9591-a7ff880f4ad7" },
      accountWorkspace(accountB, connection).key,
    );
    rememberAccount(accountA, issuer);
    // When failed refresh emits SIGNED_OUT and both storage boundaries restart.
    const lost = sessionChange(accountA, "SIGNED_OUT", null, issuer, null);
    expect(lost.session).toBeNull();
    expect(
      await listObservations(adapter(database), accountWorkspace(lost.account, connection).key),
    ).toEqual([{ ...record, storageStatus: "local-only" }]);
    database.close();
    database = new DatabaseSync(filename);
    await initializeDatabase(adapter(database));
    const restored = restoreAccount(cachedAccount(issuer), null);
    const restarted = sessionChange(restored.account, "INITIAL_SESSION", null, issuer, null);
    // Then account A remains visible without revealing account B or resuming uploads.
    expect(restarted.session).toBeNull();
    expect(restarted.account).toEqual(accountA);
    expect(
      await listObservations(
        adapter(database),
        accountWorkspace(restarted.account, connection).key,
      ),
    ).toEqual([{ ...record, storageStatus: "local-only" }]);
    expect(signInRecovery(restarted.account, restarted.session, restored.deletedUserId)).toEqual({
      email: accountA.email,
    });
    expect(cachedAccount("https://other.example.test")).toBeNull();
  } finally {
    database.close();
    rmSync(device.directory, { recursive: true });
  }
});

it("hides deliberately signed-out account records after restart but retains them for sign-in", async () => {
  // Given account A's records and persisted identity.
  device.directory = mkdtempSync(join(tmpdir(), "decamark-signout-"));
  const filename = join(device.directory, "observations.db");
  let database = new DatabaseSync(filename);
  try {
    await initializeDatabase(adapter(database));
    await saveObservation(adapter(database), record, accountWorkspace(accountA, connection).key);
    rememberAccount(accountA, issuer);
    // When sign-out refreshes an expired token before completing and the app restarts.
    await persistDeliberateSignOut(
      accountA,
      forgetAccount,
      (account) => rememberAccount(account, issuer),
      () => true,
      () => true,
      async () => {
        const refreshed = sessionChange(
          accountA,
          "TOKEN_REFRESHED",
          { user: accountA },
          issuer,
          accountA.id,
        );
        expect(refreshed.account).toEqual(accountA);
        expect(cachedAccount(issuer)).toBeNull();
        const signedOut = sessionChange(refreshed.account, "SIGNED_OUT", null, issuer, accountA.id);
        expect(signedOut.account).toBeNull();
        return { error: null };
      },
    );
    const signedOut = sessionChange(accountA, "SIGNED_OUT", null, issuer, accountA.id);
    expect(signedOut.account).toBeNull();
    database.close();
    database = new DatabaseSync(filename);
    await initializeDatabase(adapter(database));
    const restored = restoreAccount(cachedAccount(issuer), null);
    // Then the signed-out workspace hides A, and signing in again restores exactly A.
    expect(restored.account).toBeNull();
    expect(
      await listObservations(adapter(database), accountWorkspace(restored.account, connection).key),
    ).toEqual([]);
    const signedIn = sessionChange(null, "SIGNED_IN", { user: accountA }, issuer, null);
    expect(
      await listObservations(adapter(database), accountWorkspace(signedIn.account, connection).key),
    ).toEqual([{ ...record, storageStatus: "local-only" }]);
    expect(signInRecovery(signedIn.account, signedIn.session, null)).toBeNull();
  } finally {
    database.close();
    rmSync(device.directory, { recursive: true });
  }
});

it("offers email-prefilled recovery only for a retained account with a missing session", () => {
  // Given active, missing, and deleted-account sessions.
  // When deciding whether to offer sign-in recovery.
  // Then deleted accounts and deliberate sign-outs have no recovery banner.
  expect(signInRecovery(accountA, null, null)).toEqual({ email: accountA.email });
  expect(signInRecovery(accountA, null, accountA.id)).toBeNull();
  expect(signInRecovery(null, null, null)).toBeNull();
  expect(signInRecovery(accountA, { user: accountA }, null)).toBeNull();
});

it("retains account B when A's pending sign-out receives a later SIGNED_OUT", async () => {
  // Given A's sign-out in progress, followed by a new sign-in as B.
  device.directory = mkdtempSync(join(tmpdir(), "decamark-switch-"));
  try {
    rememberAccount(accountA, issuer);
    let current: ReturnType<typeof sessionChange> = sessionChange(
      null,
      "SIGNED_IN",
      { user: accountA },
      issuer,
      null,
    );
    // When the SDK emits B's sign-in before A's sign-out resolves.
    await persistDeliberateSignOut(
      accountA,
      forgetAccount,
      (account) => rememberAccount(account, issuer),
      () => current.account?.id === accountA.id,
      () => false,
      async () => {
        current = sessionChange(
          current.account,
          "SIGNED_IN",
          { user: accountB },
          issuer,
          accountA.id,
        );
        current = sessionChange(current.account, "SIGNED_OUT", null, issuer, accountA.id);
        return { error: null };
      },
    );
    // Then neither B's cached identity nor visible account is removed.
    expect(current.account).toEqual(accountB);
    expect(cachedAccount(issuer)).toEqual(accountB);
  } finally {
    rmSync(device.directory, { recursive: true });
  }
});

it("preserves a real account-cache write failure across session loss until a durable retry", () => {
  // Given a filesystem conflict that prevents retaining account identity.
  device.directory = mkdtempSync(join(tmpdir(), "decamark-cache-error-"));
  const blockedFile = join(device.directory, "auth", "last-account.json");
  mkdirSync(blockedFile, { recursive: true });
  try {
    const signedIn = sessionChange(null, "SIGNED_IN", { user: accountA }, issuer, null);
    expect(signedIn.error).toContain("Could not retain your account");
    // When unexpected session loss arrives before the cache can be repaired.
    const lost = sessionChange(signedIn.account, "SIGNED_OUT", null, issuer, null, signedIn.error);
    // Then the warning survives while records remain available only in memory.
    expect(lost.account).toEqual(accountA);
    expect(lost.error).toBe(signedIn.error);
    expect(cachedAccount(issuer)).toBeNull();
    expect(
      sessionChange(lost.account, "SIGNED_OUT", null, issuer, accountA.id, lost.error).error,
    ).toBeNull();
    rmSync(blockedFile, { recursive: true });
    const repaired = sessionChange(
      lost.account,
      "SIGNED_IN",
      { user: accountA },
      issuer,
      null,
      lost.error,
    );
    expect(repaired.error).toBeNull();
    expect(cachedAccount(issuer)).toEqual(accountA);
  } finally {
    rmSync(device.directory, { recursive: true });
  }
});

it("builds the owner scope from the configured connection and the account, not from a constant", () => {
  // Given two different backends and two accounts.
  const local = { apiUrl: "http://192.168.1.20:8000", supabaseUrl: "http://192.168.1.20:54321" };
  // When the workspace is derived for each pair.
  const here = accountWorkspace(accountA, local);
  // Then the scope names that backend and that account, and no other pair shares its key.
  expect(here.scope).toMatchObject({
    apiUrl: local.apiUrl,
    issuer: local.supabaseUrl,
    userId: accountA.id,
  });
  expect(accountWorkspace(accountA, connection).key).not.toBe(here.key);
  expect(accountWorkspace(accountB, local).key).not.toBe(here.key);
  expect(here.key).not.toContain("127.0.0.1:8000");
  expect(here.key).not.toContain("lezmq");
  // And the stored key reads back as the scope the uploader checks rows against.
  expect(readOwnerScope(here.key)).toEqual(here.scope);
  expect(accountWorkspace(null, local)).toEqual({ scope: null, key: "local" });
});
