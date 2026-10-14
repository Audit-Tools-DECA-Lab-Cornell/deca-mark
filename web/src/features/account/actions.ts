"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { type AccountDeletion, deleteAccount, session, updateProfile } from "@/lib/api/client";
import { ApiError, errorCopy, failedWrite } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";

import { confirmedBySignedIn, OTHER_ACCOUNT_SIGNED_IN } from "./deletion";
import { checkProfile, type ProfileErrors, type ProfileValues, profileValues } from "./rules";

export type ProfileState = {
	readonly status: "idle" | "saved" | "failed";
	readonly message?: string;
	readonly errors?: ProfileErrors;
	/** What the server saved, as the fields show it (an empty field is a cleared value). */
	readonly saved?: ProfileValues;
};

/**
 * Edit profile: checks the fields again, then PATCH /v1/me. An empty field clears that part of the
 * profile. The account page re-reads the profile afterwards, so the header and title follow.
 */
export async function saveProfile(_state: ProfileState, form: FormData): Promise<ProfileState> {
	const values = profileValues(form);
	const errors = checkProfile(values);
	if (Object.keys(errors).length > 0)
		return { status: "failed", errors, message: "Nothing was saved. Check the fields marked below." };
	try {
		const profile = await updateProfile({
			display_name: values.displayName.trim() || null,
			observer_initials: values.initials || null,
			locale: values.locale.trim() || null
		});
		revalidatePath("/account");
		// The header's name and initials come from the workspace read in the /o layouts.
		revalidatePath("/o", "layout");
		return {
			status: "saved",
			saved: {
				displayName: profile.display_name ?? "",
				initials: profile.observer_initials ?? "",
				locale: profile.locale ?? ""
			}
		};
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { status: "failed", message: failedWrite("Nothing was saved.", error) };
	}
}

export type DeletionState = {
	readonly status: "idle" | "pending" | "failed";
	readonly message?: string;
	/** 409 sole_owner: an organization or project would be left without an owner or manager. */
	readonly blocked?: boolean;
	/** The session has ended; signing in again is the way forward. */
	readonly signIn?: boolean;
	/** A different account is signed in on this browser now, so nothing was sent. */
	readonly otherAccount?: boolean;
};

/** The cookies the auth flows keep beside the Supabase session (src/lib/auth/actions.ts). */
const AUTH_FLOW_COOKIES = ["fm-verify-email", "fm-recovery-email", "fm-recovery-user", "fm-email-sent"];

/**
 * Delete account: DELETE /v1/me, after the person typed DELETE, and only for the account the dialog was
 * opened for (the form's `account`). 204 ends the session here and lands on
 * sign in (the page leaves a flash for it). 202 says the sign-in is still being removed. 409 sole_owner,
 * and every other refusal say that nothing was deleted, and why; a lost answer or a 5xx says the deletion could not be confirmed.
 */
export async function requestAccountDeletion(_state: DeletionState, form: FormData): Promise<DeletionState> {
	const confirm = form.get("confirm");
	if (typeof confirm !== "string" || confirm.trim() !== "DELETE")
		return { status: "failed", message: "Nothing was deleted. Type DELETE to confirm." };
	let outcome: AccountDeletion;
	try {
		// The API deletes whoever this request is signed in as; this request's session is checked first.
		const current = await session();
		if (current.status === "signed-in" && !confirmedBySignedIn(form.get("account"), current.userId))
			return { status: "failed", otherAccount: true, message: OTHER_ACCOUNT_SIGNED_IN };
		outcome = await deleteAccount();
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		if (error.code === "sole_owner")
			return { status: "failed", blocked: true, message: `Nothing was deleted. ${errorCopy.sole_owner}` };
		return {
			status: "failed",
			message: failedWrite("Nothing was deleted.", error),
			signIn: error.kind === "sign-in"
		};
	}
	if (outcome === "unavailable")
		return {
			status: "failed",
			message: "Deleting accounts is not available yet. Nothing was deleted."
		};
	if (outcome === "pending") return { status: "pending" };
	// The sign-in no longer exists, so end the session here only; the server has nothing left to revoke.
	const supabase = await createClient();
	const { error } = await supabase.auth.signOut({ scope: "local" });
	const store = await cookies();
	// If Auth could not be reached, drop the session cookies anyway: the account they name is gone.
	if (error) for (const cookie of store.getAll()) if (cookie.name.startsWith("sb-")) store.delete(cookie.name);
	for (const name of AUTH_FLOW_COOKIES) store.delete(name);
	redirect("/sign-in");
}
