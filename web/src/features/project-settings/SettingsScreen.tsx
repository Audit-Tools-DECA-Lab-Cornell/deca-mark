"use client";

import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { FactsList } from "@/components/contour/FactsList";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { Select } from "@/components/contour/Select";
import { StateBadge } from "@/components/contour/StateBadge";
import { Textarea } from "@/components/contour/Textarea";
import { TextInput } from "@/components/contour/TextInput";
import { useToast } from "@/components/contour/Toast";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import { rejected } from "@/lib/action-rejection";

import { saveSettings } from "./actions";
import { ArchiveIsland } from "./ArchiveIsland";
import {
	changedFields,
	checkSettings,
	DESCRIPTION_MAX,
	NAME_MAX,
	patchOf,
	type ProjectStatus,
	SETTINGS_FIELDS,
	type SettingsContext,
	type SettingsErrors,
	type SettingsField,
	type SettingsForm,
	zoneOptions
} from "./rules";

export type SettingsScreenProps = {
	context: SettingsContext;
	organizationName: string;
	/** The project as it was last saved. */
	saved: SettingsForm;
	/** The project's code. It is part of its web address and cannot be changed. */
	code: string;
	status: ProjectStatus;
	/** Every timezone the picker offers, read once on the server so both sides list the same. */
	zones: string[];
};

/**
 * Project settings (project-19): the project's name, description and timezone, its code and status, and
 * archiving. Unsaved changes say so and leaving asks first. What DECA Mark cannot do yet (deleting a
 * project, planning rounds) is said plainly beside the controls that do exist.
 */
export function SettingsScreen({
	context,
	organizationName,
	saved: initial,
	code,
	status,
	zones
}: SettingsScreenProps) {
	const id = useId();
	const toast = useToast();
	const [saved, setSaved] = useState(initial);
	const [seen, setSeen] = useState(JSON.stringify(initial));
	const [draft, setDraft] = useState<Partial<SettingsForm>>({});
	const [errors, setErrors] = useState<SettingsErrors>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [unchanged, setUnchanged] = useState(false);
	const [pending, startSave] = useTransition();
	const refs = useRef<Partial<Record<SettingsField, HTMLElement | null>>>({});
	// The fields are locked while a save runs and cannot take focus, so focus returns once it ends.
	const refocus = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (pending) return;
		const target = refocus.current;
		refocus.current = null;
		target?.focus();
	}, [pending]);

	// The page was read again (this save, or another manager's): the saved values are what it says.
	const key = JSON.stringify(initial);
	if (seen !== key) {
		setSeen(key);
		setSaved(initial);
	}

	const form: SettingsForm = { ...saved, ...draft };
	const dirty = changedFields(saved, form).length > 0;
	const guard = useLeaveGuard(dirty);
	const zoneList = zoneOptions(zones, saved.timezone);

	function set(field: SettingsField, value: string) {
		setDraft(current => ({ ...current, [field]: value }));
		setUnchanged(false);
		if (errors[field]) setErrors(current => ({ ...current, [field]: undefined }));
	}

	function focusFirst(found: SettingsErrors) {
		const first = SETTINGS_FIELDS.find(field => found[field]);
		if (first) refs.current[first]?.focus();
	}

	function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFailure(null);
		if (!dirty) {
			setUnchanged(true);
			return;
		}
		const found = checkSettings(form);
		setErrors(found);
		if (Object.keys(found).length > 0) {
			focusFirst(found);
			return;
		}
		const active = document.activeElement;
		refocus.current = active instanceof HTMLElement && event.currentTarget.contains(active) ? active : null;
		startSave(async () => {
			let result: Awaited<ReturnType<typeof saveSettings>>;
			try {
				result = await saveSettings(context, patchOf(saved, form));
			} catch (error) {
				// The call itself rejected: the screen stays, the typed values stay in the fields, and a second
				// Save sends the same changes again (a project change is a plain update, so that is safe).
				setFailure(rejected(error, "kept", "Nothing was saved.").message);
				setErrors({});
				return;
			}
			if (result.status === "failed") {
				setFailure(result.message);
				setErrors(result.fields ?? {});
				const first = SETTINGS_FIELDS.find(field => result.fields?.[field]);
				if (first) refocus.current = refs.current[first] ?? refocus.current;
				return;
			}
			setSaved(result.saved);
			setDraft({});
			setErrors({});
			toast({ title: "Project settings saved.", tone: "saved" });
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Project settings"
				lead="Name, description and timezone. Renaming a project does not change its web address."
			/>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
				<Island title="General">
					<form noValidate onSubmit={save} className="flex flex-col gap-6">
						{/* Locked while a save runs, so nothing typed meanwhile is lost when the result arrives. */}
						<fieldset disabled={pending} className="flex min-w-0 flex-col gap-6">
							<Field
								label="Project name"
								htmlFor={`${id}-name`}
								error={errors.name}
								hint="Shown in the header and in the list of projects.">
								<TextInput
									id={`${id}-name`}
									ref={node => {
										refs.current.name = node;
									}}
									autoComplete="off"
									maxLength={NAME_MAX}
									value={form.name}
									onChange={event => set("name", event.target.value)}
								/>
							</Field>
							<Field
								label="Description"
								htmlFor={`${id}-description`}
								optional
								error={errors.description}
								hint="What the study is about, for the people who manage it.">
								<Textarea
									id={`${id}-description`}
									ref={node => {
										refs.current.description = node;
									}}
									maxLength={DESCRIPTION_MAX}
									showCount
									value={form.description}
									onChange={event => set("description", event.target.value)}
								/>
							</Field>
							<Field
								label="Timezone"
								htmlFor={`${id}-timezone`}
								error={errors.timezone}
								hint="Observation times and days on the web are shown in this timezone.">
								<Select
									id={`${id}-timezone`}
									ref={node => {
										refs.current.timezone = node;
									}}
									value={form.timezone}
									onChange={event => set("timezone", event.target.value)}>
									{zoneList.map(zone => (
										<option key={zone} value={zone}>
											{zone}
										</option>
									))}
								</Select>
							</Field>
						</fieldset>
						{failure && (
							<Note tone="attention" live="assertive">
								{failure}
							</Note>
						)}
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<Button type="submit" variant="primary" icon="check" busy={pending} busyLabel="Saving…">
								Save changes
							</Button>
							<p role="status" className="type-small text-ink-2">
								{dirty ? (
									<StateBadge kind="form" state="draft" label="Unsaved changes" size="sm" />
								) : unchanged ? (
									"Nothing has changed since the last save."
								) : null}
							</p>
						</div>
					</form>
				</Island>

				<div className="flex min-w-0 flex-col gap-6">
					<Island
						title="About this project"
						footnote="The code is part of this project’s web address, so it cannot be changed.">
						<FactsList
							labelWidth="8rem"
							items={[
								{ label: "Project code", value: code, mono: true },
								{ label: "Organization", value: organizationName }
							]}
						/>
					</Island>
					<ArchiveIsland context={context} projectName={saved.name} status={status} />
					<NotAvailable
						title="Deleting a project"
						reason="DECA Mark does not delete projects, so a project’s sites, forms and observations are never removed by accident."
						instead="To stop using a project, archive it."
					/>
					<NotAvailable
						title="Planning rounds"
						reason="Every project offers the same three rounds: Standard, Reliability and Inventory. There is nothing to plan or assign here."
						instead="Overview shows how many observations each round has in each zone."
					/>
				</div>
			</div>

			<Dialog
				open={guard.leavingTo !== null}
				onOpenChange={open => {
					if (!open) guard.stay();
				}}
				title="Leave without saving?"
				description="Your changes to the project settings are not saved. If you leave now, they are lost."
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Keep editing</Button>
						</DialogClose>
						<Button
							variant="ink"
							icon="arrow-right"
							onClick={() => {
								setDraft({});
								guard.leave();
							}}>
							Leave without saving
						</Button>
					</>
				}
			/>
		</div>
	);
}
