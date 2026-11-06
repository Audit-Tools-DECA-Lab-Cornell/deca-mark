"use client";

import { type ReactNode, type RefObject, useActionState, useEffect, useId, useRef, useState } from "react";

import { Note, type NoteTone } from "@/components/contour/Note";
import { TextLink } from "@/components/contour/TextLink";
import { authRejectionCopy } from "@/lib/action-rejection";
import { authenticate, type AuthState } from "@/lib/auth/actions";

/** A form's state before the server has answered. */
export const NO_MESSAGE: AuthState = { message: "" };

/** The fields a server message can be about. */
export type AuthField = "email" | "password" | "code";

/**
 * Which field a message from `authenticate` is about, read from its wording. That wording is a contract
 * (tests/auth.test.mjs, tests/auth-local.test.mjs), so it is stable enough to steer focus by.
 */
export function fieldOf(message: string): AuthField | undefined {
	if (/six-digit code|invalid or expired/i.test(message)) return "code";
	if (/password between|different from your current password/i.test(message)) return "password";
	if (/valid email address/i.test(message)) return "email";
	return undefined;
}

/**
 * The server no longer holds the address a code went to (its httpOnly cookie lasts 30 minutes), so the
 * flow starts over from the email address. The code forms then offer the way back.
 */
export function asksToStartAgain(state: AuthState): boolean {
	return /^Start again with your email address/.test(state.message);
}

/** The way back to the email address, after a message that asks to start again. */
export function StartAgainLink({ href }: { href: string }) {
	return (
		<>
			{" "}
			<TextLink href={href}>Enter your email again</TextLink>
		</>
	);
}

export type AuthActionOptions = {
	/** The fields a message can send focus to. A field the form does not have is left out. */
	fields?: Partial<Record<AuthField, RefObject<HTMLInputElement | null>>>;
	/** Called with the server's `retryAfter`, so the form's cooldown starts from the server. */
	onRetryAfter?: (seconds: number) => void;
};

/**
 * One form's round trip through the `authenticate` Server Action. The form keeps its own checks and only
 * submits when they pass; this posts the FormData, starts the cooldown the server asks for, and moves
 * focus to what the answer is about: the field it names (a wrong code is reselected), or else the message.
 * A successful answer is a redirect, so it never comes back here.
 */
export function useAuthAction({ fields, onRetryAfter }: AuthActionOptions = {}) {
	const [state, action, pending] = useActionState<AuthState, FormData>(async (previous, form) => {
		let result: Awaited<ReturnType<typeof authenticate>>;
		try {
			result = await authenticate(previous, form);
		} catch (error) {
			// A redirect (signed in, on to the next page) is rethrown by `authRejectionCopy`. Anything else rejected
			// the call itself: the form stays mounted with what was typed.
			return { message: authRejectionCopy(error) };
		}
		if (!result) return previous;
		if (result.retryAfter) onRetryAfter?.(result.retryAfter);
		return result;
	}, NO_MESSAGE);
	const noteId = useId();
	const noteRef = useRef<HTMLDivElement>(null);
	const handled = useRef(NO_MESSAGE);
	// The answer the person has since edited a field after, which clears that field's attention edge.
	const [editedAfter, setEditedAfter] = useState<AuthState | null>(null);
	const field = state.message ? fieldOf(state.message) : undefined;

	useEffect(() => {
		if (handled.current === state) return;
		handled.current = state;
		if (!state.message) return;
		const input = field ? fields?.[field]?.current : undefined;
		if (!input) {
			noteRef.current?.focus();
			return;
		}
		input.focus();
		if (field === "code") input.select();
	}, [state, field, fields]);

	return {
		state,
		action,
		pending,
		/** Draws the attention edge on the field the answer is about, until the person changes something. */
		invalid: (name: AuthField) => field === name && editedAfter !== state,
		/** Links the field the answer is about to the message, so focusing it reads the message. */
		describedBy: (name: AuthField) => (field === name && state.message ? noteId : undefined),
		/** Call from a field's onChange. */
		edited: () => setEditedAfter(state),
		note: { id: noteId, ref: noteRef, state }
	};
}

export type ServerMessageProps = {
	id: string;
	ref: RefObject<HTMLDivElement | null>;
	state: AuthState;
	/** A way forward after the message, such as "Enter verification code". */
	children?: ReactNode;
};

/**
 * The server's answer as the form's error: an attention note that is announced as an alert and can take
 * focus. Nothing is shown before the first answer.
 */
export function ServerMessage({ id, ref, state, children }: ServerMessageProps) {
	if (!state.message) return null;
	return (
		<div ref={ref} id={id} tabIndex={-1} className="rounded-note">
			<Note tone="attention" live="assertive">
				{state.message}
				{children}
			</Note>
		</div>
	);
}

/**
 * The answer to a resend: a confirmation, a wait, or a problem. It sits in a polite live region that is on
 * the page from the start, so the answer is announced without taking focus from the code field. When the
 * server asks to start again, the note links back to `startAgainHref`.
 */
export function ResendMessage({ state, startAgainHref }: { state: AuthState; startAgainHref: string }) {
	const tone: NoteTone = state.sent ? "neutral" : state.retryAfter ? "waiting" : "attention";
	return (
		<div aria-live="polite" aria-atomic="true">
			{state.message && (
				<Note tone={tone} icon={state.sent ? "mail" : undefined}>
					{state.message}
					{asksToStartAgain(state) && <StartAgainLink href={startAgainHref} />}
				</Note>
			)}
		</div>
	);
}
