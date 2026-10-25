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

/** Which form each version belongs to, for every version whatever its state: a map may name a retired one. */
export type FormVersionIndex = ReadonlyMap<string, { formCode: string; version: number }>;

export function formVersionIndex(forms: readonly FormSummary[]): FormVersionIndex {
	return new Map(
		forms.flatMap(form =>
			form.versions.map(version => [version.code, { formCode: form.code, version: version.version }])
		)
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

/** The form and number of `code`: from the published versions, or from `index` when `code` is retired. */
function locate(published: readonly PublishedVersion[], code: string, index?: FormVersionIndex) {
	return published.find(version => version.code === code) ?? index?.get(code);
}

/** The highest-numbered published version of a form, whichever was published last; null when none is. */
function newestOf(published: readonly PublishedVersion[], formCode: string, above = 0): PublishedVersion | null {
	return published
		.filter(version => version.formCode === formCode && version.version > above)
		.reduce<PublishedVersion | null>(
			(best, version) => (best === null || version.version > best.version ? version : best),
			null
		);
}

/**
 * The newest published version of the same form as `code`, when it is newer than `code`; otherwise null:
 * `code` is the newest one, or its form is unknown. Pass `index` so a retired `code` still finds its form.
 * "Newest" is the highest version number, whichever was published last.
 */
export function newerPublished(
	published: readonly PublishedVersion[],
	code: string,
	index?: FormVersionIndex
): PublishedVersion | null {
	const at = locate(published, code, index);
	return at ? newestOf(published, at.formCode, at.version) : null;
}

/**
 * The form version the upload starts on: the newest published version of the form the site's current
 * package names, even when the version it names is retired (pass `index`), because a map names its form
 * exactly and the version it names is rarely the one to repeat; when that form has no published version, the newest published form that is not an inventory form (or the
 * newest published, when every one is). `inventory` holds the codes known to be inventory forms. Null when
 * nothing is published.
 */
export function chooseFormVersion(
	published: readonly PublishedVersion[],
	currentFormVersion: string | null,
	inventory: ReadonlySet<string> = new Set(),
	index?: FormVersionIndex
): string | null {
	const current = currentFormVersion === null ? undefined : locate(published, currentFormVersion, index);
	const ownForm = current ? newestOf(published, current.formCode) : null;
	if (ownForm) return ownForm.code;
	const start = published.find(version => !inventory.has(version.code)) ?? published[0];
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
