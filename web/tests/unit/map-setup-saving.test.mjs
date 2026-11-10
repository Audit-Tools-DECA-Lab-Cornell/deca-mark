import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support.mjs";
const { drainSaves } = await load("features/map-setup/saving.ts");

test("leaving waits for changes made while an earlier save is running", async () => {
	// Given one in-flight acknowledgement and a later local edit.
	let saved = 0,
		local = 1;
	let release;
	const first = new Promise(resolve => {
		release = resolve;
	});
	const versions = [];
	const save = async () => {
		const snapshot = local;
		versions.push(snapshot);
		if (snapshot === 1) await first;
		saved = snapshot;
		return true;
	};
	// When leaving begins before the later edit is acknowledged.
	const result = drainSaves(save, () => saved === local);
	local = 2;
	release();
	// Then both snapshots are acknowledged before navigation is allowed.
	assert.equal(await result, true);
	assert.deepEqual(versions, [1, 2]);
	assert.equal(saved, 2);
});

test("refused save keeps navigation blocked", async () => {
	assert.equal(
		await drainSaves(
			async () => false,
			() => false
		),
		false
	);
});
