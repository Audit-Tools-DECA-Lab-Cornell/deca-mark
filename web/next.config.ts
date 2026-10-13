import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

// Vercel builds from the repository root with Root Directory set to web/, and its Next.js adapter
// resolves every build output path against the repository root. Next.js reports those paths
// relative to this tracing root, so it must be the repository root, not web/. Next.js requires
// turbopack.root to match it.
const repositoryRoot = path.join(__dirname, "..");

/**
 * Addresses that no longer exist: the Nocturne workspace's pages, the set-up flow, and workspace pages
 * that were removed with the sample data. Each goes to the nearest page that does exist; `/o` opens the
 * person's own project.
 */
const OLD_ROUTES: [string, string][] = [
	["/overview", "/o"],
	["/observations", "/o"],
	["/places", "/o"],
	["/basemaps", "/o"],
	["/instrument", "/o"],
	["/qgis", "/o"],
	["/onboarding", "/o"],
	["/onboarding/:path*", "/o"],
	["/o/:org/library", "/o/:org"],
	["/o/:org/p/:project/sites/:site/zones", "/o/:org/p/:project/sites/:site"],
	["/o/:org/p/:project/reports/views", "/o/:org/p/:project/reports"],
	["/o/:org/p/:project/settings/rounds", "/o/:org/p/:project/settings"]
];

const nextConfig: NextConfig = {
	turbopack: { root: repositoryRoot },
	outputFileTracingRoot: repositoryRoot,
	// Form definitions and other edits travel through Server Actions; 1 MB is too tight for a long form.
	// Map packages (up to 24 MiB) go from the browser straight to the API instead (lib/api/browser.ts).
	experimental: { serverActions: { bodySizeLimit: "2mb" } },
	// Temporary (307) redirects: the query string is carried over.
	async redirects() {
		return OLD_ROUTES.map(([source, destination]) => ({ source, destination, permanent: false }));
	},
	async headers() {
		return [
			{
				source: "/sw.js",
				headers: [
					{ key: "Content-Type", value: "application/javascript; charset=utf-8" },
					{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }
				]
			}
		];
	}
};

export default function config(phase: string): NextConfig {
	if (phase !== PHASE_PRODUCTION_BUILD && phase !== PHASE_DEVELOPMENT_SERVER) return nextConfig;
	const buildId = (process.env.DECAMARK_SERVICE_WORKER_BUILD_ID ??= randomUUID());
	const source = readFileSync(path.join(__dirname, "src/lib/pwa/service-worker.js"), "utf8");
	writeFileSync(path.join(__dirname, "public/sw.js"), source.replace("__DECAMARK_BUILD_ID__", buildId));
	return { ...nextConfig, generateBuildId: async () => buildId };
}
