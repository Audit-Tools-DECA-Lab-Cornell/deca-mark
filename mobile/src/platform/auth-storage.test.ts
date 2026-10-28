import { randomBytes } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  files: new Map<string, string>(),
  secure: new Map<string, string>(),
  failKey: false,
  failAccount: false,
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "document" },
  Directory: class {
    constructor(...parts: unknown[]) {
      this.path = parts.join("/");
    }
    readonly path: string;
    toString() {
      return this.path;
    }
    create() {}
  },
  File: class {
    constructor(...parts: unknown[]) {
      this.path = parts.join("/");
    }
    readonly path: string;
    get exists() {
      return mock.files.has(this.path);
    }
    textSync() {
      return mock.files.get(this.path);
    }
    write(value: string) {
      if (mock.failAccount && this.path.endsWith("last-account.json")) throw new Error("Disk full");
      mock.files.set(this.path, value);
    }
    delete() {
      mock.files.delete(this.path);
    }
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => mock.secure.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (mock.failKey) throw new Error("SecureStore unavailable");
    mock.secure.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mock.secure.delete(key);
  }),
}));
vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (length: number) => new Uint8Array(randomBytes(length)),
}));

import {
  cachedAccount,
  forgetAccount,
  rememberAccount,
  sessionIdentity,
} from "../auth/cached-account";
import { authStorage } from "./auth-storage";

const issuer = "https://auth.example.test";
const account = { id: "50000000-0000-4000-8000-000000000001", email: "qa@example.test" };
const largeSession = JSON.stringify({ user: account, access_token: "synthetic".repeat(600) });
const storageKey = "fieldmaps-auth-synthetic.supabase.co";
const filePath = `document/auth/${storageKey}`;
beforeEach(() => {
  mock.files.clear();
  mock.secure.clear();
  mock.failKey = false;
  mock.failAccount = false;
});

it("round trips a >2KB session with only a 256-bit key in SecureStore", async () => {
  await authStorage.setItem(storageKey, largeSession);
  expect(largeSession.length).toBeGreaterThan(2048);
  expect(mock.secure.get("fieldmaps-auth-key")).toHaveLength(64);
  expect(mock.files.get(filePath)).not.toContain("synthetic");
  expect(await authStorage.getItem(storageKey)).toBe(largeSession);
});
it("uses a fresh nonce for every write and authenticates the storage key", async () => {
  await authStorage.setItem(storageKey, largeSession);
  const first = mock.files.get(filePath);
  await authStorage.setItem(storageKey, largeSession);
  expect(mock.files.get(filePath)).not.toBe(first);
  mock.files.set("document/auth/other", mock.files.get(filePath) ?? "");
  expect(await authStorage.getItem("other")).toBeNull();
});
it("serializes concurrent key creation, writes and removal", async () => {
  await Promise.all([authStorage.setItem("one", largeSession), authStorage.setItem("two", "{}")]);
  expect(await authStorage.getItem("one")).toBe(largeSession);
  expect(await authStorage.getItem("two")).toBe("{}");
  await Promise.all([authStorage.setItem("one", "{}"), authStorage.removeItem("one")]);
  expect(await authStorage.getItem("one")).toBeNull();
});
it("writes no session file when the encryption key cannot be saved", async () => {
  mock.failKey = true;
  await expect(authStorage.setItem(storageKey, largeSession)).rejects.toThrow(
    "SecureStore unavailable",
  );
  expect(mock.files.size).toBe(0);
});
it("missing and malformed keys permit a fresh sign-in", async () => {
  await authStorage.setItem(storageKey, largeSession);
  mock.secure.clear();
  expect(await authStorage.getItem(storageKey)).toBeNull();
  await authStorage.setItem(storageKey, "{}");
  expect(await authStorage.getItem(storageKey)).toBe("{}");
  mock.secure.set("fieldmaps-auth-key", "bad-key");
  expect(await authStorage.getItem(storageKey)).toBeNull();
  await authStorage.setItem(storageKey, "{}");
  expect(await authStorage.getItem(storageKey)).toBe("{}");
});
it("does not replace a key or session when SecureStore read fails", async () => {
  await authStorage.setItem(storageKey, largeSession);
  const ciphertext = mock.files.get(filePath);
  const secure = await import("expo-secure-store");
  vi.mocked(secure.getItemAsync).mockRejectedValueOnce(new Error("Keychain locked"));
  await expect(authStorage.setItem(storageKey, "{}")).rejects.toThrow("Keychain locked");
  expect(mock.files.get(filePath)).toBe(ciphertext);
  expect(await authStorage.getItem(storageKey)).toBe(largeSession);
});
it("corrupt or tampered files count as signed out", async () => {
  await authStorage.setItem(storageKey, largeSession);
  const envelope = JSON.parse(mock.files.get(filePath) ?? "{}");
  envelope.ciphertext = `${envelope.ciphertext[0] === "0" ? "1" : "0"}${envelope.ciphertext.slice(1)}`;
  mock.files.set(filePath, JSON.stringify(envelope));
  expect(await authStorage.getItem(storageKey)).toBeNull();
  mock.files.set(filePath, "invalid JSON");
  expect(await authStorage.getItem(storageKey)).toBeNull();
});
it("account identity survives Supabase session removal, including a module restart", async () => {
  rememberAccount(account, issuer);
  await authStorage.setItem(storageKey, largeSession);
  await authStorage.removeItem(storageKey);
  vi.resetModules();
  const restored = await import("../auth/cached-account");
  expect(restored.cachedAccount(issuer)).toEqual(account);
  expect(restored.cachedAccount("http://127.0.0.1:54321")).toBeNull();
  restored.forgetAccount();
  expect(restored.cachedAccount(issuer)).toBeNull();
});
it("corrupt account cache never crashes or leaks another issuer's account", () => {
  mock.files.set("document/auth/last-account.json", "invalid");
  expect(cachedAccount(issuer)).toBeNull();
  rememberAccount(account, issuer);
  expect(cachedAccount("https://other.supabase.co")).toBeNull();
  forgetAccount();
  expect(cachedAccount(issuer)).toBeNull();
});

it("publishes the new session's identity on cache-write failure and retries on refresh", () => {
  rememberAccount(account, issuer);
  const next = { user: { id: "50000000-0000-4000-8000-000000000002", email: "b@example.test" } };
  mock.failAccount = true;
  const failed = sessionIdentity(next, issuer);
  expect(failed.account).toEqual(next.user);
  expect(failed.session).toBe(next);
  expect(failed.error).toContain("Could not retain");
  expect(cachedAccount(issuer)).toEqual(account);
  mock.failAccount = false;
  const refreshed = sessionIdentity(next, issuer);
  expect(refreshed.account).toEqual(next.user);
  expect(refreshed.error).toBeNull();
  expect(cachedAccount(issuer)).toEqual(next.user);
});
