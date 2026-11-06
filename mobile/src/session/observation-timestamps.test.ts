import type { RefObject } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Coordinate, Placement, RoundContext } from "../domain/observation";
import { shellV1 } from "../forms/fixtures/shell-v1";
import { type SessionState, startSession } from "../forms/session";
import { siteZones } from "../maps/sample-site";
import type { SitePackage } from "../packages/site-package";
import { readDraft } from "../storage/draft-store";
import { listObservations } from "../storage/observation-store";
import { memoryDatabase } from "../storage/package-store.fixture";
import { persistDraft } from "./draft-persistence";
import { useObservationActions } from "./observation-actions";
import type { ObservationIdentity } from "./ownership";

vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
afterEach(() => vi.useRealTimers());

async function harness(roundType: RoundContext["roundType"]) {
  const database = await memoryDatabase();
  const zone = siteZones[0];
  if (!zone) throw new Error("Synthetic zone missing");
  const style: SitePackage["bases"]["day"] = { version: 8, sources: {}, layers: [] };
  const site: SitePackage = {
    id: "synthetic-map",
    name: "Synthetic map",
    meta: "Synthetic",
    availability: "on-device",
    formVersion: "synthetic-timing-v1",
    inventoryFormVersion: "synthetic-timing-v1",
    version: "v1",
    siteId: "synthetic-site",
    sizeOnDevice: "Synthetic",
    inheritedContext: "",
    zones: [zone],
    centre: zone.centre,
    bounds: [zone.west, zone.south, zone.east, zone.north],
    bases: { day: style, night: style, aerial: style },
    layers: [],
  };
  const form = {
    ...shellV1,
    version: "synthetic-timing-v1",
    questions: shellV1.questions.filter((question) => question.id === "notes"),
  };
  const context: RoundContext = {
    packageId: site.id,
    packageVersion: site.version,
    zoneId: zone.id,
    zoneLabel: zone.label,
    roundType,
    freshPeriod: true,
    inheritedFrom: "",
  };
  const identity: RefObject<ObservationIdentity | null> = { current: null };
  const stateRef: RefObject<SessionState> = { current: startSession() };
  const placementRef: RefObject<Placement["source"]> = { current: "hand" };
  let placed: Coordinate | null = null;
  const actions = () =>
    useObservationActions({
      database: database.db,
      key: "local",
      packageOwner: "local",
      sitePackage: site,
      zone,
      context,
      form,
      unreadableDraft: false,
      recovered: null,
      placed,
      initials: "QA",
      accountId: "local",
      identity,
      stateRef,
      placementRef,
      holdIdentity: (value) => {
        identity.current = value;
      },
      setPlaced: (value) => {
        placed = value;
      },
      setPlacementSource: (value) => {
        placementRef.current = value;
      },
      setArmed: vi.fn(),
      setRecovered: vi.fn(),
      setStatus: vi.fn(),
      setSaves: vi.fn(),
      apply: (value) => {
        stateRef.current = value;
      },
      persist: (next, coordinate) =>
        persistDraft({
          database: database.db,
          key: "local",
          ready: true,
          site,
          context,
          owner: identity.current,
          formVersion: form.version,
          placement: placementRef.current,
          next,
          coordinate,
          failed: vi.fn(),
        }),
      wake: vi.fn(),
      current: () => true,
    });
  return { ...database, identity, actions, zone };
}

it.each([
  "standard",
  "reliability",
  "inventory",
] as const)("keeps the first %s start through adjustment, draft persistence and Save", async (round) => {
  const test = await harness(round);
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime("2026-10-26T12:00:00Z");
    if (round === "inventory") test.actions().startZoneRecord();
    else test.actions().place(test.zone.centre);
    expect(test.identity.current?.startedAt).toBe("2026-10-26T12:00:00.000Z");
    vi.setSystemTime("2026-10-26T12:01:00Z");
    if (round === "inventory") test.actions().startZoneRecord();
    else test.actions().place(test.zone.centre);
    expect((await readDraft(test.db, "local"))?.startedAt).toBe("2026-10-26T12:00:00.000Z");
    vi.setSystemTime("2026-10-26T12:02:00Z");
    expect(await test.actions().save()).toMatchObject({ ok: true });
    expect(await listObservations(test.db, "local")).toMatchObject([
      {
        startedAt: "2026-10-26T12:00:00.000Z",
        createdAt: "2026-10-26T12:02:00.000Z",
      },
    ]);
    expect(await readDraft(test.db, "local")).toBeNull();
    expect(test.identity.current).toBeNull();
    vi.setSystemTime("2026-10-26T12:03:00Z");
    if (round === "inventory") test.actions().startZoneRecord();
    else test.actions().place(test.zone.centre);
    expect(test.identity.current?.startedAt).toBe("2026-10-26T12:03:00.000Z");
    expect((await readDraft(test.db, "local"))?.startedAt).toBe("2026-10-26T12:03:00.000Z");
  } finally {
    test.sqlite.close();
  }
});

it("stamps a new start after discard without saving the abandoned observation", async () => {
  const test = await harness("standard");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime("2026-10-26T12:00:00Z");
    test.actions().place(test.zone.centre);
    test.actions().discard();
    await readDraft(test.db, "local");
    expect(test.identity.current).toBeNull();
    vi.setSystemTime("2026-10-26T12:01:00Z");
    test.actions().place(test.zone.centre);
    expect(test.identity.current?.startedAt).toBe("2026-10-26T12:01:00.000Z");
    expect(await listObservations(test.db, "local")).toEqual([]);
  } finally {
    test.sqlite.close();
  }
});

it("retains the start after a failed save and stamps observed time on the successful attempt", async () => {
  const test = await harness("standard");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime("2026-10-26T12:00:00Z");
    test.actions().place(test.zone.centre);
    test.sqlite.exec(
      "CREATE TEMP TRIGGER fail_save BEFORE INSERT ON observations BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
    );
    vi.setSystemTime("2026-10-26T12:01:00Z");
    expect(await test.actions().save()).toMatchObject({ ok: false });
    expect((await readDraft(test.db, "local"))?.startedAt).toBe("2026-10-26T12:00:00.000Z");
    test.sqlite.exec("DROP TRIGGER fail_save;");
    vi.setSystemTime("2026-10-26T12:02:00Z");
    expect(await test.actions().save()).toMatchObject({ ok: true });
    expect(await listObservations(test.db, "local")).toMatchObject([
      {
        startedAt: "2026-10-26T12:00:00.000Z",
        createdAt: "2026-10-26T12:02:00.000Z",
      },
    ]);
  } finally {
    test.sqlite.close();
  }
});
