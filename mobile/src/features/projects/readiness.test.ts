import { describe, expect, it } from "vitest";
import { PREVIEW_SITES } from "../preview/fixtures";
import {
  allVerified,
  deviceAssetChecks,
  downloadsSummary,
  nothingLostNote,
  projectReadiness,
  type SiteWithDownload,
  siteReadiness,
  siteSubtitle,
  unfinishedSentence,
  unfinishedTitle,
  zonesSentence,
} from "./readiness";

function site(id: string, state: SiteWithDownload["download"]["state"], received = 0) {
  const base = PREVIEW_SITES.find((entry) => entry.id === id);
  if (!base) throw new Error(id);
  return {
    ...base,
    download: { state, receivedMb: received, totalMb: base.sizeMb, assets: [] },
  } satisfies SiteWithDownload;
}

const riverside = site("riverside", "ready", 84);
const fallCreek = site("fall-creek", "notDownloaded");
const practice = site("practice-garden", "ready");

describe("project readiness (Mobile 10)", () => {
  it("counts the sites ready offline", () => {
    expect(projectReadiness({ training: false }, [riverside, fallCreek])).toEqual({
      state: "readyOffline",
      label: "1 site ready offline",
    });
    expect(projectReadiness({ training: false }, [riverside, riverside])).toMatchObject({
      label: "2 sites ready offline",
    });
  });

  it("calls Training always available, and says when nothing is here yet", () => {
    expect(projectReadiness({ training: true }, [practice]).label).toBe("Always available");
    expect(projectReadiness({ training: false }, [])).toEqual({
      state: "unknown",
      label: "No sites on this device yet",
    });
    expect(projectReadiness({ training: false }, [fallCreek]).state).toBe("notDownloaded");
    expect(
      projectReadiness({ training: false }, [site("fall-creek", "downloading", 60)]).state,
    ).toBe("downloading");
  });
});

describe("site rows (Mobile 11)", () => {
  it("reads as designed", () => {
    expect(siteSubtitle(riverside)).toBe("3 zones · map v3 · 84.0 MB");
    expect(siteSubtitle(fallCreek)).toBe("Whole playground · 126.0 MB");
    expect(siteSubtitle(practice)).toBe("2 zones · map bundled");
    expect(siteReadiness(riverside).label).toBe("Ready offline");
    expect(siteReadiness(fallCreek).label).toBe("Not downloaded");
    expect(siteReadiness(site("fall-creek", "downloading", 60)).label).toBe("Downloading · 48%");
    expect(siteReadiness(practice).label).toBe("Ships with the app");
  });

  it("totals what is on this device", () => {
    expect(downloadsSummary([riverside, fallCreek])).toBe("1 of 2 · 84.0 MB");
    expect(downloadsSummary([practice])).toBe("1 of 1");
    expect(downloadsSummary([])).toBe("0 of 0");
  });

  it("names the zones under a ready site", () => {
    expect(zonesSentence(riverside.zones)).toBe("3 zones: North meadow, Woodland edge, Sand area.");
    expect(zonesSentence(["Whole playground"])).toBe("1 zone: Whole playground.");
  });
});

describe("device package checks", () => {
  it("verifies only what the package on this device really has", () => {
    const facts = { hasGeometry: true, zoneCount: 3, formKnown: true, guideInApp: true };
    expect(allVerified(deviceAssetChecks(facts))).toBe(true);
    const noForm = deviceAssetChecks({ ...facts, formKnown: false });
    expect(noForm.map((asset) => asset.state)).toEqual([
      "verified",
      "verified",
      "waiting",
      "verified",
    ]);
    expect(allVerified(noForm)).toBe(false);
    expect(allVerified(deviceAssetChecks(null))).toBe(false);
    expect(allVerified([])).toBe(false);
  });
});

describe("unfinished observation and the 404 note", () => {
  it("says what the draft holds", () => {
    expect(unfinishedSentence({ placed: true, answered: 3, asked: 8 })).toBe(
      "Point placed, 3 of 8 answered. Kept on this device.",
    );
    expect(unfinishedSentence({ placed: false, answered: 1, asked: 0 })).toBe(
      "No point yet, 1 answer. Kept on this device.",
    );
    expect(unfinishedTitle("North meadow", "standard")).toBe("North meadow · Standard round");
    expect(unfinishedTitle("North meadow", "inventory")).toBe("North meadow · Inventory round");
  });

  it("names what is still on the device", () => {
    expect(nothingLostNote(5, true)).toEqual({
      title: "Nothing was lost.",
      body: "The 5 records on this device and your unfinished observation are still here.",
    });
    expect(nothingLostNote(1, false).body).toBe("The 1 record on this device is still here.");
    expect(nothingLostNote(0, true).body).toBe(
      "Your unfinished observation is still on this device.",
    );
  });
});
