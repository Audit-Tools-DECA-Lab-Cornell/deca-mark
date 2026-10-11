/** Curated FieldMaps screenshots. Runs against the seeded, loopback-only E2E stack. */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { authFile } from "./support/auth";
import type { Role } from "./support/manifest";
import { SCAN_ROUTES } from "./support/routes";

type Target = { name: string; role: Role | null; state?: string; setup?: (page: Page) => Promise<void> };
const targets: Target[] = [
	{ name: "home", role: null },
	{ name: "sign-in", role: null },
	{ name: "sign-up", role: null },
	{ name: "forgot-password", role: null },
	{ name: "privacy", role: null },
	{ name: "account", role: "manager" },
	{ name: "project-overview", role: "manager" },
	{ name: "data", role: "manager" },
	{ name: "observation", role: "manager" },
	{ name: "sites", role: "manager" },
	{ name: "site", role: "manager" },
	{ name: "packages", role: "manager" },
	{ name: "packages-upload", role: "manager" },
	{ name: "forms", role: "manager" },
	{ name: "form-versions", role: "manager" },
	{ name: "team", role: "manager" },
	{ name: "qgis", role: "manager" },
	{ name: "reports", role: "manager" },
	{ name: "project-settings", role: "manager" },
	{ name: "org-projects", role: "owner" },
	{ name: "org-members", role: "owner" },
	{ name: "org-settings", role: "owner" },
	{ name: "viewer-overview", role: "viewer" },
	{ name: "observer-collect", role: "observer" },
	{
		name: "team",
		role: "manager",
		state: "invite-dialog",
		setup: async page => {
			await page.getByRole("button", { name: "Invite", exact: true }).first().click();
			await expect(page.getByRole("dialog")).toBeVisible();
		}
	},
	{
		name: "data",
		role: "manager",
		state: "export-dialog",
		setup: async page => {
			await page.getByRole("button", { name: "Export", exact: true }).first().click();
			await expect(page.getByRole("dialog")).toBeVisible();
		}
	},
	{
		name: "sites",
		role: "manager",
		state: "create-site-dialog",
		setup: async page => {
			await page
				.getByRole("button", { name: /^Create site$/ })
				.first()
				.click();
			await expect(page.getByRole("dialog")).toBeVisible();
		}
	}
];

const ROLES: Array<Role | null> = [null, "manager", "owner", "viewer", "observer"];
const EMPTY_STATE = { cookies: [], origins: [] };
const CAPTURE_ROOT = path.resolve(process.cwd(), "../assets/screenshots/web/raw");
const MAX_FRAMES = 16;
const SAFE = (value: string) => value.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
const localHost = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");
if (localHost.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(localHost.hostname)) {
	throw new Error("Screenshot capture is restricted to a loopback-only local web server.");
}

/** Preserve one screenful per frame, including the last partial viewport. */
async function captureFrames(page: Page, output: string): Promise<string[]> {
	await mkdir(output, { recursive: true });
	await page.addStyleTag({
		content: `html { scroll-behavior: auto !important; } *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; } nextjs-portal { display: none !important; }`
	});
	await page.evaluate(async () => {
		await document.fonts?.ready;
	});
	// Some screens scroll `main` rather than the document. Capture whichever actually scrolls.
	const dimensions = await page.evaluate(() => {
		const doc = document.scrollingElement ?? document.documentElement;
		const main = document.querySelector("main");
		const inside =
			main && main.scrollHeight > main.clientHeight + 32 && getComputedStyle(main).overflowY !== "visible"
				? main
				: null;
		const element = doc.scrollHeight > doc.clientHeight + 32 ? doc : (inside ?? doc);
		const viewport = element === doc ? window.innerHeight : element.clientHeight;
		return { height: element.scrollHeight, viewport, element: element === doc ? "document" : "main" };
	});
	const bottom = Math.max(0, dimensions.height - dimensions.viewport);
	const frameStride = Math.max(1, dimensions.viewport - 96);
	const desired = Math.ceil(bottom / frameStride) + 1;
	if (desired > MAX_FRAMES)
		console.warn(`Long page: capture is limited to ${MAX_FRAMES} frames, sampling the full scroll span.`);
	const count = Math.max(1, Math.min(MAX_FRAMES, desired));
	const files: string[] = [];
	const signatures = new Set<string>();
	for (let i = 0; i < count; i += 1) {
		const y = count === 1 ? 0 : Math.round((bottom * i) / (count - 1));
		await page.evaluate(
			({ value, element }) => {
				if (element === "main") document.querySelector("main")?.scrollTo({ top: value, behavior: "instant" });
				else window.scrollTo({ top: value, behavior: "instant" });
			},
			{ value: y, element: dimensions.element }
		);
		await page.waitForTimeout(220);
		const file = path.join(output, `${String(i + 1).padStart(2, "0")}.png`);
		const png = await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
		const hash = createHash("sha256").update(png).digest("hex");
		if (signatures.has(hash)) {
			// A scrolling container or a clamped page can duplicate pixels.
			// Discard duplicates so manifest and directory contain the same frames.
			await rm(file);
			continue;
		}
		signatures.add(hash);
		files.push(path.relative(path.resolve(process.cwd(), ".."), file).split(path.sep).join("/"));
	}
	return files;
}

type ManifestRecord = { role: string; screen: string; state: string; theme: string; route: string; files: string[] };
const records: ManifestRecord[] = [];

for (const role of ROLES) {
	test.describe(`screenshots as ${role ?? "public"}`, () => {
		test.use({ storageState: role ? authFile(role) : EMPTY_STATE });
		for (const target of targets.filter(item => item.role === role)) {
			const route = SCAN_ROUTES.find(item => item.name === target.name && item.role === role);
			if (!route) throw new Error(`Missing route in existing acceptance catalog: ${target.name} (${role})`);
			test(`@screenshots ${target.name}${target.state ? ` / ${target.state}` : ""}`, async ({ page }, info) => {
				test.setTimeout(120_000);
				const routePath = await route.path();
				for (const theme of ["day", "dusk"] as const) {
					await page.addInitScript(mode => localStorage.setItem("fm-theme", mode), theme);
					const response = await page.goto(routePath, { waitUntil: "domcontentloaded" });
					expect(response?.status(), `HTTP response from ${routePath}`).toBe(200);
					await expect(page.locator("body")).toBeVisible();
					await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
					await page.evaluate(async () => {
						await document.fonts?.ready;
					});
					// A meaningful page-specific ready state is preferable to unconditional network-idle.
					// Require the project shell or main landmark, without hiding failed routes.
					await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
					if (target.setup) await target.setup(page);
					const folder = path.join(
						CAPTURE_ROOT,
						SAFE(info.project.name),
						theme,
						role ?? "public",
						SAFE(target.name),
						SAFE(target.state ?? "overview")
					);
					const files = await captureFrames(page, folder);
					records.push({
						role: role ?? "public",
						screen: target.name,
						state: target.state ?? "overview",
						theme,
						route: routePath,
						files
					});
				}
			});
		}
	});
}

test.afterAll(async ({}, info) => {
	if (records.length === 0) return;
	const output = path.join(CAPTURE_ROOT, SAFE(info.project.name), "manifest.json");
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(
		output,
		JSON.stringify(
			{
				schemaVersion: 1,
				generatedAt: new Date().toISOString(),
				captureProject: info.project.name,
				captures: records.sort((a, b) =>
					`${a.role}/${a.screen}/${a.state}/${a.theme}`.localeCompare(
						`${b.role}/${b.screen}/${b.state}/${b.theme}`
					)
				)
			},
			null,
			2
		) + "\n"
	);
});
