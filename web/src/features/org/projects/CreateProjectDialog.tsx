"use client";

import { type FormEvent, useId, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { TextInput } from "@/components/contour/TextInput";
import { rejectedWith } from "@/lib/action-rejection";
import { isTimeZone, timeZones } from "@/lib/time";

import { createProjectAction } from "../actions";
import { addressFromName, addressProblem, nameProblem } from "../slug";

type Problems = Partial<Record<"name" | "code" | "timezone", string>>;

export type CreateProjectDialogProps = {
	orgId: string;
	orgSlug: string;
	/** The timezone the picker starts on: the organization's first project's, else New York. */
	defaultTimeZone: string;
	/** Codes already used by projects the person can see, so a repeat is caught before it is sent. */
	takenCodes: readonly string[];
};

/**
 * Create project (owners and admins): a name, a code that follows the name until it is edited, and the
 * timezone the project's dates are shown in. The new project opens as soon as it exists. The person who
 * creates it becomes its manager.
 */
export function CreateProjectDialog({ orgId, orgSlug, defaultTimeZone, takenCodes }: CreateProjectDialogProps) {
	const ids = useId();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	// The code follows the name until the person types in it; clearing it hands it back to the name.
	const [codeEdited, setCodeEdited] = useState(false);
	const [timezone, setTimezone] = useState(defaultTimeZone);
	const [problems, setProblems] = useState<Problems>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, startCreate] = useTransition();
	const fields = useRef<Partial<Record<"name" | "code" | "timezone", HTMLElement | null>>>({});
	const zones = useMemo(() => {
		const all = timeZones();
		return all.includes(defaultTimeZone) ? all : [defaultTimeZone, ...all];
	}, [defaultTimeZone]);

	function reset() {
		setName("");
		setCode("");
		setCodeEdited(false);
		setTimezone(defaultTimeZone);
		setProblems({});
		setFailure(null);
	}

	function changeOpen(next: boolean) {
		if (!next && pending) return;
		if (!next) reset();
		setOpen(next);
	}

	function changeName(value: string) {
		setName(value);
		if (!codeEdited) setCode(addressFromName(value));
		setProblems(current => ({ ...current, name: undefined, code: codeEdited ? current.code : undefined }));
	}

	function changeCode(value: string) {
		const next = value.toLowerCase().replace(/\s+/g, "-");
		setCode(next);
		setCodeEdited(next !== "");
		setProblems(current => ({ ...current, code: undefined }));
	}

	/** Leaving the code empty hands it back to the name. */
	function fillCode() {
		if (code === "") setCode(addressFromName(name));
	}

	function check(): Problems {
		const found: Problems = {};
		const nameIssue = nameProblem(name, "a project name");
		if (nameIssue) found.name = nameIssue;
		const codeIssue = addressProblem(code, "the project code");
		if (codeIssue) found.code = codeIssue;
		else if (takenCodes.includes(code))
			found.code = "A project in this organization already uses this code. Choose another.";
		if (!isTimeZone(timezone)) found.timezone = "Choose a time zone from the list.";
		return found;
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFailure(null);
		const found = check();
		setProblems(found);
		const first = (["name", "code", "timezone"] as const).find(key => found[key]);
		if (first) {
			fields.current[first]?.focus();
			return;
		}
		startCreate(async () => {
			// A created project opens straight away, so this only comes back when nothing was created.
			let result: Awaited<ReturnType<typeof createProjectAction>>;
			try {
				result = await createProjectAction({ orgId, orgSlug, name: name.trim(), code, timezone });
			} catch (error) {
				// A redirect to the new project is not a failure: `rejectedWith` rethrows it, so the page still leaves.
				setFailure(rejectedWith(error, "reload", "Nothing was created."));
				return;
			}
			setFailure(result.message);
			const named: Problems = {};
			for (const key of ["name", "code", "timezone"] as const) {
				const problem = result.fields?.[key];
				if (problem) named[key] = problem;
			}
			setProblems(named);
			const first = (["name", "code", "timezone"] as const).find(key => named[key]);
			if (first) fields.current[first]?.focus();
		});
	}

	const formId = `${ids}-form`;

	return (
		<Dialog
			open={open}
			onOpenChange={changeOpen}
			trigger={
				<Button variant="primary" icon="plus">
					Create project
				</Button>
			}
			title="Create project"
			description="A project holds one study's sites, forms and team. You become its manager."
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline" disabled={pending}>
							Cancel
						</Button>
					</DialogClose>
					<Button variant="primary" type="submit" form={formId} busy={pending} busyLabel="Creating…">
						Create project
					</Button>
				</>
			}>
			<form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
				<Field label="Name" htmlFor={`${ids}-name`} error={problems.name}>
					<TextInput
						ref={node => {
							fields.current.name = node;
						}}
						id={`${ids}-name`}
						autoComplete="off"
						value={name}
						onChange={event => changeName(event.target.value)}
					/>
				</Field>
				<Field
					label="Project code"
					htmlFor={`${ids}-code`}
					error={problems.code}
					hint="Appears in the project's web address and in export file names. It cannot be changed later.">
					<TextInput
						ref={node => {
							fields.current.code = node;
						}}
						id={`${ids}-code`}
						autoComplete="off"
						spellCheck={false}
						className="font-mono"
						value={code}
						onChange={event => changeCode(event.target.value)}
						onBlur={fillCode}
					/>
				</Field>
				<Field
					label="Time zone"
					htmlFor={`${ids}-timezone`}
					error={problems.timezone}
					hint="Dates for this project are shown in this time zone.">
					<Select
						ref={node => {
							fields.current.timezone = node;
						}}
						id={`${ids}-timezone`}
						value={timezone}
						onChange={event => {
							setTimezone(event.target.value);
							setProblems(current => ({ ...current, timezone: undefined }));
						}}>
						{zones.map(zone => (
							<option key={zone} value={zone}>
								{zone}
							</option>
						))}
					</Select>
				</Field>
				{failure && (
					<Note tone="attention" live="assertive">
						{failure}
					</Note>
				)}
			</form>
		</Dialog>
	);
}
