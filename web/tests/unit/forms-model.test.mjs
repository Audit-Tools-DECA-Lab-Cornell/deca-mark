import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { forms, pkg, site as fixtureSite } from "./fixtures.mjs";
import { load } from "./support.mjs";

const read = name =>
	JSON.parse(readFileSync(new URL(`../../../contracts/forms/${name}.json`, import.meta.url), "utf8"));
const behaviour = read("janet-test-v1");
const inventory = read("janet-inventory-v1");

const model = await load("features/forms/model.ts");

const NOW = "2026-10-08T12:00:00Z";
const version = (code, n, state, extra = {}) => ({
	version_id: `id-${code}`,
	code,
	version: n,
	state,
	title: "A form",
	question_count: 3,
	created_at: NOW,
	published_at: state === "draft" ? null : NOW,
	...extra
});
const form = (code, versions) => ({ form_id: `f-${code}`, code, name: `Form ${code}`, created_at: NOW, versions });
const site = (code, name, formVersion, inventoryVersion = null) =>
	fixtureSite({ code, name, package: formVersion ? pkg({ forms: forms(formVersion, inventoryVersion) }) : null });

test("a form row names its newest published version, its drafts and the sites that use it", () => {
	const rows = model.formRows(
		[
			form("check", [
				version("check-v1", 1, "published"),
				version("check-v3", 3, "draft"),
				version("check-v2", 2, "published")
			])
		],
		[site("a", "Site A", "check-v2"), site("b", "Site B", "check-v1"), site("c", "Site C", null)]
	);
	assert.equal(rows.length, 1);
	const [row] = rows;
	assert.deepEqual(
		row.versions.map(v => v.code),
		["check-v3", "check-v2", "check-v1"]
	);
	assert.equal(row.published.code, "check-v2");
	assert.deepEqual(
		row.drafts.map(v => v.code),
		["check-v3"]
	);
	assert.equal(row.newest.code, "check-v3");
	assert.deepEqual(
		row.uses.map(use => [use.name, use.version]),
		[
			["Site A", 2],
			["Site B", 1]
		]
	);
	assert.deepEqual(row.versions[1].sites, [{ code: "a", name: "Site A" }]);
});

test("with v1 bound by Site A's map and v2 published, the row names Site A with v1 and not v2", () => {
	const [row] = model.formRows(
		[form("check", [version("check-v2", 2, "published"), version("check-v1", 1, "published")])],
		[site("a", "Site A", "check-v1"), site("b", "Site B", null)]
	);
	assert.equal(row.published.code, "check-v2");
	assert.deepEqual(row.uses, [{ code: "a", name: "Site A", version: 1, versionCode: "check-v1" }]);
});

test("a site that binds two versions of one form is listed once for each", () => {
	const [row] = model.formRows(
		[form("check", [version("check-v2", 2, "published"), version("check-v1", 1, "published")])],
		[site("a", "Site A", "check-v1", "check-v2")]
	);
	assert.deepEqual(
		row.uses.map(use => [use.code, use.version]),
		[
			["a", 2],
			["a", 1]
		]
	);
});

test("a retired version still names the sites whose map is on it, and a form nobody uses lists none", () => {
	const [retired, unused] = model.formRows(
		[
			form("old", [version("old-v2", 2, "published"), version("old-v1", 1, "retired")]),
			form("idle", [version("idle-v1", 1, "published")])
		],
		[site("a", "Site A", "old-v1")]
	);
	assert.deepEqual(
		retired.uses.map(use => [use.name, use.version]),
		[["Site A", 1]]
	);
	assert.deepEqual(unused.uses, []);
});

test("a form without a published version has none, and a reader's form can hold no versions", () => {
	const [draftOnly, empty] = model.formRows([form("one", [version("one-v1", 1, "draft")]), form("two", [])], []);
	assert.equal(draftOnly.published, null);
	assert.equal(draftOnly.drafts.length, 1);
	assert.equal(empty.newest, null);
	assert.deepEqual(empty.versions, []);
});

test("a version with no counted questions is from before the form editor", () => {
	const [row] = model.formRows([form("shell", [version("shell-v1", 1, "published", { question_count: 0 })])], []);
	assert.equal(row.versions[0].legacy, true);
	assert.equal(row.newest.legacy, true);
});

test("a version is compared with the nearest frozen version before it", () => {
	const [row] = model.formRows(
		[
			form("f", [
				version("f-v4", 4, "draft"),
				version("f-v3", 3, "draft"),
				version("f-v2", 2, "retired"),
				version("f-v1", 1, "published")
			])
		],
		[]
	);
	assert.equal(model.baseVersionOf(row, "f-v4").code, "f-v2");
	assert.equal(model.baseVersionOf(row, "f-v3").code, "f-v2");
	assert.equal(model.baseVersionOf(row, "f-v2").code, "f-v1");
	assert.equal(model.baseVersionOf(row, "f-v1"), null);
	assert.equal(model.baseVersionOf(row, "missing"), null);
});

test("an earlier version from before the form editor is not a base to compare with", () => {
	const [row] = model.formRows(
		[form("f", [version("f-v2", 2, "draft"), version("f-v1", 1, "published", { question_count: 0 })])],
		[]
	);
	assert.equal(model.baseVersionOf(row, "f-v2"), null);
});

test("sitesUsing lists the sites whose current package names exactly that version, as either form", () => {
	const sites = [
		site("a", "A", "x-v1"),
		site("b", "B", "x-v10"),
		site("c", "C", null),
		site("d", "D", "y-v1", "x-v1")
	];
	assert.deepEqual(model.sitesUsing("x-v1", sites), [
		{ code: "a", name: "A" },
		{ code: "d", name: "D" }
	]);
	assert.deepEqual(model.sitesUsing("x-v2", sites), []);
});

test("the inventory form asks only about a zone; the behaviour form is a play form", () => {
	assert.equal(model.isZoneForm(inventory), true);
	assert.equal(model.isZoneForm(behaviour), false);
	assert.equal(model.isZoneForm({ questions: [{ act: "Record" }] }), false);
	assert.equal(model.isZoneForm({ questions: [{ act: "Climate" }, { act: "Record" }] }), true);
	assert.equal(model.isZoneForm({ questions: [{ act: "Climate" }, { act: "Play" }] }), false);
});

test("publishing a play form says it reaches observers only through a map package that names it", () => {
	const play = model.deliveryOf(behaviour, "janet-v3");
	assert.equal(play.kind, "play");
	assert.match(play.text, /only through a map package that names it/);
	assert.match(play.confirm, /janet-v3 cannot be edited/);
	assert.doesNotMatch(play.confirm, /next time they open the site/);
	const zone = model.deliveryOf(inventory, "zones-v2");
	assert.equal(zone.kind, "zone");
	assert.match(zone.text, /form for the Inventory round/);
	assert.match(zone.text, /only through a map package that names it/);
	assert.match(zone.confirm, /only through a new map package/);
});

test("draft changes name the field that changed, and a new question is new", () => {
	const base = { ...behaviour, questions: behaviour.questions.slice(0, 2) };
	const draft = structuredClone(base);
	draft.questions[0].label = "How old is the child?";
	draft.questions[1].required = !draft.questions[1].required;
	draft.questions.push({ ...behaviour.questions[2], id: "added", label: "Added" });
	const changes = model.draftChanges(draft, base);
	assert.deepEqual(
		changes.map(c => [c.questionId, c.field]),
		[
			["age_range", "Question Text"],
			["play_type_1", "Required"],
			["added", "New question"]
		]
	);
	assert.equal(changes[0].was, "How old is the target child?");
	assert.equal(changes[0].now, "How old is the child?");
	assert.deepEqual([...model.changedIds(draft, base)].sort(), ["added", "age_range", "play_type_1"]);
	assert.deepEqual(model.draftChanges(draft, undefined), []);
	assert.deepEqual(
		model.removedQuestions(draft, base).map(q => q.id),
		[]
	);
	assert.deepEqual(
		model
			.removedQuestions(draft, {
				...base,
				questions: [...base.questions, { ...behaviour.questions[5], id: "gone" }]
			})
			.map(q => q.id),
		["gone"]
	);
});

test("emptied observer instructions are visible in the publication review", () => {
	const base = { ...behaviour, questions: [{ ...behaviour.questions[0], hint: "Ask the parent" }] };
	const draft = structuredClone(base);
	delete draft.questions[0].hint;
	const [change] = model.draftChanges(draft, base);
	assert.equal(change.field, "Instructions to Observers");
	assert.equal(change.was, "Ask the parent");
	assert.equal(change.now, "No instructions");
});

test("two definitions are the same when only the order of their keys differs", () => {
	assert.equal(model.sameDefinition({ a: 1, b: { c: [1, 2], d: 3 } }, { b: { d: 3, c: [1, 2] }, a: 1 }), true);
	assert.equal(model.sameDefinition({ a: [1, 2] }, { a: [2, 1] }), false);
	assert.equal(model.sameDefinition({ a: 1 }, { a: 1, b: 1 }), false);
});

test("questions waiting on a note or an option list are flagged", () => {
	const flagged = model.flaggedQuestions({
		questions: [
			{ id: "a", label: "A" },
			{ id: "b", label: "B", protocolFlag: "Decide with Janet" },
			{ id: "c", label: "C", optionsPending: "List not supplied" }
		]
	});
	assert.deepEqual(flagged, [
		{ id: "b", label: "B", note: "Decide with Janet" },
		{ id: "c", label: "C", note: "List not supplied" }
	]);
});

test("questions are numbered 01, 02 … as the editor shows them", () => {
	assert.equal(model.questionNumber(0), "01");
	assert.equal(model.questionNumber(11), "12");
});
