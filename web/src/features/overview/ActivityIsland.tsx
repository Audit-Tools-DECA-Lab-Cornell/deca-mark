import { Island } from "@/components/contour/Island";
import { TextLink } from "@/components/contour/TextLink";
import { Timeline } from "@/components/contour/Timeline";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { PAGE_LIMIT } from "@/lib/api/observations";
import type { ActivityEntry } from "@/lib/observations/summary";
import type { Clock } from "@/lib/time";
import type { Failure } from "@/lib/workspace/types";

import { activityTone } from "./model";

export type ActivityIslandProps = {
	/** Newest first. */
	entries: readonly ActivityEntry[];
	/** What could not be read, so the list is missing that part. */
	unread: readonly { what: string; failure: Failure }[];
	/** The observation list was cut at 500, so the oldest day's counts may be partial. */
	limited: boolean;
	nowIso: string;
	clock: Clock;
	dataHref: string;
};

/**
 * Recent activity, read from the dates on observations, map packages, forms and sites: observations by
 * day and observer, packages prepared, versions published or started as drafts, sites added. It lists
 * what those dates show, not every change that was made.
 */
export function ActivityIsland({ entries, unread, limited, nowIso, clock, dataHref }: ActivityIslandProps) {
	return (
		<Island
			flush
			divided={false}
			title="Recent activity"
			actions={<TextLink href={dataHref}>All observations</TextLink>}
			footnote={
				<p>
					Built from the dates on observations, map packages, forms and sites. It does not list every change.
					{limited ? ` Observation counts come from the newest ${PAGE_LIMIT}.` : ""}
				</p>
			}>
			<div className="px-island-pad pt-1 pb-island-pad">
				{entries.length === 0 ? (
					<p className="type-body text-ink-2">
						Nothing yet. Observations, map packages and form versions appear here as they are added.
					</p>
				) : (
					<Timeline
						items={entries.map(entry => ({
							id: entry.id,
							tone: activityTone(entry.kind, entry.state),
							title: entry.title,
							detail: entry.detail,
							time: clock.relativeDayTime(entry.at, nowIso)
						}))}
					/>
				)}
			</div>
			{unread.map(entry => (
				<LoadFailure key={entry.what} failure={entry.failure} what={entry.what} bare />
			))}
		</Island>
	);
}
