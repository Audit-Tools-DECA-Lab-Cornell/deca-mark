"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { NumberStepper } from "@/components/contour/NumberStepper";
import { RadioRows } from "@/components/contour/RadioRows";
import { Segmented } from "@/components/contour/Segmented";
import { Textarea } from "@/components/contour/Textarea";

import {
	createInvitationBatch,
	DEFAULT_INVITATION_DAYS,
	parseRecipients,
	type RecipientResult,
	retryableRecipients
} from "./invitation-batch";
import { InvitationBatchResults } from "./InvitationBatchResults";
import { InvitationCreated } from "./InvitationCreated";
import type { CreatedInvitation, InviteRequest, InviteResult, PeopleRole, RoleOption } from "./types";

export type InviteDialogProps<R extends PeopleRole> = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	roleOptions: readonly RoleOption<R>[];
	defaultRole: R;
	onCreate: (request: InviteRequest<R>) => Promise<InviteResult>;
	timeZone: string;
	onCreated?: (invitation: CreatedInvitation) => void;
	trigger?: ReactNode;
};

/** Separate email invitations from shared codes. Keep every confirmed result through partial failures. */
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
	const [mode, setMode] = useState<"email" | "code">("email");
	const [email, setEmail] = useState("");
	const [maxUses, setMaxUses] = useState(1);
	const [days, setDays] = useState(DEFAULT_INVITATION_DAYS);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [results, setResults] = useState<RecipientResult[]>([]);
	const [total, setTotal] = useState(0);
	const [started, setStarted] = useState(false);
	const [pending, startCreate] = useTransition();
	const inFlight = useRef(false);
	const emailRef = useRef<HTMLTextAreaElement>(null);
	const resultRef = useRef<HTMLDivElement>(null);

	function reset() {
		setRole(defaultRole);
		setMode("email");
		setEmail("");
		setMaxUses(1);
		setDays(DEFAULT_INVITATION_DAYS);
		setErrors({});
		setResults([]);
		setStarted(false);
		setTotal(0);
	}

	function changeOpen(next: boolean) {
		if (!next && inFlight.current) return;
		if (!next) reset();
		onOpenChange(next);
	}

	function create(addresses: readonly (string | null)[]) {
		if (inFlight.current) return;
		inFlight.current = true;
		setStarted(true);
		setTotal(results.filter(result => !addresses.includes(result.email)).length + addresses.length);
		setResults(current => current.filter(result => !addresses.includes(result.email)));
		startCreate(async () => {
			try {
				await createInvitationBatch(
					addresses,
					address =>
						onCreate({
							role,
							email: address,
							maxUses: address === null ? maxUses : 1,
							expiresInDays: days
						}),
					result => {
						setResults(current => [...current, result]);
						if (result.status === "created") onCreated?.(result.invitation);
					}
				);
			} finally {
				inFlight.current = false;
				resultRef.current?.focus();
			}
		});
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (mode === "code") {
			create([null]);
			return;
		}
		const recipients = parseRecipients(email);
		if (!recipients.ok) {
			setErrors({ email: recipients.message });
			emailRef.current?.focus();
			return;
		}
		setErrors({});
		create(recipients.addresses);
	}

	const formId = `${ids}-form`;
	const failed = retryableRecipients(results);
	const only = results.length === 1 ? results[0] : undefined;

	return (
		<Dialog
			open={open}
			onOpenChange={changeOpen}
			trigger={trigger}
			title={started ? "Invitation results" : title}
			description={started ? undefined : "Choose individual email invitations or a join code to share."}
			footer={
				started ? (
					<>
						{failed.length > 0 && (
							<Button
								variant="primary"
								onClick={() => create(failed)}
								busy={pending}
								busyLabel="Creating…">
								Retry failed invitations
							</Button>
						)}
						<DialogClose asChild>
							<Button variant="ink" disabled={pending}>
								Done
							</Button>
						</DialogClose>
					</>
				) : (
					<>
						<DialogClose asChild>
							<Button variant="outline" disabled={pending}>
								Cancel
							</Button>
						</DialogClose>
						<Button variant="primary" type="submit" form={formId} busy={pending} busyLabel="Creating…">
							{mode === "email" ? "Create invitations" : "Create join code"}
						</Button>
					</>
				)
			}>
			{started ? (
				<div ref={resultRef} tabIndex={-1} className="flex flex-col gap-4 outline-none">
					{only?.status === "created" && !pending ? (
						<InvitationCreated invitation={only.invitation} timeZone={timeZone} />
					) : (
						<InvitationBatchResults results={results} total={total} pending={pending} timeZone={timeZone} />
					)}
					{results.some(result => result.status === "unconfirmed") && (
						<Note tone="attention">
							Unconfirmed invitations will not be retried. Close this dialog and check the waiting
							invitations before creating another.
						</Note>
					)}
				</div>
			) : (
				<form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
					<Segmented
						label="Invitation method"
						value={mode}
						onValueChange={value => {
							if (value === "email" || value === "code") {
								setMode(value);
								setErrors({});
							}
						}}
						options={[
							{ value: "email", label: "Invite by email" },
							{ value: "code", label: "Shared join code" }
						]}
						fullWidth
					/>
					<div className="flex flex-col">
						<p aria-hidden="true" className="mb-2 type-small font-semibold text-ink">
							Role
						</p>
						<RadioRows
							label="Role"
							name={`${ids}-role`}
							value={role}
							onValueChange={value => {
								const option = roleOptions.find(option => option.value === value);
								if (option) setRole(option.value);
							}}
							options={roleOptions.map(option => ({
								value: option.value,
								label: option.label,
								description: option.hint
							}))}
						/>
					</div>
					{mode === "email" ? (
						<Field
							label="Email addresses"
							htmlFor={`${ids}-email`}
							error={errors.email}
							hint="Separate up to 25 different email addresses with commas. Only someone signed in with each address can use its invitation.">
							<Textarea
								ref={emailRef}
								id={`${ids}-email`}
								autoComplete="off"
								value={email}
								onChange={event => setEmail(event.target.value)}
							/>
						</Field>
					) : (
						<Field label="How many people can use it" htmlFor={`${ids}-uses`} error={errors.max_uses}>
							<NumberStepper
								id={`${ids}-uses`}
								label="How many people can use it"
								value={maxUses}
								onChange={setMaxUses}
								min={1}
								max={10_000}
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
							max={365}
						/>
					</Field>
				</form>
			)}
		</Dialog>
	);
}
