"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PLACE_COOKIE } from "@/features/shell/navigation";
import { safeNext } from "@/lib/auth/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";

export type AuthState = {
	readonly message: string;
	readonly verify?: boolean;
	readonly retryAfter?: number;
	/** A resend went through: the message is a confirmation, not an error. */
	readonly sent?: boolean;
};
const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(8).max(128);
const cookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax",
	path: "/",
	maxAge: 1800
} as const;

function failure(error: { readonly code?: string; readonly status?: number }): AuthState {
	if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")
		return { message: "Too many attempts. Wait one minute before trying again.", retryAfter: 60 };
	if (error.code === "email_not_confirmed") return { message: "Verify your email before signing in.", verify: true };
	if (error.code === "invalid_credentials") return { message: "The email or password is incorrect." };
	if (error.code === "otp_expired") return { message: "That code is invalid or expired. Request a new code." };
	if (error.code === "same_password") return { message: "Choose a password different from your current password." };
	return { message: "This request could not be completed. Check your details and try again." };
}

export async function authenticate(_state: AuthState, form: FormData): Promise<AuthState> {
	const intent = form.get("intent");
	const supabase = await createClient();
	const store = await cookies();
	const next = safeNext(form.get("next"));
	if (intent === "verify" || intent === "reset-password") {
		const email = store.get(intent === "verify" ? "fm-verify-email" : "fm-recovery-email")?.value;
		if (!email) return { message: "Start again with your email address; this verification request expired." };
		const code = z
			.string()
			.regex(/^\d{6}$/)
			.safeParse(form.get("code"));
		if (!code.success) return { message: "Enter the six-digit code from your email." };
		const password = passwordSchema.safeParse(form.get("password"));
		if (intent === "reset-password" && !password.success)
			return { message: "Use a password between 8 and 128 characters." };
		let recoveryVerified = false;
		if (intent === "reset-password" && store.get("fm-recovery-user")?.value) {
			const {
				data: { user },
				error: userError
			} = await supabase.auth.getUser();
			const { data: claims, error: claimsError } = await supabase.auth.getClaims();
			const sessionId = z.uuid().safeParse(claims?.claims.session_id);
			recoveryVerified =
				!userError &&
				!claimsError &&
				Boolean(
					user &&
					sessionId.success &&
					user.email === email &&
					store.get("fm-recovery-user")?.value === `${user.id}:${sessionId.data}`
				);
		}
		if (!recoveryVerified) {
			const { error } = await supabase.auth.verifyOtp({
				email,
				token: code.data,
				type: intent === "verify" ? "email" : "recovery"
			});
			if (error) return failure(error);
			if (intent === "reset-password") {
				const { data, error: claimsError } = await supabase.auth.getClaims();
				const sessionId = z.uuid().safeParse(data?.claims.session_id);
				if (claimsError || !data?.claims.sub || !sessionId.success)
					return { message: "That recovery code has expired. Ask for a new one." };
				// Workflow marker only: retries still authenticate the user and session with Supabase.
				store.set("fm-recovery-user", `${data.claims.sub}:${sessionId.data}`, cookieOptions);
			}
		}
		if (intent === "reset-password" && password.success) {
			const result = await supabase.auth.updateUser({ password: password.data });
			if (result.error) return failure(result.error);
			store.delete("fm-recovery-email");
			store.delete("fm-recovery-user");
		} else store.delete("fm-verify-email");
		redirect(next);
	}
	if (intent === "resend" || intent === "resend-recovery") {
		const recovery = intent === "resend-recovery";
		const email = store.get(recovery ? "fm-recovery-email" : "fm-verify-email")?.value;
		if (!email) return { message: "Start again with your email address." };
		const remaining = Math.ceil((Number(store.get("fm-email-sent")?.value ?? 0) + 60000 - Date.now()) / 1000);
		if (remaining > 0) return { message: "Wait before requesting another code.", retryAfter: remaining };
		const { error } = recovery
			? await supabase.auth.resetPasswordForEmail(email)
			: await supabase.auth.resend({ type: "signup", email });
		if (error) return failure(error);
		store.set("fm-email-sent", String(Date.now()), cookieOptions);
		return { message: "If this email is eligible, a new code is on its way.", retryAfter: 60, sent: true };
	}
	const email = emailSchema.safeParse(form.get("email"));
	if (!email.success) return { message: "Enter a valid email address." };
	if (intent === "forgot-password") {
		store.delete("fm-recovery-user");
		const { error } = await supabase.auth.resetPasswordForEmail(email.data);
		if (error) return failure(error);
		store.set("fm-recovery-email", email.data, cookieOptions);
		store.set("fm-email-sent", String(Date.now()), cookieOptions);
		redirect(`/reset-password?next=${encodeURIComponent(next)}`);
	}
	const password = passwordSchema.safeParse(form.get("password"));
	if (!password.success) return { message: "Use a password between 8 and 128 characters." };
	if (intent === "sign-up") {
		const { error } = await supabase.auth.signUp({ email: email.data, password: password.data });
		if (error) return failure(error);
		store.set("fm-verify-email", email.data, cookieOptions);
		store.set("fm-email-sent", String(Date.now()), cookieOptions);
		redirect(`/verify?next=${encodeURIComponent(next)}`);
	}
	if (intent !== "sign-in") return { message: "Choose a valid account action." };
	const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
	if (error) {
		if (error.code === "email_not_confirmed") store.set("fm-verify-email", email.data, cookieOptions);
		return failure(error);
	}
	redirect(next);
}

/**
 * Sign out ends this browser's session only. Auth's default scope is `global`, which would revoke the same
 * account's session on the phone collector as well; "Signing out here does not affect the app" (Account)
 * has to stay true. The last place (`fm-place`) is forgotten too, so the next person here starts from `/o`.
 */
export async function signOut(): Promise<void> {
	const { supabase } = await requireUser();
	const { error } = await supabase.auth.signOut({ scope: "local" });
	if (error) throw error;
	const store = await cookies();
	store.delete("fm-verify-email");
	store.delete("fm-recovery-email");
	store.delete("fm-recovery-user");
	store.delete("fm-email-sent");
	store.delete(PLACE_COOKIE);
	redirect("/sign-in");
}
