import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
vi.mock("expo-file-system", () => {
  class File {
    readonly path: string;
    constructor(...parts: string[]) {
      this.path = parts.join("/");
    }
    get name() {
      return this.path.split("/").at(-1) ?? "";
    }
    get exists() {
      return files.has(this.path);
    }
    textSync() {
      return files.get(this.path) ?? "";
    }
    write(value: string) {
      files.set(this.path, value);
    }
    delete() {
      files.delete(this.path);
    }
  }
  class Directory {
    readonly path: string;
    constructor(...parts: string[]) {
      this.path = parts.join("/");
    }
    get exists() {
      return [...files.keys()].some((path) => path.startsWith(`${this.path}/`));
    }
    create() {}
    list() {
      return [...files.keys()]
        .filter((path) => path.startsWith(`${this.path}/`))
        .map((path) => new File(path));
    }
  }
  return { Paths: { document: "documents" }, File, Directory };
});

const { readAccountSummaries, removeAccountSummary, writeAccountSummary } = await import(
  "./account-summaries"
);

const ISSUER = "http://127.0.0.1:54321";
const A = "50000000-0000-4000-8000-00000000000a";
const B = "50000000-0000-4000-8000-00000000000b";

function summary(userId: string, unsent: number, signedOutAt: string) {
  return {
    userId,
    email: `${userId.slice(-1)}@fieldmaps.test`,
    issuer: ISSUER,
    unsent,
    held: 0,
    drafts: 0,
    signedOutAt,
  };
}

describe("signed-out account summaries (MOB-05, MOB-07)", () => {
  beforeEach(() => files.clear());

  it("lists each signed-out account with records left, newest sign-out first", () => {
    expect(writeAccountSummary(summary(A, 5, "2026-10-15T10:00:00Z"))).toBe(true);
    expect(writeAccountSummary(summary(B, 2, "2026-10-15T11:00:00Z"))).toBe(true);
    expect(readAccountSummaries(ISSUER).map((s) => [s.email, s.unsent])).toEqual([
      ["b@fieldmaps.test", 2],
      ["a@fieldmaps.test", 5],
    ]);
  });

  it("keeps only the email and counts, one file per account", () => {
    writeAccountSummary(summary(A, 1, "2026-10-15T10:00:00Z"));
    expect([...files.keys()]).toEqual([`documents/accounts/${A}.json`]);
    expect(
      Object.keys(JSON.parse(files.get(`documents/accounts/${A}.json`) ?? "{}")).sort(),
    ).toEqual(["drafts", "email", "held", "issuer", "signedOutAt", "unsent", "userId"]);
  });

  it("forgets an account that signs in again", () => {
    writeAccountSummary(summary(A, 5, "2026-10-15T10:00:00Z"));
    removeAccountSummary(A);
    expect(readAccountSummaries(ISSUER)).toEqual([]);
  });

  it("skips another sign-in service, empty accounts and unreadable files", () => {
    writeAccountSummary({ ...summary(A, 5, "2026-10-15T10:00:00Z"), issuer: "https://other.test" });
    writeAccountSummary(summary(B, 0, "2026-10-15T10:00:00Z"));
    files.set("documents/accounts/broken.json", "{not json");
    expect(readAccountSummaries(ISSUER)).toEqual([]);
  });

  it("refuses a summary that is not an account's, without throwing", () => {
    expect(writeAccountSummary({ ...summary(A, 1, "x"), userId: "not-a-uuid" })).toBe(false);
    expect(files.size).toBe(0);
  });
});
