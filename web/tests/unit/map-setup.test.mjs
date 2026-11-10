import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support.mjs";
const { allowedRoles, classifySetupLoadFailure, closeOutline, setupReady, sourceDisposition } =
	await load("features/map-setup/model.ts");
const { availableZoneIdentityChoices } = await load("features/map-setup/assignment.ts");
const { setupFormChoices, unavailableInventoryFormCode } = await load("features/map-setup/form-choices.ts");
const { createInitialImportAttempt, submitInitialImport } = await load("features/map-setup/initial-import.ts");
const { reduceSetupEditorState } = await load("features/map-setup/setup-editor-state.ts");
const { createOutlineEditHistory, editOutline } = await load("features/map-setup/outline-editing.ts");
const { ApiError } = await load("lib/api/errors.ts");

test("a committed first import with a dropped reply automatically replays its exact request", async () => {
	const accepted = { setup_id: "setup-1" };
	const stored = [];
	let dropReply = true;
	const attempt = createInitialImportAttempt(
		{ files: [{ file_name: "site.qgz", content: "cWdz" }] },
		null,
		"project",
		"request-1"
	);
	const result = await submitInitialImport(attempt, {
		create: async body => {
			if (!stored.some(entry => entry.request_id === body.request_id)) stored.push(body);
			if (dropReply) {
				dropReply = false;
				throw new DOMException("Reply dropped", "NetworkError");
			}
			return accepted;
		}
	});

	assert.equal(result.status, "accepted");
	assert.equal(result.setup, accepted);
	assert.equal(stored.length, 1);
	assert.equal(stored[0].request_id, "request-1");
	assert.equal(dropReply, false);
});

test("two uncertain exact sends retain the immutable attempt for a deliberate UI retry", async () => {
	const accepted = { setup_id: "setup-2" };
	const sent = [];
	const attempt = createInitialImportAttempt(
		{ files: [{ file_name: "site.qgs", content: "cWdz" }] },
		null,
		"project",
		"request-2"
	);
	const transport = {
		create: async body => {
			sent.push(body);
			if (sent.length <= 2) throw new DOMException("Reply dropped", "NetworkError");
			return accepted;
		}
	};

	const uncertain = await submitInitialImport(attempt, transport);
	assert.equal(uncertain.status, "uncertain");
	assert.equal(sent.length, 2);
	assert.equal(sent[0], sent[1]);
	const retried = await submitInitialImport(attempt, transport);
	assert.equal(retried.status, "accepted");
	assert.equal(sent.length, 3);
	assert.equal(sent[0], sent[2]);
	assert.equal(sent[2].request_id, "request-2");
});

test("a competing active setup remains a named refusal after the exact recovery replay", async () => {
	const attempt = createInitialImportAttempt(
		{ files: [{ file_name: "site.qgs", content: "cWdz" }] },
		null,
		"project",
		"request-3"
	);
	let sends = 0;
	const result = await submitInitialImport(attempt, {
		create: async () => {
			sends += 1;
			if (sends === 1) throw new DOMException("Reply dropped", "NetworkError");
			throw new ApiError("conflict", "rejected", { status: 409 });
		}
	});

	assert.equal(result.status, "refused");
	assert.equal(result.failure.code, "conflict");
	assert.equal(sends, 2);
});

test("only a missing bare setup list means map setup is unavailable", () => {
	const missing = { code: "not_found", status: 404 };

	assert.equal(classifySetupLoadFailure(missing), "capability-unavailable");
	assert.equal(classifySetupLoadFailure(missing, "setup-1"), "setup-missing");
	assert.equal(classifySetupLoadFailure({ code: "storage_unavailable", status: 503 }), "failed");
});

test("map setup form choices separate known inventory forms and keep unread definitions observable", () => {
	const published = [
		{ code: "play-v1", formCode: "play", formName: "Play", version: 1, publishedAt: null },
		{
			code: "inventory-v1",
			formCode: "inventory",
			formName: "Inventory",
			version: 1,
			publishedAt: null
		},
		{ code: "legacy-v1", formCode: "legacy", formName: "Legacy", version: 1, publishedAt: null }
	];
	const question = (id, act) => ({ id, code: id, label: id, act, kind: "text" });
	const choices = setupFormChoices(published, {
		"play-v1": { questions: [question("play", "Play")] },
		"inventory-v1": { questions: [question("climate", "Climate"), question("record", "Record")] }
	});

	assert.deepEqual(
		choices.observation.map(form => form.code),
		["play-v1", "legacy-v1"]
	);
	assert.deepEqual(
		choices.inventory.map(form => form.code),
		["inventory-v1"]
	);
});

test("a selected inventory form absent from eligible choices is explicitly unavailable", () => {
	const inventory = [{ code: "inventory-v1" }];

	assert.equal(unavailableInventoryFormCode(null, inventory), null);
	assert.equal(unavailableInventoryFormCode("inventory-v1", inventory), null);
	assert.equal(unavailableInventoryFormCode("retired-inventory-v1", inventory), "retired-inventory-v1");
});

test("accepted content advances its editor epoch while save acknowledgement does not", () => {
	const oldContent = {
		zones: [{ zone_id: "same-zone", geometry: { type: "Polygon", coordinates: [[[0, 0]]] } }]
	};
	const latestContent = {
		zones: [{ zone_id: "same-zone", geometry: { type: "Polygon", coordinates: [[[9, 9]]] } }]
	};
	const initial = { setup: null, content: null, acceptedContentEpoch: 0 };
	const adopted = reduceSetupEditorState(initial, {
		type: "accept",
		setup: { setup_id: "setup-1", revision: 1, content: oldContent }
	});
	const edited = reduceSetupEditorState(adopted, {
		type: "change",
		content: { ...oldContent, change_note: "local edit" }
	});
	const acknowledged = reduceSetupEditorState(edited, {
		type: "acknowledge",
		setup: { setup_id: "setup-1", revision: 2, content: edited.content }
	});
	const acceptedLatest = reduceSetupEditorState(acknowledged, {
		type: "accept",
		setup: { setup_id: "setup-1", revision: 3, content: latestContent }
	});

	assert.equal(adopted.acceptedContentEpoch, 1);
	assert.equal(acknowledged.acceptedContentEpoch, 1);
	assert.equal(acknowledged.content, edited.content);
	assert.equal(acceptedLatest.acceptedContentEpoch, 2);
	assert.equal(acceptedLatest.content, latestContent);
});

test("zone identity choices omit identities claimed by another imported feature", () => {
	const choices = availableZoneIdentityChoices(
		{
			assignments: [
				{ source_id: "zones", feature_key: "one", role: "zones", zone_id: "zone-1" },
				{ source_id: "ground", feature_key: "site", role: "ground", zone_id: null }
			],
			zones: [{ zone_id: "zone-1" }, { zone_id: "zone-2" }]
		},
		"zones",
		"two"
	);
	assert.deepEqual(
		choices.map(zone => zone.zone_id),
		["zone-2"]
	);
});

test("outline point insertion and removal both participate in undo and redo history", () => {
	const square = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[2, 0],
				[2, 2],
				[0, 2],
				[0, 0]
			]
		]
	};
	let geometry = square;
	let history = createOutlineEditHistory();

	let result = editOutline(geometry, history, {
		type: "insert",
		address: { part: 0, ring: 0, index: 0 },
		position: [1, 0]
	});
	geometry = result.geometry;
	history = result.history;
	assert.equal(geometry.coordinates[0].length, 6);

	result = editOutline(geometry, history, {
		type: "remove",
		address: { part: 0, ring: 0, index: 2 }
	});
	geometry = result.geometry;
	history = result.history;
	assert.equal(history.past.length, 2);

	result = editOutline(geometry, history, { type: "undo" });
	assert.equal(result.geometry.coordinates[0].length, 6);
	result = editOutline(result.geometry, result.history, { type: "undo" });
	assert.deepEqual(result.geometry, square);
	result = editOutline(result.geometry, result.history, { type: "redo" });
	assert.equal(result.geometry.coordinates[0].length, 6);
	result = editOutline(result.geometry, result.history, { type: "redo" });
	assert.equal(result.geometry.coordinates[0].length, 5);
});

test("outline point removal clearly refuses to reduce a ring below three points", () => {
	const triangle = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[2, 0],
				[1, 1],
				[0, 0]
			]
		]
	};
	const result = editOutline(triangle, createOutlineEditHistory(), {
		type: "remove",
		address: { part: 0, ring: 0, index: 1 }
	});
	assert.deepEqual(result.geometry, triangle);
	assert.equal(result.history.past.length, 0);
	assert.equal(result.history.message, "Point not removed. A site outline edge must keep at least three points.");
});

test("outline creation closes the coordinates without inventing a zone identity", () => {
	const positions = [
		[-76, 42],
		[-75.999, 42],
		[-75.999, 42.001]
	];
	const outline = closeOutline(positions);
	assert.deepEqual(outline, { type: "Polygon", coordinates: [[...positions, positions[0]]] });
});
test("outline creation rejects fewer than three distinct finite positions", () => {
	assert.equal(
		closeOutline([
			[1, 2],
			[1, 2],
			[3, 4]
		]),
		null
	);
	assert.equal(
		closeOutline([
			[Infinity, 2],
			[3, 4],
			[5, 6]
		]),
		null
	);
});
test("point sources offer trees or explicit exclusion, never outline", () => {
	assert.deepEqual(allowedRoles("Point"), ["trees", "leave_out"]);
});
test("partial draft is not ready to publish but remains a representable value", () => {
	assert.equal(setupReady({ outline: null, zones: [], form_version: null }), false);
});
test("per-feature disposition keeps remaining polygon features unresolved", () => {
	const layers = [{ source_id: "s", features: [{ feature_key: "a" }, { feature_key: "b" }] }];
	assert.equal(sourceDisposition(layers, [{ source_id: "s", feature_key: "a", role: "outline" }]), 1);
});

test("changing an adopted source disposition removes exactly its linked zone after confirmation", async () => {
	const { assignFeature } = await load("features/map-setup/assignment.ts");
	const content = {
		import_generation: 1,
		assignments: [{ source_id: "s", feature_key: "a", role: "zones", zone_id: "linked" }],
		outline: null,
		zones: [
			{ zone_id: "linked", zone_code: "A", zone_label: "Lawn", geometry: { type: "Polygon", coordinates: [] } }
		],
		form_version: null,
		inventory_form_version: null,
		change_note: "",
		confirmed_omissions: []
	};
	const next = assignFeature(content, { source_id: "s", feature_key: "a", role: "leave_out" }, null, "linked");
	assert.equal(next.zones.length, 0);
	assert.equal(next.assignments[0].role, "leave_out");
});

test("adopting replacement geometry keeps the chosen existing zone identity and code", async () => {
	const { assignFeature } = await load("features/map-setup/assignment.ts");
	const shape = { type: "Polygon", coordinates: [] };
	const content = {
		import_generation: 1,
		assignments: [],
		outline: null,
		zones: [{ zone_id: "kept", zone_code: "A", zone_label: "Existing lawn", geometry: shape }],
		form_version: null,
		inventory_form_version: null,
		change_note: "",
		confirmed_omissions: []
	};
	const next = assignFeature(
		content,
		{ source_id: "s", feature_key: "a", role: "zones", zone_id: "kept" },
		shape,
		"kept",
		"Imported name"
	);
	assert.equal(next.zones.length, 1);
	assert.equal(next.zones[0].zone_code, "A");
	assert.equal(next.assignments[0].zone_id, "kept");
});

test("new zone code fills unused numbers without colliding after a deletion", async () => {
	const { nextZoneCode } = await load("features/map-setup/model.ts");
	assert.equal(nextZoneCode([{ zone_code: "Z1" }, { zone_code: "Z3" }]), "Z2");
});

test("a point-only setup has enough real-world viewing room to draw boundaries", async () => {
	const { setupPlan } = await load("features/map-setup/plan.ts");
	const plan = setupPlan(
		"Point source",
		[
			{
				source_id: "s",
				name: "Trees",
				features: [
					{
						feature_key: "f",
						feature: {
							type: "Feature",
							properties: {},
							geometry: { type: "Point", coordinates: [-76, 42] }
						}
					}
				]
			}
		],
		{
			import_generation: 1,
			assignments: [],
			outline: null,
			zones: [],
			form_version: null,
			inventory_form_version: null,
			change_note: "",
			confirmed_omissions: []
		}
	);
	assert.ok(plan);
	assert.ok(plan.metresPerUnit * plan.height >= 60);
	assert.equal(plan.zones.length, 0);
});
