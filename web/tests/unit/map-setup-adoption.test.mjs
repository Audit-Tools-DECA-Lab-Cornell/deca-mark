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
const boundaryEditorMock = `
	import React from "${react}";
	const { useEffect, useState } = React;
	export function BoundaryEditor(props) {
		const [zones, setZones] = useState(props.content.zones);
		useEffect(() => {
			props.onChange({ ...props.content, zones });
		}, [zones, props.content, props.onChange]);
		return React.createElement("BoundaryEditorProbe", {
			zones,
			emitStaleGeometry: geometry =>
				setZones(current => current.map(zone => ({ ...zone, geometry })))
		});
	}
`;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "./BoundaryEditor") return { url: "map-setup-adoption:BoundaryEditor", shortCircuit: true };
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === "map-setup-adoption:BoundaryEditor")
			return { format: "module", source: boundaryEditorMock, shortCircuit: true };
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

const { AcceptedBoundaryEditor } = await load("features/map-setup/AcceptedBoundaryEditor.tsx");

const polygon = value => ({
	type: "Polygon",
	coordinates: [
		[
			[value, value],
			[value + 1, value],
			[value, value + 1],
			[value, value]
		]
	]
});

const content = geometry => ({
	import_generation: 1,
	assignments: [],
	outline: polygon(0),
	zones: [{ zone_id: "same-zone", zone_code: "A", zone_label: "Lawn", geometry }],
	form_version: "play-v1",
	inventory_form_version: null,
	change_note: "",
	confirmed_omissions: []
});

test("accepting saved geometry remounts the whole boundary editor before it can emit stale zones", async () => {
	const staleGeometry = polygon(20);
	const savedGeometry = polygon(40);
	const writes = [];
	const onChange = value => writes.push(value);
	const onPending = () => {};
	let editor;

	await act(async () => {
		editor = create(
			React.createElement(AcceptedBoundaryEditor, {
				acceptedContentEpoch: 1,
				layers: [],
				baseZoneIds: [],
				content: content(polygon(10)),
				onChange,
				onPending
			})
		);
	});
	await act(async () => {
		editor.root.findByType("BoundaryEditorProbe").props.emitStaleGeometry(staleGeometry);
	});
	writes.length = 0;

	await act(async () => {
		editor.update(
			React.createElement(AcceptedBoundaryEditor, {
				acceptedContentEpoch: 2,
				layers: [],
				baseZoneIds: [],
				content: content(savedGeometry),
				onChange,
				onPending
			})
		);
	});

	assert.ok(writes.length > 0);
	assert.ok(writes.every(value => value.zones[0].geometry === savedGeometry));
	assert.equal(editor.root.findByType("BoundaryEditorProbe").props.zones[0].geometry, savedGeometry);
	await act(async () => editor.unmount());
});
