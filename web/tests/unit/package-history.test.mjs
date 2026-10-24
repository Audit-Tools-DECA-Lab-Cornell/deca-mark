import assert from "node:assert/strict";
import test from "node:test";

import { forms, pkg, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { blockedToExplain, currentPackage, firstBlockedDetail, historyRows } =
	await load("features/packages/history.ts");
const { readManifest } = await load("features/packages/manifest.ts");
const { chooseFormVersion, chooseInventoryForm, isInventoryDefinition, newerPublished, publishedVersions } =
	await load("features/packages/forms.ts");
const { clock } = await load("lib/time.ts");

const ny = clock("America/New_York");
const summary = (version, state, extra = {}) =>
	pkg({
		package_id: uuid(100 + version),
		package_version: version,
		state,
		prepared_at: `2026-10-0${version}T18:05:00Z`,
		...extra
	});
const history = (current, packages) => ({ current_package_id: current, packages });

test("the package the site names is current, whatever its number; other ready ones are archived; blocked ones fail", () => {
	const packages = [summary(1, "ready"), summary(4, "blocked"), summary(2, "ready"), summary(3, "ready")];
	// Version 2 is current: version 3 is ready but was replayed after it, which does not make it current.
	const rows = historyRows(history(uuid(102), packages), ny, {
		[uuid(104)]: "Fall Creek declares a CRS that is not WGS 84."
	});
	assert.deepEqual(
		rows.map(row => [row.version, row.state]),
		[
			[4, "blocked"],
			[3, "archived"],
			[2, "current"],
			[1, "archived"]
		]
	);
	assert.equal(rows[0].blockedDetail, "Fall Creek declares a CRS that is not WGS 84.");
	assert.equal(rows[2].blockedDetail, null);
	assert.equal(rows[2].prepared, "Oct 02, 2026 · 14:05");
	assert.equal(rows[2].sizeLabel, "13 KB");
	assert.equal(currentPackage(history(uuid(102), packages)).package_version, 2);
});

test("a row says which forms the version binds, where it came from, and its note", () => {
	const [row] = historyRows(
		history(uuid(101), [
			summary(1, "ready", {
				forms: forms("behaviour-v2", "inventory-v1"),
				source: "draft",
				change_note: "  Split the meadow.  "
			})
		]),
		ny
	);
	assert.equal(row.formVersion, "behaviour-v2");
	assert.equal(row.inventoryFormVersion, "inventory-v1");
	assert.equal(row.source, "draft");
	assert.equal(row.changeNote, "Split the meadow.");
	assert.equal(historyRows(history(uuid(101), [summary(1, "ready")]), ny)[0].inventoryFormVersion, null);
});

test("a site whose packages are all blocked has no current package", () => {
	assert.equal(currentPackage(history(null, [summary(1, "blocked")])), null);
	assert.equal(historyRows(history(null, [summary(1, "blocked")]), ny)[0].state, "blocked");
	assert.equal(historyRows(history(null, [summary(1, "blocked")]), ny)[0].blockedDetail, null);
	assert.deepEqual(historyRows(history(null, []), ny), []);
});

test("the reason a package was blocked is the first check that blocked it", () => {
	const checks = [
		{ step: "source-project", state: "skipped", detail: "No QGIS project was supplied." },
		{ step: "coordinate-reference", state: "blocked", detail: "Re-export with CRS EPSG:4326." },
		{ step: "imagery-licence", state: "blocked", detail: "Tiles are fetched on demand." }
	];
	assert.equal(firstBlockedDetail(checks), "Re-export with CRS EPSG:4326.");
	assert.equal(firstBlockedDetail([{ step: "archive", state: "passed", detail: "ok" }]), null);
});

test("only the newest blocked packages are read for their reasons", () => {
	const blocked = Array.from({ length: 10 }, (_, index) => summary(index + 1, "blocked"));
	const ids = blockedToExplain([...blocked, summary(11, "ready")], 3);
	assert.deepEqual(ids, [uuid(110), uuid(109), uuid(108)]);
});

test("a manifest is read leniently", () => {
	const manifest = readManifest({
		format: 1,
		forms: { play: { form_version_id: uuid(800), form_version: "workspace-check-v1" }, inventory: null },
		zones: [
			{ zone_id: uuid(201), zone_code: "A", label: "Zone A · Whole playground", bbox: [0, 0, 1, 1] },
			{ zone_id: uuid(202), zone_code: "B" },
			{ zone_code: "C", label: "no identity" }
		],
		layers: [{ name: "ground", features: 1, sha256: "x" }, { name: "trees", features: 12 }, { name: "broken" }],
		source_project: {
			file_name: "playground.qgz",
			title: "Playground",
			crs: "EPSG:3857",
			vector_layers: ["ground", "zones"],
			raster_layers: [{ layer_name: "ortho" }]
		}
	});
	assert.equal(manifest.formVersion, "workspace-check-v1");
	assert.deepEqual(manifest.zones, [
		{ id: uuid(201), code: "A", label: "Zone A · Whole playground" },
		{ id: uuid(202), code: "B", label: "B" }
	]);
	assert.deepEqual(manifest.layers, [
		{ name: "ground", features: 1 },
		{ name: "trees", features: 12 }
	]);
	assert.deepEqual(manifest.project, {
		fileName: "playground.qgz",
		title: "Playground",
		crs: "EPSG:3857",
		vectorLayers: 2,
		rasterLayers: 1
	});
	assert.equal(readManifest(null), null);
	assert.deepEqual(readManifest({ source_project: null }).project, null);
	assert.equal(readManifest({}).formVersion, null);
});

const form = (code, name, versions) => ({
	form_id: code,
	code,
	name,
	versions: versions.map(([version, state, published]) => ({
		version_id: `${code}-${version}`,
		code: `${code}-v${version}`,
		version,
		state,
		title: name,
		question_count: 1,
		published_at: published ?? null
	}))
});

test("only published versions are offered, most recently published first", () => {
	const catalogue = [
		form("behaviour", "Behaviour mapping", [
			[1, "retired", "2026-09-01T00:00:00Z"],
			[2, "published", "2026-09-20T00:00:00Z"],
			[3, "draft"]
		]),
		form("inventory", "Zone inventory", [[1, "published", "2026-10-01T00:00:00Z"]])
	];
	assert.deepEqual(
		publishedVersions(catalogue).map(version => version.code),
		["inventory-v1", "behaviour-v2"]
	);
	assert.deepEqual(publishedVersions([form("x", "X", [[1, "draft"]])]), []);
});

test("the upload starts on the current package's form while it is still published", () => {
	const published = publishedVersions([
		form("behaviour", "Behaviour", [[2, "published", "2026-09-20T00:00:00Z"]]),
		form("inventory", "Inventory", [[1, "published", "2026-10-01T00:00:00Z"]])
	]);
	assert.equal(chooseFormVersion(published, "behaviour-v2"), "behaviour-v2");
	// Retired or unknown: the newest published form that is not an inventory form.
	assert.equal(chooseFormVersion(published, "behaviour-v1", new Set(["inventory-v1"])), "behaviour-v2");
	assert.equal(chooseFormVersion(published, null, new Set(["inventory-v1"])), "behaviour-v2");
	// Only inventory forms are published: still offer one rather than none.
	assert.equal(chooseFormVersion(published.slice(0, 1), null, new Set(["inventory-v1"])), "inventory-v1");
	assert.equal(chooseFormVersion([], null), null);
});

test("the upload starts on the newest published version of the current package's form, not the one the map names", () => {
	const published = publishedVersions([
		form("behaviour", "Behaviour", [
			[1, "published", "2026-09-01T00:00:00Z"],
			[2, "published", "2026-09-20T00:00:00Z"]
		]),
		form("inventory", "Inventory", [[1, "published", "2026-10-01T00:00:00Z"]])
	]);
	// The map names v1, v2 is published: the upload starts on v2, so the correction reaches observers.
	assert.equal(chooseFormVersion(published, "behaviour-v1", new Set(["inventory-v1"])), "behaviour-v2");
	assert.equal(chooseFormVersion(published, "behaviour-v2", new Set(["inventory-v1"])), "behaviour-v2");
	// Another form published more recently does not take the place of the map's own.
	assert.equal(chooseFormVersion(published, "behaviour-v1"), "behaviour-v2");
	// "Newest" is the highest version number, not the one published last (v3 went out before v2 was published).
	const outOfOrder = publishedVersions([
		form("check", "Check", [
			[1, "published", "2026-09-01T00:00:00Z"],
			[2, "published", "2026-10-02T00:00:00Z"],
			[3, "published", "2026-10-01T00:00:00Z"]
		])
	]);
	assert.equal(chooseFormVersion(outOfOrder, "check-v1"), "check-v3");
});

test("a published version says which newer version of its own form is published", () => {
	const published = publishedVersions([
		form("behaviour", "Behaviour", [
			[1, "published", "2026-09-01T00:00:00Z"],
			[2, "published", "2026-09-20T00:00:00Z"],
			[3, "published", "2026-09-25T00:00:00Z"]
		]),
		form("inventory", "Inventory", [[1, "published", "2026-10-01T00:00:00Z"]])
	]);
	assert.equal(newerPublished(published, "behaviour-v1").code, "behaviour-v3");
	assert.equal(newerPublished(published, "behaviour-v2").code, "behaviour-v3");
	assert.equal(newerPublished(published, "behaviour-v3"), null);
	// A form with one published version has no newer one, and a version that is not offered says nothing.
	assert.equal(newerPublished(published, "inventory-v1"), null);
	assert.equal(newerPublished(published, "behaviour-v9"), null);
	assert.equal(newerPublished([], "behaviour-v1"), null);
	assert.equal(published.find(version => version.code === "behaviour-v2").formCode, "behaviour");
});

test("a first upload starts Inventory on the most recently published zone-only form, or off", () => {
	const published = publishedVersions([
		form("behaviour", "Behaviour", [[2, "published", "2026-09-20T00:00:00Z"]]),
		form("inventory", "Inventory", [
			[1, "published", "2026-09-01T00:00:00Z"],
			[2, "published", "2026-10-01T00:00:00Z"]
		])
	]);
	assert.equal(chooseInventoryForm(published, new Set(["inventory-v1", "inventory-v2"])), "inventory-v2");
	assert.equal(chooseInventoryForm(published, new Set()), null);
});

test("an inventory form asks about the zone and nothing about a play event", () => {
	const question = (id, act) => ({ id, code: id, label: id, act, kind: "text" });
	assert.equal(isInventoryDefinition({ questions: [question("a", "Climate"), question("b", "Record")] }), true);
	assert.equal(isInventoryDefinition({ questions: [question("a", "Play"), question("b", "Record")] }), false);
	assert.equal(isInventoryDefinition({ questions: [question("a", "Climate"), question("b", "Play")] }), false);
	assert.equal(isInventoryDefinition({ questions: [question("a", "Record")] }), false);
});
