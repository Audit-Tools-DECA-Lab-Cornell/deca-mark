"use client";

import { type FormEvent, useId, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { Textarea } from "@/components/contour/Textarea";
import { TextInput } from "@/components/contour/TextInput";
import { useToast } from "@/components/contour/Toast";
import { rejectedWith } from "@/lib/action-rejection";
import { UNCONFIRMED_CHANGE_COPY } from "@/lib/api/errors";

import { type SiteField, updateSiteAction } from "./actions";
import { SITE_DESCRIPTION_MAX, SITE_NAME_MAX, siteDescriptionProblem, siteNameProblem } from "./code";

type Problems = Partial<Record<SiteField, string>>;

/** Edit details (managers): a site's name and description. The code is fixed once the site exists. */
export function EditSiteDialog({
	org,
	project,
	code,
	name: savedName,
	description: savedDescription
}: {
	org: string;
	project: string;
	code: string;
	name: string;
	description: string | null;
}) {
	const toast = useToast();
	const ids = useId();
	const nameId = `${ids}-name`;
	const descriptionId = `${ids}-description`;
	const nameRef = useRef<HTMLInputElement>(null);
	const descriptionRef = useRef<HTMLTextAreaElement>(null);

	const [open, setOpen] = useState(false);
	const [name, setName] = useState(savedName);
	const [description, setDescription] = useState(savedDescription ?? "");
	const [problems, setProblems] = useState<Problems>({});
	const [failure, setFailure] = useState<string | null>(null);
	// The call itself rejected (offline, signed out, a page older than the server's build): see `rejectedWith`.
	const [rejection, setRejection] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	function start() {
		setName(savedName);
		setDescription(savedDescription ?? "");
		setProblems({});
		setFailure(null);
		setRejection(null);
	}

	function focusFirst(found: Problems) {
		if (found.name) nameRef.current?.focus();
		else if (found.description) descriptionRef.current?.focus();
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const found: Problems = {};
		const nameProblem = siteNameProblem(name);
		const descriptionProblem = siteDescriptionProblem(description);
		if (nameProblem) found.name = nameProblem;
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
			const result = await updateSiteAction({ org, project }, code, { name: name.trim(), description });
			if (result.status === "failed") {
				setProblems(result.fields ?? {});
				setFailure(result.message);
				focusFirst(result.fields ?? {});
				return;
			}
			setOpen(false);
			toast({ title: "Site details saved.", tone: "saved" });
		} catch (error) {
			setRejection(rejectedWith(error, "kept", "Nothing was saved."));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (next) start();
				setOpen(next);
			}}
			title="Edit site details"
			description="The site code stays the same. It appears in export file names."
			trigger={
				<Button variant="outline" icon="pencil">
					Edit details
				</Button>
			}>
			<form onSubmit={submit} noValidate className="flex flex-col gap-5">
				<Field label="Name" htmlFor={nameId} error={problems.name}>
					<TextInput
						ref={nameRef}
						value={name}
						autoComplete="off"
						maxLength={SITE_NAME_MAX}
						onChange={event => setName(event.target.value)}
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
						rows={4}
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
						<Note tone="attention" title="The details may not have been saved." live="assertive">
							{failure}
						</Note>
					) : (
						<Note tone="attention" title="The details were not saved." live="assertive">
							{failure.replace(/^Nothing was saved\.\s*/, "")} What you typed is still here.
						</Note>
					))}
				<div className="flex flex-wrap items-center justify-end gap-3">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
						Save details
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
