import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const {
	DELETION_RETRY_DELAYS_MS,
	OTHER_ACCOUNT_SIGNED_IN,
	confirmedBySignedIn,
	deletionFinishingLine,
	nextDeletionRetry
} = await load("features/account/deletion.ts");

test("after a 202 the deletion is sent again three times, about 30 seconds in all", () => {
	const waits = [0, 1, 2].map(tries => nextDeletionRetry(tries, false));
	assert.deepEqual(waits, [5_000, 10_000, 15_000]);
	assert.equal(
		waits.reduce((sum, wait) => sum + wait, 0),
		30_000
	);
	assert.equal(nextDeletionRetry(DELETION_RETRY_DELAYS_MS.length, false), null);
});

test("a try that failed stops the retries", () => {
	assert.equal(nextDeletionRetry(0, true), null);
	assert.equal(nextDeletionRetry(1, true), null);
});

test("the note says a try is coming, then that the deletion is recorded", () => {
	assert.match(deletionFinishingLine(0, false), /trying again \(1 of 3\)/);
	assert.match(deletionFinishingLine(2, false), /trying again \(3 of 3\)/);
	for (const line of [deletionFinishingLine(3, false), deletionFinishingLine(1, true)]) {
		assert.match(line, /It is recorded, and the person who runs DECA Mark will complete it\./);
		assert.doesNotMatch(line, /Nothing was deleted/);
	}
});

test("a try deletes only the account that confirmed, never another one signed in from another tab", () => {
	assert.equal(confirmedBySignedIn("user-a", "user-a"), true);
	assert.equal(confirmedBySignedIn("user-a", "user-b"), false);
	// A form without the account, or with a file in its place, names no one.
	assert.equal(confirmedBySignedIn(null, "user-a"), false);
	assert.equal(confirmedBySignedIn("", "user-a"), false);
	assert.equal(confirmedBySignedIn(new Blob(["user-a"]), "user-a"), false);
	assert.match(OTHER_ACCOUNT_SIGNED_IN, /^Nothing was deleted\. A different account is signed in/);
});

test("after a 202, another account signed in stops the tries and keeps the deletion recorded", () => {
	const line = deletionFinishingLine(1, true, true);
	assert.match(line, /A different account is signed in on this browser now, so DECA Mark stopped trying\./);
	assert.match(line, /recorded, and the person who runs DECA Mark will complete it\./);
	assert.doesNotMatch(line, /trying again|Nothing was deleted/);
});
