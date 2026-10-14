import { describe, expect, it } from "vitest";
import type { SiteVersions } from "../../packages/zone-read-models";
import {
  briefVersionNote,
  checkedLine,
  hasUpdate,
  hostedReadiness,
  referencesSentence,
  siteVersionLine,
  updatesPhrase,
  versionView,
  whenLabel,
} from "./versions";

const none = { unfinished: 0, unsent: 0, attention: 0, retained: 0, openSession: false };
const MB = 1024 * 1024;

function versions(overrides: Partial<SiteVersions> = {}): SiteVersions {
  return {
    available: { packageId: "p2", version: 2, archiveBytes: 12 * MB },
    installed: [
      {
        packageId: "p1",
        version: 1,
        status: "verified",
        bytes: 11 * MB,
        installedAt: "2026-10-10T09:00:00Z",
        references: none,
      },
    ],
    nextSessionPackageId: "p1",
    lastCheckedAt: null,
    refreshProblem: null,
    download: null,
    ...overrides,
  };
}

const now = new Date(2026, 9, 14, 12, 0);

describe("versionView", () => {
  it("announces a newer map beside the installed one, which stays for the next session", () => {
    const view = versionView(versions(), now);
    expect(view.newest?.version).toBe(1);
    expect(view.update).toEqual({
      packageId: "p2",
      note: "Map v2 is available. Download it now to use it from your next session. Your unfinished and saved observations keep map v1.",
      button: "Download v2 · 12.0 MB",
    });
    expect(view.first).toBeNull();
    expect(hasUpdate(versions())).toBe(true);
  });

  it("offers the first download of a site with nothing on this device", () => {
    const view = versionView(versions({ installed: [], nextSessionPackageId: null }), now);
    expect(view.newest).toBeNull();
    expect(view.first).toEqual({ packageId: "p2", button: "Download 12.0 MB" });
    expect(view.update).toBeNull();
  });

  it("shows a download part by part, Waiting, Downloading, Verified", () => {
    const view = versionView(
      versions({ download: { packageId: "p2", part: 2, state: "running" } }),
      now,
    );
    expect(view.progress?.detail).toBe("Downloading · part 3 of 4");
    expect(view.progress?.version).toBe(2);
    expect(view.progress?.parts.map((part) => part.state)).toEqual([
      "verified",
      "verified",
      "downloading",
      "waiting",
    ]);
    expect(view.update).toBeNull();
  });

  it("keeps the installed map ready when a newer one fails or does not verify", () => {
    const failed = versionView(
      versions({ download: { packageId: "p2", part: 1, state: "failed" } }),
      now,
    );
    expect(failed.failure).toEqual({
      title: "Map v2 did not finish downloading.",
      body: "Map v1 is still on this device and ready.",
    });
    const unverified = versionView(
      versions({
        download: {
          packageId: "p2",
          part: 1,
          state: "verify_failed",
          message: "Zone Slide has no boundary.",
        },
      }),
      now,
    );
    expect(unverified.failure).toEqual({
      title: "Map v2 could not be checked.",
      body: "Zone Slide has no boundary. Map v1 stays on this device. Tell your coordinator.",
    });
  });

  it("lists older maps with what still uses them, and offers one whose files fail again", () => {
    const view = versionView(
      versions({
        installed: [
          {
            packageId: "p2",
            version: 2,
            status: "verified",
            bytes: 12 * MB,
            installedAt: null,
            references: none,
          },
          {
            packageId: "p1",
            version: 1,
            status: "needs_redownload",
            bytes: 11 * MB,
            installedAt: null,
            references: { ...none, unfinished: 1, unsent: 3 },
          },
        ],
        nextSessionPackageId: "p2",
      }),
      now,
    );
    expect(view.newest?.version).toBe(2);
    expect(view.update).toBeNull();
    expect(view.older).toEqual([
      {
        packageId: "p1",
        version: 1,
        label: "Map v1 · 11.0 MB · needs downloading again",
        usedBy: "Used by 1 unfinished observation and 3 records not uploaded yet.",
      },
    ]);
    expect(view.redownload).toEqual([
      { packageId: "p1", button: "Download map v1 again · 11.0 MB" },
    ]);
  });

  it("says why the list may be old, and what stays when access is gone", () => {
    const offline = versions({ refreshProblem: "offline", lastCheckedAt: "2026-10-10T13:12:00" });
    expect(versionView(offline, now).refresh).toBe(
      "Could not check for map updates. Showing what this device knew at Oct 10 · 13:12.",
    );
    expect(versionView(versions({ refreshProblem: "no_access" }), now).refresh).toBe(
      "You no longer have access to this project's maps. The maps and records on this device stay here.",
    );
    expect(versionView(versions(), now).refresh).toBeNull();
  });
});

describe("referencesSentence", () => {
  it("names every use, including uploaded records still kept with their map", () => {
    expect(referencesSentence(none)).toBeNull();
    expect(referencesSentence({ ...none, unsent: 1 })).toBe("Used by 1 record not uploaded yet.");
    expect(
      referencesSentence({
        unfinished: 2,
        unsent: 0,
        attention: 1,
        retained: 4,
        openSession: true,
      }),
    ).toBe(
      "Used by the collection open now, 2 unfinished observations, 1 record that needs attention and 4 uploaded records kept on this device.",
    );
  });
});

describe("labels", () => {
  it("says when this device last checked, in its own time", () => {
    expect(whenLabel("2026-10-14T09:12:00", now)).toBe("Today · 09:12");
    expect(whenLabel("2026-10-10T09:12:00", now)).toBe("Oct 10 · 09:12");
    expect(checkedLine(versions({ lastCheckedAt: "2026-10-14T09:12:00" }), now)).toBe(
      "Checked for updates Today · 09:12",
    );
    expect(checkedLine(versions(), now)).toBeNull();
  });

  it("names the installed and the published map on the Project screen", () => {
    expect(siteVersionLine(3, versions())).toBe("3 zones · map v1 · v2 available · 12.0 MB");
    expect(siteVersionLine(1, versions({ available: null }))).toBe("1 zone · map v1");
    expect(siteVersionLine(3, versions({ installed: [], nextSessionPackageId: null }))).toBe(
      "3 zones · map v2 · 12.0 MB",
    );
  });

  it("tells the Brief which map the session uses and why", () => {
    expect(briefVersionNote(1, versions())).toBe(
      "This session uses map v1, the newest map on this device. Map v2 has been published. Download it when you have a connection.",
    );
    const both = versions({
      available: { packageId: "p2", version: 2, archiveBytes: MB },
      installed: [
        ...versions().installed,
        {
          packageId: "p2",
          version: 2,
          status: "verified",
          bytes: MB,
          installedAt: null,
          references: none,
        },
      ],
    });
    expect(briefVersionNote(2, both)).toBe(
      "This session uses map v2. Earlier observations keep the map they were recorded on.",
    );
    expect(briefVersionNote(1, versions({ available: null }))).toBeNull();
  });
});

describe("readiness", () => {
  it("is ready offline while a verified map is here, even with a newer one published", () => {
    expect(hostedReadiness(versions())).toEqual({ state: "readyOffline", label: "Ready offline" });
    expect(hostedReadiness(versions({ installed: [], nextSessionPackageId: null }))).toEqual({
      state: "notDownloaded",
      label: "Not downloaded",
    });
    expect(
      hostedReadiness(versions({ download: { packageId: "p2", part: 1, state: "running" } })),
    ).toEqual({ state: "downloading", label: "Downloading · part 2 of 4" });
  });

  it("counts map updates for the Projects row", () => {
    expect(updatesPhrase(0)).toBe("");
    expect(updatesPhrase(1)).toBe(" · map update for 1 site");
    expect(updatesPhrase(2)).toBe(" · map update for 2 sites");
  });
});
