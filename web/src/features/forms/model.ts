import { boundFormVersions } from "@/lib/api/sites";
import type { FormSummary, Site, VersionState } from "@/lib/api/types";
import type { Condition, FormDefinition, Question } from "@/lib/forms";

import type { RawDefinition, RawQuestion } from "./raw";

/**
 * The Forms screens' reading of what the API holds: forms with their versions and the sites whose current
 * map package names each one, and the differences between a draft and the version before it. Plain
 * functions over plain data, so a server page can call them and a client screen can receive the result.
 */

/* ── Forms, versions and the sites that use them ──────────────────────────── */

/** A site, as the Forms screens name it. */
export type SiteRef = { readonly code: string; readonly name: string };

export type VersionRow = {
	readonly code: string;
	readonly etag: string;
	readonly version: number;
	readonly state: VersionState;
	readonly title: string | null;
	readonly questionCount: number;
	/** ISO time, or null for a version that is not published. */
	readonly publishedAt: string | null;
	readonly createdAt: string;
	/** The sites whose current map package was prepared with this version. */
	readonly sites: readonly SiteRef[];
	/**
	 * True for a version from before the form editor, which holds a field list rather than questions. The
	 * API counts no questions in it; it can be read, but not copied or changed.
	 */
	readonly legacy: boolean;
};

export type FormRow = {
	readonly code: string;
	readonly name: string;
	readonly createdAt: string;
	/** Newest first. */
	readonly versions: readonly VersionRow[];
	/** The newest published version. */
	readonly published: VersionRow | null;
	/** Every draft, newest first. Only a manager is sent any. */
	readonly drafts: readonly VersionRow[];
	/** The newest version in any state: the one "Start new draft" copies. */
	readonly newest: VersionRow | null;
	/** Every site whose current package uses any version of this form. */
	readonly sites: readonly SiteRef[];
};

/** The sites whose current map package binds this form version, as its play form or its inventory form. */
export function sitesUsing(code: string, sites: readonly Site[]): SiteRef[] {
	return sites
		.filter(site => site.package !== null && boundFormVersions(site.package.forms).includes(code))
		.map(site => ({ code: site.code, name: site.name }));
}

export function formRows(forms: readonly FormSummary[], sites: readonly Site[]): FormRow[] {
	return forms.map(form => {
		const versions = [...form.versions]
			.sort((a, b) => b.version - a.version)
			.map(
				(version): VersionRow => ({
					code: version.code,
					etag: version.etag,
					version: version.version,
					state: version.state,
					title: version.title,
					questionCount: version.question_count,
					publishedAt: version.published_at,
					createdAt: version.created_at,
					sites: sitesUsing(version.code, sites),
					legacy: version.question_count === 0
				})
			);
		const seen = new Set<string>();
		const used: SiteRef[] = [];
		for (const version of versions)
			for (const site of version.sites)
				if (!seen.has(site.code)) {
					seen.add(site.code);
					used.push(site);
				}
		return {
			code: form.code,
			name: form.name,
			createdAt: form.created_at,
			versions,
			published: versions.find(version => version.state === "published") ?? null,
			drafts: versions.filter(version => version.state === "draft"),
			newest: versions[0] ?? null,
			sites: used
		};
	});
}

/**
 * The version a draft or a published version is compared with: the nearest frozen (published or retired)
 * version before it in the same form. Null for the first version, and for one whose earlier version is
 * from before the form editor, which has no questions to compare.
 */
export function baseVersionOf(form: Pick<FormRow, "versions">, code: string): VersionRow | null {
	const at = form.versions.find(version => version.code === code);
	if (!at) return null;
	const base = form.versions.find(version => version.version < at.version && version.state !== "draft");
	return base && !base.legacy ? base : null;
}

/** The form a version code belongs to, by the version lists. */
export function formOfVersion<T extends Pick<FormRow, "versions">>(forms: readonly T[], code: string): T | undefined {
	return forms.find(form => form.versions.some(version => version.code === code));
}

/* ── What observers receive ───────────────────────────────────────────────── */

const ZONE_ACTS: ReadonlySet<string> = new Set(["Climate", "Inventory"]);
const SHARED_ACTS: ReadonlySet<string> = new Set(["Record"]);

/**
 * Whether the form asks only about a zone (its climate, the loose parts available) and nothing about a
 * play event: a form a map package can bind as its inventory form. Every other form is a play form. Either
 * way a site uses a form only when its current map package names it (contract "Package forms").
 */
export function isZoneForm(definition: Pick<RawDefinition, "questions">): boolean {
	const acts = definition.questions.map(question => question.act);
	return acts.some(act => ZONE_ACTS.has(act)) && acts.every(act => ZONE_ACTS.has(act) || SHARED_ACTS.has(act));
}

/* ── The definition as the collector's engine reads it ────────────────────── */

/**
 * The authored definition as the engine reads it, with the schema's defaults filled in. Lenient on purpose:
 * a label being retyped can be empty for a moment, and the collector view should keep running through it.
 */
export function toForm(raw: RawDefinition): FormDefinition {
	return {
		version: raw.version,
		title: raw.title,
		summary: raw.summary,
		source: raw.source,
		status: raw.status,
		inclusion: raw.inclusion,
		knownExportCollisions: raw.knownExportCollisions ?? [],
		protocolNotes: raw.protocolNotes ?? [],
		questions: raw.questions.map(
			(question): Question => ({
				...question,
				dependsOn: question.dependsOn as Condition | undefined,
				hint: question.hint ? question.hint : undefined,
				options: question.options ?? [],
				columns: question.columns ?? 1,
				required: question.required ?? false
			})
		)
	};
}

/** Questions that carry an unresolved note from the study, or are waiting for an option list. */
export function flaggedQuestions(raw: Pick<RawDefinition, "questions">): { id: string; label: string; note: string }[] {
	return raw.questions.flatMap(question => {
		const note = question.protocolFlag || question.optionsPending;
		return note ? [{ id: question.id, label: question.label, note }] : [];
	});
}

/* ── Changes against the version before ───────────────────────────────────── */

export type ChangeField = "Question label" | "Guidance" | "Required" | "Answer format" | "Options" | "New question";

export type QuestionChange = {
	readonly questionId: string;
	readonly field: ChangeField;
	readonly was: string;
	readonly now: string;
	/** "Required: yes · Single choice · options unchanged" */
	readonly detail: string;
};

/** Answer formats in the words the forms screens use. */
export const FORMAT_LABEL: Record<RawQuestion["kind"], string> = {
	one: "Single choice",
	many: "Several choices",
	text: "Free text",
	number: "Number"
};

function sameOptions(a: RawQuestion, b: RawQuestion): boolean {
	return JSON.stringify(a.options ?? []) === JSON.stringify(b.options ?? []);
}

/** A question's facts after the change, as the publication review states them. */
export function changeDetail(question: RawQuestion, base?: RawQuestion): string {
	const parts = [`Required: ${question.required ? "yes" : "no"}`, FORMAT_LABEL[question.kind]];
	if (question.kind === "one" || question.kind === "many") {
		if (question.dynamicFrom) parts.push("options follow an earlier answer");
		else parts.push(base && sameOptions(question, base) ? "options unchanged" : "options changed");
	} else if (question.kind === "text" && question.maxLength !== undefined) {
		parts.push(`up to ${question.maxLength} characters`);
	}
	return parts.join(" · ");
}

/** What changed on one question, field by field. An empty list means it is as the base has it. */
export function questionChanges(question: RawQuestion, base: RawQuestion | undefined): QuestionChange[] {
	const detail = changeDetail(question, base);
	if (!base) return [{ questionId: question.id, field: "New question", was: "", now: question.label, detail }];
	const changes: QuestionChange[] = [];
	const add = (field: ChangeField, was: string, now: string) =>
		changes.push({ questionId: question.id, field, was, now, detail });
	if (base.label !== question.label) add("Question label", base.label, question.label);
	if ((base.hint ?? "") !== (question.hint ?? ""))
		add("Guidance", base.hint || "No guidance", question.hint || "No guidance");
	if ((base.required ?? false) !== (question.required ?? false))
		add(
			"Required",
			base.required ? "Required when visible" : "Optional",
			question.required ? "Required when visible" : "Optional"
		);
	if (base.kind !== question.kind) add("Answer format", FORMAT_LABEL[base.kind], FORMAT_LABEL[question.kind]);
	if (!sameOptions(question, base))
		add(
			"Options",
			(base.options ?? []).map(option => option.label).join(", "),
			(question.options ?? []).map(option => option.label).join(", ")
		);
	return changes;
}

/** Every change in a draft against its base, in question order. A first version has no base: none. */
export function draftChanges(draft: RawDefinition, base: RawDefinition | undefined): QuestionChange[] {
	if (!base) return [];
	const old = new Map(base.questions.map(question => [question.id, question] as const));
	return draft.questions.flatMap(question => questionChanges(question, old.get(question.id)));
}

/** The ids of the questions that differ from the base. */
export function changedIds(draft: RawDefinition, base: RawDefinition | undefined): Set<string> {
	return new Set(draftChanges(draft, base).map(change => change.questionId));
}

/** Questions of the base that the draft no longer has. */
export function removedQuestions(draft: RawDefinition, base: RawDefinition | undefined): RawQuestion[] {
	if (!base) return [];
	const kept = new Set(draft.questions.map(question => question.id));
	return base.questions.filter(question => !kept.has(question.id));
}

/** Two digits, as the editor numbers questions: 01 … 12. */
export function questionNumber(index: number): string {
	return String(index + 1).padStart(2, "0");
}

/** Whether two definitions are the same as stored: key order does not matter, nothing else does. */
export function sameDefinition(a: unknown, b: unknown): boolean {
	return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, entry: unknown) => {
		if (entry && typeof entry === "object" && !Array.isArray(entry)) {
			return Object.fromEntries(Object.entries(entry).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
		}
		return entry;
	});
}

/* ── What publishing does for observers ───────────────────────────────────── */

export type Delivery = {
	readonly kind: "play" | "zone";
	/** What happens after publishing, for the page. */
	readonly text: string;
	/** The confirmation the manager ticks. */
	readonly confirm: string;
};

/**
 * How observers come to collect with a published version, as the collector does it
 * (`mobile/src/packages/hosted/prepare.ts`). A form reaches a device only through a site's map package,
 * which names its play form and its inventory form exactly; publishing a new version changes nothing for a
 * site until a package that names it is prepared and observers download the site again.
 */
export function deliveryOf(definition: Pick<RawDefinition, "questions">, code: string): Delivery {
	if (isZoneForm(definition))
		return {
			kind: "zone",
			text: `${code} asks only about a zone, so a map package can name it as the form for the Inventory round. Observers collect with it only through a map package that names it. A site keeps the inventory form its current map package names until you prepare a new package with ${code} and observers download the site again in the app.`,
			confirm: `I understand that ${code} cannot be edited once it is published, and that observers get it only through a new map package.`
		};
	return {
		kind: "play",
		text: `Observers collect with ${code} only through a map package that names it. A site keeps the version its current map package names until you prepare a new package with ${code} and observers download the site again in the app.`,
		confirm: `I understand that ${code} cannot be edited once it is published, and that observers get it only through a new map package.`
	};
}
