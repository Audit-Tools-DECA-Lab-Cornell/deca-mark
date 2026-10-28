"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createDraft, createForm, discardDraft, publishVersion, retireVersion, saveDraft } from "@/lib/api/mutations";
import type { VersionState } from "@/lib/api/types";
import { getFormVersion, resolveProject } from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";

import { failedChange, type FormActionFailure, type FormActionResult } from "./result";
import { FORM_CODE_PATTERN, isTemplateId, NAME_LIMIT, type TemplateId } from "./starter";
import { templateDefinition } from "./templates";

/**
 * Form changes. Each action finds the project from its web address, stops a person who is not a manager
 * before anything is sent (the API refuses them too), makes one change and refreshes the project's pages.
 * A failure says what did not happen and why; nothing here turns an API failure into success.
 */

const place = { org: z.string().min(1).max(200), project: z.string().min(1).max(200) };
const versionCode = z.string().min(1).max(100);
const definition = z.record(z.string(), z.unknown());

const NOT_MANAGER = "Only project managers can change forms.";

/** Runs `work` for the project at this address, for a manager only, and refreshes the project's pages. */
async function asManager<T extends object>(
	org: string,
	project: string,
	nothing: string,
	work: (projectId: string) => Promise<T>
): Promise<FormActionResult<T>> {
	try {
		const ref = await resolveProject(org, project);
		if (!ref) return { status: "failed", message: `${nothing} This project is no longer there.` };
		if (!projectAbilities(ref.role).manage) return { status: "failed", message: `${nothing} ${NOT_MANAGER}` };
		const done = await work(ref.id);
		revalidatePath(`/o/${org}/p/${project}`, "layout");
		return { status: "done", ...done };
	} catch (error) {
		// Anything that is not a DECA Mark or network failure is rethrown there.
		return failedChange(nothing, error);
	}
}

function refused(nothing: string): FormActionFailure {
	return { status: "failed", message: `${nothing} The request was not understood. Reload the page and try again.` };
}

/* ── New form ─────────────────────────────────────────────────────────────── */

const newFormInput = z.object({
	...place,
	template: z.custom<TemplateId>(isTemplateId),
	code: z.string().regex(FORM_CODE_PATTERN),
	name: z.string().trim().min(1).max(NAME_LIMIT)
});

/** A new form from a template; the answer is its first draft, which the screen opens. */
export async function createFormAction(
	input: z.input<typeof newFormInput>
): Promise<FormActionResult<{ version: string }>> {
	const nothing = "Nothing was created.";
	const parsed = newFormInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, template, code, name } = parsed.data;
	const result = await asManager(org, project, nothing, async projectId => {
		const draft = await createForm(projectId, { code, name, definition: templateDefinition(template, code, name) });
		return { version: draft.code };
	});
	// A code already in use is the one conflict a new form can meet: say so next to the code.
	if (result.status === "failed" && result.conflict)
		return {
			status: "failed",
			message: `${nothing} This project already has a form with the code ${code}.`,
			fields: { code: "This project already has a form with this code." }
		};
	return result;
}

/* ── Versions ─────────────────────────────────────────────────────────────── */

const startDraftInput = z.object({
	...place,
	form: z.string().min(1).max(100),
	/** Copy this version instead of the form's newest. */
	from: versionCode.optional()
});

/** The form's next version as a draft: a copy of its newest version, or of `from`. */
export async function startDraftAction(
	input: z.input<typeof startDraftInput>
): Promise<FormActionResult<{ version: string }>> {
	const nothing = "Nothing was started.";
	const parsed = startDraftInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, form, from } = parsed.data;
	return asManager(org, project, nothing, async projectId => {
		const source = from ? (await getFormVersion(projectId, from)).definition : undefined;
		const draft = await createDraft(projectId, form, source);
		return { version: draft.code };
	});
}

const conditionalVersionInput = z.object({ ...place, version: versionCode, etag: z.string().min(1).max(200) });
const saveDraftInput = conditionalVersionInput.extend({ definition });

/** Replaces the draft's definition with the editor's. A refused definition comes back with its problems. */
export async function saveDraftAction(
	input: z.input<typeof saveDraftInput>
): Promise<FormActionResult<{ etag: string; revision: number }>> {
	const nothing = "Nothing was saved.";
	const parsed = saveDraftInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, version, etag, definition: body } = parsed.data;
	return asManager(org, project, nothing, async projectId => {
		const saved = await saveDraft(projectId, version, body, etag);
		return { etag: saved.etag, revision: saved.revision };
	});
}

const versionInput = z.object({ ...place, version: versionCode });

export async function discardDraftAction(input: z.input<typeof conditionalVersionInput>): Promise<FormActionResult> {
	const nothing = "Nothing was discarded.";
	const parsed = conditionalVersionInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, version, etag } = parsed.data;
	return asManager(org, project, nothing, async projectId => {
		await discardDraft(projectId, version, etag);
		return {};
	});
}

export async function publishVersionAction(input: z.input<typeof conditionalVersionInput>): Promise<FormActionResult> {
	const nothing = "Nothing was published.";
	const parsed = conditionalVersionInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, version, etag } = parsed.data;
	return asManager(org, project, nothing, async projectId => {
		await publishVersion(projectId, version, etag);
		return {};
	});
}

export async function retireVersionAction(input: z.input<typeof versionInput>): Promise<FormActionResult> {
	const nothing = "Nothing was retired.";
	const parsed = versionInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, version } = parsed.data;
	return asManager(org, project, nothing, async projectId => {
		await retireVersion(projectId, version);
		return {};
	});
}

const readDraftInput = z.object({ ...place, version: versionCode });

/**
 * The draft as it is stored now. The editor asks when a Save met a refusal after an earlier Save whose
 * reply never arrived: only the stored content can say whether that earlier Save landed. It changes
 * nothing, so it does not refresh the project's pages under the editor.
 */
export async function readDraftAction(
	input: z.input<typeof readDraftInput>
): Promise<FormActionResult<{ etag: string; state: VersionState; definition: Record<string, unknown> }>> {
	const nothing = "The draft could not be read.";
	const parsed = readDraftInput.safeParse(input);
	if (!parsed.success) return refused(nothing);
	const { org, project, version } = parsed.data;
	try {
		const ref = await resolveProject(org, project);
		if (!ref) return { status: "failed", message: `${nothing} This project is no longer there.` };
		if (!projectAbilities(ref.role).manage) return { status: "failed", message: `${nothing} ${NOT_MANAGER}` };
		const stored = await getFormVersion(ref.id, version);
		return { status: "done", etag: stored.etag, state: stored.state, definition: stored.definition };
	} catch (error) {
		return failedChange(nothing, error);
	}
}
