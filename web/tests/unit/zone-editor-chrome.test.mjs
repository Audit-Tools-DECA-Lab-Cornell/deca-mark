import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { load } from "./support.mjs";

const { editorProblems } = await load("features/zones/editor/problems.ts");
const { shapeFacts } = await load("features/zones/editor/state.ts");

const root = new URL("../../../", import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const cases = readJson("contracts/zones/geometry.cases.json");
const contour = readJson("contracts/contour.json");
const palettes = readJson("contracts/map-palettes.json");

const zone = (n, alias, label = `Zone ${n}`) => ({
	zone_id: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
	zone_code: `Z${n}`,
	zone_label: label,
	geometry: structuredClone(cases.geometries[alias])
});

test("problems say what, where and what to do, blocking ones first, numbered from 1", () => {
	const problems = editorProblems(
		[
			zone(1, "bow_tie", "Bow tie"),
			zone(2, "square", "  "),
			zone(3, "outside_hole", "Pond"),
			zone(4, "adjacent", "Slide")
		],
		[[cases.geometries.square.coordinates[0]]]
	);
	assert.deepEqual(
		problems.map(problem => [problem.number, problem.kind, problem.code, problem.text]),
		[
			[1, "blocking", "empty_label", "Zone Z2 needs a name."],
			[
				2,
				"hint",
				"self_intersection",
				"Bow tie’s edge crosses itself near point 3. Move a point so the edge no longer crosses."
			],
			[
				3,
				"hint",
				"hole_outside",
				"Hole 1 of Pond reaches outside its outer edge near point 1. Move the hole’s points inside the outer edge."
			],
			[
				4,
				"hint",
				"outside_site",
				"Part of Pond is outside the site boundary near point 1. Move it inside, or trace the site edge."
			],
			[
				5,
				"hint",
				"outside_site",
				"Part of Slide is outside the site boundary near point 2. Move it inside, or trace the site edge."
			]
		]
	);
	// A zone that cannot be read gets one problem, not hints computed on a broken shape.
	const broken = editorProblems([zone(1, "unclosed", "Loose")], []);
	assert.deepEqual(
		broken.map(problem => [problem.kind, problem.code]),
		[["blocking", "invalid_structure"]]
	);
	assert.equal(editorProblems([zone(1, "holed"), zone(2, "multipart")], []).length, 0);
	assert.equal(
		editorProblems([zone(1, "square", "Square"), { ...zone(2, "adjacent", "Slide"), zone_code: "Z1" }], [])[0].text,
		"Two zones use code Z1. Give one a different code."
	);
});

/** Every source file of the editor and the map, for the no-hex rule. */
function sources(directory) {
	const found = [];
	for (const name of readdirSync(directory)) {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) found.push(...sources(path));
		else if (/\.(ts|tsx)$/.test(name)) found.push(path);
	}
	return found;
}

test("gate 5: the editor and the map draw no colour of their own", () => {
	const src = fileURLToPath(new URL("../../src/", import.meta.url));
	const files = ["features/zones", "lib/zones", "components/map", "app/dev/zone-editor"].flatMap(folder =>
		sources(join(src, folder))
	);
	assert.ok(files.length > 10);
	for (const file of files) {
		const text = readFileSync(file, "utf8");
		assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b(?!["'`]?\s*:)/, file);
		assert.doesNotMatch(text, /\b(rgb|hsl)a?\(/, file);
	}
});

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex) {
	const [r, g, b] = [1, 3, 5].map(index => {
		const c = parseInt(hex.slice(index, index + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

test("gate 5: a handle's ink ring keeps 3:1 on every surface of both palettes", () => {
	// Handles are map chrome: Day chrome on the light palette, Dusk chrome on the dark one (mapChromeTheme).
	for (const [name, palette] of Object.entries(palettes.palettes)) {
		const theme = contour.themes[palette.tiles === "dark" ? "dusk" : "day"];
		const surfaces = [
			palette.background,
			palette.site.fill,
			palette.structure.fill,
			palette.equipment.fill,
			palette.tree.fill,
			palette.path.line,
			...Object.values(palette.surfaces).map(surface => surface.fill)
		];
		for (const surface of surfaces) {
			assert.ok(
				contrast(theme.ink, surface) >= 3,
				`${name}: ink ${theme.ink} on ${surface} is ${contrast(theme.ink, surface).toFixed(2)}`
			);
		}
	}
});

test("shape facts count parts, holes and points without closing repeats", () => {
	assert.equal(shapeFacts(zone(1, "holed")), "1 part · 1 hole · 8 points");
	assert.equal(shapeFacts(zone(1, "multipart")), "2 parts · 0 holes · 8 points");
});
