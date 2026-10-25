import type { ActivityKind } from "@/lib/observations/summary";

/**
 * Overview's decisions, apart from the screens: which site's coverage to show, and what needs a
 * manager's attention. Pure, so the tests load it directly.
 */

/* ── Coverage ─────────────────────────────────────────────────────────────── */

type SiteWithPackage = {
	readonly code: string;
	readonly observation_count: number;
	readonly package: unknown;
};

/**
 * The site whose coverage the overview shows, among sites with a current map package (coverage reads the
 * zones of that package). The one asked for with `?site=`, otherwise the first site that has observations,
 * otherwise the first. Null when no site has a package.
 */
export function pickCoverageSite<S extends SiteWithPackage>(sites: readonly S[], requested?: string): S | null {
	const withPackage = sites.filter(site => site.package !== null && site.package !== undefined);
	return (
		withPackage.find(site => site.code === requested) ??
		withPackage.find(site => site.observation_count > 0) ??
		withPackage[0] ??
		null
	);
}

/* ── Needs attention ──────────────────────────────────────────────────────── */

export type AttentionItem = {
	readonly id: string;
	readonly tone: "attention" | "waiting";
	readonly title: string;
	readonly detail: string;
	/** Where to fix it. Only managers get one. */
	readonly action?: { readonly label: string; readonly href: string };
};

type AttentionSite = {
	readonly code: string;
	readonly name: string;
	readonly package: {
		readonly package_version: number;
		/** The form versions the map names: its play form, and its inventory form or none. */
		readonly forms: {
			readonly play: { readonly form_version: string };
			readonly inventory: { readonly form_version: string } | null;
		};
	} | null;
};

type AttentionPackage = {
	readonly package_id: string;
	readonly site_code: string;
	readonly package_version: number;
	readonly state: "ready" | "blocked";
};

type AttentionForm = {
	readonly code: string;
	readonly name: string;
	readonly versions: readonly {
		readonly code: string;
		readonly version: number;
		readonly state: "draft" | "published" | "retired";
	}[];
};

/** "Site A", "Site A and Site B", "A, B and C": names inside a sentence. */
function names(items: readonly string[]): string {
	if (items.length < 2) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** How many sites an attention item names before it says "and 4 more". */
const SITES_NAMED = 3;

/**
 * Where a published form has moved on without the sites. A map package names its forms exactly, so
 * publishing a newer version of a form changes nothing for a site until a package that names it is
 * uploaded. Null when no site's map names an older version than the newest published one; otherwise that
 * version, the sites that name it, and each older version a site's map still names.
 */
function formBehind(form: AttentionForm, sites: readonly AttentionSite[]) {
	let newest: AttentionForm["versions"][number] | null = null;
	for (const version of form.versions)
		if (version.state === "published" && (newest === null || version.version > newest.version)) newest = version;
	if (newest === null) return null;
	const versionOf = new Map(form.versions.map(version => [version.code, version.version] as const));
	const named: AttentionSite[] = [];
	const behind: { site: AttentionSite; version: number }[] = [];
	for (const site of sites) {
		if (site.package === null) continue;
		const { play, inventory } = site.package.forms;
		for (const code of new Set([play.form_version, inventory?.form_version])) {
			const version = code === undefined ? undefined : versionOf.get(code);
			if (version === undefined) continue;
			if (version === newest.version) named.push(site);
			else if (version < newest.version) behind.push({ site, version });
		}
	}
	return behind.length === 0 ? null : { newest, named, behind };
}

/**
 * What stands between the project and a working field setup, most basic first: no site; a site without a
 * ready map package; a newest map package that was blocked (with its first blocked check); no published
 * form; for each form, a published version that no map names yet while a map still names an older one,
 * then its drafts, which observers cannot see yet.
 *
 * `packages` and `forms` are null when they could not be read; the item they would raise is then left
 * out and the page says the check did not run. `blocked` maps a package id to the detail of its first
 * blocked check. `base` is the project's address; without `manage` there are no links.
 */
export function attentionItems(input: {
	readonly sites: readonly AttentionSite[];
	readonly packages: readonly AttentionPackage[] | null;
	readonly blocked: Readonly<Record<string, string | null>>;
	readonly forms: readonly AttentionForm[] | null;
	readonly base: string;
	readonly manage: boolean;
}): AttentionItem[] {
	const { sites, packages, blocked, forms, base, manage } = input;
	const link = (label: string, href: string) => (manage ? { action: { label, href } } : {});
	const items: AttentionItem[] = [];

	if (sites.length === 0)
		items.push({
			id: "no-site",
			tone: "attention",
			title: "This project has no sites yet.",
			detail: "A site is a place where observers collect. Add one, then upload its map package from QGIS.",
			...link("Add a site", `${base}/sites`)
		});

	for (const site of sites) {
		const newest = (packages ?? [])
			.filter(entry => entry.site_code === site.code)
			.reduce<AttentionPackage | null>(
				(best, entry) => (best === null || entry.package_version > best.package_version ? entry : best),
				null
			);

		if (newest?.state === "blocked") {
			const reason = blocked[newest.package_id];
			const why = reason ? (/[.!?]$/.test(reason) ? `${reason} ` : `${reason}. `) : "";
			const current = site.package
				? `Observers still get v${site.package.package_version}.`
				: "There is no ready map package for this site.";
			items.push({
				id: `blocked-${newest.package_id}`,
				tone: "attention",
				title: `Map package v${newest.package_version} for ${site.name} was blocked.`,
				detail: `${why}${current}`,
				...link("See the checks", `${base}/sites/${site.code}/packages?package=${newest.package_id}`)
			});
		} else if (site.package === null) {
			items.push({
				id: `no-package-${site.code}`,
				tone: "attention",
				title: `${site.name} has no ready map package.`,
				detail: "Observers have no map to download for this site.",
				...link("Upload a map package", `${base}/sites/${site.code}/packages?step=upload`)
			});
		}
	}

	if (forms !== null) {
		const published = forms.some(form => form.versions.some(version => version.state === "published"));
		if (!published)
			items.push({
				id: "no-form",
				tone: "attention",
				title: "No form is published.",
				detail: "Observers need a published form to record observations.",
				...link("Open forms", `${base}/forms`)
			});
		for (const form of forms) {
			const lagging = formBehind(form, sites);
			if (lagging) {
				const { newest, named, behind } = lagging;
				const only = new Set(behind.map(entry => entry.site.code)).size === 1 ? behind[0]!.site : null;
				const where = behind.map(entry => `v${entry.version} at ${entry.site.name}`);
				const shown =
					where.length > SITES_NAMED
						? [...where.slice(0, SITES_NAMED), `${where.length - SITES_NAMED} more`]
						: where;
				items.push({
					id: `form-behind-${form.code}`,
					tone: "waiting",
					title: `${form.name} v${newest.version} is published, but ${named.length === 0 ? "no site's map names it" : "not every site's map names it"}.`,
					detail: `Observers still get ${names(shown)}. A site changes forms only when you upload a map package that names v${newest.version}.`,
					...(only
						? link("Upload a map package", `${base}/sites/${only.code}/packages?step=upload`)
						: link("Open sites", `${base}/sites`))
				});
			}
			for (const version of form.versions)
				if (version.state === "draft")
					items.push({
						id: `draft-${version.code}`,
						tone: "waiting",
						title: `${form.name} has an unpublished draft, v${version.version}.`,
						detail: "Observers do not see it until it is published.",
						...link("Open the draft", `${base}/forms/versions/${version.code}`)
					});
		}
	}

	return items;
}

/* ── Activity ─────────────────────────────────────────────────────────────── */

/** The ring colour of an activity entry. The sentence carries the meaning. */
export function activityTone(
	kind: ActivityKind,
	state?: "ready" | "blocked"
): "uploaded" | "saved" | "attention" | "held" | "ink" {
	switch (kind) {
		case "observations":
			return "uploaded";
		case "package":
			return state === "blocked" ? "attention" : "saved";
		case "form-published":
			return "saved";
		case "form-draft":
			return "held";
		default:
			return "ink";
	}
}
