import { type DraftZone, normalizeDraftZones, sameZones } from "@/lib/zones/geometry";

/**
 * The draft's save queue as a pure reducer (UI plan 6.3 and 5.9). The server draft is the only
 * persistence; this decides when to send the next whole-draft replacement, what a response means, and when
 * to stop and let the manager choose. It never sends anything itself: each step returns at most one
 * command (a PUT with If-Match, or a GET of the draft), and the effect hook that carries it out reports back
 * with the command's sequence number. A response for any other sequence is ignored, so a late response can
 * never roll the draft back.
 *
 * Only one PUT is ever in flight. Edits made meanwhile wait and are sent once it settles.
 */

export type DraftSnapshot = { readonly zones: readonly DraftZone[]; readonly changeNote: string };

/** A draft as read back from the server, in the queue's own words (the adapter maps the wire fields). */
export type SavedDraft = DraftSnapshot & {
	readonly revision: number;
	readonly etag: string;
	readonly state: "draft" | "published" | "discarded";
	readonly updatedAt: string;
	/** The display name of whoever saved last, when known. */
	readonly updatedBy: string | null;
	readonly publishedPackageId: string | null;
};

export type Acknowledged = DraftSnapshot & {
	readonly revision: number;
	readonly etag: string;
	readonly updatedAt: string;
	readonly updatedBy: string | null;
};

export type IssueRef = { readonly code: string; readonly zoneIds: readonly string[]; readonly path: string };

/** How a request ended without a usable answer. */
export type Failure =
	| {
			readonly kind: "http";
			readonly status: number;
			readonly code?: string;
			readonly issues?: readonly IssueRef[];
			/** Seconds to wait, from `Retry-After`. */
			readonly retryAfter?: number;
			readonly requestId?: string;
	  }
	| { readonly kind: "network"; readonly requestId?: string };

/** Why saving stopped, until the manager or the connection acts. */
export type Pause =
	/** The last PUT got no answer: the draft is read back to find out whether it was saved. */
	| { readonly kind: "unconfirmed" }
	/** Someone else saved first (412), or a check after an unconfirmed save found another revision. */
	| { readonly kind: "conflict"; readonly server: SavedDraft | null }
	/** A missing or malformed precondition (428) is a defect here: the draft is reloaded, edits kept. */
	| { readonly kind: "precondition"; readonly server: SavedDraft | null; readonly requestId?: string }
	/** The draft was published or discarded elsewhere (409, or found on reading it back). */
	| { readonly kind: "closed"; readonly server: SavedDraft | null }
	| { readonly kind: "signed-out" }
	| { readonly kind: "no-access" }
	| { readonly kind: "too-large" }
	/** The server refused the draft's structure; saving resumes with the next edit. */
	| { readonly kind: "rejected"; readonly issues: readonly IssueRef[] }
	/** Asked to wait (429); the hook flushes again after `seconds`. */
	| { readonly kind: "waiting"; readonly seconds: number };

type InFlight = { readonly seq: number; readonly snapshot: DraftSnapshot; readonly baseRevision: number };
type Reading = { readonly seq: number; readonly reason: "verify" | "conflict" | "reload" | "closed" };

export type SaveQueue = {
	readonly acknowledged: Acknowledged;
	readonly local: DraftSnapshot;
	/** Why the local draft cannot be sent (its structure fails), or null. */
	readonly invalid: string | null;
	readonly inFlight: InFlight | null;
	readonly reading: Reading | null;
	readonly seq: number;
	readonly pause: Pause | null;
	readonly offline: boolean;
	/** The request whose stored draft did not match what was sent, kept for the report. */
	readonly echoMismatch: string | null;
};

export type Command =
	| { readonly type: "put"; readonly seq: number; readonly snapshot: DraftSnapshot; readonly etag: string }
	| { readonly type: "get"; readonly seq: number; readonly reason: Reading["reason"] };

export type QueueEvent =
	| { readonly type: "edited"; readonly local: DraftSnapshot; readonly invalid: string | null }
	| { readonly type: "flush" }
	| { readonly type: "put-ok"; readonly seq: number; readonly draft: SavedDraft; readonly requestId?: string }
	| { readonly type: "put-failed"; readonly seq: number; readonly failure: Failure }
	| { readonly type: "get-ok"; readonly seq: number; readonly draft: SavedDraft }
	| { readonly type: "get-failed"; readonly seq: number; readonly failure: Failure }
	| { readonly type: "offline" }
	| { readonly type: "online" }
	| { readonly type: "signed-in" }
	/** Conflict choice: replace the saved draft with these edits (an explicit PUT with the saved ETag). */
	| { readonly type: "keep-mine" }
	/** Conflict choice: drop these edits and continue from the saved draft. */
	| { readonly type: "take-saved" }
	/** The first read after the editor mounts: adopt the server's draft when it is newer. */
	| { readonly type: "mounted"; readonly draft: SavedDraft }
	/**
	 * A check of the acknowledged revision was refused as stale (412) while nothing was being saved: someone
	 * else saved since. The draft is read, as for a refused save.
	 */
	| { readonly type: "stale" };

export type QueueStep = { readonly queue: SaveQueue; readonly command: Command | null };

export function createQueue(draft: SavedDraft): SaveQueue {
	const snapshot: DraftSnapshot = { zones: draft.zones, changeNote: draft.changeNote };
	return {
		acknowledged: acknowledge(snapshot, draft),
		local: snapshot,
		invalid: null,
		inFlight: null,
		reading: null,
		seq: 0,
		pause: draft.state === "draft" ? null : { kind: "closed", server: draft },
		offline: false,
		echoMismatch: null
	};
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function acknowledge(snapshot: DraftSnapshot, draft: SavedDraft): Acknowledged {
	return {
		zones: snapshot.zones,
		changeNote: snapshot.changeNote,
		revision: draft.revision,
		etag: draft.etag,
		updatedAt: draft.updatedAt,
		updatedBy: draft.updatedBy
	};
}

/** Whether two snapshots are the same draft after the server's normalisation (trimmed text, lowercase IDs). */
export function sameSnapshot(a: DraftSnapshot, b: DraftSnapshot): boolean {
	return a.changeNote.trim() === b.changeNote.trim() && sameZones(a.zones, b.zones);
}

/** Whether the server stored exactly what was sent: the zones, normalised as the server does, and the note. */
function stored(sent: DraftSnapshot, draft: SavedDraft): boolean {
	return sameZones(normalizeDraftZones(sent.zones), draft.zones) && sent.changeNote.trim() === draft.changeNote;
}

export function isDirty(queue: SaveQueue): boolean {
	return !sameSnapshot(queue.local, queue.acknowledged);
}

const step = (queue: SaveQueue, command: Command | null = null): QueueStep => ({ queue, command });

/** Sends the local draft when nothing stops it: no pause, nothing in flight, valid, and changed. */
function trySend(queue: SaveQueue): QueueStep {
	if (queue.pause || queue.offline || queue.inFlight || queue.reading || queue.invalid || !isDirty(queue))
		return step(queue);
	const seq = queue.seq + 1;
	const snapshot = queue.local;
	return step(
		{ ...queue, seq, inFlight: { seq, snapshot, baseRevision: queue.acknowledged.revision } },
		{ type: "put", seq, snapshot, etag: queue.acknowledged.etag }
	);
}

/**
 * The read a pause is still waiting for, when none is under way: an unconfirmed save is checked, and a
 * conflict, a precondition failure or a closed draft whose read got no answer reads the draft again. A pause
 * that already holds the saved draft needs no read.
 */
function readPending(queue: SaveQueue): Reading["reason"] | null {
	const pause = queue.pause;
	if (!pause || queue.reading || queue.offline) return null;
	switch (pause.kind) {
		case "unconfirmed":
			return "verify";
		case "conflict":
			return pause.server ? null : "conflict";
		case "precondition":
			return pause.server ? null : "reload";
		case "closed":
			return pause.server ? null : "closed";
		default:
			return null;
	}
}

function read(queue: SaveQueue, reason: Reading["reason"], pause: Pause | null): QueueStep {
	const seq = queue.seq + 1;
	return step({ ...queue, seq, pause, reading: { seq, reason } }, { type: "get", seq, reason });
}

/** Statuses that are still answers from the server, as opposed to no answer at all. */
const definite = (failure: Failure) => failure.kind === "http" && failure.status < 500;

function tooLarge(failure: Failure): boolean {
	return (
		failure.kind === "http" &&
		(failure.status === 413 ||
			(failure.status === 422 && (failure.issues ?? []).some(issue => issue.code === "too_complex")))
	);
}

/* ── The reducer ──────────────────────────────────────────────────────────── */

export function queueReducer(queue: SaveQueue, event: QueueEvent): QueueStep {
	switch (event.type) {
		case "edited": {
			const next = { ...queue, local: event.local, invalid: event.invalid };
			// "Fix and continue": the next edit after a refusal, or after the draft was too large, is sent again.
			// The structural check behind `invalid` still holds back a draft over the limits.
			const resumes = next.pause?.kind === "rejected" || next.pause?.kind === "too-large";
			return step(resumes ? { ...next, pause: null } : next);
		}

		case "flush": {
			const unread = readPending(queue);
			if (unread) return read(queue, unread, queue.pause);
			if (queue.pause?.kind === "waiting") return trySend({ ...queue, pause: null });
			return trySend(queue);
		}

		case "put-ok": {
			const flight = queue.inFlight;
			if (!flight || flight.seq !== event.seq) return step(queue);
			const echoMismatch = stored(flight.snapshot, event.draft)
				? queue.echoMismatch
				: (event.requestId ?? "unknown");
			return trySend({
				...queue,
				acknowledged: acknowledge(flight.snapshot, event.draft),
				inFlight: null,
				echoMismatch
			});
		}

		case "put-failed": {
			const flight = queue.inFlight;
			if (!flight || flight.seq !== event.seq) return step(queue);
			const { failure } = event;
			if (!definite(failure)) {
				// No answer: maybe saved, maybe not. Read the draft back before anything else is sent.
				if (queue.offline) return step({ ...queue, pause: { kind: "unconfirmed" } });
				return read(queue, "verify", { kind: "unconfirmed" });
			}
			const settled = { ...queue, inFlight: null };
			const status = failure.kind === "http" ? failure.status : 0;
			if (status === 412) return read(settled, "conflict", { kind: "conflict", server: null });
			if (status === 428)
				return read(settled, "reload", { kind: "precondition", server: null, requestId: failure.requestId });
			if (status === 409) return read(settled, "closed", { kind: "closed", server: null });
			if (tooLarge(failure)) return step({ ...settled, pause: { kind: "too-large" } });
			if (status === 401) return step({ ...settled, pause: { kind: "signed-out" } });
			if (status === 403 || status === 404) return step({ ...settled, pause: { kind: "no-access" } });
			if (status === 429)
				return step({
					...settled,
					pause: { kind: "waiting", seconds: failure.kind === "http" ? (failure.retryAfter ?? 20) : 20 }
				});
			return step({
				...settled,
				pause: { kind: "rejected", issues: failure.kind === "http" ? (failure.issues ?? []) : [] }
			});
		}

		case "get-ok": {
			const reading = queue.reading;
			if (!reading || reading.seq !== event.seq) return step(queue);
			const { draft } = event;
			const done = { ...queue, reading: null };
			if (draft.state !== "draft")
				return step({ ...done, inFlight: null, pause: { kind: "closed", server: draft } });
			if (reading.reason === "verify") {
				const flight = queue.inFlight;
				if (!flight) return trySend({ ...done, pause: null });
				if (draft.revision === flight.baseRevision + 1 && stored(flight.snapshot, draft)) {
					// It was saved: acknowledge it, then send anything newer.
					return trySend({
						...done,
						pause: null,
						inFlight: null,
						acknowledged: acknowledge(flight.snapshot, draft)
					});
				}
				// Not saved: send again. Saved by someone else: a conflict.
				if (draft.revision === flight.baseRevision) return trySend({ ...done, pause: null, inFlight: null });
				return step({ ...done, inFlight: null, pause: { kind: "conflict", server: draft } });
			}
			if (reading.reason === "reload")
				return step({
					...done,
					pause: {
						kind: "precondition",
						server: draft,
						...(queue.pause?.kind === "precondition" && queue.pause.requestId
							? { requestId: queue.pause.requestId }
							: {})
					}
				});
			return step({ ...done, pause: { kind: "conflict", server: draft } });
		}

		case "get-failed": {
			const reading = queue.reading;
			if (!reading || reading.seq !== event.seq) return step(queue);
			const done = { ...queue, reading: null };
			const status = event.failure.kind === "http" ? event.failure.status : 0;
			if (status === 401) return step({ ...done, pause: { kind: "signed-out" } });
			if (status === 403 || status === 404)
				return step({ ...done, inFlight: null, pause: { kind: "no-access" } });
			// No answer: keep the pause, which still needs its read; the next flush (or reconnecting) reads again.
			return step(done);
		}

		case "offline":
			return step({ ...queue, offline: true });
		case "online": {
			const back = { ...queue, offline: false };
			const unread = readPending(back);
			if (unread) return read(back, unread, back.pause);
			return trySend(back);
		}
		case "signed-in": {
			if (queue.pause?.kind !== "signed-out") return trySend(queue);
			// A save sent before the sign-out may have landed: check it first.
			if (queue.inFlight) return read(queue, "verify", { kind: "unconfirmed" });
			return trySend({ ...queue, pause: null });
		}

		case "keep-mine": {
			const pause = queue.pause;
			if ((pause?.kind !== "conflict" && pause?.kind !== "precondition") || !pause.server) return step(queue);
			const server = pause.server;
			return trySend({
				...queue,
				pause: null,
				acknowledged: acknowledge({ zones: server.zones, changeNote: server.changeNote }, server)
			});
		}
		case "take-saved": {
			const pause = queue.pause;
			if ((pause?.kind !== "conflict" && pause?.kind !== "precondition") || !pause.server) return step(queue);
			const server = pause.server;
			const snapshot = { zones: server.zones, changeNote: server.changeNote };
			return step({
				...queue,
				pause: null,
				local: snapshot,
				invalid: null,
				acknowledged: acknowledge(snapshot, server)
			});
		}

		case "stale":
			if (queue.pause || queue.inFlight || queue.reading) return step(queue);
			return read(queue, "conflict", { kind: "conflict", server: null });

		case "mounted": {
			const { draft } = event;
			if (draft.state !== "draft") return step({ ...queue, pause: { kind: "closed", server: draft } });
			if (draft.revision < queue.acknowledged.revision) return step(queue);
			const snapshot = { zones: draft.zones, changeNote: draft.changeNote };
			return step({ ...queue, local: snapshot, invalid: null, acknowledged: acknowledge(snapshot, draft) });
		}
	}
}

/* ── What the status line says (UI plan 5.8) ─────────────────────────────── */

export type SaveStatus = { readonly text: string; readonly live: "polite" | "assertive" | null };

/**
 * The save status line, in words, with how urgently it is announced. `time` formats an instant in the
 * project's timezone ("11:32"). These are meta text, never state words: the vocabulary has none for saving.
 */
export function saveStatus(queue: SaveQueue, time: (iso: string) => string): SaveStatus {
	const pause = queue.pause;
	if (queue.offline)
		return {
			text: "You are offline. Your changes stay in this tab and save when you reconnect. Do not close the tab.",
			live: "polite"
		};
	switch (pause?.kind) {
		case "unconfirmed":
			return { text: "Checking whether your last change was saved…", live: "polite" };
		case "conflict":
			return {
				text: pause.server
					? `Not saved · ${pause.server.updatedBy ?? "someone else"} saved this draft at ${time(pause.server.updatedAt)}`
					: "Not saved · this draft changed since it was opened",
				live: "assertive"
			};
		case "precondition":
			return { text: "Not saved · the draft is being read again. Your changes are kept.", live: "assertive" };
		case "closed":
			return {
				text:
					pause.server?.state === "discarded"
						? "Not saved · this draft was discarded."
						: pause.server?.state === "published"
							? "Not saved · this draft was published."
							: "Not saved · this draft is no longer open.",
				live: "assertive"
			};
		case "signed-out":
			return {
				text: "Not saved · you were signed out. Sign in again in another tab, then come back to save.",
				live: "assertive"
			};
		case "no-access":
			return { text: "Not saved · you no longer have access to this draft.", live: "assertive" };
		case "too-large":
			return {
				text: "Not saved · this draft is larger than DECA Mark accepts (20,000 points per site, 2,000 per zone, 250 zones).",
				live: "assertive"
			};
		case "rejected":
			return { text: "Not saved · fix the problems listed, and the draft saves again.", live: "assertive" };
		case "waiting":
			return { text: `Saving paused for ${pause.seconds} s.`, live: "polite" };
		case undefined:
			break;
	}
	if (queue.invalid) return { text: `Not saved yet · ${queue.invalid}`, live: "polite" };
	if (queue.inFlight) return { text: "Saving…", live: null };
	if (isDirty(queue)) return { text: "Unsaved changes", live: null };
	const { updatedAt, revision } = queue.acknowledged;
	return { text: `Saved to the draft · ${time(updatedAt)} · revision ${revision}`, live: null };
}
