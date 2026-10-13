import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

/**
 * Browser checks of the dev-only zone editor specimen (`/dev/zone-editor`): no local stack, no sign-in and
 * no API, because the specimen has none. It starts `next dev` on 127.0.0.1:3100 unless one is already
 * answering there (set SPECIMEN_BASE_URL to use another loopback address). Next.js is told not to load any
 * .env file. Specs end in `.specimen.ts`, so the local-stack suite (`playwright.config.ts`) never runs them.
 *
 *   pnpm --dir web test:specimen [--project=desktop-1440] [--grep …]
 */
const baseURL = process.env.SPECIMEN_BASE_URL ?? "http://127.0.0.1:3100";
const base = new URL(baseURL);
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
	throw new Error(`SPECIMEN_BASE_URL must be an http:// loopback address; refusing ${base.origin}.`);
}

const PINNED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = process.env.E2E_CHROMIUM ?? (existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined);

export default defineConfig({
	testDir: "./e2e/specimen",
	testMatch: /\.specimen\.ts$/,
	outputDir: "./test-results/specimen",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: Boolean(process.env.CI),
	timeout: 120_000,
	expect: { timeout: 20_000 },
	reporter: [["list"]],
	use: {
		baseURL: base.origin,
		locale: "en-US",
		timezoneId: "America/New_York",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		video: "off",
		actionTimeout: 15_000,
		navigationTimeout: 90_000,
		launchOptions: executablePath ? { executablePath } : {}
	},
	webServer: {
		command: `pnpm exec next dev --hostname ${base.hostname} --port ${base.port || "80"}`,
		url: `${base.origin}/dev/zone-editor`,
		reuseExistingServer: true,
		timeout: 180_000,
		env: { __NEXT_PROCESSED_ENV: "true", NEXT_TELEMETRY_DISABLED: "1" }
	},
	projects: [
		{ name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
		{
			name: "phone-390",
			use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
		}
	]
});
