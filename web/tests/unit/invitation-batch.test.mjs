import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";
const { parseRecipients, createInvitationBatch, retryableRecipients } = await load(
	"features/people/invitation-batch.ts"
);

const invitation = {
	code: "ABCDEFGH",
	token: "secret",
	role: "observer",
	email: null,
	max_uses: 1,
	expires_at: "2026-11-07"
};

test("normalizes and deduplicates comma-separated recipients before counting the limit", () => {
	// Given repeated addresses with different casing and surrounding spaces.
	const input = [...Array(25)].map((_, i) => ` person${i}@example.test `).join(",");
	// When the manager submits them.
	const result = parseRecipients(`${input},PERSON0@example.test`);
	// Then only unique normalized recipients count.
	assert.equal(result.ok, true);
	assert.equal(result.addresses.length, 25);
	assert.equal(result.addresses[0], "person0@example.test");
	assert.equal(parseRecipients(`${input},extra@example.test`).ok, false);
});

test("rejects empty or invalid recipient lists without producing partial requests", () => {
	for (const input of ["", "good@example.test,broken", "good@example.test,,other@example.test", "missing@", "a@b"])
		assert.equal(parseRecipients(input).ok, false, input);
});

test("creates at most three invitations concurrently and keeps per-recipient confirmed outcomes", async () => {
	// Given five recipients and a controllable create boundary.
	let active = 0;
	let peak = 0;
	const addresses = Array.from({ length: 5 }, (_, i) => `person${i}@example.test`);
	// When the batch is created.
	const results = await createInvitationBatch(addresses, async email => {
		active++;
		peak = Math.max(peak, active);
		await new Promise(resolve => setImmediate(resolve));
		active--;
		return { status: "done", invitation: { ...invitation, email } };
	});
	// Then concurrency is bounded and every result keeps its recipient.
	assert.equal(peak, 3);
	assert.deepEqual(
		results.map(result => result.email),
		addresses
	);
	assert.ok(results.every(result => result.status === "created"));
});

test("retries only definite failures, never confirmed successes or unknown writes", async () => {
	// Given one success, an explicit refusal, an unknown failure and a lost response.
	const addresses = ["ok@example.test", "refused@example.test", "unknown@example.test", "lost@example.test"];
	const results = await createInvitationBatch(addresses, async email => {
		if (email.startsWith("ok")) return { status: "done", invitation: { ...invitation, email } };
		if (email.startsWith("refused")) return { status: "failed", definite: true, message: "No access." };
		if (email.startsWith("lost")) throw new TypeError("connection lost");
		return { status: "failed", definite: false, message: "Not confirmed." };
	});
	// When retry candidates are selected, only the explicit refusal is safe.
	assert.deepEqual(
		results.map(result => result.status),
		["created", "failed", "unconfirmed", "unconfirmed"]
	);
	assert.deepEqual(retryableRecipients(results), ["refused@example.test"]);
});
