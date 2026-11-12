import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { finishedSteps, readStep, resolveStep, stepBlockers } = await load("features/map-setup/steps.ts");
const { featureName, layerCount, sharedRole, undecidedIn } = await load("features/map-setup/feature-names.ts");

const feature = (type, properties = {}) => ({ type: "Feature", properties, geometry: { type, coordinates: [] } });
const layers = [
	{
		source_id: "ground",
		features: [
			{ feature_key: "a", feature: feature("Polygon", { name: "  Sand area " }) },
			{ feature_key: "b", feature: feature("Polygon") }
		]
	}
];
const outline = { type: "Polygon", coordinates: [] };
const zone = { zone_id: "z", zone_code: "Z1", zone_label: "Lawn", geometry: outline };
const decided = [
	{ source_id: "ground", feature_key: "a", role: "ground" },
	{ source_id: "ground", feature_key: "b", role: "ground" }
];

test("a step address reads the four steps and keeps the earlier boundaries link working", () => {
	assert.equal(readStep(undefined), "add-map");
	assert.equal(readStep("add-map"), "add-map");
	assert.equal(readStep("outline"), "outline");
	assert.equal(readStep("zones"), "zones");
	assert.equal(readStep("review"), "review");
	assert.equal(readStep("boundaries"), "zones");
	assert.equal(readStep("publish"), null);
});

test("each later step names the first thing still missing", () => {
	assert.equal(stepBlockers(null).outline, "Choose your QGIS project first.");
	const undecided = stepBlockers({
		layers,
		content: { assignments: [decided[0]], outline: null, zones: [] },
		drawable: true
	});
	assert.equal(undecided["add-map"], null);
	assert.equal(undecided.outline, "Decide how to use 1 more feature first.");
	assert.equal(undecided.review, undecided.outline);
	const blank = stepBlockers({ layers: [], content: { assignments: [], outline: null, zones: [] }, drawable: false });
	assert.match(blank.outline, /no map features/);
	const noOutline = stepBlockers({
		layers,
		content: { assignments: decided, outline: null, zones: [] },
		drawable: true
	});
	assert.equal(noOutline.outline, null);
	assert.equal(noOutline.zones, "Add the site outline first.");
	const noZones = stepBlockers({ layers, content: { assignments: decided, outline, zones: [] }, drawable: true });
	assert.equal(noZones.zones, null);
	assert.equal(noZones.review, "Add at least one observation zone first.");
});

test("a link to a later step opens the latest step the draft allows", () => {
	const noOutline = { layers, content: { assignments: decided, outline: null, zones: [] }, drawable: true };
	assert.equal(resolveStep("review", stepBlockers(noOutline)), "outline");
	assert.equal(resolveStep("zones", stepBlockers(noOutline)), "outline");
	assert.deepEqual(finishedSteps(noOutline), ["add-map"]);
	const ready = { layers, content: { assignments: decided, outline, zones: [zone] }, drawable: true };
	assert.equal(resolveStep("review", stepBlockers(ready)), "review");
	assert.deepEqual(finishedSteps(ready), ["add-map", "outline", "zones"]);
	assert.equal(resolveStep("review", stepBlockers(null)), "add-map");
});

test("features take their QGIS name, or their shape and number, and are never classified silently", () => {
	assert.equal(featureName(layers[0].features[0].feature, 0), "Sand area");
	assert.equal(featureName(layers[0].features[1].feature, 1), "Area 2");
	assert.equal(featureName(feature("Point"), 3), "Point 4");
	assert.equal(featureName(feature("MultiLineString"), 0), "Line 1");
	assert.equal(featureName({ type: "Feature", properties: null, geometry: null }, 0), "Feature 1");
	assert.equal(featureName(feature("Polygon", { name: "x".repeat(80) }), 0).length, 60);
	assert.equal(layerCount(layers[0]), "2 areas");
	assert.equal(layerCount({ features: [{ feature: feature("Point") }] }), "1 point");
	assert.equal(
		layerCount({ features: [{ feature: feature("Point") }, { feature: feature("Polygon") }] }),
		"2 features"
	);
	assert.equal(undecidedIn(layers[0], []), 2);
	assert.equal(sharedRole(layers[0], []), null);
	assert.equal(sharedRole(layers[0], [decided[0]]), null);
	assert.equal(sharedRole(layers[0], decided), "ground");
	assert.equal(sharedRole(layers[0], [decided[0], { ...decided[1], role: "leave_out" }]), null);
});
