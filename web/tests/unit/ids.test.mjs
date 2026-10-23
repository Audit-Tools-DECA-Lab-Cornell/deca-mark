import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { newId } = await load("lib/ids.ts");

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("a new identity is a version 4 UUID", () => {
	assert.match(newId(), UUID_V4);
});

test("without crypto.randomUUID (plain HTTP on a LAN address), identities are still version 4 UUIDs", () => {
	Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
	try {
		assert.equal(typeof crypto.randomUUID, "undefined");
		const ids = new Set(Array.from({ length: 2000 }, () => newId()));
		assert.equal(ids.size, 1999, "no repeats");
		for (const id of ids) assert.match(id, UUID_V4);
	} finally {
		delete crypto.randomUUID;
	}
	assert.equal(typeof crypto.randomUUID, "function");
});
