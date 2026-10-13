"use client";

import { type Ref, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Select } from "@/components/contour/Select";
import { TextInput } from "@/components/contour/TextInput";
import { ROUND_TYPES, roundName } from "@/lib/labels";
import type { RoundType } from "@/lib/workspace/types";

import type { DataView, Option } from "./view";

export type FilterBarProps = {
	view: DataView;
	sites: readonly Option[];
	/** The chosen site's zones, every map version's; empty without a site. */
	zones: readonly Option[];
	/** The chosen site's map versions. */
	versions: readonly number[];
	timeZone: string;
	/** A filter DECA Mark applies to every observation: the page asks again, and Back returns. */
	onViewChange: (patch: Partial<DataView>) => void;
	/** The search, which finds words in the observations that have loaded. */
	onSearch: (q: string) => void;
	onClear: () => void;
	canClear: boolean;
	firstFilterRef?: Ref<HTMLSelectElement>;
};

const MANY = "~many";

/**
 * The filters above the table. Site, zone, map version, round type, observer and days are applied by DECA
 * Mark to every observation; the search finds words in the loaded ones. Every control is labelled, and one
 * that cannot be used yet says why.
 */
export function FilterBar({
	view,
	sites,
	zones,
	versions,
	timeZone,
	onViewChange,
	onSearch,
	onClear,
	canClear,
	firstFilterRef
}: FilterBarProps) {
	// Initials are typed: the filter applies when the field is left or Enter is pressed.
	const [observer, setObserver] = useState(view.observer ?? "");
	// A new view (Back, or Clear filters) shows its own initials.
	const [shownFor, setShownFor] = useState(view.observer);
	if (shownFor !== view.observer) {
		setShownFor(view.observer);
		setObserver(view.observer ?? "");
	}
	const commitObserver = () => {
		const next = observer.trim() || null;
		if (next !== view.observer) onViewChange({ observer: next });
	};

	const zoneValue = view.zones.length === 1 ? view.zones[0]! : view.zones.length > 1 ? MANY : "";
	const noSite = view.site === null;
	const noZone = view.zones.length === 0;

	return (
		<div className="flex flex-col gap-4 px-island-pad pb-5">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Field label="Site" htmlFor="data-site">
					<Select
						id="data-site"
						ref={firstFilterRef}
						value={view.site ?? ""}
						onChange={event =>
							onViewChange({ site: event.target.value || null, zones: [], version: null })
						}>
						<option value="">All sites</option>
						{sites.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Zone" htmlFor="data-zone" hint={noSite ? "Choose a site to filter by zone." : undefined}>
					<Select
						id="data-zone"
						value={zoneValue}
						disabled={noSite}
						onChange={event =>
							event.target.value !== MANY &&
							onViewChange({
								zones: event.target.value ? [event.target.value] : [],
								version: event.target.value ? view.version : null
							})
						}>
						<option value="">All zones</option>
						{view.zones.length > 1 && <option value={MANY}>{`${view.zones.length} zones`}</option>}
						{zones.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Select>
				</Field>
				<Field
					label="Map versions"
					htmlFor="data-version"
					hint={noZone ? "Choose a zone to pick one map version." : "Any version matches by zone identity."}>
					<Select
						id="data-version"
						value={view.version === null ? "" : String(view.version)}
						disabled={noZone}
						onChange={event =>
							onViewChange({ version: event.target.value ? Number(event.target.value) : null })
						}>
						<option value="">All map versions</option>
						{versions.map(version => (
							<option key={version} value={String(version)}>
								{`Only map v${version}`}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Round type" htmlFor="data-round">
					<Select
						id="data-round"
						value={view.round ?? ""}
						onChange={event => onViewChange({ round: (event.target.value || null) as RoundType | null })}>
						<option value="">All round types</option>
						{ROUND_TYPES.map(type => (
							<option key={type} value={type}>
								{roundName(type)}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Observer" htmlFor="data-observer" hint="Initials, exactly as recorded.">
					<TextInput
						id="data-observer"
						value={observer}
						maxLength={12}
						autoComplete="off"
						spellCheck={false}
						onChange={event => setObserver(event.target.value)}
						onBlur={commitObserver}
						onKeyDown={event => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitObserver();
							}
						}}
					/>
				</Field>
				<Field label="From" htmlFor="data-from" hint={`Days are in ${timeZone}.`}>
					<TextInput
						id="data-from"
						type="date"
						value={view.from ?? ""}
						max={view.to ?? undefined}
						onChange={event => onViewChange({ from: event.target.value || null })}
					/>
				</Field>
				<Field label="To" htmlFor="data-to">
					<TextInput
						id="data-to"
						type="date"
						value={view.to ?? ""}
						min={view.from ?? undefined}
						onChange={event => onViewChange({ to: event.target.value || null })}
					/>
				</Field>
				<Field label="Search loaded observations" htmlFor="data-search">
					<TextInput
						id="data-search"
						type="search"
						leadingIcon="search"
						placeholder="Label, observer, zone or words in an answer"
						value={view.q}
						onChange={event => onSearch(event.target.value)}
						data-shortcut-search=""
						aria-keyshortcuts="/"
						autoComplete="off"
						spellCheck={false}
					/>
				</Field>
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				{canClear && (
					<Button variant="outline" size="sm" icon="x" onClick={onClear}>
						Clear filters
					</Button>
				)}
				<p className="type-small text-ink-2">
					Every filter but the search applies to all observations. The search finds words in the ones that
					have loaded.
				</p>
			</div>
		</div>
	);
}
