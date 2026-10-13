import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { addDays, clock, dayKeysBetween, daysBetween, isTimeZone } = await load("lib/time.ts");

const ny = clock("America/New_York");

test("formats in the project's timezone on the 24-hour clock", () => {
	const iso = "2026-10-07T18:05:00Z"; // 14:05 in New York (EDT)
	assert.equal(ny.time(iso), "14:05");
	assert.equal(ny.day(iso), "Oct 07, 2026");
	assert.equal(ny.shortDay(iso), "Oct 07");
	assert.equal(ny.dayTime(iso), "Oct 07, 2026 · 14:05");
	assert.equal(ny.dayKey(iso), "2026-10-07");
	assert.equal(clock("Asia/Tokyo").dayKey(iso), "2026-10-08");
});

test("midnight reads 00:00, not 24:00", () => {
	assert.equal(ny.time("2026-10-08T04:00:00Z"), "00:00");
});

test("relative days count calendar days in the timezone", () => {
	const now = "2026-10-08T15:00:00Z"; // 11:00 Oct 08 in New York
	assert.equal(ny.relativeDay("2026-10-08T05:00:00Z", now), "Today");
	assert.equal(ny.relativeDay("2026-10-08T03:59:00Z", now), "Yesterday"); // 23:59 Oct 07
	assert.equal(ny.relativeDay("2026-09-30T15:00:00Z", now), "Sep 30");
	assert.equal(ny.relativeDay("2025-09-30T15:00:00Z", now), "Sep 30, 2025");
	assert.equal(ny.relativeDayTime("2026-10-08T14:25:00Z", now), "Today 10:25");
	assert.equal(ny.relativeDayTime("2026-09-30T15:32:00Z", now), "Sep 30 · 11:32");
});

test("the day clocks fall back (25 hours) is one day: 00:30 and 23:30 on 2026-11-01", () => {
	const early = "2026-11-01T04:30:00Z"; // 00:30 EDT
	const late = "2026-11-02T04:30:00Z"; // 23:30 EST, exactly 24 hours later
	assert.equal(ny.time(early), "00:30");
	assert.equal(ny.time(late), "23:30");
	assert.equal(ny.dayKey(early), "2026-11-01");
	assert.equal(ny.dayKey(late), "2026-11-01");
	assert.equal(ny.dayKey("2026-11-02T05:00:00Z"), "2026-11-02"); // 00:00 EST Nov 02
});

test("the day clocks spring forward (23 hours) is one day: 00:30 and 23:30 on 2026-03-08", () => {
	const early = "2026-03-08T05:30:00Z"; // 00:30 EST
	const late = "2026-03-09T03:30:00Z"; // 23:30 EDT, 22 hours later
	assert.equal(ny.time(early), "00:30");
	assert.equal(ny.time(late), "23:30");
	assert.equal(ny.dayKey(early), "2026-03-08");
	assert.equal(ny.dayKey(late), "2026-03-08");
	assert.equal(ny.dayKey("2026-03-09T04:00:00Z"), "2026-03-09"); // 00:00 EDT Mar 09
});

test("day keys step by calendar day across clock changes and month ends", () => {
	assert.equal(addDays("2026-11-01", 1), "2026-11-02");
	assert.equal(addDays("2026-03-08", -1), "2026-03-07");
	assert.equal(addDays("2026-02-28", 1), "2026-03-01");
	assert.equal(addDays("2026-12-31", 1), "2027-01-01");
	assert.equal(daysBetween("2026-10-02", "2026-10-08"), 6);
	assert.deepEqual(dayKeysBetween("2026-10-30", "2026-11-02"), [
		"2026-10-30",
		"2026-10-31",
		"2026-11-01",
		"2026-11-02"
	]);
	assert.deepEqual(dayKeysBetween("2026-11-02", "2026-11-01"), []);
	assert.equal(ny.keyLabel("2026-11-01"), "Nov 01, 2026");
	assert.equal(ny.shortKeyLabel("2026-03-08"), "Mar 08");
});

test("an unknown timezone falls back to UTC, and an unreadable time formats as nothing", () => {
	assert.equal(isTimeZone("America/New_York"), true);
	assert.equal(isTimeZone("Mars/Olympus"), false);
	const fallback = clock("Mars/Olympus");
	assert.equal(fallback.timeZone, "UTC");
	assert.equal(fallback.time("2026-10-07T18:05:00Z"), "18:05");
	assert.equal(ny.time("not a time"), "");
	assert.equal(ny.dayKey("not a time"), "");
});

test("a day starts at its first instant in the timezone, across clock changes and far offsets", () => {
	const cases = [
		["America/New_York", "2026-03-08", "2026-03-08T05:00:00.000Z"], // the 23-hour day starts on EST
		["America/New_York", "2026-11-01", "2026-11-01T04:00:00.000Z"], // the 25-hour day starts on EDT
		["America/New_York", "2026-11-02", "2026-11-02T05:00:00.000Z"],
		// Santiago skips midnight when its clocks go forward: the day starts at 01:00.
		["America/Santiago", "2026-09-06", "2026-09-06T04:00:00.000Z"],
		["Pacific/Kiritimati", "2026-10-08", "2026-10-07T10:00:00.000Z"], // +14
		["Pacific/Pago_Pago", "2026-10-08", "2026-10-08T11:00:00.000Z"], // −11
		["Asia/Kolkata", "2026-10-08", "2026-10-07T18:30:00.000Z"], // +5:30
		["UTC", "2026-10-08", "2026-10-08T00:00:00.000Z"]
	];
	for (const [zone, key, start] of cases) {
		const zoned = clock(zone);
		assert.equal(zoned.dayStart(key), start, `${zone} ${key}`);
		assert.equal(zoned.dayKey(start), key);
		assert.equal(zoned.dayKey(new Date(Date.parse(start) - 1000).toISOString()), addDays(key, -1));
	}
});
