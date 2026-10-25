import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

/*
 * WEB-50. A `loading.tsx` makes Next wrap each CHILD segment of its folder in a Suspense keyed by that
 * child, so every tab switch mounted a new boundary and React's 300 ms fallback reveal throttle held the
 * ready page (audit C17: warm tab switches 327-360 ms against 79-205 ms with one stable boundary).
 * The boundary therefore lives in the layout that holds the tabs, where it survives a tab switch. These
 * tests hold the source to that; the timing is measured with the boundary harness (web/PLAN.md WEB-50).
 */

const app = new URL("../../src/app/(app)/o/[org]/", import.meta.url);
const read = path => readFileSync(new URL(path, app), "utf8");

test("no loading.tsx remounts a boundary under the project or organization tabs", () => {
	assert.equal(existsSync(new URL("p/[project]/loading.tsx", app)), false, "p/[project]/loading.tsx");
	assert.equal(existsSync(new URL("(org)/loading.tsx", app)), false, "(org)/loading.tsx");
	assert.equal(existsSync(new URL("p/loading.tsx", app)), false, "p/loading.tsx");
});

test("the project and organization layouts hold one Suspense around the page", () => {
	for (const [file, label] of [
		["p/[project]/layout.tsx", "Loading the project…"],
		["(org)/layout.tsx", "Loading the organization…"]
	]) {
		const source = read(file);
		assert.match(source, /<Suspense\s+fallback=/, `${file} has a Suspense`);
		assert.match(source, /\}>\s*\{children\}\s*<\/Suspense>/, `${file} wraps only {children}`);
		assert.ok(source.includes(label), `${file} keeps the skeleton wording "${label}"`);
	}
});

test("the tab bar shows a still pending mark while a tab's page is on its way", () => {
	const source = readFileSync(new URL("../../src/components/contour/InkTabs.tsx", import.meta.url), "utf8");
	assert.match(source, /useLinkStatus/);
});
