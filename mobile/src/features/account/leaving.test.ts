import { describe, expect, it } from "vitest";
import {
  deleteAnywayAlert,
  deletionConsequences,
  type LocalWork,
  nothingWaits,
  signOutWarning,
  uploadFirstLabel,
} from "./leaving";

/** MOB-37, MOB-43: the words for leaving say what the uploader does; every saved record is one that uploads. */

const none: LocalWork = { unsent: 0, attention: 0, drafts: 0 };

describe("work that waits in the words for leaving", () => {
  it("says nothing waits when no record is unsent and no draft is kept", () => {
    expect(nothingWaits(none)).toBe(true);
    expect(signOutWarning(none, "a@b.c")).toBeNull();
  });

  it("never says a record stays on the device for good: practice records upload like any other", () => {
    const lines = signOutWarning({ ...none, unsent: 1 }, "a@b.c") ?? [];
    expect(lines).toContain("1 observation has not been uploaded.");
    const said = [
      ...lines,
      ...deletionConsequences({ ...none, unsent: 1 }, 1, null),
      deleteAnywayAlert({ ...none, unsent: 1 }).body,
    ].join(" ");
    expect(said).not.toMatch(/practice/i);
    expect(said).not.toContain("never uploaded");
    expect(said).not.toContain("held for the project");
  });
});

describe("no record is ever held on a device (MOB-37, MOB-38)", () => {
  it("never says held, for any mix of work", () => {
    const work = { unsent: 4, attention: 1, drafts: 2 };
    const said = [
      ...(signOutWarning(work, "a@b.c") ?? []),
      ...deletionConsequences(work, 2, "MO"),
      deleteAnywayAlert(work).title,
      deleteAnywayAlert(work).body,
    ].join(" ");
    expect(said).not.toMatch(/held/i);
  });
});

describe("deleting with work left", () => {
  it("labels the way out 'Upload N first'", () => {
    expect(uploadFirstLabel(1)).toBe("Upload 1 first");
    expect(uploadFirstLabel(5)).toBe("Upload 5 first");
  });

  it("tells the observer they can upload first, never that it is impossible", () => {
    const alert = deleteAnywayAlert({ ...none, unsent: 3 });
    expect(alert.title).toBe("Delete with 3 records not uploaded?");
    expect(alert.body).toBe("Upload them first, or they stay on this device and can never upload.");
    expect(alert.body).not.toMatch(/cannot upload them/);
  });

  it("names an unfinished observation as unable to upload, whatever the observer does", () => {
    expect(deleteAnywayAlert({ ...none, drafts: 1 })).toEqual({
      title: "Delete with 1 record not uploaded?",
      body: "The unfinished observation can never be saved for upload.",
    });
  });
});
