"use client";

import { type RefObject, useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/contour/Button";
import { authRejectionCopy } from "@/lib/action-rejection";
import { authenticate, type AuthState } from "@/lib/auth/actions";

import { NO_MESSAGE, ResendMessage } from "./useAuthAction";
import { formatCountdown, useCooldown } from "./useCooldown";

export type CodeFormKind = "verify" | "reset-password";

/**
 * The resend button for a code screen, as its own form posting `resend` (sign-up code) or `resend-recovery`
 * (recovery code). The wait comes from the server: the page passes what was left when it rendered, and
 * each answer's `retryAfter` restarts it. Afterwards focus goes back to the code field.
 */
export function ResendCodeForm({
	kind,
	cooldownSeconds,
	codeRef,
	startAgainHref
}: {
	kind: CodeFormKind;
	cooldownSeconds: number;
	codeRef: RefObject<HTMLInputElement | null>;
	/** Where the person enters their address again, if the server no longer holds it. */
	startAgainHref: string;
}) {
	const cooldown = useCooldown(cooldownSeconds);
	const [state, action, pending] = useActionState<AuthState, FormData>(async (previous, form) => {
		let result: Awaited<ReturnType<typeof authenticate>>;
		try {
			result = await authenticate(previous, form);
		} catch (error) {
			return { message: authRejectionCopy(error) };
		}
		if (!result) return previous;
		if (result.retryAfter) cooldown.start(result.retryAfter);
		return result;
	}, NO_MESSAGE);
	const handled = useRef(state);
	const waiting = cooldown.remaining > 0;

	useEffect(() => {
		if (handled.current === state) return;
		handled.current = state;
		codeRef.current?.focus();
	}, [state, codeRef]);

	return (
		<form
			action={action}
			onSubmit={event => {
				if (pending || waiting) event.preventDefault();
			}}
			className="flex flex-col gap-5"
			aria-busy={pending || undefined}>
			<input type="hidden" name="intent" value={kind === "verify" ? "resend" : "resend-recovery"} />
			<Button
				type="submit"
				variant="outline"
				size="lg"
				fullWidth
				icon="rotate-cw"
				busy={pending}
				busyLabel="Sending a new code…"
				disabled={waiting}
				disabledReason="A new code can be sent once a minute.">
				{waiting ? (
					<>
						Resend in <span className="font-mono tnum">{formatCountdown(cooldown.remaining)}</span>
					</>
				) : (
					"Resend code"
				)}
			</Button>
			<ResendMessage state={state} startAgainHref={startAgainHref} />
		</form>
	);
}
