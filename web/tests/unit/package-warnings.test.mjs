import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { historyRows, readyToExplain, warningDetails } = await load("features/packages/history.ts");
const { markedOnlineMaps, onlineMapLine, onlineMapName, ONLINE_MAP_CANCELLED } = await load(
	"features/packages/online-maps.ts"
);

const clock = { dayTime: () => "Nov 07, 2026 · 10:00" };
const summary = (id, version, state = "ready") => ({
	package_id: id,
	package_version: version,
	state,
	archive_bytes: 2048,
	prepared_at: "2026-11-07T10:00:00Z",
	source: "upload",
	change_note: "",
	forms: { play: { form_version: "v1" }, inventory: null }
});
const history = packages => ({ current_package_id: "p3", packages });

test("warning checks are the ones that say warning, in order", () => {
	const checks = [
		{ step: "source-project", state: "passed", detail: "ok" },
		{
			step: "imagery-licence",
			state: "warning",
			detail: "Satellite (mt1.google.com) is an online background map."
		},
		{ step: "archive", state: "warning", detail: "Second." },
		{ step: "layer-sources", state: "blocked", detail: "no" }
	];
	assert.deepEqual(warningDetails(checks), ["Satellite (mt1.google.com) is an online background map.", "Second."]);
	assert.deepEqual(warningDetails([]), []);
});

test("the newest ready versions are read for warnings, at most the limit, never a blocked one", () => {
	const list = [summary("p1", 1), summary("p2", 2, "blocked"), summary("p3", 3), summary("p4", 4), summary("p5", 5)];
	assert.deepEqual(readyToExplain(list, 3), ["p5", "p4", "p3"]);
	assert.deepEqual(readyToExplain(list), ["p5", "p4", "p3", "p1"]);
});

test("a version's warnings reach its row, and a failed read is kept apart from no warnings", () => {
	const list = history([summary("p1", 1), summary("p2", 2), summary("p3", 3), summary("p4", 4)]);
	const rows = historyRows(list, clock, {}, { p3: ["Satellite left out."], p2: null, p1: [] });
	const byId = Object.fromEntries(rows.map(row => [row.packageId, row]));
	assert.deepEqual(byId.p3.warnings, ["Satellite left out."]);
	assert.equal(byId.p3.warningsUnreadable, false);
	assert.deepEqual(byId.p2.warnings, []);
	assert.equal(byId.p2.warningsUnreadable, true);
	assert.equal(byId.p1.warningsUnreadable, false);
	// A version nobody read (past the limit, or another page) has neither.
	assert.deepEqual(byId.p4.warnings, []);
	assert.equal(byId.p4.warningsUnreadable, false);
});

test("the background map wording is plain and names the host only when there is one", () => {
	const withHost = { name: "Satellite", host: "mt1.google.com" };
	const noHost = { name: "Streets", host: null };
	assert.equal(onlineMapName(withHost), "Satellite (mt1.google.com)");
	assert.equal(onlineMapName(noHost), "Streets");
	assert.equal(
		onlineMapLine(withHost),
		"Satellite (mt1.google.com) is an online background map. It will not be uploaded."
	);
	assert.equal(onlineMapLine(noHost), "Streets is an online background map. It will not be uploaded.");
	assert.match(ONLINE_MAP_CANCELLED, /^Not uploaded\. Remove the background map from the project in QGIS/);
	for (const text of [onlineMapLine(withHost), ONLINE_MAP_CANCELLED]) assert.doesNotMatch(text, /\bring|API|server/i);
});

test("only issues marked online_basemap become maps to leave out", () => {
	const issues = [
		{ layer: "Satellite", message: "x", kind: "online_basemap", host: "mt1.google.com" },
		{ layer: "Streets", message: "x", kind: "online_basemap", host: null },
		{ layer: "Odd", message: "x", kind: null },
		{ layer: "Plain", message: "x" }
	];
	assert.deepEqual(markedOnlineMaps({ issues }), [
		{ name: "Satellite", host: "mt1.google.com" },
		{ name: "Streets", host: null }
	]);
});
