import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Observation } from "../domain/observation";
import { useObservations } from "./use-observations";

type Read = { key: string; resolve: (rows: Observation[]) => void; reject: (error: Error) => void };

const state = vi.hoisted(() => ({
  database: {},
  key: "account-a",
  ready: true,
  revision: 0,
  reads: [] as Read[],
}));

vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => state.database }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});
vi.mock("../auth/provider", () => ({ useAccount: () => ({ key: state.key, ready: state.ready }) }));
vi.mock("../sync/provider", () => ({ useSync: () => ({ revision: state.revision }) }));
vi.mock("./observation-store", () => ({
  listObservations: (_db: unknown, key: string) =>
    new Promise<Observation[]>((resolve, reject) => {
      state.reads.push({ key, resolve, reject });
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (id: string) => ({ id }) as unknown as Observation;
let view: ReactTestRenderer | undefined;
let seen: ReturnType<typeof useObservations>;
function Probe() {
  seen = useObservations();
  return null;
}
async function show() {
  await act(async () => {
    if (view) view.update(<Probe />);
    else view = create(<Probe />);
  });
}
async function answer(index: number, rows: Observation[]) {
  await act(async () => state.reads[index]?.resolve(rows));
}
const ids = () => seen.records.map((record) => record.id);

afterEach(async () => {
  await act(async () => view?.unmount());
  view = undefined;
  Object.assign(state, { key: "account-a", ready: true, revision: 0, reads: [] });
});

describe("useObservations (MOB-39)", () => {
  it("is loading for the first read of an account, then shows its records", async () => {
    await show();
    expect(seen.loading).toBe(true);
    expect(ids()).toEqual([]);
    await answer(0, [row("one")]);
    expect(seen.loading).toBe(false);
    expect(ids()).toEqual(["one"]);
  });

  it("keeps the records and says nothing is loading while it reads again", async () => {
    await show();
    await answer(0, [row("one")]);
    state.revision = 1;
    await show();
    expect(state.reads).toHaveLength(2);
    expect(seen.loading).toBe(false);
    expect(ids()).toEqual(["one"]);
    await answer(1, [row("one"), row("two")]);
    expect(seen.loading).toBe(false);
    expect(ids()).toEqual(["one", "two"]);
  });

  it("ignores a read that finishes after a newer one", async () => {
    await show();
    await answer(0, [row("one")]);
    state.revision = 1;
    await show();
    state.revision = 2;
    await show();
    await answer(2, [row("one"), row("three")]);
    await answer(1, [row("stale")]);
    expect(ids()).toEqual(["one", "three"]);
  });

  it("never shows one account's records under another, and loads again for the new one", async () => {
    await show();
    await answer(0, [row("a-record")]);
    state.key = "account-b";
    await show();
    expect(seen.loading).toBe(true);
    expect(ids()).toEqual([]);
    await answer(1, [row("b-record")]);
    expect(seen.loading).toBe(false);
    expect(ids()).toEqual(["b-record"]);
    state.key = "account-a";
    await show();
    expect(seen.loading).toBe(true);
    expect(ids()).toEqual([]);
  });

  it("is loading until the account is ready", async () => {
    state.ready = false;
    await show();
    expect(seen.loading).toBe(true);
    expect(state.reads).toHaveLength(0);
    state.ready = true;
    await show();
    await answer(0, [row("one")]);
    expect(seen.loading).toBe(false);
  });

  it("reports an unreadable table, and a retry reads it again", async () => {
    await show();
    await act(async () => state.reads[0]?.reject(new Error("disk full")));
    expect(seen.error).toBe("disk full");
    expect(seen.loading).toBe(false);
    await act(async () => seen.retry());
    expect(seen.error).toBeNull();
    await answer(1, [row("one")]);
    expect(ids()).toEqual(["one"]);
    expect(seen.loading).toBe(false);
  });

  it("keeps the records it had when a later read fails", async () => {
    await show();
    await answer(0, [row("one")]);
    state.revision = 1;
    await show();
    await act(async () => state.reads[1]?.reject(new Error("busy")));
    expect(seen.error).toBe("busy");
    expect(ids()).toEqual(["one"]);
    expect(seen.loading).toBe(false);
  });
});
