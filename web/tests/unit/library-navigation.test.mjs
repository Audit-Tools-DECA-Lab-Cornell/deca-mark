import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { ORG_SECTIONS, PROJECT_SECTIONS, orgHref, pageNameOf, projectHref, scopeOf, visibleSections } =
	await load("features/shell/navigation.ts");
const { ORG_GO_KEYS, ORG_SHORTCUTS, PROJECT_GO_KEYS, PROJECT_SHORTCUTS } = await load("lib/shortcuts.ts");

const labels = sections => sections.map(section => section.label);

test("Library is the ninth project tab, directly after Forms", () => {
	assert.deepEqual(labels(PROJECT_SECTIONS), [
		"Overview",
		"Data",
		"Sites",
		"Forms",
		"Library",
		"Team",
		"QGIS",
		"Reports",
		"Settings"
	]);
});

test("a viewer sees the project Library tab but not Team or Settings", () => {
	assert.deepEqual(labels(visibleSections(PROJECT_SECTIONS, false)), [
		"Overview",
		"Data",
		"Sites",
		"Forms",
		"Library",
		"QGIS",
		"Reports"
	]);
});

test("Library is the fourth organization tab, for owners and admins only", () => {
	assert.deepEqual(labels(ORG_SECTIONS), ["Projects", "Members", "Library", "Settings"]);
	assert.deepEqual(labels(visibleSections(ORG_SECTIONS, false)), ["Projects"]);
});

test("the library addresses and their page names", () => {
	assert.equal(projectHref("deca", "play", "library"), "/o/deca/p/play/library");
	assert.equal(orgHref("deca", "library"), "/o/deca/library");
	assert.equal(pageNameOf("/o/deca/p/play/library/variables/new"), "Library");
	assert.equal(pageNameOf("/o/deca/library/templates"), "Organization library");
	assert.deepEqual(scopeOf("/o/deca/library"), { kind: "org", org: "deca", section: "library" });
});

test("g then l goes to the Library in a project and on the organization pages", () => {
	assert.equal(PROJECT_GO_KEYS.l, "library");
	assert.equal(ORG_GO_KEYS.l, "library");
});

for (const [name, sections, keys, group] of [
	["project", PROJECT_SECTIONS, PROJECT_GO_KEYS, PROJECT_SHORTCUTS],
	["organization", ORG_SECTIONS, ORG_GO_KEYS, ORG_SHORTCUTS]
]) {
	test(`every ${name} tab has one g key, and the shortcuts dialog lists it`, () => {
		assert.equal(new Set(sections.map(section => section.go)).size, sections.length);
		for (const section of sections) {
			assert.equal(keys[section.go], section.segment, `g ${section.go} opens ${section.label}`);
			assert.ok(
				group.rows.some(row => row.keys[1] === section.go && row.label === `Go to ${section.label}`),
				`the dialog lists g ${section.go} for ${section.label}`
			);
		}
		assert.equal(Object.keys(keys).length, sections.length);
	});
}
