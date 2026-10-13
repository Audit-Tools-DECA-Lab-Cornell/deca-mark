/**
 * Dates and times in a project's own timezone (DESIGN.md § Formatting): the 24-hour clock, "Oct 07 ·
 * 11:32", "Today 11:25", "Yesterday". Every formatter names its timezone, so a server render and a browser
 * render agree, and a record made at ten in the morning in Ithaca reads 10:00 wherever the manager sits.
 *
 * Days are calendar days in that timezone, found with Intl rather than by adding 24 hours, so the days
 * clocks change (23 or 25 hours long) group correctly. Day arithmetic works on day keys ("2026-10-07"),
 * which are plain calendar dates.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

/** Whether the runtime knows this IANA timezone name. */
export function isTimeZone(value: string): boolean {
	if (value.trim() === "") return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** Every IANA timezone the runtime knows, for a timezone picker. */
export function timeZones(): string[] {
	const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
	return zones.includes("UTC") ? [...zones] : [...zones, "UTC"];
}

/* ── Day keys ─────────────────────────────────────────────────────────────── */

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function keyParts(key: string): [number, number, number] {
	const match = KEY.exec(key);
	if (!match) throw new RangeError(`Not a day key: ${key}`);
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function keyOf(year: number, month: number, day: number): string {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The calendar day `days` after (or before) a day key. */
export function addDays(key: string, days: number): string {
	const [year, month, day] = keyParts(key);
	const date = new Date(Date.UTC(year, month - 1, day + days));
	return keyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
	const [y1, m1, d1] = keyParts(from);
	const [y2, m2, d2] = keyParts(to);
	// UTC midnights of two calendar dates: UTC has no clock changes, so they are whole days apart.
	return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Every day key from `from` to `to`, both included. Empty when `to` is before `from`. */
export function dayKeysBetween(from: string, to: string): string[] {
	const count = daysBetween(from, to);
	return Array.from({ length: Math.max(0, count + 1) }, (_, index) => addDays(from, index));
}

/* ── The clock ────────────────────────────────────────────────────────────── */

export type Clock = {
	/** The timezone every formatter uses (UTC when the project's was not a known name). */
	readonly timeZone: string;
	/** "Oct 07, 2026". */
	day(iso: string): string;
	/** "Oct 07". */
	shortDay(iso: string): string;
	/** "14:05", 24-hour. */
	time(iso: string): string;
	/** "Oct 07, 2026 · 14:05". */
	dayTime(iso: string): string;
	/** "2026-10-07": the calendar day in this timezone, for grouping and comparing. */
	dayKey(iso: string): string;
	/** "Today", "Yesterday", "Oct 07", or "Oct 07, 2025" in another year. */
	relativeDay(iso: string, nowIso: string): string;
	/** "Today 14:05", "Yesterday 09:10", "Oct 07 · 14:05", "Oct 07, 2025 · 14:05". */
	relativeDayTime(iso: string, nowIso: string): string;
	/** A day key as "Oct 07, 2026". */
	keyLabel(key: string): string;
	/** A day key as "Oct 07". */
	shortKeyLabel(key: string): string;
	/**
	 * The first instant of a calendar day in this timezone, as a UTC ISO string: what an API filter by
	 * day takes. A day whose midnight the clocks skip starts at the first instant that falls on it.
	 */
	dayStart(key: string): string;
};

type Formatters = {
	day: Intl.DateTimeFormat;
	shortDay: Intl.DateTimeFormat;
	time: Intl.DateTimeFormat;
	key: Intl.DateTimeFormat;
};

const formatters = new Map<string, Formatters>();

function formattersFor(timeZone: string): Formatters {
	let found = formatters.get(timeZone);
	if (!found) {
		found = {
			day: new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "2-digit", year: "numeric" }),
			shortDay: new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "2-digit" }),
			time: new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
			key: new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
		};
		formatters.set(timeZone, found);
	}
	return found;
}

const UTC = formattersFor("UTC");

function dateOf(iso: string): Date | null {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Noon UTC on a day key, so formatting it in UTC gives back that calendar day. */
function noonOf(key: string): Date {
	const [year, month, day] = keyParts(key);
	return new Date(Date.UTC(year, month - 1, day, 12));
}

/**
 * Formatters for one project's timezone. An unknown timezone falls back to UTC (`timeZone` says which
 * was used); an unreadable timestamp formats as an empty string.
 */
export function clock(timeZone: string): Clock {
	const zone = isTimeZone(timeZone) ? timeZone : "UTC";
	const f = formattersFor(zone);
	const format = (formatter: Intl.DateTimeFormat, iso: string) => {
		const date = dateOf(iso);
		return date ? formatter.format(date) : "";
	};
	const dayKey = (iso: string): string => {
		const date = dateOf(iso);
		if (!date) return "";
		const parts = f.key.formatToParts(date);
		const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(entry => entry.type === type)?.value);
		return keyOf(part("year"), part("month"), part("day"));
	};
	const sameYear = (key: string, nowKey: string) => key.slice(0, 4) === nowKey.slice(0, 4);
	const relativeDay = (iso: string, nowIso: string): string => {
		const key = dayKey(iso);
		const nowKey = dayKey(nowIso);
		if (key === "" || nowKey === "") return format(f.day, iso);
		const ago = daysBetween(key, nowKey);
		if (ago === 0) return "Today";
		if (ago === 1) return "Yesterday";
		return sameYear(key, nowKey) ? format(f.shortDay, iso) : format(f.day, iso);
	};
	return {
		timeZone: zone,
		day: iso => format(f.day, iso),
		shortDay: iso => format(f.shortDay, iso),
		time: iso => format(f.time, iso),
		dayTime: iso => (dateOf(iso) ? `${format(f.day, iso)} · ${format(f.time, iso)}` : ""),
		dayKey,
		relativeDay,
		relativeDayTime: (iso, nowIso) => {
			if (!dateOf(iso)) return "";
			const label = relativeDay(iso, nowIso);
			const time = format(f.time, iso);
			return label === "Today" || label === "Yesterday" ? `${label} ${time}` : `${label} · ${time}`;
		},
		keyLabel: key => UTC.day.format(noonOf(key)),
		shortKeyLabel: key => UTC.shortDay.format(noonOf(key)),
		dayStart: key => {
			const [year, month, day] = keyParts(key);
			const wallMidnight = Date.UTC(year, month - 1, day);
			const keyAt = (ms: number) => dayKey(new Date(ms).toISOString());
			// Every offset is between −12 and +14 hours: the day starts within this window. Day keys only grow
			// with time, so the first second on the day is found by halving the window.
			let before = wallMidnight - 15 * 3_600_000;
			let onOrAfter = wallMidnight + 13 * 3_600_000;
			while (onOrAfter - before > 1000) {
				const middle = before + Math.floor((onOrAfter - before) / 2000) * 1000;
				if (keyAt(middle) < key) before = middle;
				else onOrAfter = middle;
			}
			return new Date(onOrAfter).toISOString();
		}
	};
}
