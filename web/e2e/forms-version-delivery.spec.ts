import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { FRESH, signInToZones, ZONE_MANIFEST, zoneApi, type ZoneCall, zoneFixture } from "./support/zones";

/**
 * Plan WEB-47 (audit C11, UXW-2): a map package names its forms exactly, so with v1 bound by a site's map
 * and v2 published, observers still get v1. The Forms row names the site with v1, Overview lists a waiting
 * item instead of "Nothing needs attention", and the upload step starts on v2 and says so when v1 is
 * chosen. Runs on a synthetic project this spec makes in the zone review fixture's organization
 * (`scripts/e2e-local.sh --zones`), so the state never depends on what other specs published. Projects
 * cannot be deleted, so every run leaves one.
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const FORM = { code: "delivery-check", name: "Delivery check" } as const;
const SITE = { code: "site-a", name: "Site A" } as const;

type Version = { code: string; version: number; state: string; etag: string };
type Definition = { version: string; status: string; questions: { label: string }[] };
type Site = { site_id: string; current_package_id: string | null; zones: { zone_id: string }[] };

/** A project with one site whose map names v1 of the form, then v2 published. Returns the project's path. */
async function projectWithNewerForm(): Promise<{ path: string; base: string; manager: ZoneCall; site: Site }> {
	const fixture = zoneFixture();
	const slug = /^\/o\/([^/]+)\//.exec(fixture.path)?.[1];
	if (!slug) throw new Error(`Unexpected zone fixture path: ${fixture.path}`);
	const owner = await zoneApi("owner");
	const manager = await zoneApi("manager");
	const tag = randomUUID().slice(0, 8);
	const code = `delivery-${tag}`;

	const org = (await owner<{ id: string; slug: string }[]>("GET", "/v1/orgs")).find(item => item.slug === slug);
	if (!org) throw new Error(`The zone fixture's organization ${slug} is not on this stack.`);
	const project = await owner<{ project_id: string }>("POST", `/v1/orgs/${org.id}/projects`, {
		name: `Version delivery ${tag}`,
		code,
		timezone: "America/New_York"
	});
	const base = `/v1/projects/${project.project_id}`;
	const invitation = await owner<{ token: string }>("POST", `${base}/invitations`, {
		role: "manager",
		email: fixture.accounts.manager!.email
	});
	await manager("POST", "/v1/invitations/redeem", { token: invitation.token });

	// The form is a copy of the fixture's play form, so its definition is whatever the API accepts today.
	const source = await manager<{ definition: Definition }>(
		"GET",
		`/v1/projects/${fixture.projectId}/form-versions/zone-review-play-v1`
	);
	await manager("POST", `${base}/forms`, {
		code: FORM.code,
		name: FORM.name,
		definition: { ...source.definition, version: `${FORM.code}-v1`, status: "draft" }
	});
	const v1 = await manager<Version>("GET", `${base}/form-versions/${FORM.code}-v1`);
	await manager("POST", `${base}/form-versions/${FORM.code}-v1/publish`, undefined, v1.etag);

	const site = await manager<Site>("POST", `${base}/sites`, SITE);
	await manager("POST", `${base}/packages`, {
		site_id: site.site_id,
		request_id: randomUUID(),
		expected_current_package_id: null,
		form_version: `${FORM.code}-v1`,
		change_note: "Synthetic first map; local acceptance only",
		zone_identity_map: [{ source_feature_id: "A", zone_id: randomUUID(), zone_code: "A" }],
		layers: {
			ground: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: { kind: "site" },
						geometry: { type: "Polygon", coordinates: [FRESH.site] }
					}
				]
			},
			zones: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: { id: "A", name: "Synthetic delivery lawn" },
						geometry: { type: "Polygon", coordinates: [FRESH.a] }
					}
				]
			}
		}
	});

	// v2: a new draft with a reworded question, published. The site's map still names v1.
	const draft = await manager<{ code: string }>("POST", `${base}/forms/${FORM.code}/versions`, {});
	const full = await manager<{ etag: string; definition: Definition }>("GET", `${base}/form-versions/${draft.code}`);
	const definition = structuredClone(full.definition);
	definition.questions[0]!.label = "Synthetic test note (corrected wording)";
	await manager("PUT", `${base}/form-versions/${draft.code}`, { definition }, full.etag);
	const saved = await manager<Version>("GET", `${base}/form-versions/${draft.code}`);
	await manager("POST", `${base}/form-versions/${draft.code}/publish`, undefined, saved.etag);
	expect(draft.code).toBe(`${FORM.code}-v2`);

	const current = (await manager<Site[]>("GET", `${base}/sites`)).find(item => item.site_id === site.site_id)!;
	return { path: `/o/${slug}/p/${code}`, base, manager, site: current };
}

test("Forms, Overview and the upload step say a site is on v1 when v2 is published", async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const { path, base, manager, site } = await projectWithNewerForm();
	await signInToZones(page, "manager");
	const main = page.getByRole("main");
	const shot = async (name: string) =>
		testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

	await test.step("Forms: the row names Site A with v1 next to the published v2", async () => {
		await page.goto(`${path}/forms`);
		const row = main.getByRole("listitem").filter({ has: page.getByRole("heading", { name: FORM.name }) });
		await expect(row).toContainText(`${FORM.code}-v2`);
		await expect(row.getByRole("listitem").filter({ hasText: SITE.name })).toHaveText(
			new RegExp(`^${SITE.name}\\s*·\\s*v1$`)
		);
		await shot("forms-v1-bound");
	});

	await test.step("Overview: a waiting item replaces 'Nothing needs attention' and links to the upload step", async () => {
		await page.goto(path);
		const attention = page.getByRole("region", { name: "Needs attention" });
		await expect(attention).toContainText(`${FORM.name} v2 is published, but no site's map names it.`);
		await expect(attention).toContainText(`Observers still get v1 at ${SITE.name}.`);
		await expect(attention).not.toContainText("Nothing needs attention");
		await shot("overview-v1-bound");
		await attention.getByRole("link", { name: "Upload a map package", exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/sites/${SITE.code}/packages\\?(.*&)?step=upload`));
	});

	await test.step("Upload step: starts on v2, and says so when v1 is chosen", async () => {
		const version = page.getByLabel("Form version", { exact: true });
		await expect(version).toHaveValue(`${FORM.code}-v2`);
		await expect(main).not.toContainText("A newer version is published");
		await version.selectOption(`${FORM.code}-v1`);
		await expect(main).toContainText(`A newer version is published: ${FORM.code}-v2.`);
		await shot("upload-v1-chosen");
		await version.selectOption(`${FORM.code}-v2`);
		await expect(main).not.toContainText("A newer version is published");
	});

	await test.step("A map that names v2 clears the item and the row names v2", async () => {
		await manager("POST", `${base}/packages`, {
			site_id: site.site_id,
			request_id: randomUUID(),
			expected_current_package_id: site.current_package_id,
			form_version: `${FORM.code}-v2`,
			change_note: "Synthetic second map; local acceptance only",
			zone_identity_map: [{ source_feature_id: "A", zone_id: site.zones[0]!.zone_id, zone_code: "A" }],
			layers: {
				ground: {
					type: "FeatureCollection",
					features: [
						{
							type: "Feature",
							properties: { kind: "site" },
							geometry: { type: "Polygon", coordinates: [FRESH.site] }
						}
					]
				},
				zones: {
					type: "FeatureCollection",
					features: [
						{
							type: "Feature",
							properties: { id: "A", name: "Synthetic delivery lawn" },
							geometry: { type: "Polygon", coordinates: [FRESH.a] }
						}
					]
				}
			}
		});
		await page.goto(path);
		const attention = page.getByRole("region", { name: "Needs attention" });
		await expect(attention).toContainText("Nothing needs attention.");
		await expect(attention).not.toContainText("is published, but");
		await page.goto(`${path}/forms`);
		const row = main.getByRole("listitem").filter({ has: page.getByRole("heading", { name: FORM.name }) });
		await expect(row.getByRole("listitem").filter({ hasText: SITE.name })).toHaveText(
			new RegExp(`^${SITE.name}\\s*·\\s*v2$`)
		);
		await shot("forms-v2-bound");
	});
});
