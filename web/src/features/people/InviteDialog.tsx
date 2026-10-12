"use client";

import { type FormEvent, type ReactNode, useId, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { NumberStepper } from "@/components/contour/NumberStepper";
import { RadioRows } from "@/components/contour/RadioRows";
import { TextInput } from "@/components/contour/TextInput";

import { InvitationCreated } from "./InvitationCreated";
import type { CreatedInvitation, InviteRequest, InviteResult, PeopleRole, RoleOption } from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const MAX_USES = 10_000;
const MAX_DAYS = 365;

export type InviteDialogProps<R extends PeopleRole> = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** "Invite someone to Play Study". */
	title: string;
	/** The roles the signed-in person can give, in order. */
	roleOptions: readonly RoleOption<R>[];
	defaultRole: R;
	/** Creates the invitation. A failure keeps the dialog open with the reason. */
	onCreate: (request: InviteRequest<R>) => Promise<InviteResult>;
	/** Dates read in this timezone. */
	timeZone: string;
	/** Called once the invitation exists, so the page can list it. */
	onCreated?: (invitation: CreatedInvitation) => void;
	/** The button that opens the dialog, when the dialog opens itself. */
	trigger?: ReactNode;
};

/**
 * Invite someone (project-08, org-02): a role; an email address when the invitation is for one person
 * (only someone signed in with that address can use it); otherwise how many people may use the code and
 * for how many days. Then the link and code, shown once (InvitationCreated).
 */
export function InviteDialog<R extends PeopleRole>({
	open,
	onOpenChange,
	title,
	roleOptions,
	defaultRole,
	onCreate,
	timeZone,
	onCreated,
	trigger
}: InviteDialogProps<R>) {
	const ids = useId();
	const [role, setRole] = useState<R>(defaultRole);
	const [email, setEmail] = useState("");
	const [maxUses, setMaxUses] = useState(1);
	const [days, setDays] = useState(7);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [created, setCreated] = useState<CreatedInvitation | null>(null);
	const [pending, startCreate] = useTransition();

	function reset() {
		setRole(defaultRole);
		setEmail("");
		setMaxUses(1);
		setDays(7);
		setErrors({});
		setFailure(null);
		setCreated(null);
	}

	function changeOpen(next: boolean) {
		if (!next && pending) return;
		if (!next) reset();
		onOpenChange(next);
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const address = email.trim();
		const found: Record<string, string> = {};
		if (address && !EMAIL.test(address)) found.email = "Enter a full email address, with an @, or leave it empty.";
		setErrors(found);
		setFailure(null);
		if (Object.keys(found).length > 0) return;
		startCreate(async () => {
			const result = await onCreate({
				role,
				email: address || null,
				maxUses: address ? 1 : maxUses,
				expiresInDays: days
			});
			if (result.status === "failed") {
				setFailure(result.message);
				setErrors(result.fields ?? {});
				return;
			}
			setCreated(result.invitation);
			onCreated?.(result.invitation);
		});
	}

	const formId = `${ids}-form`;
	const forOnePerson = email.trim().length > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={changeOpen}
			trigger={trigger}
			title={created ? "Invitation ready" : title}
			description={
				created
					? undefined
					: "Add an email address to request an invitation email. You will also get a link and a join code to share."
			}
			footer={
				created ? (
					<DialogClose asChild>
						<Button variant="ink">Done</Button>
					</DialogClose>
				) : (
					<>
						<DialogClose asChild>
							<Button variant="outline" disabled={pending}>
								Cancel
							</Button>
						</DialogClose>
						<Button variant="primary" type="submit" form={formId} busy={pending} busyLabel="Creating…">
							Create invitation
						</Button>
					</>
				)
			}>
			{created ? (
				<InvitationCreated invitation={created} timeZone={timeZone} />
			) : (
				<form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
					<div className="flex flex-col">
						<p aria-hidden="true" className="mb-2 type-small font-semibold text-ink">
							Role
						</p>
						<RadioRows
							label="Role"
							name={`${ids}-role`}
							value={role}
							onValueChange={value => setRole(value as R)}
							options={roleOptions.map(option => ({
								value: option.value,
								label: option.label,
								description: option.hint
							}))}
						/>
					</div>
					<Field
						label="Email address"
						htmlFor={`${ids}-email`}
						optional
						error={errors.email}
						hint="Only someone signed in with this address can use the invitation. Leave it empty for a join code several people can use.">
						<TextInput
							id={`${ids}-email`}
							type="email"
							autoComplete="off"
							value={email}
							onChange={event => setEmail(event.target.value)}
						/>
					</Field>
					{!forOnePerson && (
						<Field label="How many people can use it" htmlFor={`${ids}-uses`} error={errors.max_uses}>
							<NumberStepper
								id={`${ids}-uses`}
								label="How many people can use it"
								value={maxUses}
								onChange={setMaxUses}
								min={1}
								max={MAX_USES}
							/>
						</Field>
					)}
					<Field label="Days until it expires" htmlFor={`${ids}-days`} error={errors.expires_in_days}>
						<NumberStepper
							id={`${ids}-days`}
							label="Days until it expires"
							value={days}
							onChange={setDays}
							min={1}
							max={MAX_DAYS}
						/>
					</Field>
					{failure && (
						<Note tone="attention" live="assertive">
							{failure}
						</Note>
					)}
				</form>
			)}
		</Dialog>
	);
}
