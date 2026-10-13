"use client";

import { type KeyboardEvent, useRef } from "react";

import { Island } from "@/components/contour/Island";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/labels";
import type { DraftZone } from "@/lib/zones/geometry";

import { type ZoneChange, zoneName } from "./state";

/**
 * The Zones island (UI plan 5.3): one row per zone in the draft, with its name, its code in mono, how it
 * compares with the base version in words, and its problem count. The list is one tab stop: ↑ / ↓ or j / k
 * move the selection, Home and End jump to the ends, and Enter moves focus to the zone's points on the
 * plan. Selecting a row selects the zone on the plan.
 */

export function zoneRowId(zoneId: string): string {
	return `zone-row-${zoneId}`;
}

const CHANGE_WORD: Record<ZoneChange, string> = { new: "New", changed: "Changed", unchanged: "Unchanged" };

export type ZoneListProps = {
	zones: readonly DraftZone[];
	changes: ReadonlyMap<string, ZoneChange>;
	problemCounts: ReadonlyMap<string, number>;
	selectedId: string | null;
	onSelect: (zoneId: string) => void;
	/** Enter on a row: go to the zone's points on the plan. */
	onOpen: (zoneId: string) => void;
	/** An action under the list, such as "Add a zone". */
	footer?: React.ReactNode;
};

export function ZoneList({ zones, changes, problemCounts, selectedId, onSelect, onOpen, footer }: ZoneListProps) {
	const listRef = useRef<HTMLUListElement>(null);
	const selectedIndex = zones.findIndex(zone => zone.zone_id === selectedId);
	const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

	function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
		if (event.altKey || event.ctrlKey || event.metaKey || zones.length === 0) return;
		const row = (event.target as HTMLElement).closest<HTMLElement>("[data-zone-index]");
		const from = row ? Number(row.dataset.zoneIndex) : tabStop;
		let next: number;
		switch (event.key) {
			case "ArrowDown":
			case "j":
				next = Math.min(from + 1, zones.length - 1);
				break;
			case "ArrowUp":
			case "k":
				next = Math.max(from - 1, 0);
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = zones.length - 1;
				break;
			case "Enter":
			case " ":
				event.preventDefault();
				onOpen(zones[from]!.zone_id);
				return;
			default:
				return;
		}
		event.preventDefault();
		onSelect(zones[next]!.zone_id);
		document.getElementById(zoneRowId(zones[next]!.zone_id))?.focus();
	}

	return (
		<Island title="Zones" meta={plural(zones.length, "zone")} flush>
			{zones.length === 0 ? (
				<p className="px-island-pad py-4 type-body text-ink-2">No zones in this draft.</p>
			) : (
				<ul ref={listRef} role="listbox" aria-label="Zones" onKeyDown={onKeyDown} className="flex flex-col">
					{zones.map((zone, index) => {
						const selected = zone.zone_id === selectedId;
						const problems = problemCounts.get(zone.zone_id) ?? 0;
						return (
							<li
								key={zone.zone_id}
								id={zoneRowId(zone.zone_id)}
								role="option"
								aria-selected={selected}
								tabIndex={index === tabStop ? 0 : -1}
								data-zone-index={index}
								onClick={() => onSelect(zone.zone_id)}
								className={cx(
									"flex min-h-touch cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-island-pad py-3",
									"[--ct-size-focus-gap:calc(var(--ct-size-focus-ring)*-2)]",
									selected ? "bg-well selected-bar" : "hover:bg-ground"
								)}>
								<span className="flex min-w-0 flex-col">
									<span className="type-body font-semibold text-ink">{zoneName(zone)}</span>
									<span className="type-small text-ink-2">
										<span className="type-mono-data">{zone.zone_code}</span> ·{" "}
										{CHANGE_WORD[changes.get(zone.zone_id) ?? "unchanged"]}
									</span>
								</span>
								{problems > 0 && (
									<span className="type-small font-semibold text-ink">
										{plural(problems, "problem")}
									</span>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{footer && <div className="border-t border-rule px-island-pad py-4">{footer}</div>}
		</Island>
	);
}
