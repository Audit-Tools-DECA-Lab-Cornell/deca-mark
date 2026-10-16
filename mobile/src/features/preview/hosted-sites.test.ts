import { describe, expect, it } from "vitest";
import { boundFixture } from "../../packages/hosted/bound-fixture";
import { siteSchema } from "../../packages/hosted/schemas";
import { downloadsSummary, siteSubtitle } from "../projects/readiness";
import { hostedDownload, hostedPreviewSite } from "./hosted-sites";

const base = boundFixture().site;
const site = siteSchema.parse({
  ...base,
  code: "fall-creek",
  name: "Fall Creek playground",
  package: { ...base.package, package_version: 3, archive_bytes: 2_621_440 },
  zones: base.zones.map((zone) => ({ ...zone, label: "Zone A" })),
  observation_count: 4,
});

describe("A hosted site on the Project and Site screens", () => {
  it("names its package version, size and zones", () => {
    const shown = hostedPreviewSite("p", site);
    expect(shown).toMatchObject({
      id: site.site_id,
      packageId: site.package?.package_id,
      packageVersion: "v3",
      sizeMb: 2.5,
      zones: ["Zone A"],
      bundled: false,
    });
  });

  it("is ready only when its package is on the device", () => {
    expect(hostedDownload(site, true, undefined).state).toBe("ready");
    expect(hostedDownload(site, false, undefined).state).toBe("notDownloaded");
  });

  it("reports which part a download is on, not megabytes it has not measured", () => {
    const shown = hostedDownload(site, false, {
      state: "downloading",
      part: 2,
      packageId: site.package?.package_id ?? "fixture",
    });
    expect(shown.assets.map((asset) => asset.state)).toEqual([
      "verified",
      "verified",
      "downloading",
      "waiting",
    ]);
    expect(shown.detail).toBe("Part 3 of 4 · Assigned form definition");
  });

  it("keeps why a download failed", () => {
    const shown = hostedDownload(site, false, {
      state: "failed",
      message: "No signal.",
      unavailable: false,
      part: 0,
      packageId: site.package?.package_id ?? "fixture",
    });
    expect(shown).toMatchObject({ state: "notDownloaded", problem: "No signal." });
  });

  it("has no size and no package when none has been prepared", () => {
    const bare = { ...site, package: null };
    expect(hostedPreviewSite("p", bare)).toMatchObject({ packageId: "", sizeMb: 0 });
  });

  it("shows a small archive's measured size on site rows and in the download total", () => {
    const small = {
      ...site,
      package: site.package ? { ...site.package, archive_bytes: 4096 } : null,
    };
    const shown = hostedPreviewSite("p", small);
    const waiting = { ...shown, download: hostedDownload(small, false, undefined) };
    const ready = { ...shown, download: hostedDownload(small, true, undefined) };
    expect(shown.sizeMb * 1024 * 1024).toBe(4096);
    expect(waiting.download.totalMb * 1024 * 1024).toBe(4096);
    expect(siteSubtitle(waiting)).toBe("Zone A · 4 KB");
    expect(siteSubtitle(ready)).toBe("Zone A · map v3 · 4 KB");
    expect(downloadsSummary([ready, ready])).toBe("2 of 2 · 8 KB");
  });

  it("says when no map is prepared instead of showing a zero-byte download", () => {
    const bare = { ...site, package: null };
    const shown = {
      ...hostedPreviewSite("p", bare),
      download: hostedDownload(bare, false, undefined),
    };
    expect(siteSubtitle(shown)).toBe("Zone A · No map package yet");
  });
});
