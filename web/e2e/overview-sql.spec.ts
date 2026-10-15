import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { manifest, projectPath } from "./support/manifest";
import { countPattern } from "./support/ui";

/**
 * WEB-11 Done when: "the overview matches SQL counts on the local stack". The counts come straight from
 * the local database (the container `pnpm db:start` runs), not from the seed's manifest or the API, so
 * the overview is held to what is stored. Local stack only.
 */

const DATABASE_CONTAINER = "supabase_db_field-maps";
const ROUNDS = ["standard", "reliability", "inventory"] as const;

/** Rows of `psql -At` for one query, as fields split on `|`. */
function sql(query: string): string[][] {
	const output = execFileSync(
		"docker",
		["exec", "-i", DATABASE_CONTAINER, "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-c", query],
		{ encoding: "utf8" }
	);
	return output
		.trim()
		.split("\n")
		.filter(line => line !== "")
		.map(line => line.split("|"));
}

/** A UUID read from the manifest, checked before it goes into a query. */
function uuid(value: string): string {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
		throw new Error(`Not a UUID: ${value}`);
	return value;
}

test.use({ storageState: authFile("manager") });

test("the overview's total and its coverage by zone and round equal the database's counts", async ({ page }) => {
	const project = uuid(manifest().projectId);
	const live = `project_id = '${project}' AND deleted_at IS NULL`;
	const [[totalText] = []] = sql(`SELECT count(*) FROM fieldmaps.observations WHERE ${live}`);
	const total = Number(totalText);
	expect(total, "observations stored for the project").toBeGreaterThan(0);
	const byZone = new Map<string, Record<(typeof ROUNDS)[number], number>>();
	for (const [zone = "", round = "", count = "0"] of sql(
		`SELECT zone_code, round_type, count(*) FROM fieldmaps.observations WHERE ${live} GROUP BY 1, 2`
	)) {
		const counts = byZone.get(zone) ?? { standard: 0, reliability: 0, inventory: 0 };
		counts[round as (typeof ROUNDS)[number]] = Number(count);
		byZone.set(zone, counts);
	}

	await page.goto(projectPath());
	const main = page.getByRole("main");
	await expect(main).toContainText(countPattern(total, "observation"));

	const coverage = page.getByRole("region", { name: /coverage/i }).first();
	await expect(coverage).toBeVisible();
	for (const [zone, counts] of byZone) {
		const row = coverage
			.getByRole("row")
			.filter({ hasText: new RegExp(`\\b${zone}\\b`) })
			.first();
		// The zone's row reads its count for each round type, in the order of the column heads.
		await expect(row).toContainText(new RegExp(ROUNDS.map(round => `\\b${counts[round]}\\b`).join("[^\\d]*")));
	}
});
