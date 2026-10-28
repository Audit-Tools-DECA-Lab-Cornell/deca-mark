"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { FactsList } from "@/components/contour/FactsList";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { TextInput } from "@/components/contour/TextInput";
import { TextLink } from "@/components/contour/TextLink";
import { clearFlash, leaveFlash } from "@/features/auth/flash";
import { isRedirect, rejectedWith } from "@/lib/action-rejection";
import { signOut } from "@/lib/auth/actions";

import { type DeletionState, requestAccountDeletion } from "./actions";
import { deletionFinishingLine, nextDeletionRetry } from "./deletion";

/** What the dialog shows: the last answer, and after a 202 how many tries followed and whether they stopped. */
type Shown = DeletionState & { readonly tries?: number; readonly gaveUp?: boolean };

const IDLE: Shown = { status: "idle" };
const CONFIRM_WORD = "DELETE";

/** The toast sign in shows once the account is gone. Left before the request; dropped if it fails. */
const DELETED_FLASH = {
	title: "Account deleted",
	description: "Your profile and memberships were removed. Observations stay with their projects."
};

export type DeleteAccountProps = {
	/** The signed-in account this page shows. Every try names it, and deletes nothing if another is signed in. */
	accountId: string;
	/** Each membership as "Name (Role)", organizations first. */
	organizations: string[];
	projects: string[];
	/** Places that can block the deletion with sole_owner (see possibleBlockers). */
	blockers: { organizations: string[]; projects: string[] };
};

function list(names: string[]): string {
	return names.length === 0 ? "None" : names.join(", ");
}

/** "DECA Lab", "DECA Lab and Play Study", "A, B and C": names inside a sentence. */
function names(items: string[]): string {
	if (items.length < 2) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * Delete account (org-05): a danger island whose button opens the review. The dialog lists everything the
 * deletion touches before the type-to-confirm field, then `requestAccountDeletion` calls DELETE /v1/me.
 * On 204 the session ends and sign in shows "Account deleted"; every other answer is said here, with what
 * did or did not change.
 */
export function DeleteAccount({ accountId, organizations, projects, blockers }: DeleteAccountProps) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [state, action, pending] = useActionState<Shown, FormData>(async (previous, form) => {
		const retry = previous.status === "pending";
		leaveFlash(DELETED_FLASH);
		try {
			const result = await requestAccountDeletion(previous, form);
			clearFlash();
			if (!retry) return result ?? previous;
			const tries = (previous.tries ?? 0) + 1;
			// After a 202 the profile and memberships are already gone, so a try that fails leaves the deletion
			// recorded and finishing; it never reads as "Nothing was deleted".
			return result?.status === "pending"
				? { ...result, tries }
				: { status: "pending", tries, gaveUp: true, otherAccount: result?.otherAccount };
		} catch (error) {
			if (isRedirect(error)) throw error;
			clearFlash();
			// The call itself rejected (offline, signed out, a page older than the server's build), so the
			// dialog stays. The deletion may have gone through: it says so, and never "Nothing was deleted"
			// unless the call is known not to have run. After a 202 the deletion is already recorded.
			if (retry)
				return {
					status: "pending",
					tries: (previous.tries ?? 0) + 1,
					gaveUp: true,
					otherAccount: previous.otherAccount
				};
			return { status: "failed", message: rejectedWith(error, "reload", "Nothing was deleted.") };
		}
	}, IDLE);
	const messageRef = useRef<HTMLDivElement>(null);
	const handled = useRef(state);
	const confirmed = typed.trim() === CONFIRM_WORD;
	const owns = blockers.organizations.length > 0;

	useEffect(() => {
		if (handled.current === state) return;
		handled.current = state;
		messageRef.current?.focus();
	}, [state]);

	// After a 202, send the deletion again while the session is still valid; a 204 redirects to sign in.
	const waitMs = state.status === "pending" ? nextDeletionRetry(state.tries ?? 0, state.gaveUp ?? false) : null;
	useEffect(() => {
		if (waitMs === null || pending) return;
		const timer = window.setTimeout(() => {
			const form = new FormData();
			form.set("confirm", CONFIRM_WORD);
			form.set("account", accountId);
			startTransition(() => action(form));
		}, waitMs);
		return () => window.clearTimeout(timer);
	}, [waitMs, pending, action, state, accountId]);

	function submit(event: FormEvent<HTMLFormElement>) {
		if (pending || !confirmed) event.preventDefault();
	}

	return (
		<Island tone="danger" title="Delete account">
			<p className="type-body text-ink">
				Deleting your account does not delete research observations owned by a study. The operator applies its
				consent and retention policy.
			</p>
			<Dialog
				open={open}
				onOpenChange={next => {
					setOpen(next);
					if (!next) setTyped("");
				}}
				trigger={
					<Button variant="danger" icon="trash-2" className="mt-5">
						Review account deletion
					</Button>
				}
				title="Delete your account?"
				description="This removes your DECA Mark profile and every membership. It cannot be undone.">
				{state.status === "pending" ? (
					<div className="flex flex-col gap-5">
						<div ref={messageRef} tabIndex={-1} className="rounded-note">
							<Note tone="waiting" title="Deletion is finishing." live="polite">
								Your profile and memberships are removed.{" "}
								{deletionFinishingLine(
									state.tries ?? 0,
									state.gaveUp ?? false,
									state.otherAccount ?? false
								)}
							</Note>
						</div>
						{/* Signing out here would sign out the other account. */}
						{!state.otherAccount && (
							<form action={signOut} className="flex justify-end">
								<Button type="submit" variant="ink" icon="log-out">
									Sign out
								</Button>
							</form>
						)}
					</div>
				) : (
					<form
						action={action}
						noValidate
						onSubmit={submit}
						className="flex flex-col gap-5"
						aria-busy={pending || undefined}>
						<input type="hidden" name="account" value={accountId} />
						<FactsList
							labelWidth="8.5rem"
							items={[
								{ label: "Profile", value: "Your name, observer initials and locale are cleared." },
								{ label: "Organizations", value: list(organizations) },
								{ label: "Projects", value: list(projects) },
								...(owns
									? [
											{
												label: "Organizations you own",
												value: "One with no other members is deleted with your account."
											}
										]
									: []),
								{
									label: "Observations",
									value: "They stay with their projects and keep your observer code as a research label."
								},
								{
									label: "Phones",
									value: "Records not yet uploaded can no longer be sent from this account."
								}
							]}
						/>
						{state.status === "failed" && state.message && (
							<div ref={messageRef} tabIndex={-1} className="rounded-note">
								<Note tone="attention" live="assertive">
									{state.message}
									{state.blocked && blockers.organizations.length > 0 && (
										<> You may be the only owner of {names(blockers.organizations)}.</>
									)}
									{state.blocked && blockers.projects.length > 0 && (
										<> You may be the only manager of {names(blockers.projects)}.</>
									)}
									{state.signIn && (
										<>
											{" "}
											<TextLink href="/sign-in">Sign in again</TextLink>
										</>
									)}
								</Note>
							</div>
						)}
						<Field label={`Type ${CONFIRM_WORD} to confirm`} htmlFor="delete-confirm">
							<TextInput
								name="confirm"
								autoComplete="off"
								autoCapitalize="characters"
								autoCorrect="off"
								spellCheck={false}
								value={typed}
								onChange={event => setTyped(event.currentTarget.value)}
							/>
						</Field>
						<div className="flex flex-wrap items-start justify-end gap-3">
							<DialogClose asChild>
								<Button variant="outline">Keep my account</Button>
							</DialogClose>
							<Button
								type="submit"
								variant="danger-solid"
								icon="triangle-alert"
								busy={pending}
								busyLabel="Deleting account…"
								disabled={!confirmed}
								disabledReason={`The button turns on when you type ${CONFIRM_WORD}.`}>
								Request account deletion
							</Button>
						</div>
					</form>
				)}
			</Dialog>
		</Island>
	);
}
