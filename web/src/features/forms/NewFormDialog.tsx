"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { RadioRows } from "@/components/contour/RadioRows";
import { TextInput } from "@/components/contour/TextInput";
import { useToast } from "@/components/contour/Toast";
import { projectHref } from "@/features/shell/navigation";
import { rejectedWith } from "@/lib/action-rejection";
import { plural } from "@/lib/labels";

import { createFormAction } from "./actions";
import {
	codeFromName,
	FORM_CODE_HINT,
	formCodeProblem,
	formNameProblem,
	NAME_LIMIT,
	type TemplateId,
	type TemplateInfo
} from "./starter";

/**
 * "New form" (managers): pick what the form starts from, name it and give it a code. Creating it makes its
 * first draft, which opens in the editor. Nothing is sent until the button is pressed.
 */
export function NewFormDialog({
	org,
	project,
	templates,
	takenCodes
}: {
	org: string;
	project: string;
	templates: readonly TemplateInfo[];
	/** The codes the project's forms already use. */
	takenCodes: readonly string[];
}) {
	const router = useRouter();
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [template, setTemplate] = useState<TemplateId>(templates[0]?.id ?? "blank");
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [codeTouched, setCodeTouched] = useState(false);
	const [errors, setErrors] = useState<{ name?: string; code?: string }>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const nameRef = useRef<HTMLInputElement>(null);
	const codeRef = useRef<HTMLInputElement>(null);

	function reset() {
		setName("");
		setCode("");
		setCodeTouched(false);
		setErrors({});
		setFailure(null);
	}

	function changeName(value: string) {
		setName(value);
		if (!codeTouched) setCode(codeFromName(value));
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		const problems = {
			name: formNameProblem(name) ?? undefined,
			code: formCodeProblem(code, takenCodes) ?? undefined
		};
		setErrors(problems);
		setFailure(null);
		if (problems.name) return nameRef.current?.focus();
		if (problems.code) return codeRef.current?.focus();
		start(async () => {
			let result: Awaited<ReturnType<typeof createFormAction>>;
			try {
				result = await createFormAction({ org, project, template, code, name: name.trim() });
			} catch (error) {
				// A create may have landed: the typed name and code stay, and the reload shows whether it did.
				setFailure(rejectedWith(error, "reload", "Nothing was created."));
				return;
			}
			if (result.status === "failed") {
				setFailure(result.message);
				if (result.fields?.code) {
					setErrors({ code: result.fields.code });
					codeRef.current?.focus();
				}
				return;
			}
			setOpen(false);
			reset();
			toast({
				title: `${name.trim()} has a first draft`,
				description: `${result.version} opens in the editor. Nobody collects with it until you publish it.`,
				tone: "saved"
			});
			router.push(projectHref(org, project, `forms/versions/${result.version}`));
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next);
				if (!next) reset();
			}}
			title="New form"
			description="Start from one of these. The form begins as a draft that you can change until you publish it."
			trigger={
				<Button variant="primary" icon="plus">
					New form
				</Button>
			}>
			<form onSubmit={submit} noValidate className="flex flex-col gap-6">
				<RadioRows
					label="Start from"
					value={template}
					onValueChange={value => setTemplate(value as TemplateId)}
					options={templates.map(item => ({
						value: item.id,
						label: item.title,
						description: `${plural(item.questions, "question")}. ${item.description}`
					}))}
				/>
				<Field label="Form name" htmlFor="new-form-name" error={errors.name} hint="What your team calls it.">
					<TextInput
						ref={nameRef}
						value={name}
						maxLength={NAME_LIMIT}
						autoComplete="off"
						onChange={event => changeName(event.target.value)}
					/>
				</Field>
				<Field label="Form Code" htmlFor="new-form-code" error={errors.code} hint={FORM_CODE_HINT}>
					<TextInput
						ref={codeRef}
						value={code}
						maxLength={40}
						autoComplete="off"
						spellCheck={false}
						className="font-mono"
						onChange={event => {
							setCodeTouched(true);
							setCode(event.target.value.toLowerCase());
						}}
					/>
				</Field>
				{failure && (
					<Note tone="attention" live="assertive">
						{failure}
					</Note>
				)}
				<div className="flex flex-wrap items-center justify-end gap-3">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button type="submit" variant="primary" icon="plus" busy={pending} busyLabel="Creating…">
						Create form
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
