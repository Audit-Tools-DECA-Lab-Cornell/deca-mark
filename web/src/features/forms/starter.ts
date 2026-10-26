import { questionIdColumns } from "./operations";
import { ADDED_SOURCE, type RawDefinition } from "./raw";

/**
 * Starting a form: the code and name a manager types, and the definition the form begins with. The API
 * stamps the first version's code and "draft" state itself; they are set here too so the definition is
 * complete as it is sent.
 */

export type TemplateId = "behaviour-mapping" | "zone-inventory" | "blank";

/** What a template offers on screen: its name, what it asks and how many questions it holds. */
export type TemplateInfo = {
	readonly id: TemplateId;
	readonly title: string;
	readonly description: string;
	readonly questions: number;
};

export const TEMPLATE_IDS: readonly TemplateId[] = ["behaviour-mapping", "zone-inventory", "blank"];

export function isTemplateId(value: unknown): value is TemplateId {
	return typeof value === "string" && (TEMPLATE_IDS as readonly string[]).includes(value);
}

/** A form code is also part of every version code (`code-v1`): the API accepts 3 to 40 of these. */
export const FORM_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const FORM_CODE_HINT =
	"Use a unique code for this form within the project. For example, play-study becomes play-study-v1 for its first version.";
export const NAME_LIMIT = 100;

/** A code from a name: lower case, letters and numbers, dashes between words. */
export function codeFromName(name: string): string {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
}

/** Why a code cannot be used, or null. `taken` are the codes the project's forms already have. */
export function formCodeProblem(code: string, taken: Iterable<string>): string | null {
	if (code === "") return "Enter a code for the form.";
	if (!FORM_CODE_PATTERN.test(code))
		return "Use 3 to 40 lowercase letters, numbers and dashes. Start and end with a letter or number.";
	for (const other of taken) if (other === code) return "This project already has a form with this code.";
	return null;
}

export function formNameProblem(name: string): string | null {
	const trimmed = name.trim();
	if (trimmed === "") return "Enter a name for the form.";
	if (trimmed.length > NAME_LIMIT) return `Use ${NAME_LIMIT} characters or fewer.`;
	return null;
}

/** The question a blank form starts with: free text, in the Record act, ready to reword. */
export function blankDefinition(code: string, name: string): RawDefinition {
	return {
		version: `${code}-v1`,
		columnNaming: "questionId",
		title: name,
		summary: "Questions observers answer at each observation.",
		source: "Written in DECA Mark",
		status: "draft",
		inclusion: "Every question on this form is asked at each observation.",
		knownExportCollisions: [],
		protocolNotes: [],
		questions: [
			{
				id: "notes",
				code: "notes",
				exportColumn: "notes",
				act: "Record",
				label: "Notes",
				hint: "Anything about this observation that the other questions do not cover",
				kind: "text",
				maxLength: 200,
				source: ADDED_SOURCE
			}
		]
	};
}

/** A shipped form as the first draft of a new form: named for the form, versioned `code-v1`. */
export function startingDefinition(template: RawDefinition, code: string, name: string): RawDefinition {
	return questionIdColumns({ ...template, version: `${code}-v1`, title: name, status: "draft" });
}
