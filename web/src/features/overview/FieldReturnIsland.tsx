import { FactsList } from "@/components/contour/FactsList";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { CountBars } from "@/features/reports/CountBars";
import type { ObservationPage, Site } from "@/lib/api/types";
import { formatCount, plural } from "@/lib/labels";
import { fieldReturn } from "@/lib/observations/summary";
import type { Clock } from "@/lib/time";
import type { Result } from "@/lib/workspace/types";

/** Exact counts the server makes for the project's today and its last 7 days (today and the 6 before). */
export type RecentCounts = { readonly today: number; readonly last7Days: number };

export type FieldReturnIslandProps = {
	sites: Result<readonly Site[]>;
	/** The newest observations (a page of at most 500), for when the last one was received. */
	observations: Result<ObservationPage>;
	recent: Result<RecentCounts>;
	nowIso: string;
	clock: Clock;
	/** The Data page's address; each site's bar opens its records. */
	dataHref: string;
};

/**
 * The field return: what the project's sites hold, as one sentence. The total adds up each site's own exact
 * count, and today and the last 7 days are counted by the server. When the last record arrived is read from
 * the newest observations loaded, and the island says so when more match than loaded.
 */
export function FieldReturnIsland({ sites, observations, recent, nowIso, clock, dataHref }: FieldReturnIslandProps) {
	if (!sites.ok) return <LoadFailure failure={sites.failure} what="the field return" />;

	const listed = observations.ok ? observations.data.items : [];
	const summary = fieldReturn(sites.data, listed);
	const loadedCount = listed.length;
	const limited = observations.ok && observations.data.total_matching > loadedCount;
	const withRecords = summary.bySite.filter(site => site.count > 0);

	let sentence = "No observations have come back yet.";
	if (summary.total > 0)
		sentence =
			withRecords.length === 1
				? `${plural(summary.total, "observation")} at ${withRecords[0]!.name}.`
				: `${plural(summary.total, "observation")} across ${plural(withRecords.length, "site")}.`;

	return (
		<Island flush aria-labelledby="field-return-title">
			<div className="grid gap-x-14 gap-y-8 p-island-pad lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
				<div className="flex min-w-0 flex-col">
					<p className="type-mono-label text-ink-2">Field return</p>
					{/* Plain spaces between the parts keep the count a word of its own when the text is read. */}{" "}
					<h2 id="field-return-title" className="mt-2 type-section text-ink">
						{sentence}
					</h2>{" "}
					<p className="mt-3 max-w-prose type-body text-ink-2">
						The total adds up every site&apos;s own count. Records still on devices are not counted here.
					</p>
					<div className="mt-6">
						<FactsList
							labelWidth="minmax(8rem, 40%)"
							items={[
								{
									label: "Last received",
									value: !observations.ok
										? "Not read"
										: summary.lastReceivedAt
											? clock.relativeDayTime(summary.lastReceivedAt, nowIso)
											: "Nothing received yet"
								},
								{
									label: "Observed today",
									value: recent.ok ? formatCount(recent.data.today) : "Not counted"
								},
								{
									label: "Observed in the last 7 days",
									value: recent.ok ? formatCount(recent.data.last7Days) : "Not counted"
								}
							]}
						/>
						{!observations.ok && (
							<LoadFailure failure={observations.failure} what="recent observations" bare />
						)}
						{!recent.ok && <LoadFailure failure={recent.failure} what="recent counts" bare />}
					</div>
					{limited && (
						<Note
							className="mt-4"
							title={`Last received is read from the newest ${formatCount(loadedCount)}.`}>
							A record collected earlier but uploaded later may have arrived since. Today, the last 7 days
							and the total count every observation.
						</Note>
					)}
					<p className="mt-4 type-small text-ink-2">
						Days and times use the project&apos;s time zone, {clock.timeZone}.
					</p>
				</div>

				{summary.bySite.length > 1 && (
					<div className="flex min-w-0 flex-col gap-3">
						<h3 className="type-mono-label text-ink-2">By site</h3>
						<CountBars
							label="Observations by site"
							rows={summary.bySite.map(site => ({
								key: site.code,
								label: site.name,
								value: site.count,
								href: `${dataHref}?site=${encodeURIComponent(site.code)}`
							}))}
						/>
					</div>
				)}
			</div>
		</Island>
	);
}
