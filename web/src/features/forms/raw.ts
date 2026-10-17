import type { z } from "zod";

import type { formDefinitionSchema, optionSchema, questionSchema } from "@/lib/forms";

/**
 * The form editor works on the definition as authored: the shape `contracts/forms/*.json` holds and the API
 * stores, rather than the parsed shape. A saved draft then differs from its source only where a person
 * changed something. Every edit is a pure function that returns a new definition; checking happens on the
 * result, never inside the edit, so a definition can pass through an invalid state while someone types.
 */

export type RawDefinition = z.input<typeof formDefinitionSchema>;
export type RawQuestion = z.input<typeof questionSchema>;
export type RawOption = z.input<typeof optionSchema>;
export type QuestionKind = RawQuestion["kind"];
export type Act = RawQuestion["act"];

/* ── Identifiers ──────────────────────────────────────────────────────────── */

/** A stable identifier from a label. Codes are what records store, so they never follow a relabel. */
export function slugify(label: string): string {
	const slug = label
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 40);
	return slug === "" ? "item" : slug;
}

/** `base`, or `base_2`, `base_3` … the first that is not taken. */
export function unique(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/* ── Questions ────────────────────────────────────────────────────────────── */

/** Sets or clears fields. `undefined` removes an optional key so the stored file stays as authored. */
export function updateQuestion(raw: RawDefinition, id: string, patch: Partial<RawQuestion>): RawDefinition {
	return {
		...raw,
		questions: raw.questions.map(question => {
			if (question.id !== id) return question;
			const next: Record<string, unknown> = { ...question };
			for (const [key, value] of Object.entries(patch)) {
				if (value === undefined) delete next[key];
				else next[key] = value;
			}
			return next as RawQuestion;
		})
	};
}

export function removeQuestion(raw: RawDefinition, id: string): RawDefinition {
	return { ...raw, questions: raw.questions.filter(question => question.id !== id) };
}

/** Most questions a manager adds mid-study are yes/no; every other list starts from these two. */
export const STARTER_OPTIONS: readonly RawOption[] = [
	{ code: "yes", label: "Yes" },
	{ code: "no", label: "No" }
];

export const ACT_ORDER: readonly Act[] = ["Child", "Social", "Play", "Setting", "Climate", "Inventory", "Record"];

/** Where a question added in the editor says it came from. It has no workbook row and no analysis column. */
export const ADDED_SOURCE = "Added in DECA Mark — no workbook row";

/**
 * A new question after the last one of its act (or after the last act that comes before it). It has no
 * analysis column: the editor never invents a column name the research team has not agreed.
 */
export function addQuestion(
	raw: RawDefinition,
	act: Act,
	kind: QuestionKind,
	label: string
): { readonly raw: RawDefinition; readonly id: string } {
	const taken = new Set(raw.questions.map(question => question.id));
	const id = unique(slugify(label), taken);
	const question: RawQuestion = {
		id,
		code: id,
		exportColumn: "",
		act,
		label,
		kind,
		...(kind === "one" || kind === "many" ? { options: [...STARTER_OPTIONS], columns: 2 } : {}),
		...(kind === "text" ? { maxLength: 200 } : {}),
		source: ADDED_SOURCE
	};
	let at = -1;
	raw.questions.forEach((candidate, index) => {
		if (candidate.act === act) at = index;
	});
	if (at < 0) {
		const order = ACT_ORDER.indexOf(act);
		at = raw.questions.findLastIndex(candidate => ACT_ORDER.indexOf(candidate.act) <= order);
	}
	const questions = [...raw.questions];
	questions.splice(at + 1, 0, question);
	return { raw: { ...raw, questions }, id };
}
