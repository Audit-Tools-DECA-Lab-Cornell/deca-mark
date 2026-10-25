import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { observation } from "./fixtures.mjs";
import { load } from "./support.mjs";

/*
 * WEB-51 (audit C18). Data rendered every loaded record twice: a table from md up and a CSS-hidden card
 * list below it, 15.2k DOM nodes and 2.2 MB of HTML at 500 rows, 4.5k of them cards. One structure now:
 * a table whose rows restyle as cards below md, with the real link, the roving tab stop and data-record-id.
 */

globalThis.__dataTableReact = React;
const mocks = new Map([
	["next/navigation", "export const useRouter=()=>({push(){},refresh(){}});"],
	[
		"next/link",
		'export default function Link({prefetch, ...p}){return globalThis.__dataTableReact.createElement("a",p)}'
	]
]);
registerHooks({
	resolve(specifier, context, next) {
		if (mocks.has(specifier)) return { url: `data-table-test:${specifier}`, shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url.startsWith("data-table-test:"))
			return { format: "module", source: mocks.get(url.slice("data-table-test:".length)), shortCircuit: true };
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
		return next(url, context);
	}
});

const { DataTable } = await load("features/data/DataTable.tsx");
const { prepareRecords } = await load("features/data/view.ts");
const { clock } = await load("lib/time.ts");

const ROWS = 500;
const rows = Array.from({ length: ROWS }, (_, index) =>
	observation({
		observation_id: `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
		observer: "OB",
		answers: {}
	})
);
const records = prepareRecords(rows, {}, clock("America/New_York"));
const count = (html, needle) => html.split(needle).length - 1;

const html = renderToStaticMarkup(
	React.createElement(DataTable, {
		records,
		hrefOf: record => `/o/deca/p/play/data/${record.id}`,
		selectedId: records[1].id,
		onSelect() {}
	})
);

test("every loaded record is rendered once, never as a table row and again as a card", () => {
	assert.equal(count(html, "data-record-id="), ROWS);
	assert.equal(count(html, "<tr"), ROWS + 1, "one row per record and the header row");
	assert.equal(count(html, "<ul"), 0, "no second, card-shaped list");
	assert.equal(count(html, "<li"), 0);
});

test("the one structure keeps the real link, the roving tab stop and the selection", () => {
	// Each record has one link to its address, labelled OBS-xxxxxx.
	assert.equal(count(html, 'href="/o/deca/p/play/data/'), ROWS);
	assert.match(html, /<a [^>]*href="\/o\/deca\/p\/play\/data\/00000000-[^"]*"[^>]*>OBS-000000<\/a>/);
	// One tab stop: the selected row, every other row is reached with the arrow keys.
	assert.equal(count(html, 'tabindex="0"'), 1);
	const selected = html.match(/<tr [^>]*data-record-id="00000001-[^>]*>/)?.[0] ?? "";
	assert.match(selected, /tabindex="0"/);
	assert.match(selected, /aria-selected="true"/);
});

test("below md the table stays a table for assistive technology while its rows look like cards", () => {
	assert.match(html, /<table[^>]*role="table"/);
	assert.match(html, /<tr[^>]*role="row"/);
	assert.match(html, /<td[^>]*role="cell"/);
	assert.match(html, /<th[^>]*role="columnheader"/);
	// The column labels stay for them; only sighted phone readers lose the header row.
	// The card styling is written once, on the table, not repeated on each of 4,000 cells.
	const table = html.match(/<table [^>]*>/)?.[0] ?? "";
	assert.ok(
		table.includes("max-md:[&amp;_thead]:sr-only"),
		"the header row is hidden for sighted phone readers only"
	);
	assert.ok(table.includes("max-md:[&amp;_tbody&gt;tr]:flex-wrap"), "rows become wrapping cards");
	assert.equal(count(html, "max-md:"), count(table, "max-md:"), "no cell carries card classes of its own");
});
