/**
 * The workspace keyboard shortcuts (DESIGN §8): what they are, for the "Keyboard shortcuts" dialog, and
 * when a key press belongs to the page rather than to a field. The listener lives in features/shell.
 */

export type ShortcutRow = {
	/** Keys pressed one after another ("g", "d"), or one combination ("mod+k"). */
	keys: string[];
	/** Pressed in sequence, as a chord ("g then d"), rather than together. */
	sequence?: boolean;
	label: string;
};

export type ShortcutGroup = { title: string; rows: ShortcutRow[] };

/** `g` then a key, inside a project: the project tabs, by their URL segment ("" is Overview). */
export const PROJECT_GO_KEYS: Record<string, string> = {
	o: "",
	d: "data",
	s: "sites",
	f: "forms",
	t: "team",
	q: "qgis",
	r: "reports",
	",": "settings"
};

/** `g` then a key on the organization pages ("" is Projects). */
export const ORG_GO_KEYS: Record<string, string> = {
	p: "",
	m: "members",
	",": "settings"
};

/** How long the second key of a `g` chord is waited for. */
export const CHORD_TIMEOUT = 1500;

let chordUntil = 0;

/** `g` was pressed: the next key, within the timeout, finishes the chord. */
export function startChord(now = Date.now()): void {
	chordUntil = now + CHORD_TIMEOUT;
}

/**
 * Whether a `g` chord waits for its second key. A page's own single-letter keys (the zone editor's tools)
 * leave that key to the chord.
 */
export function chordPending(now = Date.now()): boolean {
	return now < chordUntil;
}

export function endChord(): void {
	chordUntil = 0;
}

export const GLOBAL_SHORTCUTS: ShortcutGroup = {
	title: "Anywhere",
	rows: [
		{ keys: ["mod+k"], label: "Search or jump to" },
		{ keys: ["?"], label: "Show keyboard shortcuts" },
		{ keys: ["/"], label: "Focus the page's search" }
	]
};

export const PROJECT_SHORTCUTS: ShortcutGroup = {
	title: "In a project",
	rows: [
		{ keys: ["g", "o"], sequence: true, label: "Go to Overview" },
		{ keys: ["g", "d"], sequence: true, label: "Go to Data" },
		{ keys: ["g", "s"], sequence: true, label: "Go to Sites" },
		{ keys: ["g", "f"], sequence: true, label: "Go to Forms" },
		{ keys: ["g", "t"], sequence: true, label: "Go to Team" },
		{ keys: ["g", "q"], sequence: true, label: "Go to QGIS" },
		{ keys: ["g", "r"], sequence: true, label: "Go to Reports" },
		{ keys: ["g", ","], sequence: true, label: "Go to Settings" }
	]
};

export const ORG_SHORTCUTS: ShortcutGroup = {
	title: "On the organization pages",
	rows: [
		{ keys: ["g", "p"], sequence: true, label: "Go to Projects" },
		{ keys: ["g", "m"], sequence: true, label: "Go to Members" },
		{ keys: ["g", ","], sequence: true, label: "Go to Settings" }
	]
};

/** Data's own keys (project-02). The Data page handles them; they are listed here so `?` shows them. */
export const DATA_SHORTCUTS: ShortcutGroup = {
	title: "On Data",
	rows: [
		{ keys: ["j", "↓"], label: "Select the next observation" },
		{ keys: ["k", "↑"], label: "Select the previous observation" },
		{ keys: ["Enter"], label: "Open the selected observation" },
		{ keys: ["a"], label: "Approve the selected observation" },
		{ keys: ["x"], label: "Exclude the selected observation" },
		{ keys: ["Esc"], label: "Close the observation" }
	]
};

export const SHORTCUT_GROUPS: ShortcutGroup[] = [GLOBAL_SHORTCUTS, PROJECT_SHORTCUTS, ORG_SHORTCUTS, DATA_SHORTCUTS];

/** The element a page marks as its search, focused by `/`: `<input data-shortcut-search …>`. */
export const PAGE_SEARCH_SELECTOR = "[data-shortcut-search]";

/** A key press here is typing, not a shortcut: fields, selects and editable text. */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	if (tag === "TEXTAREA" || tag === "SELECT") return true;
	if (tag !== "INPUT") return false;
	const type = (target as HTMLInputElement).type;
	return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
}

/** A dialog, menu or popover is open, so page shortcuts stand aside. */
export function isOverlayOpen(): boolean {
	return Boolean(
		document.querySelector(
			'[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]'
		)
	);
}
