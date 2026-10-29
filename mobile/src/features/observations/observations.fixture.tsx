import {
  type ComponentType,
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { reactNative, router } from "../../ui/native.fixture";
import type { QueueRecord, QueueState } from "../preview/fixtures";
import type { Queue, QueueCounts } from "../preview/queue";

/**
 * What the Observations screen tests stand on: a scripted queue and sync, the stand-ins of
 * `native.fixture.tsx` plus a FlatList that draws all of its rows, and a reader that counts the stops a
 * screen reader would make. Each test file mocks the modules itself (`vi.mock` is hoisted per file):
 *
 *   vi.mock("react-native", async () => (await import("./observations.fixture")).nativeWithList);
 *   vi.mock("expo-router", async () => (await import("./observations.fixture")).routerWithRedirect);
 *   vi.mock("../preview/data-source", async () => (await import("./observations.fixture")).dataSource);
 *   vi.mock("../../sync/provider", async () => (await import("./observations.fixture")).sync);
 *   ...and the others listed in `observations-screen.test.tsx`.
 */

export const world = {
  records: [] as QueueRecord[],
  loading: false,
  error: null as string | null,
  online: true as boolean | null,
  mode: "device" as "device" | "preview",
  syncError: "",
  /** What the screen asked of the sync provider and the queue, in order. */
  calls: [] as string[],
  /** Where `<Redirect>` was asked to go. */
  redirects: [] as string[],
};

export function resetWorld(): void {
  world.records = [];
  world.loading = false;
  world.error = null;
  world.online = true;
  world.mode = "device";
  world.syncError = "";
  world.calls = [];
  world.redirects = [];
}

export function record(
  id: string,
  state: QueueState,
  more: Partial<QueueRecord> = {},
): QueueRecord {
  return {
    id,
    label: `OBS-${id.toUpperCase()}`,
    zone: "North meadow",
    roundType: "standard",
    time: "11:34",
    state,
    summary: "Behaviour mapping",
    ...more,
  };
}

/** The queue the screen reads, counted the way `useQueueForMode` counts: bound rows only. */
function queue(): Queue {
  const bound = world.records.filter((entry) => entry.practice !== true);
  const counts: QueueCounts = { onDevice: 0, uploading: 0, uploaded: 0, attention: 0, held: 0 };
  for (const entry of bound) counts[entry.state] += 1;
  return {
    records: world.records,
    counts,
    unsent: bound.length - counts.uploaded,
    practice: world.records.length - bound.length,
    loading: world.loading,
    error: world.error,
    retry: () => {
      world.calls.push("read again");
    },
    uploadNow: () => {
      world.calls.push("wake");
    },
  };
}

export const dataSource = {
  useQueue: queue,
  useDataSource: () => ({ mode: world.mode }),
};

export const sync = {
  useSync: () => ({
    revision: 0,
    error: world.syncError,
    wake: () => {
      world.calls.push("wake");
    },
    retry: async () => {
      world.calls.push("retry");
    },
  }),
};

type ListProps = {
  data?: readonly unknown[];
  renderItem: (info: { item: unknown; index: number }) => ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  ListHeaderComponent?: ComponentType | ReactElement | null;
  ListEmptyComponent?: ComponentType | ReactElement | null;
  ListFooterComponent?: ComponentType | ReactElement | null;
} & Record<string, unknown>;

function part(slot: ComponentType | ReactElement | null | undefined): ReactNode {
  if (!slot) return null;
  return isValidElement(slot) ? slot : createElement(slot as ComponentType);
}

/** FlatList without windowing: every row is drawn, so a test can read all of them. */
function FlatList({
  data = [],
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  ...props
}: ListProps) {
  return createElement(
    "FlatList",
    props,
    part(ListHeaderComponent),
    data.length === 0
      ? part(ListEmptyComponent)
      : data.map((item, index) =>
          createElement(
            Fragment,
            { key: keyExtractor ? keyExtractor(item, index) : index },
            renderItem({ item, index }),
          ),
        ),
    part(ListFooterComponent),
  );
}

function RefreshControl(props: Record<string, unknown>) {
  return createElement("RefreshControl", props);
}

export const nativeWithList = { ...reactNative, FlatList, RefreshControl };

export const routerWithRedirect = {
  ...router,
  Redirect: ({ href }: { href: string }) => {
    world.redirects.push(href);
    return null;
  },
  Tabs: Object.assign(
    ({ children, tabBar }: { children?: ReactNode; tabBar?: unknown }) => {
      tabsBar.current = tabBar;
      return createElement("Tabs", null, children);
    },
    {
      Screen: ({ name }: { name: string }) => {
        tabScreens.push(name);
        return null;
      },
    },
  ),
};

/** What the real `(tabs)` layout handed its `Tabs`: the tab bar renderer and the screens in order. */
export const tabsBar: { current: unknown } = { current: null };
export const tabScreens: string[] = [];

type Node = ReactTestInstance;
const props = (node: Node) => node.props as Record<string, unknown>;

/**
 * The stops a screen reader makes inside one part of the screen. An accessible element groups
 * everything inside it into one stop; hidden descendants are skipped; a bare Text outside a group is a
 * stop of its own, as it is on iOS.
 */
export function stopsIn(root: Node): { label: string }[] {
  const stops: { label: string }[] = [];
  const walk = (node: Node) => {
    const own = props(node);
    if (own.accessibilityElementsHidden === true || own.importantForAccessibility === "no-hide-descendants")
      return;
    const host = typeof node.type === "string";
    if (host && own.accessible === true) {
      stops.push({ label: String(own.accessibilityLabel ?? "") });
      return;
    }
    if (host && node.type === "Text") {
      stops.push({ label: node.children.map((child) => (typeof child === "string" ? child : "")).join("") });
      return;
    }
    for (const child of node.children) if (typeof child !== "string") walk(child);
  };
  walk(root);
  return stops;
}
