import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Drawing on the zone editor specimen (WEB-34): shapes and rectangles by keyboard, mouse and touch
 * emulation, snapping to exact points, following a neighbour's edge, and removing holes and parts. Real
 * iPad Safari stays a manual run (WEB-30 gate 4).
 */

type Position = [number, number];
type Zone = {
	zone_id: string;
	zone_code: string;
	zone_label: string;
	geometry: { type: string; coordinates: Position[][] | Position[][][] };
};

async function open(page: Page, shapes: string) {
	await page.goto(`/dev/zone-editor?shapes=${shapes}`);
	await page.waitForFunction(() => Boolean(window.__zoneSpecimen));
}

const current = (page: Page) => page.evaluate(() => window.__zoneSpecimen!.zones() as unknown) as Promise<Zone[]>;
const said = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const zoneRow = (page: Page, label: string) =>
	page.getByRole("listbox", { name: "Zones" }).getByRole("option", { name: new RegExp(`^${label}`) });
const same = (a: Position, b: Position) => Object.is(a[0], b[0]) && Object.is(a[1], b[1]);

/** Puts the plan at the top of the viewport (the mouse does not scroll) and returns its box. */
async function mapAtTop(page: Page) {
	const map = page.locator('[aria-roledescription="map"]');
	await map.evaluate(element => element.scrollIntoView({ block: "start" }));
	return (await map.boundingBox())!;
}

/** The screen centre of a point's handle, with its zone selected (handles show only while selecting). */
async function handleCentre(page: Page, name: RegExp) {
	const target = page.getByRole("button", { name });
	await target.scrollIntoViewIfNeeded();
	const box = (await target.boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("keyboard: P puts focus on the cross; Space adds points; an unfinished shape is never a zone", async ({
	page
}) => {
	await open(page, "neighbours");
	const before = await current(page);
	await page.locator('[aria-roledescription="map"]').focus();
	await page.keyboard.press("p");
	await expect(page.locator(":focus")).toHaveAttribute("aria-roledescription", "drawing cross");
	await page.keyboard.press("Space");
	for (let i = 0; i < 40; i++) await page.keyboard.press("Shift+ArrowRight");
	await page.keyboard.press("Space");
	expect(await current(page), "two points are not a zone yet").toEqual(before);
	await page.keyboard.press("Enter");
	await expect(said(page, "Not finished. A shape needs at least three different points; it has 2.")).toHaveCount(1);
	for (let i = 0; i < 40; i++) await page.keyboard.press("Shift+ArrowUp");
	await page.keyboard.press("Space");
	await page.keyboard.press("Enter");
	const after = await current(page);
	expect(after).toHaveLength(before.length + 1);
	const drawn = after[after.length - 1]!;
	expect(drawn.zone_code).toBe("Z1");
	expect(drawn.zone_label).toBe("");
	expect(drawn.zone_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	const ring = drawn.geometry.coordinates[0] as Position[];
	expect(ring).toHaveLength(4);
	expect(same(ring[0]!, ring[3]!)).toBe(true);
	// Focus moves to the new zone's name; typing names it.
	await expect(page.locator(":focus")).toHaveAttribute("id", /zone-name$/);
	await page.keyboard.type("Sandpit");
	expect((await current(page)).at(-1)!.zone_label).toBe("Sandpit");
	// Escape with points clears the drawing; nothing is added.
	await page.locator('[aria-roledescription="map"]').focus();
	await page.keyboard.press("p");
	await page.keyboard.press("Space");
	await page.keyboard.press("Escape");
	await expect(said(page, "Drawing cancelled. Nothing was added.")).toHaveCount(1);
	expect(await current(page)).toHaveLength(before.length + 1);
});

test("mouse: a shape that follows a neighbour's edge shares its exact points", async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== "desktop-1440", "mouse clicks; touch drawing is covered below");
	await open(page, "concave");
	const [concave] = await current(page);
	const ring = concave!.geometry.coordinates[0] as Position[];
	// Where the concave zone's inner corner points are on screen.
	await zoneRow(page, "Concave").click();
	await page.getByRole("button", { name: "Fit zone" }).click();
	await page.waitForTimeout(400);
	const before = await mapAtTop(page);
	// Points relative to the plan's frame, so a click can find them wherever the page has scrolled to.
	const [p1, p2, p4, p5] = (
		await Promise.all(
			[2, 3, 5, 6].map(n => handleCentre(page, new RegExp(`^Point ${n} of 6, Concave, outer edge$`)))
		)
	).map(({ x, y }) => ({ x: x - before.x, y: y - before.y })) as [
		{ x: number; y: number },
		{ x: number; y: number },
		{ x: number; y: number },
		{ x: number; y: number }
	];
	const clickAt = async (x: number, y: number) => {
		const frame = await mapAtTop(page);
		await page.mouse.click(frame.x + x, frame.y + y);
	};
	await page.getByRole("radio", { name: "Draw shape" }).click();
	// A few pixels off each point: snapping lands on the exact pairs.
	await clickAt(p2.x + 3, p2.y - 2);
	await clickAt(p4.x - 2, p4.y + 3);
	await page.getByRole("button", { name: "Follow the edge of Concave" }).click();
	await expect(said(page, "Following the edge of Concave: 1 point copied.")).toHaveCount(1);
	// The fourth corner, free, where the notch's outer corner is (above point 2, right of point 6).
	await clickAt(p1.x, p5.y);
	// Clicking the first point finishes.
	await clickAt(p2.x + 1, p2.y + 1);
	const zones = await current(page);
	expect(zones).toHaveLength(2);
	const drawn = zones[1]!.geometry.coordinates[0] as Position[];
	expect(drawn).toHaveLength(5);
	expect(same(drawn[0]!, ring[2]!), "first point is concave point 3").toBe(true);
	expect(same(drawn[1]!, ring[3]!), "traced point is concave point 4").toBe(true);
	expect(same(drawn[2]!, ring[4]!), "second snapped point is concave point 5").toBe(true);
	expect(same(drawn[4]!, drawn[0]!)).toBe(true);
	// The concave zone itself is untouched, and the browser finds nothing wrong with either shape.
	expect(JSON.stringify(zones[0])).toBe(JSON.stringify(concave));
	// Its only problem is the name it still needs: no crossing, nothing outside the site.
	await expect(page.getByText("Found while editing · 1 problem")).toBeVisible();
	await expect(page.getByText("Zone Z1 needs a name.")).toBeVisible();
	expect(
		await page
			.getByRole("status")
			.filter({ hasText: /^Drew zone Z1 with 4 points/ })
			.count()
	).toBe(1);
});

test("mouse: a rectangle by dragging, aligned to longitude and latitude", async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== "desktop-1440", "mouse drag; touch is covered below");
	await open(page, "neighbours");
	await page.getByRole("radio", { name: "Draw rectangle" }).click();
	const frame = await mapAtTop(page);
	const from = { x: frame.x + frame.width * 0.3, y: frame.y + frame.height * 0.75 };
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 120, from.y + 60, { steps: 8 });
	await page.mouse.up();
	const zones = await current(page);
	expect(zones).toHaveLength(4);
	const ring = zones[3]!.geometry.coordinates[0] as Position[];
	expect(ring).toHaveLength(5);
	expect(ring[0]![0]).toBe(ring[3]![0]);
	expect(ring[1]![0]).toBe(ring[2]![0]);
	expect(ring[0]![1]).toBe(ring[1]![1]);
	expect(ring[2]![1]).toBe(ring[3]![1]);
	expect(same(ring[0]!, ring[4]!)).toBe(true);
	await expect(page.getByRole("radio", { name: "Select" })).toHaveAttribute("data-state", "on");
});

test("touch: tapping out a shape, and dragging a rectangle", async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== "phone-390", "touch emulation runs on the phone project");
	await open(page, "neighbours");
	const map = page.locator('[aria-roledescription="map"]');
	await map.scrollIntoViewIfNeeded();
	await page.getByRole("radio", { name: "Draw shape" }).tap();
	await map.scrollIntoViewIfNeeded();
	const frame = (await map.boundingBox())!;
	const at = (x: number, y: number) => ({ x: frame.x + frame.width * x, y: frame.y + frame.height * y });
	for (const point of [at(0.3, 0.75), at(0.6, 0.75), at(0.45, 0.88)]) await page.touchscreen.tap(point.x, point.y);
	await page.getByRole("button", { name: "Finish shape" }).tap();
	let zones = await current(page);
	expect(zones).toHaveLength(4);
	expect(zones[3]!.geometry.coordinates[0]).toHaveLength(4);

	await page.getByRole("radio", { name: "Draw rectangle" }).tap();
	await map.scrollIntoViewIfNeeded();
	const box = (await map.boundingBox())!;
	const from = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.7 };
	const client = await page.context().newCDPSession(page);
	await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
	for (let step = 1; step <= 8; step++)
		await client.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x: from.x + step * 12, y: from.y + step * 5 }]
		});
	await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	zones = await current(page);
	expect(zones).toHaveLength(5);
	expect(zones[4]!.geometry.coordinates[0]).toHaveLength(5);
});

test("holes and parts come off whole, the zone keeps its identity, and undo brings them back", async ({ page }) => {
	await open(page, "holed");
	const [before] = await current(page);
	await zoneRow(page, "Holed square").click();
	await page.getByRole("button", { name: "Remove hole 1" }).click();
	let [after] = await current(page);
	expect(after!.zone_id).toBe(before!.zone_id);
	expect(after!.geometry.coordinates).toHaveLength(1);
	await expect(said(page, "Removed hole 1 of Holed square.")).toHaveCount(1);
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	[after] = await current(page);
	expect(JSON.stringify(after)).toBe(JSON.stringify(before));

	await open(page, "multipart");
	const [parts] = await current(page);
	await zoneRow(page, "Two parts").click();
	await page.getByRole("button", { name: "Remove part 2" }).click();
	[after] = await current(page);
	expect(after!.geometry.type).toBe("MultiPolygon");
	expect(after!.geometry.coordinates).toEqual([(parts!.geometry.coordinates as Position[][][])[0]]);
	await expect(page.getByRole("button", { name: /^Remove part/ })).toHaveCount(0);
});

test("axe finds nothing while drawing, in both palettes", async ({ page }) => {
	await open(page, "concave");
	await page.locator('[aria-roledescription="map"]').focus();
	await page.keyboard.press("p");
	await page.keyboard.press("Space");
	for (const palette of ["Day", "Night"]) {
		if (palette === "Night") {
			await page.getByRole("button", { name: "Map layers" }).click();
			await page.getByRole("radio", { name: "Night" }).click();
			await page.keyboard.press("Escape");
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
