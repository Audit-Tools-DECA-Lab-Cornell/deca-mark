"use client";

import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { FactsList } from "@/components/contour/FactsList";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { StateBadge } from "@/components/contour/StateBadge";
import { TextInput } from "@/components/contour/TextInput";
import { useToast } from "@/components/contour/Toast";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import { rejectedWith } from "@/lib/action-rejection";
import { clock } from "@/lib/time";
import type { Failure, OrgRole } from "@/lib/workspace/types";

import { saveOrganizationAction } from "../actions";
import { addressProblem, nameProblem } from "../slug";
import { type TransferCandidate, TransferOwnership } from "./TransferOwnership";

export type SettingsScreenProps = {
	org: { id: string; slug: string; name: string; role: OrgRole };
	/** What the API holds about the organization besides its name and address. */
	details: { createdAt: string; plan: string; dataRegion: string };
	/** Dates read in this timezone: the organization's first project's. */
	timeZone: string;
	/** Owners only: who ownership can pass to. Null for admins, or when the members could not be read. */
	candidates: TransferCandidate[] | null;
	candidatesFailure: Failure | null;
	/** Whether the person can transfer ownership (owners). */
	canTransfer: boolean;
};

type Problems = Partial<Record<"name" | "slug", string>>;

/** "pilot" reads "Pilot". */
function capitalised(word: string): string {
	return word === "" ? word : word[0].toUpperCase() + word.slice(1);
}

/**
 * Organization settings (org-04) for owners and admins: the name and web address, what DECA Mark holds
 * about the organization, Transfer ownership for owners, and Delete organization, which is not
 * available yet. Unsaved changes say so and leaving asks first. A new web address moves the person to
 * it once it is saved, since the old one stops working.
 */
export function SettingsScreen({
	org,
	details,
	timeZone,
	candidates,
	candidatesFailure,
	canTransfer
}: SettingsScreenProps) {
	const ids = useId();
	const toast = useToast();
	const [saved, setSaved] = useState({ name: org.name, slug: org.slug });
	const [name, setName] = useState(org.name);
	const [slug, setSlug] = useState(org.slug);
	const [problems, setProblems] = useState<Problems>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, startSave] = useTransition();
	const fields = useRef<Partial<Record<"name" | "slug", HTMLElement | null>>>({});
	// The fields are locked while a save runs and cannot take focus, so focus returns once it ends.
	const refocus = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (pending) return;
		const target = refocus.current;
		refocus.current = null;
		target?.focus();
	}, [pending]);

	const changedName = name.trim() !== saved.name;
	const changedSlug = slug !== saved.slug;
	const dirty = changedName || changedSlug;
	const guard = useLeaveGuard(dirty);

	function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFailure(null);
		const found: Problems = {};
		const nameIssue = nameProblem(name, "a name");
		if (nameIssue) found.name = nameIssue;
		const slugIssue = addressProblem(slug, "the web address");
		if (slugIssue) found.slug = slugIssue;
		setProblems(found);
		const first = (["name", "slug"] as const).find(key => found[key]);
		if (first) {
			fields.current[first]?.focus();
			return;
		}
		const active = document.activeElement;
		refocus.current = active instanceof HTMLElement && event.currentTarget.contains(active) ? active : null;
		startSave(async () => {
			let result: Awaited<ReturnType<typeof saveOrganizationAction>>;
			try {
				result = await saveOrganizationAction({
					orgId: org.id,
					currentSlug: saved.slug,
					...(changedName ? { name: name.trim() } : {}),
					...(changedSlug ? { slug } : {})
				});
			} catch (error) {
				// A redirect (the web address changed) is rethrown by `rejectedWith`. Anything else rejected the
				// call itself: the typed name and address stay in their fields.
				setFailure(rejectedWith(error, "kept", "Nothing was saved."));
				setProblems({});
				return;
			}
			if (result.status === "failed") {
				setFailure(result.message);
				const named: Problems = {};
				if (result.fields?.name) named.name = result.fields.name;
				if (result.fields?.slug) named.slug = result.fields.slug;
				setProblems(named);
				const field = (["name", "slug"] as const).find(key => named[key]);
				if (field) refocus.current = fields.current[field] ?? refocus.current;
				return;
			}
			setSaved({ name: result.name, slug: result.slug });
			setName(result.name);
			setSlug(result.slug);
			toast({ title: "Organization saved.", tone: "saved" });
		});
	}

	function discard() {
		setName(saved.name);
		setSlug(saved.slug);
		setProblems({});
		setFailure(null);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="Settings" lead={`The name and web address of ${saved.name}, and who owns it.`} />
			<div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
				<Island
					title="Organization"
					meta={
						dirty ? <StateBadge kind="form" state="draft" label="Unsaved changes" size="sm" /> : undefined
					}>
					<form noValidate onSubmit={save} className="flex flex-col gap-5">
						{/* Locked while a save runs, so nothing typed meanwhile is lost when the result arrives. */}
						<fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
							<Field label="Name" htmlFor={`${ids}-name`} error={problems.name}>
								<TextInput
									ref={node => {
										fields.current.name = node;
									}}
									id={`${ids}-name`}
									autoComplete="off"
									value={name}
									onChange={event => {
										setName(event.target.value);
										setProblems(current => ({ ...current, name: undefined }));
									}}
								/>
							</Field>
							<Field
								label="Web address"
								htmlFor={`${ids}-slug`}
								error={problems.slug}
								hint={`Links to this organization start with /o/${slug || "…"}. Links that use the old address stop working.`}>
								<TextInput
									ref={node => {
										fields.current.slug = node;
									}}
									id={`${ids}-slug`}
									autoComplete="off"
									spellCheck={false}
									className="font-mono"
									value={slug}
									onChange={event => {
										setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"));
										setProblems(current => ({ ...current, slug: undefined }));
									}}
								/>
							</Field>
						</fieldset>
						{changedSlug && !problems.slug && (
							<Note tone="attention" title="Saving moves you to the new address.">
								Anyone with a link, bookmark or message that uses /o/{saved.slug} will need the new
								address.
							</Note>
						)}
						{failure && (
							<Note tone="attention" live="assertive">
								{failure}
							</Note>
						)}
						<div className="flex flex-wrap items-center gap-3">
							<Button
								variant="primary"
								type="submit"
								icon="check"
								disabled={!dirty}
								disabledReason="Change the name or web address to save."
								busy={pending}
								busyLabel="Saving…">
								Save changes
							</Button>
							{dirty && (
								<Button variant="outline" disabled={pending} onClick={discard}>
									Discard changes
								</Button>
							)}
						</div>
					</form>
				</Island>

				<div className="flex min-w-0 flex-col gap-6">
					<Island title="Details">
						<FactsList
							labelWidth="8rem"
							items={[
								{ label: "Created", value: clock(timeZone).day(details.createdAt) },
								{ label: "Plan", value: capitalised(details.plan) },
								{ label: "Data region", value: details.dataRegion, mono: true }
							]}
						/>
					</Island>
					{canTransfer && (
						<TransferOwnership
							org={org}
							candidates={candidates}
							failure={candidatesFailure}
							timeZone={timeZone}
						/>
					)}
					<Island tone="danger" title="Delete organization">
						<NotAvailable
							title="Deleting an organization"
							reason="An organization holds its projects and every observation collected in them."
							instead="To stop using this one, archive its projects and remove its members."
						/>
					</Island>
				</div>
			</div>

			<Dialog
				open={guard.leavingTo !== null}
				onOpenChange={open => {
					if (!open) guard.stay();
				}}
				title="Leave without saving?"
				description="Your changes to the organization are not saved. If you leave now, they are lost."
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Keep editing</Button>
						</DialogClose>
						<Button
							variant="ink"
							icon="arrow-right"
							onClick={() => {
								discard();
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
