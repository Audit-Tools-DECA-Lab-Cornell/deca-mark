"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { Textarea } from "@/components/contour/Textarea";
import { TextInput } from "@/components/contour/TextInput";
import { useToast } from "@/components/contour/Toast";
import { projectHref } from "@/features/shell/navigation";
import { rejectedWith } from "@/lib/action-rejection";
import { UNCONFIRMED_CHANGE_COPY } from "@/lib/api/errors";

import { createSiteAction, type SiteField } from "./actions";
import {
	SITE_CODE_MAX,
	SITE_DESCRIPTION_MAX,
	SITE_NAME_MAX,
	siteCodeFrom,
	siteCodeProblem,
	siteDescriptionProblem,
	siteNameProblem
} from "./code";

type Problems = Partial<Record<SiteField, string>>;

/**
 * Create site (managers): a name, a code that follows the name until it is edited, and an optional
 * description. The new site has no map package; its map and zones arrive with the first upload.
 */
export function CreateSiteDialog({ org, project, canManage }: { org: string; project: string; canManage: boolean }) {
	const router = useRouter();
	const toast = useToast();
	const ids = useId();
	const nameId = `${ids}-name`;
	const codeId = `${ids}-code`;
	const descriptionId = `${ids}-description`;
	const nameRef = useRef<HTMLInputElement>(null);
	const codeRef = useRef<HTMLInputElement>(null);
	const descriptionRef = useRef<HTMLTextAreaElement>(null);

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [codeEdited, setCodeEdited] = useState(false);
	const [description, setDescription] = useState("");
	const [problems, setProblems] = useState<Problems>({});
	const [failure, setFailure] = useState<string | null>(null);
	// The call itself rejected (offline, signed out, a page older than the server's build): see `rejectedWith`.
	const [rejection, setRejection] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	if (!canManage)
		return (
			<Button variant="primary" icon="plus" disabled disabledReason="Only project managers can create sites.">
				Create site
			</Button>
		);

	function reset() {
		setName("");
		setCode("");
		setCodeEdited(false);
		setDescription("");
		setProblems({});
		setFailure(null);
		setRejection(null);
	}

	function focusFirst(found: Problems) {
		if (found.name) nameRef.current?.focus();
		else if (found.code) codeRef.current?.focus();
		else if (found.description) descriptionRef.current?.focus();
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const found: Problems = {};
		const nameProblem = siteNameProblem(name);
		const codeProblem = siteCodeProblem(code);
		const descriptionProblem = siteDescriptionProblem(description);
		if (nameProblem) found.name = nameProblem;
		if (codeProblem) found.code = codeProblem;
		if (descriptionProblem) found.description = descriptionProblem;
		setProblems(found);
		setFailure(null);
		setRejection(null);
		if (Object.keys(found).length > 0) {
			focusFirst(found);
			return;
		}

		setBusy(true);
		try {
			const result = await createSiteAction({ org, project }, { name: name.trim(), code, description });
			if (result.status === "failed") {
				setProblems(result.fields ?? {});
				setFailure(result.message);
				focusFirst(result.fields ?? {});
				return;
			}
			const createdName = name.trim();
			const createdCode = result.code;
			setOpen(false);
			reset();
			toast({
				title: `${createdName} was created.`,
				description: "It has no map package yet.",
				tone: "saved",
				action: {
					label: "Open site",
					onClick: () => router.push(projectHref(org, project, `sites/${createdCode}`))
				}
			});
		} catch (error) {
			setRejection(rejectedWith(error, "reload", "Nothing was created."));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next);
				if (!next) reset();
			}}
			title="Create site"
			description="A site is one real place where observers collect. Its map and zones arrive with its first map package."
			trigger={
				<Button variant="primary" icon="plus">
					Create site
				</Button>
			}>
			<form onSubmit={submit} noValidate className="flex flex-col gap-5">
				<Field
					label="Name"
					htmlFor={nameId}
					hint="The place as observers know it, such as Riverside Park."
					error={problems.name}>
					<TextInput
						ref={nameRef}
						value={name}
						autoComplete="off"
						maxLength={SITE_NAME_MAX}
						onChange={event => {
							const next = event.target.value;
							setName(next);
							if (!codeEdited) setCode(siteCodeFrom(next));
							if (problems.name) setProblems(current => ({ ...current, name: undefined }));
						}}
					/>
				</Field>
				<Field
					label="Site code"
					htmlFor={codeId}
					hint="Short and unique. It appears in export file names and cannot be changed later."
					error={problems.code}>
					<TextInput
						ref={codeRef}
						value={code}
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						maxLength={SITE_CODE_MAX}
						className="type-mono-data"
						onChange={event => {
							setCode(event.target.value.toLowerCase());
							setCodeEdited(true);
							if (problems.code) setProblems(current => ({ ...current, code: undefined }));
						}}
					/>
				</Field>
				<Field
					label="Description"
					htmlFor={descriptionId}
					optional
					hint="Anything observers or colleagues should know about the place."
					error={problems.description}>
					<Textarea
						ref={descriptionRef}
						value={description}
						rows={3}
						maxLength={SITE_DESCRIPTION_MAX}
						onChange={event => setDescription(event.target.value)}
					/>
				</Field>
				{rejection && (
					<Note tone="attention" live="assertive">
						{rejection}
					</Note>
				)}
				{failure &&
					(failure === UNCONFIRMED_CHANGE_COPY ? (
						<Note tone="attention" title="The site may not have been created." live="assertive">
							{failure}
						</Note>
					) : (
						<Note tone="attention" title="The site was not created." live="assertive">
							{failure.replace(/^Nothing was created\.\s*/, "")} What you typed is still here.
						</Note>
					))}
				<div className="flex flex-wrap items-center justify-end gap-3">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button type="submit" variant="primary" busy={busy} busyLabel="Creating…">
						Create site
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
