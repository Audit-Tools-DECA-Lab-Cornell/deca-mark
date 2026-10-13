import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { observation as fixture, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const {
	buildReport,
	dayRangeIsBackwards,
	FORM_UNREADABLE,
	MAX_DAYS,
	NO_PLAY_QUESTION,
	parseDayKey,
	reportRows,
	summarySentence
} = await load("features/reports/model.ts");
const { clock } = await load("lib/time.ts");

const janet = JSON.parse(readFileSync(new URL("../../../contracts/forms/janet-test-v1.json", import.meta.url), "utf8"));
const plain = {
	version: 1,
	title: "Notes only",
	questions: [
		{
			id: "note",
			code: "Note",
			exportColumn: "note",
			act: "Record",
			label: "Note",
			kind: "text",
			options: [],
			required: false
		}
	]
};
const ny = clock("America/New_York");

let serial = 0;
function observation(overrides = {}) {
	serial += 1;
	return fixture({
		observation_id: uuid(70_000 + serial),
		first_round: true,
		received_at: "2026-10-07T17:00:00Z",
		form_version: "janet-test-v1",
		answers: { play_type_1: "physical" },
		...overrides
	});
}

const A = uuid(200);
const B = uuid(202);
const OLD = uuid(209);
const zones = [
	{ siteId: uuid(1), siteCode: "fall-creek", siteName: "Fall Creek", id: A, label: "Zone A · Whole playground" },
	{ siteId: uuid(1), siteCode: "fall-creek", siteName: "Fall Creek", id: B, label: "Zone B · Garden" }
];

test("a day key is a real calendar date or nothing", () => {
	assert.equal(parseDayKey("2026-10-07"), "2026-10-07");
	assert.equal(parseDayKey("2026-02-30"), null);
	assert.equal(parseDayKey("10/07/2026"), null);
	assert.equal(parseDayKey(""), null);
	assert.equal(parseDayKey(undefined), null);
	assert.equal(dayRangeIsBackwards("2026-10-08", "2026-10-07"), true);
	assert.equal(dayRangeIsBackwards("2026-10-07", null), false);
});

test("play type is read with each record's own form version", () => {
	const { rows, playOptions } = reportRows(
		[
			observation(),
			observation({ answers: { play_type_1: "bio" } }),
			observation({ answers: {} }),
			observation({ form_version: "notes-v1", answers: { note: "x" } }),
			observation({ form_version: "gone-v1", answers: {} })
		],
		{ "janet-test-v1": janet, "notes-v1": plain }
	);
	assert.deepEqual(
		rows.map(row => row.play),
		["Physical", "Bio", "Not answered", null, FORM_UNREADABLE]
	);
	assert.deepEqual(Object.keys(playOptions), ["janet-test-v1"]);
	assert.equal(playOptions["janet-test-v1"][0], "Physical");
});

test("a row keeps the zone it was recorded in, by identity, with the label it had then", () => {
	const { rows } = reportRows([observation({ zone_id: OLD, zone_label: "Pond", round_type: "reliability" })], {
		"janet-test-v1": janet
	});
	assert.equal(rows[0].round, "reliability");
	assert.equal(rows[0].zone, OLD);
	assert.equal(rows[0].zoneLabel, "Pond");
});

/** The summary DECA Mark would send for these observations: counts by site, zone, version and round. */
function summarize(list) {
	const groups = new Map();
	for (const row of list) {
		const key = [row.site_id, row.zone_id, row.package_version, row.round_type].join("|");
		const group = groups.get(key) ?? {
			site_id: row.site_id,
			zone_id: row.zone_id,
			zone_label: row.zone_label,
			package_version: row.package_version,
			round_type: row.round_type,
			count: 0
		};
		group.count += 1;
		groups.set(key, group);
	}
	return [...groups.values()];
}

const SITES = [
	{ siteId: uuid(1), name: "Fall Creek" },
	{ siteId: uuid(2), name: "Second site" }
];

/** A report of these observations, every one read (or only `read` of them, the newest page). */
function reportOf(list, definitions = { "janet-test-v1": janet }, options = {}) {
	const read = options.read ?? list;
	const { rows, playOptions } = reportRows(read, definitions);
	return buildReport({
		groups: summarize(list),
		total: list.length,
		rows,
		zones: options.zones ?? zones,
		sites: SITES,
		playOptions,
		clock: ny
	});
}

test("days are the project's calendar days, across the clock change", () => {
	// 2026-11-01 is the 25-hour day in New York: 00:30 EDT, 01:30 EDT, and 23:30 EST.
	const report = reportOf([
		observation({ observed_at: "2026-11-01T04:30:00Z" }),
		observation({ observed_at: "2026-11-01T05:30:00Z" }),
		observation({ observed_at: "2026-11-02T04:30:00Z" }),
		observation({ observed_at: "2026-11-02T05:30:00Z" })
	]);
	assert.deepEqual(
		report.days.map(bar => [bar.key, bar.value]),
		[
			["2026-11-01", 3],
			["2026-11-02", 1]
		]
	);
});

test("zones and rounds count every match; observers, days and play types count the rows read", () => {
	const list = [
		observation(),
		observation({ round_type: "reliability" }),
		observation({ round_type: "inventory", answers: { play_type_1: "bio" } }),
		observation({ zone_id: OLD, zone_label: "Pond", observer: "JL", observed_at: "2026-10-08T14:00:00Z" }),
		observation({
			zone_id: B,
			zone_label: "Garden",
			observer: "JL",
			observed_at: "2026-10-08T15:00:00Z",
			answers: {}
		})
	];
	const report = reportOf(list);

	assert.equal(report.total, 5);
	assert.equal(report.sampled, false);
	assert.deepEqual(
		report.zones.map(bar => [bar.label, bar.value]),
		[
			["Zone A · Whole playground", 3],
			["Zone B · Garden", 1],
			["Pond", 1]
		]
	);
	assert.deepEqual(
		report.rounds.map(bar => [bar.label, bar.value]),
		[
			["Standard round", 3],
			["Reliability round", 1],
			["Inventory round", 1]
		]
	);
	assert.deepEqual(
		report.observerBars.map(bar => [bar.label, bar.value]),
		[
			["OB", 3],
			["JL", 2]
		]
	);
	assert.deepEqual(
		report.days.map(bar => [bar.key, bar.value]),
		[
			["2026-10-07", 3],
			["2026-10-08", 2]
		]
	);
	// Every option of the form is listed (zero too); the counts add up to the records.
	assert.equal(
		report.play.reduce((sum, bar) => sum + bar.value, 0),
		5
	);
	assert.deepEqual(
		report.play.slice(0, 2).map(bar => [bar.label, bar.value]),
		[
			["Physical", 3],
			["Bio", 1]
		]
	);
	assert.ok(report.play.some(bar => bar.label === "Digital" && bar.value === 0));
	assert.ok(report.play.some(bar => bar.label === "Not answered" && bar.value === 1));
	assert.equal(report.zonesWithRecords, 3);
	assert.deepEqual(report.formVersions, ["janet-test-v1"]);
	assert.deepEqual(report.siteNames, ["Fall Creek"]);
});

test("a zone recorded on several map versions is one bar, named as its newest version names it", () => {
	const report = reportOf(
		[
			observation({ zone_id: OLD, zone_label: "Pond", package_version: 1 }),
			observation({ zone_id: OLD, zone_label: "Pond edge", package_version: 2 }),
			observation({ zone_id: OLD, zone_label: "Pond edge", package_version: 2, round_type: "inventory" })
		],
		undefined,
		{ zones: [] }
	);
	assert.deepEqual(
		report.zones.map(bar => [bar.key, bar.label, bar.value]),
		[[OLD, "Pond edge", 3]]
	);
});

test("when more match than were read, the counts say which are exact", () => {
	const list = Array.from({ length: 6 }, (_, index) =>
		observation({ observer: index < 3 ? "OB" : "JL", observed_at: `2026-10-0${index + 1}T14:00:00Z` })
	);
	const report = reportOf(list, undefined, { read: list.slice(3) });
	assert.equal(report.total, 6);
	assert.equal(report.sampled, true);
	assert.equal(report.counted, 3);
	assert.equal(report.zones[0].value, 6, "zones count every match");
	assert.equal(report.rounds[0].value, 6, "rounds count every match");
	assert.deepEqual(
		report.observerBars.map(bar => [bar.label, bar.value]),
		[["JL", 3]],
		"observers count the rows read"
	);
	// Observers and days are left out of the sentence when they were not counted from every match.
	assert.equal(summarySentence(report, { clock: ny, round: null }), "6 observations in 1 zone at Fall Creek.");
});

test("no play type chart when no form has a Play question; rows of other forms get their own bar", () => {
	const none = reportOf([observation({ form_version: "notes-v1", answers: {} })], { "notes-v1": plain });
	assert.equal(none.play, null);
	const mixed = reportOf([observation(), observation({ form_version: "notes-v1", answers: {} })], {
		"janet-test-v1": janet,
		"notes-v1": plain
	});
	assert.equal(mixed.play.find(bar => bar.label === NO_PLAY_QUESTION).value, 1);
	assert.equal(mixed.play.find(bar => bar.label === "Physical").value, 1);
});

test("two sites keep their own zones apart", () => {
	const second = uuid(301);
	const list = [
		observation(),
		observation({ site_id: uuid(2), site_code: "creek-2", site_name: "Second site", zone_id: second })
	];
	const both = [
		...zones,
		{ siteId: uuid(2), siteCode: "creek-2", siteName: "Second site", id: second, label: "Zone A" }
	];
	const report = reportOf(list, undefined, { zones: both });
	assert.deepEqual(
		report.zones.filter(bar => bar.value > 0).map(bar => bar.label),
		["Fall Creek · Zone A · Whole playground", "Second site · Zone A"]
	);
	assert.equal(
		summarySentence(report, { clock: ny, round: null }),
		"2 observations by 1 observer in 2 zones across 2 sites on Oct 07, 2026."
	);
});

test("only the newest 31 days are listed, and the rest are counted", () => {
	const list = Array.from({ length: 40 }, (_, index) =>
		observation({
			observed_at: `2026-${index < 31 ? "08" : "09"}-${String((index % 31) + 1).padStart(2, "0")}T16:00:00Z`
		})
	);
	const report = reportOf(list);
	assert.equal(report.days.length, MAX_DAYS);
	assert.equal(report.daysLeftOut, 9);
	assert.equal(report.days[0].key, "2026-08-10");
	assert.equal(report.days.at(-1).key, "2026-09-09");
});

test("the summary is one plain sentence", () => {
	const report = reportOf([observation(), observation({ round_type: "reliability" })]);
	assert.equal(
		summarySentence(report, { clock: ny, round: null }),
		"2 observations by 1 observer in 1 zone at Fall Creek on Oct 07, 2026."
	);
	assert.equal(
		summarySentence(report, { clock: ny, round: "reliability" }),
		"2 observations by 1 observer in 1 zone at Fall Creek on Oct 07, 2026, Reliability rounds only."
	);
	const spread = reportOf([observation(), observation({ observed_at: "2026-10-09T14:00:00Z", observer: "JL" })]);
	assert.equal(
		summarySentence(spread, { clock: ny, round: null }),
		"2 observations by 2 observers in 1 zone at Fall Creek from Oct 07, 2026 to Oct 09, 2026."
	);
	const empty = reportOf([]);
	assert.equal(summarySentence(empty, { clock: ny, round: null }), "No observations match these filters.");
	assert.deepEqual(
		empty.rounds.map(bar => bar.value),
		[0, 0, 0]
	);
});
