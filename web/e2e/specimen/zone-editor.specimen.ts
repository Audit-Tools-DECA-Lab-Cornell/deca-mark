import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { scanRoute } from "../support/scan";

/**
 * The zone editor on its dev-only specimen (`/dev/zone-editor`): WEB-30's gates in a desktop and a phone
 * browser, and WEB-33's editing by keyboard alone and by touch emulation. Real iPad Safari (gates 4 and 8)
 * is a manual run; Chromium's touch emulation here does not stand in for it.
 */

type Position = [number, number];
type Geometry = { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] };
type Zone = { zone_id: string; zone_code: string; zone_label: string; geometry: Geometry };

const ALL_SETS = [
	"neighbours",
	"holed",
	"multipart",
	"concave",
	"reversed",
	"duplicate",
	"bow-tie",
	"outside-hole",
	"collinear",
	"overlap",
	"shared-edge",
	"precision",
	"fall-creek"
] as const;

async function open(page: Page, shapes: string) {
	await page.goto(`/dev/zone-editor?shapes=${shapes}`);
	// Hydrated once the specimen reports its zones.
	await page.waitForFunction(() => Boolean(window.__zoneSpecimen));
}

const current = (page: Page) => page.evaluate(() => window.__zoneSpecimen!.zones() as unknown) as Promise<Zone[]>;
const original = (page: Page) => page.evaluate(() => window.__zoneSpecimen!.original() as unknown) as Promise<Zone[]>;

const partsOf = (geometry: Geometry): Position[][][] =>
	geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

/** Every position by its address: zone/part/ring/index, closing positions included. */
function addresses(zones: Zone[]): Map<string, Position> {
	const map = new Map<string, Position>();
	zones.forEach((zone, z) =>
		partsOf(zone.geometry).forEach((rings, p) =>
			rings.forEach((ring, r) => ring.forEach((position, i) => map.set(`${z}/${p}/${r}/${i}`, position)))
		)
	);
	return map;
}

const same = (a: Position, b: Position) => Object.is(a[0], b[0]) && Object.is(a[1], b[1]);

/** Asserts the same zones, types, parts and ring lengths, and returns the addresses whose numbers changed. */
function changed(before: Zone[], after: Zone[]): string[] {
	expect(after.map(zone => [zone.zone_id, zone.geometry.type])).toEqual(
		before.map(zone => [zone.zone_id, zone.geometry.type])
	);
	expect(after.map(zone => partsOf(zone.geometry).map(rings => rings.map(ring => ring.length)))).toEqual(
		before.map(zone => partsOf(zone.geometry).map(rings => rings.map(ring => ring.length)))
	);
	const a = addresses(before);
	const b = addresses(after);
	const moved = [...a.keys()].filter(key => !same(a.get(key)!, b.get(key)!));
	// Every ring stays closed on the identical pair.
	for (const zone of after)
		for (const rings of partsOf(zone.geometry))
			for (const ring of rings) expect(same(ring[0]!, ring[ring.length - 1]!)).toBe(true);
	return moved;
}

/** The addresses a move of one point may change: the point, its closing twin, and points shared with it. */
function allowed(before: Zone[], zone: number, part: number, ring: number, index: number): Set<string> {
	const rings = partsOf(before[zone]!.geometry)[part]!;
	const target = rings[ring]![index]!;
	const keys = new Set([`${zone}/${part}/${ring}/${index}`]);
	if (index === 0) keys.add(`${zone}/${part}/${ring}/${rings[ring]!.length - 1}`);
	for (const [key, position] of addresses(before))
		if (!key.startsWith(`${zone}/`) && same(position, target)) keys.add(key);
	return keys;
}

const cameraTransform = (page: Page) =>
	page
		.locator('[aria-roledescription="map"] svg > g')
		.first()
		.evaluate(element => (element as SVGGElement).style.transform);

/** The editor's announcement, once it says this. */
const said = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

const zoneRow = (page: Page, label: string) =>
	page.getByRole("listbox", { name: "Zones" }).getByRole("option", { name: new RegExp(`^${label}`) });
const handle = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

test.describe("gate 1: lossless", () => {
	test("every set serialises unchanged when nothing is edited", async ({ page }) => {
		for (const shapes of [...ALL_SETS, "limit-zone", "limit-site"]) {
			await open(page, shapes);
			expect(JSON.stringify(await current(page)), shapes).toBe(JSON.stringify(await original(page)));
		}
	});
});

test.describe("keyboard editing (gate 3, WEB-33)", () => {
	for (const shapes of ALL_SETS) {
		test(`${shapes}: move, step, remove, undo and redo by keyboard alone`, async ({ page }) => {
			await open(page, shapes);
			const before = await original(page);
			const label = before[0]!.zone_label;
			await zoneRow(page, label).focus();
			await page.keyboard.press("Enter");
			const focused = page.locator(":focus");
			await expect(focused).toHaveAttribute("aria-label", new RegExp(`^Point 1 of \\d+, ${label}, `));

			// Arrows move the point; the plan does not pan while the handle has focus.
			const camera = await cameraTransform(page);
			await page.keyboard.press("ArrowUp");
			await page.keyboard.press("Shift+ArrowRight");
			expect(await cameraTransform(page)).toBe(camera);
			const moved = changed(before, await current(page));
			const permitted = allowed(before, 0, 0, 0, 0);
			expect(moved.length).toBeGreaterThan(0);
			for (const key of moved) expect(permitted.has(key), key).toBe(true);
			await expect(said(page, /^Moved point 1 of /)).toHaveCount(1);

			// Step to the next point, then remove it.
			await page.keyboard.press("]");
			await expect(page.locator(":focus")).toHaveAttribute(
				"aria-label",
				new RegExp(`^Point 2 of \\d+, ${label}, `)
			);
			await page.keyboard.press("Delete");
			await expect(said(page, /Removed point 2 from|keeps at least three points/)).toHaveCount(1);

			// Undo everything: the very same numbers as loaded.
			for (let i = 0; i < 3; i++) await page.keyboard.press("Control+z");
			expect(JSON.stringify(await current(page))).toBe(JSON.stringify(before));
			await expect(said(page, /Undid: |Nothing to undo/)).toHaveCount(1);
			await page.keyboard.press("Control+Shift+z");
			await expect(said(page, "Redid: moved point 1 of")).toHaveCount(1);

			// Escape returns to the zone in the list.
			await page.keyboard.press("Escape");
			await expect(zoneRow(page, label)).toBeFocused();
		});
	}

	test("holes and second parts are edited point by point and kept", async ({ page }) => {
		for (const [shapes, label, edge, name] of [
			["holed", "Holed square", "0:1", /^Point 1 of 4, Holed square, hole 1$/],
			["multipart", "Two parts", "1:0", /^Point 1 of 4, Two parts, part 2 outer edge$/],
			["precision", "Full precision", "0:1", /^Point 1 of 4, Full precision, hole 1$/]
		] as const) {
			await open(page, shapes);
			const before = await original(page);
			await zoneRow(page, label).click();
			await page.getByLabel("Edge", { exact: true }).selectOption(edge);
			await handle(page, name).focus();
			await page.keyboard.press("ArrowLeft");
			const [part, ring] = edge.split(":").map(Number) as [number, number];
			const moved = changed(before, await current(page));
			expect(moved.sort()).toEqual([...allowed(before, 0, part, ring, 0)].sort());
			await page.keyboard.press("Control+z");
			expect(JSON.stringify(await current(page))).toBe(JSON.stringify(before));
		}
	});

	test("Tab reaches the ring's one tab stop from the plan, and the next Tab leaves the ring", async ({ page }) => {
		await open(page, "holed");
		await zoneRow(page, "Holed square").click();
		await page.locator('[aria-roledescription="map"]').focus();
		await page.keyboard.press("Tab");
		await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Point 1 of 4, Holed square, outer edge$/);
		await page.keyboard.press("Tab");
		await expect(page.locator(":focus")).not.toHaveAttribute("aria-label", /^Point /);
	});

	test("a ring keeps three points: removal below that is refused with the reason", async ({ page }) => {
		await open(page, "neighbours");
		await zoneRow(page, "Square").focus();
		await page.keyboard.press("Enter");
		await page.keyboard.press("Delete");
		await page.keyboard.press("Delete");
		await expect(said(page, "Not removed. The outer edge of Square keeps at least three points.")).toHaveCount(1);
		const zones = await current(page);
		expect(zones[0]!.geometry.coordinates[0]).toHaveLength(4);
	});

	test("I inserts a point at the drawn middle of the edge, leaving its neighbours untouched", async ({ page }) => {
		await open(page, "precision");
		const before = await original(page);
		await zoneRow(page, "Full precision").focus();
		await page.keyboard.press("Enter");
		await page.keyboard.press("i");
		await expect(page.locator(":focus")).toHaveAttribute(
			"aria-label",
			/^Point 2 of 5, Full precision, outer edge$/
		);
		const after = await current(page);
		const ringBefore = (before[0]!.geometry as { coordinates: Position[][][] }).coordinates[0]![0]!;
		const ringAfter = (after[0]!.geometry as { coordinates: Position[][][] }).coordinates[0]![0]!;
		expect(ringAfter).toHaveLength(6);
		expect(ringAfter[0]).toEqual(ringBefore[0]);
		expect(ringAfter.slice(2)).toEqual(ringBefore.slice(1));
		// The hole is untouched.
		expect((after[0]!.geometry as { coordinates: Position[][][] }).coordinates[0]![1]).toEqual(
			(before[0]!.geometry as { coordinates: Position[][][] }).coordinates[0]![1]
		);
	});
});

test.describe("pointer and touch (gates 2 and 4, emulated)", () => {
	async function centre(page: Page, name: string | RegExp) {
		// The mouse does not scroll the page by itself: bring the handle into view first.
		await handle(page, name).scrollIntoViewIfNeeded();
		const box = (await handle(page, name).boundingBox())!;
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	}

	test("holes render unfilled; parts draw separately; nothing becomes a box", async ({ page }) => {
		await open(page, "holed");
		await zoneRow(page, "Holed square").click();
		await page.getByLabel("Edge", { exact: true }).selectOption("0:1");
		const corners = await Promise.all(
			[1, 3].map(n => centre(page, new RegExp(`^Point ${n} of 4, Holed square, hole 1$`)))
		);
		const middle = { x: (corners[0]!.x + corners[1]!.x) / 2, y: (corners[0]!.y + corners[1]!.y) / 2 };
		const hit = await page.evaluate(
			({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-zone]")?.getAttribute("data-zone") ?? null,
			middle
		);
		expect(hit, "the hole is not part of the zone's fill").toBeNull();
		const d = await page.locator("[data-zone]").first().getAttribute("d");
		expect(d!.match(/M/g)).toHaveLength(2);
		await open(page, "multipart");
		expect((await page.locator("[data-zone]").first().getAttribute("d"))!.match(/M/g)).toHaveLength(2);
		await open(page, "concave");
		expect((await page.locator("[data-zone]").first().getAttribute("d"))!.match(/L/g)).toHaveLength(5);
	});

	test("overlapping parts are drawn and hit where they overlap", async ({ page }) => {
		await open(page, "overlap");
		const zone = page.locator("[data-zone]").first();
		await zone.scrollIntoViewIfNeeded();
		// The parts span 0 to 0.015 on both axes and overlap from 0.005 to 0.01: the middle is in both.
		const box = (await zone.boundingBox())!;
		const hits = await page.evaluate(
			({ x, y }) => document.elementsFromPoint(x, y).filter(element => element.hasAttribute("data-zone")).length,
			{ x: box.x + box.width / 2, y: box.y + box.height / 2 }
		);
		expect(hits, "the shared patch is filled, not a false hole").toBe(1);
		const outside = await page.evaluate(
			({ x, y }) => document.elementsFromPoint(x, y).filter(element => element.hasAttribute("data-zone")).length,
			{ x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 }
		);
		expect(outside, "the north-west corner, outside both parts").toBe(0);
	});

	test("a drag moves one point; snapping copies a neighbour's exact pair; Alt places freely", async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== "desktop-1440", "mouse drag; touch is covered below");
		await open(page, "neighbours");
		const before = await original(page);
		await zoneRow(page, "Gap neighbour").click();
		await page.getByRole("switch", { name: "Move shared points together" }).click();
		const name = /^Point 1 of 4, Gap neighbour, outer edge$/;
		const start = await centre(page, name);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(start.x + 20, start.y - 30, { steps: 6 });
		await page.mouse.move(start.x + 40, start.y - 60, { steps: 6 });
		await page.mouse.up();
		let after = await current(page);
		expect(changed(before, after).sort()).toEqual(["2/0/0/0", "2/0/0/4"]);
		await expect(said(page, "Moved point 1 of Gap neighbour.")).toHaveCount(1);

		// Back to within a few pixels of Adjacent's corner: it snaps to that exact pair.
		const moved = await centre(page, name);
		await page.mouse.move(moved.x, moved.y);
		await page.mouse.down();
		await page.mouse.move(start.x + 3, start.y + 2, { steps: 8 });
		await page.mouse.up();
		after = await current(page);
		const corner = (after[2]!.geometry as { coordinates: Position[][] }).coordinates[0]![0]!;
		expect(same(corner, (before[1]!.geometry as { coordinates: Position[][] }).coordinates[0]![1]!)).toBe(true);

		// Onto the place of Adjacent's top corner (where this zone's point 4 also is): with Alt held the point
		// lands where the pointer is; without it, on the corner's exact pair.
		const topCorner = (before[1]!.geometry as { coordinates: Position[][] }).coordinates[0]![2]!;
		for (const alt of [true, false]) {
			const from = await centre(page, name);
			const to = await centre(page, /^Point 4 of 4, Gap neighbour, outer edge$/);
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			if (alt) await page.keyboard.down("Alt");
			await page.mouse.move(to.x + 2, to.y + 3, { steps: 6 });
			await page.mouse.up();
			if (alt) await page.keyboard.up("Alt");
			after = await current(page);
			const point = (after[2]!.geometry as { coordinates: Position[][] }).coordinates[0]![0]!;
			expect(same(point, topCorner), alt ? "Alt places freely" : "snaps to the corner").toBe(!alt);
			if (alt) await page.keyboard.press("Control+z");
		}
	});

	test("touch: dragging a handle edits only that point, and pinch zooms", async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== "phone-390", "touch emulation runs on the phone project");
		for (const shapes of ALL_SETS) {
			await open(page, shapes);
			const before = await original(page);
			const label = before[0]!.zone_label;
			await zoneRow(page, label).tap();
			await page.getByRole("button", { name: "Fit zone" }).tap();
			await page.locator('[aria-roledescription="map"]').scrollIntoViewIfNeeded();
			await page.waitForTimeout(400);
			// A handle the map's own controls do not cover (on a phone they sit over the plan's corners).
			const handles = page.locator("[data-map-keys]");
			let found: { name: string; x: number; y: number; box: { width: number; height: number } } | null = null;
			for (let n = 0; n < (await handles.count()) && !found; n++) {
				const box = (await handles.nth(n).boundingBox())!;
				const x = box.x + box.width / 2;
				const y = box.y + box.height / 2;
				const name = (await handles.nth(n).getAttribute("aria-label"))!;
				const hit = await page.evaluate(
					({ x, y }) =>
						document.elementFromPoint(x, y)?.closest("[data-map-keys]")?.getAttribute("aria-label") ?? null,
					{ x, y }
				);
				if (hit === name) found = { name, x, y, box };
			}
			expect(found, `${shapes}: a handle that can be touched`).not.toBeNull();
			// The handle's target is at least 44 px across.
			expect(Math.min(found!.box.width, found!.box.height)).toBeGreaterThanOrEqual(43.5);
			const from = { x: found!.x, y: found!.y };
			const client = await page.context().newCDPSession(page);
			const mapTop = async () => (await page.locator('[aria-roledescription="map"]').boundingBox())!.y;
			const top = await mapTop();
			await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
			for (let step = 1; step <= 8; step++)
				await client.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [{ x: from.x - step * 3, y: from.y + step * 2 }]
				});
			await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			// The plan stays under the finger: the page neither scrolls nor zooms with the drag.
			expect(Math.abs((await mapTop()) - top), "the plan did not move on screen").toBeLessThan(1);
			const index = Number(/^Point (\d+)/.exec(found!.name)![1]) - 1;
			const part = /part 2/.test(found!.name) ? 1 : 0;
			const moved = changed(before, await current(page));
			expect(moved.length, found!.name).toBeGreaterThan(0);
			const permitted = allowed(before, 0, part, 0, index);
			for (const key of moved) expect(permitted.has(key), key).toBe(true);
		}

		// Two fingers moving apart zoom the plan (no zone selected, so no handle is under a finger).
		await open(page, "holed");
		await page.locator('[aria-roledescription="map"]').scrollIntoViewIfNeeded();
		const frame = (await page.locator('[aria-roledescription="map"]').boundingBox())!;
		const mid = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
		const zoomBefore = await cameraTransform(page);
		const client = await page.context().newCDPSession(page);
		await client.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [
				{ x: mid.x - 20, y: mid.y, id: 1 },
				{ x: mid.x + 20, y: mid.y, id: 2 }
			]
		});
		for (let step = 1; step <= 10; step++)
			await client.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [
					{ x: mid.x - 20 - step * 6, y: mid.y, id: 1 },
					{ x: mid.x + 20 + step * 6, y: mid.y, id: 2 }
				]
			});
		await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await page.waitForTimeout(100);
		const scale = (transform: string) => Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? 1);
		expect(scale(await cameraTransform(page))).toBeGreaterThan(scale(zoomBefore));
	});

	test("touch: a second finger during a handle drag pinches; the point goes back", async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== "phone-390", "touch emulation runs on the phone project");
		await open(page, "holed");
		const before = await original(page);
		await zoneRow(page, "Holed square").tap();
		await page.getByRole("button", { name: "Fit zone" }).tap();
		await page.locator('[aria-roledescription="map"]').scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		const from = await centre(page, /^Point 1 of 4, Holed square, outer edge$/);
		const zoomBefore = await cameraTransform(page);
		const client = await page.context().newCDPSession(page);
		const one = (x: number, y: number) => ({ x, y, id: 1 });
		await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [one(from.x, from.y)] });
		for (let step = 1; step <= 4; step++)
			await client.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [one(from.x + step * 4, from.y - step * 3)]
			});
		const held = one(from.x + 16, from.y - 12);
		const second = { x: held.x + 60, y: held.y - 40, id: 2 };
		await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [held, second] });
		for (let step = 1; step <= 8; step++)
			await client.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [
					one(held.x - step * 5, held.y + step * 4),
					{ x: second.x + step * 5, y: second.y - step * 4, id: 2 }
				]
			});
		await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await page.waitForTimeout(100);
		expect(changed(before, await current(page)), "no point moved").toEqual([]);
		const scale = (transform: string) => Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? 1);
		expect(scale(await cameraTransform(page)), "the plan zoomed").toBeGreaterThan(scale(zoomBefore));
		await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
	});
});

test.describe("gate 5: palette and contrast", () => {
	/** WCAG relative luminance of a CSS rgb() colour. */
	function luminance(rgb: string): number {
		const [r, g, b] = (rgb.match(/[\d.]+/g) ?? [])
			.slice(0, 3)
			.map(Number)
			.map(value => {
				const c = value / 255;
				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			}) as [number, number, number];
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}
	const contrast = (a: string, b: string) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
		return (hi + 0.05) / (lo + 0.05);
	};

	test("handles keep 3:1 against the plan in Day and Night", async ({ page }) => {
		await open(page, "fall-creek");
		await zoneRow(page, "Zone A · Whole playground").click();
		for (const palette of ["Day", "Night"]) {
			if (palette === "Night") {
				await page.getByRole("button", { name: "Map layers" }).click();
				await page.getByRole("radio", { name: "Night" }).click();
				await page.keyboard.press("Escape");
				// The menu fades out; measure once it has gone.
				await expect(page.getByText("Separate from the screen theme.")).toBeHidden();
			}
			const ring = await handle(page, /^Point 1 of /)
				.locator("circle")
				.nth(1)
				.evaluate(element => getComputedStyle(element).stroke);
			const ground = await page
				.locator('[aria-roledescription="map"]')
				.evaluate(element => getComputedStyle(element).backgroundColor);
			const site = await page
				.locator('[aria-roledescription="map"] svg path[fill-rule="evenodd"]')
				.first()
				.getAttribute("fill");
			const siteRgb = await page.evaluate(hex => {
				const probe = document.createElement("div");
				probe.style.color = hex ?? "";
				document.body.append(probe);
				const value = getComputedStyle(probe).color;
				probe.remove();
				return value;
			}, site);
			expect(contrast(ring, ground), `${palette}: handle ring on the ground`).toBeGreaterThanOrEqual(3);
			expect(contrast(ring, siteRgb), `${palette}: handle ring on the site`).toBeGreaterThanOrEqual(3);
		}
	});
});

test("gate 6: no tile, glyph or outside requests while editing", async ({ page }) => {
	const requests: string[] = [];
	page.on("request", request => requests.push(request.url()));
	await open(page, "fall-creek");
	await zoneRow(page, "Zone A · Whole playground").click();
	await page.getByRole("button", { name: "Zoom in" }).click();
	await page.getByRole("button", { name: "Zoom in" }).click();
	await page.waitForTimeout(500);
	// Same host only (the development server's own websocket included); nothing fetched from anywhere else.
	const host = new URL(page.url()).host;
	expect(requests.filter(url => !url.startsWith("data:") && new URL(url).host !== host)).toEqual([]);
	expect(requests.filter(url => /tile|glyph|\.pbf|\.mvt|basemaps|cartocdn/i.test(url))).toEqual([]);
});

test.describe("gate 9 and the Problems island", () => {
	test("the hints flag the bow tie and the hole outside, and nothing on valid shapes", async ({ page }) => {
		await open(page, "bow-tie");
		await expect(page.getByText("Bow tie’s edge crosses itself near point 3.", { exact: false })).toBeVisible();
		await open(page, "outside-hole");
		await expect(
			page.getByText("Hole 1 of Hole outside reaches outside its outer edge", { exact: false })
		).toBeVisible();
		for (const shapes of ["holed", "multipart", "duplicate", "reversed", "neighbours"]) {
			await open(page, shapes);
			await expect(page.getByText("Nothing found while editing.")).toBeVisible();
		}
	});
});

test.describe("accessibility and copy", () => {
	test("the specimen passes the honesty scan and axe in Day and Dusk", async ({ page }, testInfo) => {
		// Compiled and cached first, so the scan's screenshots never race hydration.
		await open(page, "holed");
		await scanRoute(page, testInfo, "/dev/zone-editor?shapes=holed", { name: "dev-zone-editor", maxPrimary: 0 });
	});

	test("axe finds nothing with a zone and a point selected, in both palettes", async ({ page }) => {
		await open(page, "multipart");
		await zoneRow(page, "Two parts").focus();
		await page.keyboard.press("Enter");
		await page.keyboard.press("ArrowUp");
		for (const palette of ["Day", "Night"]) {
			if (palette === "Night") {
				await page.getByRole("button", { name: "Map layers" }).click();
				await page.getByRole("radio", { name: "Night" }).click();
				await page.keyboard.press("Escape");
				// The menu fades out; measure once it has gone.
				await expect(page.getByText("Separate from the screen theme.")).toBeHidden();
			}
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.exclude("nextjs-portal")
				.analyze();
			expect(
				results.violations.map(
					violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(" ")).join(" | ")}`
				),
				palette
			).toEqual([]);
		}
	});
});

test.describe("gate 8 (desktop Chromium only; the iPad run is manual)", () => {
	test("the 20,000-position site draws, and a 2,000-point drag keeps frames short", async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== "desktop-1440", "measured once, at desktop size");
		await open(page, "holed");
		await page.getByLabel("Shapes", { exact: true }).selectOption("limit-site");
		await page.waitForFunction(
			() => window.__zoneSpecimen?.set === "limit-site" && window.__zoneSpecimen.lastRenderMs !== null
		);
		const renderMs = await page.evaluate(() => window.__zoneSpecimen!.lastRenderMs!);

		await page.getByLabel("Shapes", { exact: true }).selectOption("limit-zone");
		await page.waitForFunction(() => window.__zoneSpecimen?.set === "limit-zone");
		await zoneRow(page, "Two thousand points").click();
		const point = handle(page, /^Point 1 of 1,999, /);
		await point.scrollIntoViewIfNeeded();
		const box = (await point.boundingBox())!;
		const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await page.evaluate(() => {
			const frames: number[] = [];
			(window as unknown as { __frames: number[] }).__frames = frames;
			const tick = (time: number) => {
				frames.push(time);
				if (frames.length < 2000) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		for (let step = 1; step <= 120; step++) await page.mouse.move(from.x - step, from.y + step / 2);
		await page.mouse.up();
		const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
		const gaps = frames.slice(1).map((time, index) => time - frames[index]!);
		const sorted = [...gaps].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)]!;
		const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
		const fps = 1000 / median;
		await testInfo.attach("gate-8-desktop.json", {
			body: JSON.stringify(
				{ renderMs, frames: gaps.length, medianFrameMs: median, p95FrameMs: p95, fps },
				null,
				2
			),
			contentType: "application/json"
		});
		console.log(
			`gate 8 (desktop Chromium at ${new URL(page.url()).origin}): 20,000-position site drawn in ${renderMs.toFixed(0)} ms; 2,000-point drag median frame ${median.toFixed(1)} ms (${fps.toFixed(0)} fps), p95 ${p95.toFixed(1)} ms over ${gaps.length} frames`
		);
		const moved = changed(await original(page), await current(page));
		expect(moved.sort()).toEqual(["0/0/0/0", "0/0/0/1999"]);
	});
});
