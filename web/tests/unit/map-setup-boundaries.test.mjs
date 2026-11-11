import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

import { load } from "./support.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const react = new URL("../../node_modules/react/index.js", import.meta.url).href;
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/link") return nextResolve("next/link.js", context);
		if (specifier === "@/components/map/MapFrame")
			return { url: "map-setup-boundaries:MapFrame", shortCircuit: true };
		if (specifier === "@/features/zones/editor/ZoneEditor")
			return { url: "map-setup-boundaries:ZoneEditor", shortCircuit: true };
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".json"))
			return {
				format: "module",
				source: `export default ${readFileSync(fileURLToPath(url), "utf8")}`,
				shortCircuit: true
			};
		if (url.startsWith("map-setup-boundaries:")) {
			const name = url.split(":")[1];
			return {
				format: "module",
				source: `import React from "${react}"; export function ${name}(props) { return React.createElement("${name}Probe", props); }`,
				shortCircuit: true
			};
		}
		if (url.endsWith(".tsx"))
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						jsx: ts.JsxEmit.ReactJSX,
						target: ts.ScriptTarget.ESNext
					}
				}).outputText
			};
		return nextLoad(url, context);
	}
});

const { OutlineStep } = await load("features/map-setup/OutlineStep.tsx");
const { ZonesStep } = await load("features/map-setup/ZonesStep.tsx");
const { fromPlan, toPlan } = await load("lib/plan.ts");
const polygon = (west, south, east, north) => ({
	type: "Polygon",
	coordinates: [
		[
			[west, south],
			[east, south],
			[east, north],
			[west, north],
			[west, south]
		]
	]
});
const point = [-76, 42];
const layers = [
	{
		source_id: "trees",
		name: "Trees",
		features: [
			{
				feature_key: "tree",
				feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } }
			}
		]
	}
];
const empty = {
	import_generation: 1,
	assignments: [],
	outline: null,
	zones: [],
	form_version: null,
	inventory_form_version: null,
	change_note: "",
	confirmed_omissions: []
};

test("boundaries and click coordinates keep the accepted frame when the outline extent changes", async () => {
	// Given a point-only map and its accepted drawing frame.
	const props = { layers, onChange() {}, onPending() {}, onChooseImported() {}, footer: null };
	let editor;
	await act(async () => {
		editor = create(React.createElement(OutlineStep, { ...props, content: empty }));
	});
	const initial = editor.root.findByType("MapFrameProbe").props.site;
	const geometry = polygon(-76.0001, 41.9999, -75.9999, 42.0001);
	const content = {
		...empty,
		outline: polygon(-76.001, 41.999, -75.998, 42.002),
		zones: [
			{
				zone_id: "zone-a",
				zone_code: "A",
				zone_label: "Lawn",
				geometry
			}
		]
	};
	try {
		// When the outline and a zone extend beyond the original feature extent.
		await act(async () => {
			editor.update(React.createElement(OutlineStep, { ...props, content }));
		});
		// Then rendered shapes, scale and inverse click coordinates use that same frame.
		const plan = editor.root.findByType("MapFrameProbe").props.site;
		assert.deepEqual(plan.frame, initial.frame);
		assert.deepEqual(plan.features.find(feature => feature.kind === "tree").center, toPlan(point, initial.frame));
		assert.deepEqual(plan.zones[0].parts[0][0][0], toPlan(geometry.coordinates[0][0], initial.frame));
		assert.equal(plan.metresPerUnit, initial.frame.metresPerUnit);
		const clicked = fromPlan(plan.features.find(feature => feature.kind === "tree").center, plan.frame);
		assert.ok(clicked.every((value, index) => Math.abs(value - point[index]) < 1e-10));
	} finally {
		await act(async () => editor.unmount());
	}
});

test("deleting adopted zones leaves their source features out and preserves surviving assignments", async () => {
	// Given two adopted zones and a manually drawn zone.
	const geometry = polygon(-76.0001, 41.9999, -75.9999, 42.0001);
	const zones = ["removed", "retained", "manual"].map(zone_id => ({
		zone_id,
		zone_code: zone_id,
		zone_label: zone_id,
		geometry
	}));
	const assignments = [
		{ source_id: "source", feature_key: "one", role: "zones", zone_id: "removed" },
		{ source_id: "source", feature_key: "two", role: "zones", zone_id: "retained" },
		{ source_id: "trees", feature_key: "tree", role: "trees", zone_id: null }
	];
	const content = { ...empty, assignments, outline: geometry, zones };
	const writes = [];
	let editor;
	await act(async () => {
		editor = create(
			React.createElement(ZonesStep, {
				layers,
				baseZoneIds: [],
				content,
				onChange: value => writes.push(value),
				onPending() {},
				footer: null
			})
		);
	});
	try {
		// When the zone editor deletes an adopted zone and a manually drawn zone.
		await act(async () => {
			editor.root.findByType("ZoneEditorProbe").props.onZonesChange([zones[1]]);
		});
		// Then every source retains a disposition without referencing a deleted zone.
		assert.deepEqual(writes.at(-1), {
			...content,
			zones: [zones[1]],
			assignments: [{ ...assignments[0], role: "leave_out", zone_id: null }, assignments[1], assignments[2]]
		});
	} finally {
		await act(async () => editor.unmount());
	}
});
