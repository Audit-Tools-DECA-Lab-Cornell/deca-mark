/**
 * Undo and redo for the zone editor (UI plan 5.6). A step is semantic: it names what changed ("moved point
 * 12 of North meadow") and holds the zones before and after. Zones are immutable and share everything
 * untouched, so keeping both is cheap. A burst of nudges to one point within a second, and the typing in one
 * focus of a label field, merge into one step.
 */

export const HISTORY_LIMIT = 200;

/** Nudges of one point closer together than this make one step. */
export const NUDGE_MERGE_MS = 1000;

export type HistoryStep<T> = {
	/** What the step did, to finish "Undid: …" and "Redid: …". */
	readonly label: string;
	readonly before: T;
	readonly after: T;
	/** Steps with the same key merge while they keep coming within `mergeWindow` of each other. */
	readonly mergeKey?: string;
	readonly mergeWindow?: number;
	/** When the step was made, in milliseconds; passed in so the history stays pure. */
	readonly at: number;
};

export type History<T> = { readonly past: readonly HistoryStep<T>[]; readonly future: readonly HistoryStep<T>[] };

export function emptyHistory<T>(): History<T> {
	return { past: [], future: [] };
}

/**
 * Records a step. It merges into the last one when both carry the same key and it comes within the window,
 * keeping the earlier `before`. Recording clears what could have been redone, and the oldest steps fall
 * off past {@link HISTORY_LIMIT}.
 */
export function record<T>(history: History<T>, step: HistoryStep<T>): History<T> {
	const last = history.past[history.past.length - 1];
	if (
		last &&
		step.mergeKey !== undefined &&
		last.mergeKey === step.mergeKey &&
		step.at - last.at <= (step.mergeWindow ?? 0)
	) {
		const merged: HistoryStep<T> = { ...step, before: last.before };
		return { past: [...history.past.slice(0, -1), merged], future: [] };
	}
	return { past: [...history.past, step].slice(-HISTORY_LIMIT), future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
	return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
	return history.future.length > 0;
}

/** Steps back once: the step undone (restore its `before`), or null with nothing to undo. */
export function undo<T>(history: History<T>): { history: History<T>; step: HistoryStep<T> } | null {
	const step = history.past[history.past.length - 1];
	if (!step) return null;
	return { history: { past: history.past.slice(0, -1), future: [step, ...history.future] }, step };
}

/** Steps forward once: the step redone (restore its `after`), or null with nothing to redo. */
export function redo<T>(history: History<T>): { history: History<T>; step: HistoryStep<T> } | null {
	const [step, ...rest] = history.future;
	if (!step) return null;
	return { history: { past: [...history.past, { ...step, mergeKey: undefined }], future: rest }, step };
}
