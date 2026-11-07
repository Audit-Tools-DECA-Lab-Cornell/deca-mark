import { describe, expect, it } from "vitest";
import {
  deleteAnywayAlert,
  deletionConsequences,
  type LocalWork,
  nothingWaits,
  practiceLine,
  signOutWarning,
  uploadFirstLabel,
} from "./leaving";

/** MOB-37: the words for leaving say what the uploader does, and keep practice apart from unsent work. */

const none: LocalWork = { unsent: 0, practice: 0, attention: 0, drafts: 0 };

describe("practice records in the words for leaving", () => {
  it("says practice records stay and are never uploaded", () => {
    expect(practiceLine(0)).toBeNull();
    expect(practiceLine(1)).toBe("1 practice record stays on this device and is never uploaded.");
    expect(practiceLine(2)).toBe("2 practice records stay on this device and are never uploaded.");
  });

  it("does not count practice as work that waits", () => {
    expect(nothingWaits({ ...none, practice: 2 })).toBe(true);
    expect(signOutWarning({ ...none, practice: 2 }, "a@b.c")).toBeNull();
  });

  it("names practice apart from the unsent count, never as 'held for the project'", () => {
    // Sign out says the practice line itself, after "their upload", so the warning carries none.
    const lines = signOutWarning({ ...none, unsent: 1, practice: 2 }, "a@b.c") ?? [];
    expect(lines).toContain("1 observation has not been uploaded.");
    expect(lines.join(" ")).not.toContain("practice");
    expect(lines.join(" ")).not.toContain("held for the project");
    expect(deletionConsequences({ ...none, unsent: 1, practice: 2 }, 1, null)).toContain(
      "2 practice records stay on this device and are never uploaded.",
    );
  });
});

describe("no record is ever held on a device (MOB-37, MOB-38)", () => {
  it("never says held, for any mix of work", () => {
    const work = { unsent: 4, practice: 2, attention: 1, drafts: 2 };
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
