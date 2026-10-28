"use client";

import { type FormEvent, useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Icon } from "@/components/contour/Icon";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { TextInput } from "@/components/contour/TextInput";
import { rejectedWith } from "@/lib/action-rejection";

import { saveProfile } from "./actions";
import { IDLE, type ProfileAnswer, settleSave, shownAnswer } from "./answer";
import {
	checkProfile,
	cleanInitials,
	DISPLAY_NAME_MAX,
	INITIALS_MAX,
	LOCALE_MAX,
	type ProfileErrors,
	type ProfileValues,
	profileValues
} from "./rules";

export type ProfileFormProps = {
	displayName: string | null;
	initials: string | null;
	locale: string | null;
	/** The sign-in address, shown read-only: Supabase Auth owns it, not the profile. */
	email?: string;
};

/**
 * Profile (org-05): the full name, the observer initials and the locale, saved to the DECA Mark account
 * with PATCH /v1/me through the `saveProfile` Server Action. The checks run here first and again on the
 * server. The confirmation is the saved state itself, announced; a refusal says what was not saved. The
 * fields stay editable while a save runs (disabling them would drop focus and hide the text from some
 * screen readers): what is typed meanwhile is kept, and it retires the confirmation it overtook.
 */
export function ProfileForm({ displayName, initials, locale, email }: ProfileFormProps) {
	const [values, setValues] = useState<ProfileValues>({
		displayName: displayName ?? "",
		initials: initials ?? "",
		locale: locale ?? ""
	});
	// What the fields hold right now, for a save that answers after the person kept typing. Written only
	// where the values are set (a change, a settled save), never during render.
	const latest = useRef(values);
	const [errors, setErrors] = useState<ProfileErrors>({});
	const [state, action, pending] = useActionState<ProfileAnswer, FormData>(async (previous, form) => {
		const submitted = profileValues(form);
		let result: Awaited<ReturnType<typeof saveProfile>>;
		try {
			result = await saveProfile(previous, form);
		} catch (error) {
			// The call itself rejected: a rejection in an action state reaches the error boundary and unmounts
			// the form, so it is answered here like a refusal. The fields keep what was typed.
			return { status: "failed", message: rejectedWith(error, "kept", "Nothing was saved.") };
		}
		// The fields show what the server kept (it trims the name and locale), unless they were edited while
		// the save ran: then the newer edits stay, and the answer that no longer describes them is overtaken.
		const settled = settleSave(result, submitted, latest.current);
		if (settled.values !== latest.current) {
			latest.current = settled.values;
			setValues(settled.values);
		}
		return settled.answer;
	}, IDLE);
	const nameRef = useRef<HTMLInputElement>(null);
	const initialsRef = useRef<HTMLInputElement>(null);
	const localeRef = useRef<HTMLInputElement>(null);
	const failureRef = useRef<HTMLDivElement>(null);
	const handled = useRef(state);
	// Edits after an answer retire it: "Profile saved" no longer describes what the fields hold. Edits
	// while a save runs mark the previous answer here; the save's own answer arrives overtaken.
	const [editedAfter, setEditedAfter] = useState<ProfileAnswer | null>(null);
	const answer = shownAnswer(state, editedAfter);
	const shownErrors = { ...answer.errors, ...errors };

	useEffect(() => {
		if (handled.current === state) return;
		handled.current = state;
		if (state.status !== "failed") return;
		if (state.errors?.displayName) nameRef.current?.focus();
		else if (state.errors?.initials) initialsRef.current?.focus();
		else if (state.errors?.locale) localeRef.current?.focus();
		else failureRef.current?.focus();
	}, [state]);

	function change(field: keyof ProfileValues, value: string) {
		latest.current = { ...latest.current, [field]: value };
		setValues(latest.current);
		setErrors(current => ({ ...current, [field]: undefined }));
		setEditedAfter(state);
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		if (pending) return event.preventDefault();
		const found = checkProfile(values);
		setErrors(found);
		if (Object.keys(found).length === 0) return;
		event.preventDefault();
		if (found.displayName) nameRef.current?.focus();
		else if (found.initials) initialsRef.current?.focus();
		else localeRef.current?.focus();
	}

	return (
		<Island title="Profile">
			<form
				action={action}
				noValidate
				onSubmit={submit}
				className="flex flex-col gap-5"
				aria-busy={pending || undefined}>
				<div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
					<Field label="Full name" htmlFor="profile-name" error={shownErrors.displayName}>
						<TextInput
							ref={nameRef}
							name="display_name"
							autoComplete="name"
							maxLength={DISPLAY_NAME_MAX}
							value={values.displayName}
							onChange={event => change("displayName", event.currentTarget.value)}
						/>
					</Field>
					<Field
						label="Observer initials"
						htmlFor="profile-initials"
						hint="Changes apply to future observations; historical codes remain."
						error={shownErrors.initials}>
						<TextInput
							ref={initialsRef}
							name="observer_initials"
							autoComplete="off"
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
							maxLength={INITIALS_MAX}
							placeholder="e.g. PS"
							value={values.initials}
							onChange={event => change("initials", cleanInitials(event.currentTarget.value))}
						/>
					</Field>
					{email && (
						<Field
							label="Email address"
							htmlFor="profile-email"
							className="md:col-span-2"
							hint={
								<span className="inline-flex items-start gap-1.5">
									<Icon name="lock" size={16} className="mt-0.5 shrink-0" />
									<span>Sign-in address. It cannot be changed here.</span>
								</span>
							}>
							<TextInput value={email} readOnly />
						</Field>
					)}
					<Field
						label="Locale"
						htmlFor="profile-locale"
						optional
						hint="A language and region tag, such as en-US."
						error={shownErrors.locale}>
						<TextInput
							ref={localeRef}
							name="locale"
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							maxLength={LOCALE_MAX}
							value={values.locale}
							onChange={event => change("locale", event.currentTarget.value)}
						/>
					</Field>
				</div>
				<div aria-live="polite" aria-atomic="true">
					{answer.status === "saved" && (
						<Note tone="saved" title="Profile saved to your DECA Mark account.">
							{answer.saved?.initials && (
								<>
									New observations use the observer code{" "}
									<span className="font-mono">{answer.saved.initials}</span>.
								</>
							)}
						</Note>
					)}
				</div>
				{answer.status === "failed" && answer.message && (
					<div ref={failureRef} tabIndex={-1} className="rounded-note">
						<Note tone="attention" live="assertive">
							{answer.message}
						</Note>
					</div>
				)}
				<div>
					<Button type="submit" icon="check" busy={pending} busyLabel="Saving profile…">
						Save profile
					</Button>
				</div>
			</form>
		</Island>
	);
}
