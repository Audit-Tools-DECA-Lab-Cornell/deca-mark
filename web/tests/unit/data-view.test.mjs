import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { observation, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const {
	clip,
	countLine,
	daysBackwards,
	hasFilters,
	paramsReader,
	parseView,
	planSiteCode,
	prepareRecords,
	searchLoaded,
	SUMMARY_LIMIT,
	summaryOf,
	versionRange,
	viewFilters,
	viewQuery,
	zoneOptions,
	zoneVersions
} = await load("features/data/view.ts");
const { clock } = await load("lib/time.ts");

const janet = JSON.parse(readFileSync(new URL("../../../contracts/forms/janet-test-v1.json", import.meta.url), "utf8"));
const legacy = {
	fields: [
		{ code: "notes", type: "text" },
		{ code: "people", type: "integer" }
	]
};
const ny = clock("America/New_York");
const A = uuid(200);
const B = uuid(202);
const OLD = uuid(209);

let serial = 0;
function row(overrides = {}) {
	serial += 1;
	return observation({
		observation_id: `7a0b${String(serial).padStart(2, "0")}c2-0000-4000-8000-000000000000`,
		first_round: true,
		received_at: "2026-10-08T17:00:00Z",
		form_version: "janet-test-v1",
		answers: { play_type_1: "physical", play_event_summary: "Two children on the swings" },
		...overrides
	});
}

const view = (overrides = {}) => ({
	site: null,
	zones: [],
	version: null,
	round: null,
	observer: null,
	from: null,
	to: null,
	q: "",
	...overrides
});
const params = query => new URLSearchParams(query);

test("the address holds the view and reads back to the same view", () => {
	const full = view({
		site: "fall-creek",
		zones: [A, B],
		version: 2,
		round: "reliability",
		observer: "OB",
		from: "2026-10-01",
		to: "2026-10-07",
		q: "swings"
	});
	const query = viewQuery(full);
	assert.equal(
		query,
		`?site=fall-creek&zone=${A}&zone=${B}&version=2&round=reliability&observer=OB&from=2026-10-01&to=2026-10-07&q=swings`
	);
	assert.deepEqual(parseView(params(query)), full);
	assert.equal(viewQuery(view()), "");
});

test("a malformed view is read without what does not make sense", () => {
	// Zones need a site; a version needs zones; a zone is an identity, never a code.
	assert.deepEqual(parseView(params(`zone=${A}&version=2`)).zones, []);
	assert.equal(parseView(params(`site=s&version=2`)).version, null);
	assert.deepEqual(parseView(params(`site=s&zone=A&zone=${A.toUpperCase()}&zone=${A}`)).zones, [A]);
	assert.equal(parseView(params(`site=s&zone=${A}&version=0`)).version, null);
	assert.equal(parseView(params(`site=s&zone=${A}&version=1.5`)).version, null);
	const odd = parseView(params("round=weekly&observer=ABCDEFGHIJKLM&from=2026-02-30&to=yesterday&q=%20%20"));
	assert.deepEqual(odd, view());
	// Nothing about a site in the view, so a version or zone is never sent alone.
	assert.equal(viewQuery(view({ zones: [A], version: 2 })), "");
});

test("Next's searchParams object reads the same, a repeated key as a list", () => {
	const reader = paramsReader({ site: ["a", "b"], zone: [A, B], round: "inventory", observer: undefined });
	assert.deepEqual(parseView(reader), view({ site: "a", zones: [A, B], round: "inventory" }));
});

test("filters: whether any applies, and days that run backwards", () => {
	assert.equal(hasFilters(view()), false);
	assert.equal(hasFilters(view({ q: "  x " })), true);
	assert.equal(hasFilters(view({ zones: [A] })), true);
	assert.equal(daysBackwards({ from: "2026-10-08", to: "2026-10-07" }), true);
	assert.equal(daysBackwards({ from: "2026-10-07", to: "2026-10-07" }), false);
	assert.equal(daysBackwards({ from: "2026-10-07", to: null }), false);
});

test("the view becomes the API's filters: identities, one exact version, and days as instants", () => {
	const site = uuid(1);
	const pkg = uuid(102);
	assert.deepEqual(viewFilters(view(), { siteId: null, packageId: null }, ny), {});
	assert.deepEqual(
		viewFilters(
			view({
				site: "fall-creek",
				zones: [A],
				version: 2,
				round: "standard",
				observer: "OB",
				from: "2026-11-01",
				to: "2026-11-01"
			}),
			{ siteId: site, packageId: pkg },
			ny
		),
		{
			siteId: site,
			zoneIds: [A],
			packageId: pkg,
			roundType: "standard",
			observer: "OB",
			// Nov 1 in New York is the 25-hour day: from 04:00 UTC to 05:00 UTC the next day.
			observedFrom: "2026-11-01T04:00:00.000Z",
			observedBefore: "2026-11-02T05:00:00.000Z"
		}
	);
	// Zones without the site's identity, or a version without zones, are never sent.
	assert.deepEqual(viewFilters(view({ zones: [A] }), { siteId: null, packageId: pkg }, ny), {});
	assert.deepEqual(viewFilters(view({ site: "s" }), { siteId: site, packageId: pkg }, ny), { siteId: site });
});

test("an answer is cut on one line without splitting an emoji", () => {
	assert.equal(clip("a\n  b\tc"), "a b c");
	assert.equal(clip("x".repeat(SUMMARY_LIMIT)), "x".repeat(SUMMARY_LIMIT));
	const long = "🌿".repeat(SUMMARY_LIMIT + 5);
	const cut = clip(long);
	assert.equal(Array.from(cut).length, SUMMARY_LIMIT + 1);
	assert.ok(cut.endsWith("…"));
	assert.doesNotMatch(cut, /\p{Surrogate}/u);
});

test("the summary is the play type when answered, otherwise the first answer in the form's order", () => {
	assert.deepEqual(summaryOf(janet, { play_type_1: "physical", play_event_summary: "Swings" }), {
		label: "Primary play type",
		value: "Physical"
	});
	assert.deepEqual(summaryOf(janet, { age_range: "age_6_8", play_event_summary: "Swings" }), {
		label: "How old is the target child?",
		value: "6–8 yrs"
	});
	assert.equal(summaryOf(janet, {}), null);
	assert.deepEqual(summaryOf(legacy, { people: 3, notes: "Quiet" }), { label: "Notes", value: "Quiet" });
	// A definition that could not be loaded still shows the answer, under its id in words.
	assert.deepEqual(summaryOf(undefined, { weather_kind: "sunny" }), { label: "Weather kind", value: "sunny" });
});

test("records are worded by their own form version and map version, in the project's timezone", () => {
	const rows = [
		row({
			observed_at: "2026-10-08T02:30:00Z",
			zone_id: B,
			zone_code: "B",
			zone_label: "Garden (as named then)",
			round_type: "reliability",
			package_id: uuid(102),
			package_version: 2
		}),
		row({
			round_type: "inventory",
			placement: "zone",
			form_version: "shell-v1",
			answers: { notes: "Quiet" }
		})
	];
	const [first, second] = prepareRecords(rows, { "janet-test-v1": janet, "shell-v1": legacy }, ny);
	assert.match(first.label, /^OBS-7A0B[0-9]{2}$/);
	// 02:30 UTC on Oct 8 is 22:30 on Oct 7 in New York.
	assert.equal(first.day, "Oct 07, 2026");
	assert.equal(first.time, "22:30");
	assert.equal(first.when, "Oct 07, 2026 · 22:30");
	assert.deepEqual([first.zone, first.zoneCode, first.zoneLabel], [B, "B", "Garden (as named then)"]);
	assert.deepEqual([first.mapVersion, first.packageId], ["v2", uuid(102)]);
	assert.equal(first.roundName, "Reliability");
	assert.equal(first.summary.value, "Physical");
	assert.deepEqual(first.point, [-76.5, 42.4]);
	assert.equal(first.wholeZone, false);
	// An inventory is the whole zone: no point.
	assert.equal(second.wholeZone, true);
	assert.equal(second.point, null);
	assert.equal(second.round, "inventory");
	assert.deepEqual(second.summary, { label: "Notes", value: "Quiet" });
});

test("the search finds words in the loaded records: a label, an answer, an option's wording, a zone, a version", () => {
	const records = prepareRecords(
		[
			row({ observer: "OB" }),
			row({
				zone_id: B,
				zone_code: "B",
				zone_label: "Garden",
				observer: "JS",
				package_version: 3,
				answers: { play_event_summary: "Sandpit" }
			})
		],
		{ "janet-test-v1": janet },
		ny
	);
	const ids = q => searchLoaded(records, q).map(record => record.id);
	assert.equal(ids("").length, 2);
	assert.deepEqual(ids("sandpit"), [records[1].id]);
	assert.deepEqual(ids(records[0].label.toLowerCase()), [records[0].id]);
	assert.deepEqual(ids("garden sandpit"), [records[1].id]);
	assert.deepEqual(ids("physical"), [records[0].id]);
	assert.deepEqual(ids("v3"), [records[1].id]);
	assert.deepEqual(ids("no such words"), []);
});

test("map versions read as ranges", () => {
	assert.equal(versionRange([]), "");
	assert.equal(versionRange([2]), "v2");
	assert.equal(versionRange([3, 1, 2, 2]), "v1–v3");
	assert.equal(versionRange([1, 3, 4, 6]), "v1, v3–v4, v6");
});

test("zone choices: the current map's zones first, then zones only earlier versions had, each with its versions", () => {
	const groups = [
		{ zone_id: A, zone_label: "Meadow", package_version: 1, count: 3 },
		{ zone_id: A, zone_label: "North meadow", package_version: 2, count: 1 },
		{ zone_id: OLD, zone_label: "Pond", package_version: 1, count: 2 }
	];
	const current = [
		{ id: A, label: "North meadow" },
		{ id: B, label: "Swings" }
	];
	assert.deepEqual(zoneOptions(groups, current, 2), [
		{ value: A, label: "North meadow · v1–v2" },
		{ value: B, label: "Swings · v2" },
		{ value: OLD, label: "Pond · v1 · not in the current map" }
	]);
	assert.deepEqual(zoneOptions([], current, null), [
		{ value: A, label: "North meadow" },
		{ value: B, label: "Swings" }
	]);
});

test("the count line says how many loaded, how many match, and when they were counted", () => {
	const at = "11:32";
	assert.equal(
		countLine({ loaded: 500, total: 1284, searched: null, countedAt: at }),
		"Showing 1–500 of 1,284 matching observations · counted at 11:32"
	);
	assert.equal(
		countLine({ loaded: 3, total: 3, searched: null, countedAt: at }),
		"Showing all 3 matching observations · counted at 11:32"
	);
	assert.equal(
		countLine({ loaded: 1, total: 1, searched: null, countedAt: at }),
		"Showing 1 matching observation · counted at 11:32"
	);
	assert.equal(
		countLine({ loaded: 0, total: 0, searched: null, countedAt: at }),
		"No matching observations · counted at 11:32"
	);
	assert.equal(
		countLine({ loaded: 500, total: 1284, searched: 12, countedAt: at }),
		"12 of 500 loaded match · 1,284 match the filters · counted at 11:32"
	);
});

test("the plan is drawn for the chosen site, the only site, or the only site that has observations", () => {
	const one = [{ code: "a", observationCount: 0 }];
	const two = [
		{ code: "a", observationCount: 8 },
		{ code: "b", observationCount: 0 }
	];
	const both = [
		{ code: "a", observationCount: 8 },
		{ code: "b", observationCount: 3 }
	];
	assert.equal(planSiteCode(one, null), "a");
	assert.equal(planSiteCode(two, null), "a");
	assert.equal(planSiteCode(two, "b"), "b");
	assert.equal(planSiteCode(both, null), null);
	assert.equal(planSiteCode(both, "b"), "b");
	assert.equal(planSiteCode(both, "missing"), null);
});

test("one map version is offered only where every chosen zone is", () => {
	const groups = [
		{ zone_id: A, zone_label: "Meadow", package_version: 1, count: 3 },
		{ zone_id: OLD, zone_label: "Pond", package_version: 1, count: 2 },
		{ zone_id: A, zone_label: "Meadow", package_version: 2, count: 1 }
	];
	const current = { version: 3, zoneIds: [A, B] };
	assert.deepEqual(zoneVersions(groups, [A], current), [1, 2, 3]);
	// The pond was left out after v1: only v1 has it, and the current v3 does not.
	assert.deepEqual(zoneVersions(groups, [OLD], current), [1]);
	assert.deepEqual(zoneVersions(groups, [A, OLD], current), [1]);
	assert.deepEqual(zoneVersions(groups, [B], current), [3]);
	assert.deepEqual(zoneVersions(groups, [], current), []);
});
