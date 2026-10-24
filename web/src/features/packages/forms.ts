import type { FormSummary, RawDefinition } from "@/lib/api/types";
import { readDefinition } from "@/lib/observations/answers";

/**
 * Which form version a new map package is prepared for. A package names one published form version: the
 * form observers collect with on that site. Only published versions are offered.
 */

export type PublishedVersion = {
	/** "workspace-check-v1". */
	code: string;
	/** The form this is a version of: "workspace-check". */
	formCode: string;
	formName: string;
	version: number;
	publishedAt: string | null;
};

/** Every published version of every form, the most recently published first. */
export function publishedVersions(forms: readonly FormSummary[]): PublishedVersion[] {
	return forms
		.flatMap(form =>
			form.versions
				.filter(version => version.state === "published")
				.map(version => ({
					code: version.code,
					formCode: form.code,
					formName: form.name,
					version: version.version,
					publishedAt: version.published_at ?? null
				}))
		)
		.sort(
			(a, b) =>
				(b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
				b.version - a.version ||
				a.code.localeCompare(b.code)
		);
}

/** The acts that describe a zone rather than a play event. */
const ZONE_ACTS = new Set(["Climate", "Inventory"]);
const SHARED_ACTS = new Set(["Record"]);

/**
 * Whether a form records a zone's inventory: it asks about the zone's climate or loose parts and nothing
 * about a play event. A package binds it as its inventory form, never as its play form.
 */
export function isInventoryDefinition(definition: RawDefinition | unknown): boolean {
	const acts = readDefinition(definition).questions.map(question => question.act ?? "");
	return acts.some(act => ZONE_ACTS.has(act)) && acts.every(act => ZONE_ACTS.has(act) || SHARED_ACTS.has(act));
}

/**
 * The newest published version of the same form as `code`, when it is newer than `code`; otherwise null:
 * `code` is the newest one, or it is not among the published versions. "Newest" is the highest version
 * number, whichever was published last.
 */
export function newerPublished(published: readonly PublishedVersion[], code: string): PublishedVersion | null {
	const at = published.find(version => version.code === code);
	if (!at) return null;
	return published
		.filter(version => version.formCode === at.formCode && version.version > at.version)
		.reduce<PublishedVersion | null>(
			(best, version) => (best === null || version.version > best.version ? version : best),
			null
		);
}

/**
 * The form version the upload starts on: the newest published version of the form the site's current
 * package names (a map names its form exactly, so the version it names is rarely the one to repeat);
 * when that form has no published version, the newest published form that is not an inventory form (or the
 * newest published, when every one is). `inventory` holds the codes known to be inventory forms. Null when
 * nothing is published.
 */
export function chooseFormVersion(
	published: readonly PublishedVersion[],
	currentFormVersion: string | null,
	inventory: ReadonlySet<string> = new Set()
): string | null {
	const start =
		published.find(version => version.code === currentFormVersion) ??
		published.find(version => !inventory.has(version.code)) ??
		published[0];
	return start ? (newerPublished(published, start.code) ?? start).code : null;
}

/**
 * The inventory form a site's first upload starts on: the most recently published form that asks only about
 * a zone, or null (Inventory off) when none is. Later uploads keep the current map's choice instead.
 */
export function chooseInventoryForm(
	published: readonly PublishedVersion[],
	inventory: ReadonlySet<string>
): string | null {
	return published.find(version => inventory.has(version.code))?.code ?? null;
}
