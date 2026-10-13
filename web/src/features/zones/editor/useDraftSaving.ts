"use client";

import { useCallback, useEffect, useState } from "react";

import { AccountChangedError } from "@/lib/api/browser";
import { apiRequestError } from "@/lib/api/errors";
import {
	type DraftAddress,
	getZoneDraft,
	replaceZoneDraft,
	validateZoneDraft,
	wasAborted
} from "@/lib/api/zones-browser";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { savedDraft } from "@/lib/zones/schemas";

import { canCheck, CHECK_IDLE_MS, type DraftCheck } from "./checks";
import { queueFailure } from "./failure";
import {
	type Command,
	createQueue,
	type DraftSnapshot,
	type Failure,
	type QueueEvent,
	queueReducer,
	type SavedDraft,
	type SaveQueue
} from "./save-queue";

/**
 * The draft's autosave (UI plan 6.3): the save queue's reducer, carried out against the API. Edits wait
 * 1.5 s after the last change, at most 10 s while editing goes on, and are sent at once when the tab is
 * hidden or loses focus. Only one replacement is ever in flight. DECA Mark checks the saved revision after
 * 10 s without changes, or when asked.
 *
 * Nothing is accepted or sent before the draft is read again from the browser (`ready`): props the router
 * restored from its history may be older than the draft.
 */

/** How long after the last edit a save waits. */
export const SAVE_DEBOUNCE_MS = 1500;
/** The longest a save waits while edits keep coming. */
export const SAVE_MAX_WAIT_MS = 10_000;

export type DraftSaving = {
	readonly queue: SaveQueue;
	/** The draft was read from the browser and edits may start. */
	readonly ready: boolean;
	/** Why that first read failed, when it did. */
	readonly mountProblem: string | null;
	/** Another account signed in: nothing more is sent, and this draft's edits must not be shown. */
	readonly fenced: boolean;
	/** Bumped whenever the local draft is replaced from DECA Mark's, so the editor starts again from it. */
	readonly generation: number;
	readonly check: DraftCheck | null;
	readonly checking: boolean;
	/** Why the last check did not finish, or how long checking is paused. */
	readonly checkProblem: string | null;
	edited(local: DraftSnapshot, invalid: string | null): void;
	flush(): void;
	keepMine(): void;
	takeSaved(): void;
	checkNow(): void;
	retryMount(): void;
};

type SaverState = { readonly queue: SaveQueue; readonly fenced: boolean };

/**
 * The queue and what it sends, outside React: one per editor, for the address the editor is keyed by. Each
 * step the reducer takes is reported to `listen`; each command it returns is sent at once.
 */
function createSaver(address: DraftAddress, initial: SavedDraft) {
	let state: SaverState = { queue: createQueue(initial), fenced: false };
	let listener: ((state: SaverState) => void) | null = null;
	const controllers = new Set<AbortController>();
	let debounce: number | null = null;
	let firstPending: number | null = null;

	function publish(next: SaverState) {
		state = next;
		listener?.(state);
	}

	/** A request's signal, ended with the editor or when another account signs in. */
	function track() {
		const controller = new AbortController();
		controllers.add(controller);
		return { signal: controller.signal, done: () => controllers.delete(controller) };
	}

	function fence() {
		for (const controller of controllers) controller.abort();
		controllers.clear();
		publish({ ...state, fenced: true });
	}

	function send(event: QueueEvent) {
		if (state.fenced) return;
		const step = queueReducer(state.queue, event);
		publish({ ...state, queue: step.queue });
		if (step.command) run(step.command);
	}

	/** A failure as the queue's event: the account fence and an abort are not answers. */
	function failed(error: unknown, event: (failure: Failure) => QueueEvent) {
		if (error instanceof AccountChangedError) return fence();
		if (wasAborted(error)) return;
		send(event(queueFailure(error)));
	}

	function run(command: Command) {
		const { signal, done } = track();
		if (command.type === "put") {
			replaceZoneDraft(address, command.etag, command.snapshot, signal)
				.then(read =>
					send({ type: "put-ok", seq: command.seq, draft: savedDraft(read.draft), requestId: read.requestId })
				)
				.catch(error => failed(error, failure => ({ type: "put-failed", seq: command.seq, failure })))
				.finally(done);
			return;
		}
		getZoneDraft(address, signal)
			.then(read => send({ type: "get-ok", seq: command.seq, draft: savedDraft(read.draft) }))
			.catch(error => failed(error, failure => ({ type: "get-failed", seq: command.seq, failure })))
			.finally(done);
	}

	function flush() {
		if (debounce !== null) window.clearTimeout(debounce);
		debounce = null;
		firstPending = null;
		send({ type: "flush" });
	}

	function edited(local: DraftSnapshot, invalid: string | null) {
		send({ type: "edited", local, invalid });
		const now = Date.now();
		firstPending ??= now;
		if (debounce !== null) window.clearTimeout(debounce);
		const waited = now - firstPending;
		if (waited >= SAVE_MAX_WAIT_MS) flush();
		else debounce = window.setTimeout(flush, Math.min(SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS - waited));
	}

	return {
		get state() {
			return state;
		},
		listen(next: (state: SaverState) => void) {
			listener = next;
			return () => {
				if (listener === next) listener = null;
			};
		},
		send,
		flush,
		edited,
		fence,
		track,
		dispose() {
			for (const controller of controllers) controller.abort();
			controllers.clear();
			if (debounce !== null) window.clearTimeout(debounce);
			listener = null;
		}
	};
}

export function useDraftSaving(address: DraftAddress, initial: SavedDraft): DraftSaving {
	const [saver] = useState(() => createSaver(address, initial));
	const [{ queue, fenced }, setState] = useState<SaverState>(saver.state);
	const [ready, setReady] = useState(false);
	const [mountProblem, setMountProblem] = useState<string | null>(null);
	const [mountAttempt, setMountAttempt] = useState(0);
	const [generation, setGeneration] = useState(0);
	const [check, setCheck] = useState<DraftCheck | null>(null);
	const [checking, setChecking] = useState(false);
	const [checkProblem, setCheckProblem] = useState<string | null>(null);
	const [checkWaitUntil, setCheckWaitUntil] = useState(0);

	useEffect(() => {
		const stop = saver.listen(setState);
		return () => {
			stop();
			saver.dispose();
		};
	}, [saver]);

	/* ── The first read, before anything is accepted ───────────────────── */

	useEffect(() => {
		const { signal, done } = saver.track();
		getZoneDraft(address, signal)
			.then(read => {
				saver.send({ type: "mounted", draft: savedDraft(read.draft) });
				setMountProblem(null);
				setReady(true);
			})
			.catch(error => {
				if (error instanceof AccountChangedError) return saver.fence();
				if (wasAborted(error)) return;
				setMountProblem(apiRequestError(error).message);
			})
			.finally(done);
	}, [saver, address, mountAttempt]);

	/* ── When to send: leaving the tab, the connection, a wait, the account ── */

	useEffect(() => {
		const flush = () => saver.flush();
		const onHidden = () => {
			if (document.visibilityState === "hidden") flush();
		};
		const onOnline = () => saver.send({ type: "online" });
		const onOffline = () => saver.send({ type: "offline" });
		window.addEventListener("blur", flush);
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", onHidden);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);
		if (navigator.onLine === false) onOffline();
		return () => {
			window.removeEventListener("blur", flush);
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", onHidden);
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
		};
	}, [saver]);

	useEffect(() => {
		let supabase: ReturnType<typeof createSupabaseClient>;
		try {
			supabase = createSupabaseClient();
		} catch {
			return;
		}
		const { data } = supabase.auth.onAuthStateChange((event, session) => {
			if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return;
			if (session && session.user.id !== address.userId) saver.fence();
			else if (session) saver.send({ type: "signed-in" });
		});
		return () => data.subscription.unsubscribe();
	}, [saver, address.userId]);

	const waiting = queue.pause?.kind === "waiting" ? queue.pause.seconds : null;
	useEffect(() => {
		if (waiting === null) return;
		const timer = window.setTimeout(() => saver.flush(), waiting * 1000);
		return () => window.clearTimeout(timer);
	}, [saver, waiting]);

	/* ── DECA Mark's checks of the saved revision ──────────────────────── */

	const runCheck = useCallback(() => {
		const now = saver.state.queue;
		if (saver.state.fenced || !canCheck(now) || Date.now() < checkWaitUntil) return;
		const { revision, etag } = now.acknowledged;
		const { signal, done } = saver.track();
		setChecking(true);
		setCheckProblem(null);
		validateZoneDraft(address, etag, signal)
			.then(validation => {
				// A check for a revision the draft has left behind is dropped; the next one follows.
				if (validation.revision !== revision || saver.state.queue.acknowledged.revision !== revision) return;
				setCheck({ revision, checkedAt: new Date().toISOString(), validation });
			})
			.catch(error => {
				if (error instanceof AccountChangedError) return saver.fence();
				if (wasAborted(error)) return;
				const failure = queueFailure(error);
				if (failure.kind === "http" && failure.status === 412) {
					// Stale only if nothing moved here meanwhile; otherwise the next check follows the save.
					const later = saver.state.queue;
					if (later.acknowledged.revision === revision && !later.inFlight) saver.send({ type: "stale" });
					return;
				}
				if (failure.kind === "http" && failure.status === 429) {
					const seconds = failure.retryAfter ?? 20;
					setCheckWaitUntil(Date.now() + seconds * 1000);
					setCheckProblem(`Checking paused for ${seconds} s.`);
					return;
				}
				setCheckProblem(`The boundaries were not checked. ${apiRequestError(error).message}`);
			})
			.finally(() => {
				done();
				setChecking(false);
			});
	}, [saver, address, checkWaitUntil]);

	const checkable = ready && !fenced && canCheck(queue) && check?.revision !== queue.acknowledged.revision;
	const revision = queue.acknowledged.revision;
	useEffect(() => {
		if (!checkable || checking) return;
		const delay = Math.max(CHECK_IDLE_MS, checkWaitUntil - Date.now());
		const timer = window.setTimeout(runCheck, delay);
		return () => window.clearTimeout(timer);
	}, [checkable, checking, checkWaitUntil, runCheck, revision]);

	const edited = useCallback((local: DraftSnapshot, invalid: string | null) => saver.edited(local, invalid), [saver]);
	const flush = useCallback(() => saver.flush(), [saver]);
	const keepMine = useCallback(() => saver.send({ type: "keep-mine" }), [saver]);
	const takeSaved = useCallback(() => {
		saver.send({ type: "take-saved" });
		setGeneration(value => value + 1);
	}, [saver]);
	const retryMount = useCallback(() => {
		setMountProblem(null);
		setMountAttempt(value => value + 1);
	}, []);

	return {
		queue,
		ready,
		mountProblem,
		fenced,
		generation,
		check,
		checking,
		checkProblem,
		edited,
		flush,
		keepMine,
		takeSaved,
		checkNow: runCheck,
		retryMount
	};
}
