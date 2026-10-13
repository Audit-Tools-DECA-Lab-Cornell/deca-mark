import { expect, type Page, test } from "@playwright/test";

import {
	FRESH,
	freshSite,
	type Position,
	signInToZones,
	ZONE_MANIFEST,
	zoneApi,
	type ZoneDraftRead,
	zoneFixture
} from "./support/zones";

/**
 * Plan WEB-28 (UI plan section 10, item 1): a manager edits zones in the real editor against the local API.
 * They start a draft, draw a rectangle (mouse, or touch on the phone) and a shape (keyboard), move a point
 * by keyboard (and by touch on the phone) until DECA Mark finds an overlap, undo it, reload with nothing
 * lost, and publish. The untouched zones keep every number they were imported with. Runs on a site of its
 * own on the synthetic zone review project (`scripts/e2e-local.sh --zones`).
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

type Geometry = { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] };
type Zone = ZoneDraftRead["zones"][number] & { geometry: Geometry };

/** A zone's first outer edge: imported zones are MultiPolygons, and drawn ones Polygons. */
const outer = (zone: Zone): Position[] =>
	zone.geometry.type === "MultiPolygon" ? zone.geometry.coordinates[0]![0]! : zone.geometry.coordinates[0]!;
/** An imported zone exactly as its package had it. */
const imported = (edge: readonly Position[]) => ({ type: "MultiPolygon", coordinates: [[edge]] });

const RECTANGLE = "Synthetic drawn rectangle";
const SHAPE = "Synthetic drawn shape";
const METRES_PER_DEGREE = 111_320;

const map = (page: Page) => page.getByRole("main").locator('[aria-roledescription="map"]');

/** Puts the plan at the top of the viewport and returns its box. */
async function mapAtTop(page: Page) {
	await map(page).evaluate(element => element.scrollIntoView({ block: "start" }));
	return (await map(page).boundingBox())!;
}

/** A handle's centre relative to the plan's box, so it can be found again wherever the page scrolls. */
async function onPlan(page: Page, name: RegExp) {
	const frame = await mapAtTop(page);
	const box = (await page.getByRole("button", { name }).boundingBox())!;
	return { x: box.x + box.width / 2 - frame.x, y: box.y + box.height / 2 - frame.y };
}

/** Presses an arrow key enough times to move about `metres` (1 m with Shift, then 10 cm steps). */
async function arrows(page: Page, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown", metres: number) {
	const whole = Math.floor(metres);
	for (let i = 0; i < whole; i++) await page.keyboard.press(`Shift+${key}`);
	for (let i = 0; i < Math.round((metres - whole) * 10); i++) await page.keyboard.press(key);
}

test("a manager draws, edits, checks, fixes, reloads and publishes zones", async ({ page }, testInfo) => {
	test.setTimeout(300_000);
	const touch = testInfo.project.name === "phone-390";
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site } = await freshSite(call, "editor");
	const lawn = "Synthetic editor lawn";
	const beds = "Synthetic editor beds";
	const zonesHref = `${path}/sites/${site.code}/zones`;
	const main = page.getByRole("main");
	const list = main.getByRole("listbox", { name: "Zones" });
	const row = (label: string) => list.getByRole("option", { name: new RegExp(label) });
	let draftId = "";
	const read = async () =>
		call<ZoneDraftRead & { zones: Zone[] }>(
			"GET",
			`/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts/${draftId}`
		);
	const zone = (draft: { zones: Zone[] }, label: string) => draft.zones.find(item => item.zone_label === label);
	/** Waits until DECA Mark has the draft `done` describes and the page says it is saved; returns it. */
	const saved = async (done: (draft: { zones: Zone[] }) => boolean) => {
		let draft: (ZoneDraftRead & { zones: Zone[] }) | null = null;
		await expect
			.poll(
				async () => {
					draft = await read();
					return done(draft);
				},
				{ timeout: 30_000 }
			)
			.toBe(true);
		await expect(main).toContainText(
			new RegExp(`Saved to the draft · [^·]+ · revision ${draft!.revision}(?!\\d)`),
			{
				timeout: 30_000
			}
		);
		return draft!;
	};

	await signInToZones(page, "manager");
	await page.goto(zonesHref);
	await main.getByRole("button", { name: "Start a draft from v1" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Start the draft" }).click();
	await expect(page).toHaveURL(/\/zones\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
	draftId = new URL(page.url()).pathname.split("/").at(-1)!;
	await expect(main).toContainText("· revision 1", { timeout: 30_000 });

	// Where the beds are on the plan: the drawing goes beside them, inside the site and clear of the lawn.
	await row(beds).click();
	const sw = await onPlan(page, new RegExp(`^Point 1 of 4, ${beds}, outer edge$`));
	const ne = await onPlan(page, new RegExp(`^Point 3 of 4, ${beds}, outer edge$`));
	const width = ne.x - sw.x;
	const bedsMetres = (FRESH.b[1][0] - FRESH.b[0][0]) * METRES_PER_DEGREE * Math.cos((FRESH.b[0][1] * Math.PI) / 180);
	const pixelsPerMetre = width / bedsMetres;

	await test.step(`a rectangle, by ${touch ? "touch" : "mouse"}`, async () => {
		const tool = main.getByRole("radio", { name: "Draw rectangle" });
		if (touch) await tool.tap();
		else await tool.click();
		const frame = await mapAtTop(page);
		const from = { x: frame.x + ne.x + width, y: frame.y + sw.y };
		const to = { x: frame.x + ne.x + 2 * width, y: frame.y + ne.y };
		if (touch) {
			const client = await page.context().newCDPSession(page);
			await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
			for (let step = 1; step <= 8; step++)
				await client.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [
						{ x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 }
					]
				});
			await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		} else {
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			await page.mouse.move(to.x, to.y, { steps: 8 });
			await page.mouse.up();
		}
		// The new zone is selected and its name has focus.
		await expect(page.locator(":focus")).toHaveAttribute("id", /zone-name$/);
		await page.keyboard.type(RECTANGLE);
		const drawn = zone(await saved(draft => zone(draft, RECTANGLE) !== undefined), RECTANGLE)!;
		const corners = outer(drawn);
		expect(corners).toHaveLength(5);
		// Its sides follow longitude and latitude exactly.
		expect(corners[0]![0]).toBe(corners[3]![0]);
		expect(corners[1]![0]).toBe(corners[2]![0]);
		expect(corners[0]![1]).toBe(corners[1]![1]);
		expect(corners[2]![1]).toBe(corners[3]![1]);
	});

	await test.step("a shape, by keyboard", async () => {
		await map(page).focus();
		await page.keyboard.press("p");
		const cross = page.locator(":focus");
		await expect(cross).toHaveAttribute("aria-roledescription", "drawing cross");
		// From where the cross starts to 15 m below the beds' south-west corner.
		const frame = await mapAtTop(page);
		const box = (await cross.boundingBox())!;
		const start = { x: box.x + box.width / 2 - frame.x, y: box.y + box.height / 2 - frame.y };
		const east = (sw.x - start.x) / pixelsPerMetre;
		const south = (sw.y - start.y) / pixelsPerMetre + 15;
		await arrows(page, east >= 0 ? "ArrowRight" : "ArrowLeft", Math.abs(east));
		await arrows(page, south >= 0 ? "ArrowDown" : "ArrowUp", Math.abs(south));
		await page.keyboard.press("Space");
		await arrows(page, "ArrowRight", 20);
		await page.keyboard.press("Space");
		await arrows(page, "ArrowDown", 15);
		await page.keyboard.press("Space");
		await page.keyboard.press("Enter");
		await expect(page.locator(":focus")).toHaveAttribute("id", /zone-name$/);
		await page.keyboard.type(SHAPE);
		const drawn = zone(await saved(draft => zone(draft, SHAPE) !== undefined), SHAPE)!;
		expect(outer(drawn)).toHaveLength(4);
	});

	if (touch)
		await test.step("a point dragged by touch moves only that point", async () => {
			const before = outer(zone(await read(), RECTANGLE)!);
			await row(RECTANGLE).tap();
			await mapAtTop(page);
			// A handle the map's own controls do not cover.
			const handles = page.locator("[data-map-keys]");
			let from: { x: number; y: number } | null = null;
			for (let n = 0; n < (await handles.count()) && !from; n++) {
				const box = (await handles.nth(n).boundingBox())!;
				const x = box.x + box.width / 2;
				const y = box.y + box.height / 2;
				const name = await handles.nth(n).getAttribute("aria-label");
				const hit = await page.evaluate(
					({ x, y }) =>
						document.elementFromPoint(x, y)?.closest("[data-map-keys]")?.getAttribute("aria-label") ?? null,
					{ x, y }
				);
				if (hit === name && name?.includes(RECTANGLE)) from = { x, y };
			}
			expect(from, "a rectangle handle that can be touched").not.toBeNull();
			const client = await page.context().newCDPSession(page);
			await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from!] });
			for (let step = 1; step <= 8; step++)
				await client.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [{ x: from!.x + step * 2, y: from!.y + step }]
				});
			await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			const changed = (draft: { zones: Zone[] }) =>
				JSON.stringify(outer(zone(draft, RECTANGLE)!)) !== JSON.stringify(before);
			const after = outer(zone(await saved(changed), RECTANGLE)!);
			const moved = after.slice(0, 4).filter((position, index) => {
				const was = before[index]!;
				return position[0] !== was[0] || position[1] !== was[1];
			});
			expect(moved).toHaveLength(1);
		});

	await test.step("a point moved by keyboard into the lawn is an overlap DECA Mark finds", async () => {
		await row(beds).click();
		await row(beds).focus();
		await page.keyboard.press("Enter");
		await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^Point 1 of 4, ${beds}, `));
		for (let i = 0; i < 3; i++) await page.keyboard.press("]");
		await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^Point 4 of 4, ${beds}, `));
		// The lawn is about 8 m west of the beds; 12 m takes their north-west corner into it.
		await arrows(page, "ArrowLeft", 12);
		const { revision } = await saved(
			draft => JSON.stringify(zone(draft, beds)!.geometry) !== JSON.stringify(imported(FRESH.b))
		);
		await main.getByRole("button", { name: "Check boundaries", exact: true }).click();
		const problems = main.getByRole("region", { name: "Problems" });
		await expect(problems).toContainText(`Checked revision ${revision} at`, { timeout: 30_000 });
		await expect(problems).toContainText("overlap");
	});

	await test.step("Undo puts the point back exactly, and the check finds nothing", async () => {
		await main.getByRole("button", { name: "Undo", exact: true }).click();
		const { revision } = await saved(
			draft => JSON.stringify(zone(draft, beds)!.geometry) === JSON.stringify(imported(FRESH.b))
		);
		await main.getByRole("button", { name: "Check boundaries", exact: true }).click();
		const problems = main.getByRole("region", { name: "Problems" });
		await expect(problems).toContainText(`Checked revision ${revision} at`, { timeout: 30_000 });
		await expect(problems).not.toContainText("overlap");
	});

	await test.step("a reload loses nothing", async () => {
		const before = await read();
		await page.reload();
		await expect(main).toContainText(`· revision ${before.revision}`, { timeout: 30_000 });
		for (const label of [lawn, beds, RECTANGLE, SHAPE]) await expect(row(label)).toBeVisible();
		expect((await read()).zones).toEqual(before.zones);
		// The imported zones keep every number they came with.
		expect(zone(before, lawn)!.geometry).toEqual(imported(FRESH.a));
		expect(zone(before, beds)!.geometry).toEqual(imported(FRESH.b));
	});

	await test.step("the draft is reviewed and published as v2", async () => {
		const { revision } = await read();
		await main.getByRole("button", { name: "Review and publish" }).click();
		await expect(page).toHaveURL(/\/publish$/, { timeout: 30_000 });
		await expect(main.getByRole("region", { name: "Ready to publish?" })).toContainText(
			`Ready to publish: revision ${revision} has no problems.`,
			{ timeout: 30_000 }
		);
		await expect(main.getByRole("region", { name: "Changes" })).toContainText(RECTANGLE);
		await main.getByLabel("Change note").fill("Drew the rectangle and the shape");
		await expect(main.getByRole("region", { name: "Ready to publish?" })).toContainText(
			`Ready to publish: revision ${revision + 1} has no problems.`,
			{ timeout: 30_000 }
		);
		await main.getByText("I understand published boundaries cannot be edited.").click();
		await main.getByRole("button", { name: "Publish v2" }).click();
		await expect(page).toHaveURL(new RegExp(`${zonesHref}$`), { timeout: 30_000 });
		const zones = main.getByRole("region", { name: "Zones of v2" });
		for (const label of [lawn, beds, RECTANGLE, SHAPE]) await expect(zones).toContainText(label);
	});
});
