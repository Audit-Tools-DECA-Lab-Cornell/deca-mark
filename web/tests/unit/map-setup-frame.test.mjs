import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support.mjs";
const { fitFrame } = await load("lib/plan.ts");
test("default historical point-map framing retains its existing scale", () => {
	const frame = fitFrame([
		{
			type: "Feature",
			properties: { id: "tree", kind: "tree" },
			geometry: { type: "Point", coordinates: [-76, 42] }
		}
	]);
	assert.equal(frame.metresPerUnit * frame.height, 0.12);
});
