import { readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { getReactNavigationConfig } from "expo-router/build/getReactNavigationConfig";
import { getExactRoutes } from "expo-router/build/getRoutes";
import { inMemoryContext } from "expo-router/build/testing-library/context-stubs";

/**
 * The app's real route tree, for tests that cannot mount a navigator.
 *
 * expo-router's own `renderRouter` (`expo-router/testing-library`) needs Jest's globals and
 * `@testing-library/react-native`; this package runs Vitest and installs neither, so it cannot load
 * here. This builds the same tree `renderRouter` would: the file names under `app/` go through
 * expo-router's own route builder (`getExactRoutes`: groups, layouts, `index`, dynamic segments) and
 * its React Navigation config (`getReactNavigationConfig`: every screen's path under its parents).
 * A screen is then asked where a href lands, as a link would. Nothing here mounts a navigator, so it
 * says which navigator a route sits in, not what that navigator draws.
 */

const APP = join(__dirname, "../../../app");

function routeFiles(directory: string, relative = ""): string[] {
  return readdirSync(join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(relative, entry.name);
    if (entry.isDirectory()) return routeFiles(directory, path);
    return /\.[tj]sx?$/.test(entry.name) ? [`./${path}`] : [];
  });
}

type Screen = { path: string; screens: Record<string, Screen> };

/** Every screen of the tree with its ancestors' names ("(app)", "(tabs)", ...) and its full url. */
export type Route = { readonly chain: readonly string[]; readonly url: string };

function flatten(
  screens: Record<string, Screen>,
  chain: readonly string[] = [],
  base: readonly string[] = [],
): Route[] {
  return Object.entries(screens).flatMap(([name, screen]) => {
    const here = [...chain, name];
    // A group's own path is its name in parentheses; it never shows in a url.
    const segments = [
      ...base,
      ...screen.path.split("/").filter((part) => part && !/^\(.*\)$/.test(part)),
    ];
    const children = flatten(screen.screens, here, segments);
    return Object.keys(screen.screens).length > 0
      ? children
      : [{ chain: here, url: `/${segments.join("/")}` }];
  });
}

export type RouteTree = {
  /** The file name of every route under `app/`, as the route builder read them. */
  readonly files: readonly string[];
  /** Every screen that is a leaf: a page someone can be on. */
  readonly routes: readonly Route[];
  /** Where a link to this href lands, or null when no route has that url. */
  readonly resolve: (href: string) => Route | null;
};

export function realRouteTree(): RouteTree {
  const files = routeFiles(APP);
  const context = inMemoryContext(
    Object.fromEntries(files.map((file) => [file, { default: () => null }])),
  );
  const root = getExactRoutes(context);
  if (!root) throw new Error("The route builder found no routes under app/.");
  const config = getReactNavigationConfig(root, false) as { screens: Record<string, Screen> };
  const routes = flatten(config.screens);
  const resolve = (href: string): Route | null => {
    const want = `/${href.split(/[?#]/)[0]?.split("/").filter(Boolean).join("/")}`.split("/");
    const dynamic = (route: Route) =>
      route.url.split("/").filter((part) => part.startsWith(":")).length;
    const matches = routes
      .filter((route) => {
        const have = route.url.split("/");
        return (
          !route.url.includes("*") &&
          have.length === want.length &&
          have.every((part, i) => part.startsWith(":") || part === want[i])
        );
      })
      // A static route wins over a dynamic one that would also match ("/account" is not a project).
      .sort((a, b) => dynamic(a) - dynamic(b));
    return matches[0] ?? null;
  };
  return { files, routes, resolve };
}

/** Whether the route is inside the navigator that draws the tab dock (`app/(app)/(tabs)/_layout.tsx`). */
export function insideTabs(route: Route | null): boolean {
  return route?.chain.includes("(tabs)") ?? false;
}
