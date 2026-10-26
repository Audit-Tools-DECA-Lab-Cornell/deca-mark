import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * WEB-46 (audit C07): the Contour text fields take no text, and form submit buttons do nothing, until the
 * page has hydrated. React 19.3 overwrites a controlled <textarea> at hydration, and an <input> keeps typed
 * text on screen but not in state, so text typed before then is lost or merged with the old text.
 *
 * The behaviour itself is covered in a real browser by `e2e/hydration.spec.ts`, which holds the scripts and
 * types. These checks guard the wiring the browser test cannot see from one screen: every primitive that
 * draws a text field reads the same gate, the gate renders `false` on the server, and `defaultValue` (which
 * the audit showed is still overwritten) does not come back as the fix.
 */

const contour = new URL("../../src/components/contour/", import.meta.url);
const read = name => readFileSync(new URL(name, contour), "utf8");

test("useHydrated is false while the server renders and while the page hydrates, then true", () => {
	const source = read("useHydrated.ts");
	assert.match(source, /^"use client";/m);
	assert.match(source, /useSyncExternalStore\(\s*subscribe,\s*\(\) => true,\s*\(\) => false\s*\)/);
});

for (const [file, field] of [
	["TextInput.tsx", "input"],
	["Textarea.tsx", "textarea"],
	["CodeInput.tsx", "input"]
]) {
	test(`${file} holds its <${field}> read-only until hydrated`, () => {
		const source = read(file);
		assert.match(source, /useHydrated\(\)/);
		assert.match(source, /readOnly=\{readOnly \|\| !hydrated\}/);
	});
}

test("TextInput keeps the read-only look tied to the caller's prop, not to hydration", () => {
	assert.match(read("TextInput.tsx"), /controlFrame\(\{ invalid: field\.invalid, readOnly \}\)/);
	assert.match(read("Textarea.tsx"), /controlFrame\(\{ invalid: field\.invalid, readOnly \}\)/);
});

test("PasswordInput is a TextInput, so it takes the same gate", () => {
	const source = read("PasswordInput.tsx");
	assert.match(source, /<TextInput/);
	assert.doesNotMatch(source, /<input/);
});

test("a submit Button is disabled until hydrated, without showing the caller's disabled reason for it", () => {
	const source = read("Button.tsx");
	assert.match(source, /type === "submit" && !hydrated/);
	assert.match(source, /disabled=\{disabled \|\| awaitingHydration\}/);
	assert.match(source, /showReason = Boolean\(disabled && disabledReason\)/);
});

test("the plain class module stays free of client code, so server pages can still import buttonClasses", () => {
	const source = read("buttonClasses.ts");
	assert.doesNotMatch(source, /"use client"/);
	assert.match(source, /export function buttonClasses/);
	assert.doesNotMatch(read("index.ts"), /buttonClasses[^;]*from "\.\/Button"/);
});
