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
	readonly package: { readonly package_version: number } | null;
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

/**
 * What stands between the project and a working field setup, most basic first: no site; a site without a
 * ready map package; a newest map package that was blocked (with its first blocked check); no published
 * form; a draft that observers cannot see yet.
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
		for (const form of forms)
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
