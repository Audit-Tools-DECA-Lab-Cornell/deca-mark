import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { activityTone, attentionItems, pickCoverageSite } = await load("features/overview/model.ts");

const bound = (play, inventory = null) => ({
	play: { form_version: play },
	inventory: inventory === null ? null : { form_version: inventory }
});
const pkg = (version, forms = bound("play-v1")) => ({
	package_id: `pkg-${version}`,
	package_version: version,
	forms
});
const site = (code, count, version = null, forms = bound("play-v1")) => ({
	code,
	name: `Site ${code}`,
	observation_count: count,
	package: version === null ? null : pkg(version, forms)
});
const base = "/o/lab/p/study";

test("coverage shows the site asked for, then the first with records, then the first with a map", () => {
	const sites = [site("empty", 0, 1), site("busy", 8, 2), site("nomap", 5), site("other", 3, 1)];
	assert.equal(pickCoverageSite(sites, "other").code, "other");
	assert.equal(pickCoverageSite(sites).code, "busy");
	assert.equal(pickCoverageSite(sites, "nomap").code, "busy");
	assert.equal(pickCoverageSite(sites, "missing").code, "busy");
	assert.equal(pickCoverageSite([site("a", 0, 1), site("b", 0, 1)]).code, "a");
	assert.equal(pickCoverageSite([site("nomap", 4)]), null);
	assert.equal(pickCoverageSite([]), null);
});

const forms = [
	{
		code: "play",
		name: "Play form",
		versions: [
			{ code: "play-v2", version: 2, state: "draft" },
			{ code: "play-v1", version: 1, state: "published" }
		]
	}
];

test("a project with nothing set up lists what to do, with links for managers", () => {
	const items = attentionItems({ sites: [], packages: [], blocked: {}, forms: [], base, manage: true });
	assert.deepEqual(
		items.map(item => [item.id, item.action?.href]),
		[
			["no-site", `${base}/sites`],
			["no-form", `${base}/forms`]
		]
	);
});

test("viewers see the same items without links", () => {
	const items = attentionItems({ sites: [], packages: [], blocked: {}, forms: [], base, manage: false });
	assert.equal(items.length, 2);
	assert.ok(items.every(item => item.action === undefined));
});

test("a site without a ready package, and a draft that observers cannot see", () => {
	const items = attentionItems({
		sites: [site("a", 0)],
		packages: [],
		blocked: {},
		forms,
		base,
		manage: true
	});
	assert.deepEqual(
		items.map(item => item.id),
		["no-package-a", "draft-play-v2"]
	);
	assert.equal(items[0].action.href, `${base}/sites/a/packages?step=upload`);
	assert.equal(items[1].action.href, `${base}/forms/versions/play-v2`);
	assert.equal(items[1].tone, "waiting");
});

test("a blocked newest package gives its first blocked check, and says what observers still get", () => {
	const packages = [
		{ package_id: "p1", site_code: "a", package_version: 1, state: "ready" },
		{ package_id: "p2", site_code: "a", package_version: 2, state: "blocked" }
	];
	const [item] = attentionItems({
		sites: [site("a", 4, 1)],
		packages,
		blocked: { p2: "The imagery layer has no licence" },
		forms: [{ ...forms[0], versions: [forms[0].versions[1]] }],
		base,
		manage: true
	});
	assert.equal(item.id, "blocked-p2");
	assert.equal(item.title, "Map package v2 for Site a was blocked.");
	assert.equal(item.detail, "The imagery layer has no licence. Observers still get v1.");
	assert.equal(item.action.href, `${base}/sites/a/packages?package=p2`);
});

test("a site whose only packages are blocked is one item, not two", () => {
	const items = attentionItems({
		sites: [site("a", 0)],
		packages: [{ package_id: "p1", site_code: "a", package_version: 1, state: "blocked" }],
		blocked: { p1: null },
		forms: [{ ...forms[0], versions: [forms[0].versions[1]] }],
		base,
		manage: true
	});
	assert.equal(items.length, 1);
	assert.equal(items[0].detail, "There is no ready map package for this site.");
});

test("an older blocked package does not count when a newer one is ready", () => {
	const items = attentionItems({
		sites: [site("a", 0, 2)],
		packages: [
			{ package_id: "p1", site_code: "a", package_version: 1, state: "blocked" },
			{ package_id: "p2", site_code: "a", package_version: 2, state: "ready" }
		],
		blocked: {},
		forms: [{ ...forms[0], versions: [forms[0].versions[1]] }],
		base,
		manage: true
	});
	assert.deepEqual(items, []);
});

test("unreadable packages or forms are not reported as problems or as fine", () => {
	const items = attentionItems({
		sites: [site("a", 0, 1)],
		packages: null,
		blocked: {},
		forms: null,
		base,
		manage: true
	});
	assert.deepEqual(items, []);
});

const form = (code, name, versions) => ({
	code,
	name,
	versions: versions.map(([version, state]) => ({ code: `${code}-v${version}`, version, state }))
});
const ready = (...sites) => ({ sites, packages: [], blocked: {}, base, manage: true });

test("v1 bound by Site A's map and v2 published is not 'nothing needs attention'", () => {
	const items = attentionItems({
		...ready(site("a", 4, 1)),
		forms: [
			form("play", "Play form", [
				[2, "published"],
				[1, "published"]
			])
		]
	});
	assert.deepEqual(
		items.map(item => item.id),
		["form-behind-play"]
	);
	const [item] = items;
	assert.equal(item.tone, "waiting");
	assert.equal(item.title, "Play form v2 is published, but no site's map names it.");
	assert.equal(
		item.detail,
		"Observers still get v1 at Site a. A site changes forms only when you upload a map package that names v2."
	);
	assert.deepEqual(item.action, { label: "Upload a map package", href: `${base}/sites/a/packages?step=upload` });
});

test("sites on the newest version are not behind, whatever else is published", () => {
	const published = [
		[2, "published"],
		[1, "published"]
	];
	const upToDate = attentionItems({
		...ready(site("a", 0, 1, bound("play-v2"))),
		forms: [form("play", "Play form", published)]
	});
	assert.deepEqual(upToDate, []);
	// A draft or a retired newest version is not something observers could be given.
	const draftOnly = attentionItems({
		...ready(site("a", 0, 1)),
		forms: [
			form("play", "Play form", [
				[2, "draft"],
				[1, "published"]
			])
		]
	});
	assert.deepEqual(
		draftOnly.map(item => item.id),
		["draft-play-v2"]
	);
	const retired = attentionItems({
		...ready(site("a", 0, 1)),
		forms: [
			form("play", "Play form", [
				[2, "retired"],
				[1, "published"]
			])
		]
	});
	assert.deepEqual(retired, []);
	// A map on a version newer than the newest published one (it was retired since) is not behind.
	const ahead = attentionItems({
		...ready(site("a", 0, 1, bound("play-v3"))),
		forms: [
			form("play", "Play form", [
				[3, "retired"],
				[2, "published"]
			])
		]
	});
	assert.deepEqual(ahead, []);
});

test("sites that name the newest version are said to, and sites with other forms are left alone", () => {
	const items = attentionItems({
		...ready(
			site("a", 0, 1, bound("play-v2")),
			site("b", 0, 2, bound("play-v1")),
			site("c", 0, 3, bound("other-v1"))
		),
		forms: [
			form("play", "Play form", [
				[2, "published"],
				[1, "published"]
			]),
			form("other", "Other form", [[1, "published"]])
		]
	});
	assert.equal(items.length, 1);
	assert.equal(items[0].title, "Play form v2 is published, but not every site's map names it.");
	assert.match(items[0].detail, /^Observers still get v1 at Site b\. /);
	assert.equal(items[0].action.href, `${base}/sites/b/packages?step=upload`);
});

test("several sites behind on one form are one item that lists each site's version and links to the sites", () => {
	const items = attentionItems({
		...ready(
			site("a", 0, 1, bound("play-v1")),
			site("b", 0, 2, bound("play-v2")),
			site("c", 0, 3, bound("play-v1"))
		),
		forms: [
			form("play", "Play form", [
				[3, "published"],
				[2, "published"],
				[1, "published"]
			])
		]
	});
	assert.equal(items.length, 1);
	assert.equal(items[0].title, "Play form v3 is published, but no site's map names it.");
	assert.match(items[0].detail, /^Observers still get v1 at Site a, v2 at Site b and v1 at Site c\. /);
	assert.deepEqual(items[0].action, { label: "Open sites", href: `${base}/sites` });
});

test("a long list of sites behind is cut after three", () => {
	const sites = ["a", "b", "c", "d", "e", "f"].map((code, index) => site(code, 0, index + 1));
	const [item] = attentionItems({
		...ready(...sites),
		forms: [
			form("play", "Play form", [
				[2, "published"],
				[1, "published"]
			])
		]
	});
	assert.match(item.detail, /^Observers still get v1 at Site a, v1 at Site b, v1 at Site c and 3 more\. /);
	assert.deepEqual(item.action, { label: "Open sites", href: `${base}/sites` });
});

test("an inventory form that a map binds is checked like the play form", () => {
	const items = attentionItems({
		...ready(site("a", 0, 1, bound("play-v1", "zones-v1"))),
		forms: [
			form("play", "Play form", [[1, "published"]]),
			form("zones", "Zone inventory", [
				[2, "published"],
				[1, "retired"]
			])
		]
	});
	assert.deepEqual(
		items.map(item => item.id),
		["form-behind-zones"]
	);
	assert.equal(items[0].title, "Zone inventory v2 is published, but no site's map names it.");
	assert.match(items[0].detail, /^Observers still get v1 at Site a\. /);
});

test("the item waits in the order of the forms, before that form's draft, and viewers get no link", () => {
	const input = {
		...ready(site("a", 0, 1)),
		forms: [
			form("play", "Play form", [
				[3, "draft"],
				[2, "published"],
				[1, "published"]
			])
		]
	};
	assert.deepEqual(
		attentionItems(input).map(item => item.id),
		["form-behind-play", "draft-play-v3"]
	);
	assert.ok(attentionItems({ ...input, manage: false }).every(item => item.action === undefined));
});

test("a bound version the forms do not list, or a map with no recorded forms, is not reported as behind", () => {
	const forms = [
		form("play", "Play form", [
			[2, "published"],
			[1, "published"]
		])
	];
	assert.deepEqual(attentionItems({ ...ready(site("a", 0, 1, bound("gone-v1"))), forms }), []);
	assert.deepEqual(attentionItems({ ...ready(site("b", 0)), forms }), [
		{
			id: "no-package-b",
			tone: "attention",
			title: "Site b has no ready map package.",
			detail: "Observers have no map to download for this site.",
			action: { label: "Upload a map package", href: `${base}/sites/b/packages?step=upload` }
		}
	]);
});

test("activity rings are colours that never carry the meaning alone", () => {
	assert.equal(activityTone("observations"), "uploaded");
	assert.equal(activityTone("package", "ready"), "saved");
	assert.equal(activityTone("package", "blocked"), "attention");
	assert.equal(activityTone("form-published"), "saved");
	assert.equal(activityTone("form-draft"), "held");
	assert.equal(activityTone("site"), "ink");
});
