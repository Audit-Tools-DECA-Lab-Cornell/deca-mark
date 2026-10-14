import Link from "next/link";

import { Icon } from "@/components/contour/Icon";
import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { stateOf } from "@/lib/contour";
import { cx } from "@/lib/cx";

import { countsLine, projectLink, type ProjectRow } from "./rows";

/** What an empty list says, and who can fix it. */
function Empty({ canCreate }: { canCreate: boolean }) {
	return (
		<ScreenState
			kind="empty"
			icon="folder"
			headingLevel={2}
			title="No projects yet"
			body={
				canCreate
					? "A project holds one study's sites, forms and team. Use Create project to make the first one."
					: "You are not on a project in this organization yet. Ask an organization owner or admin to add you to one."
			}
		/>
	);
}

function Row({ orgSlug, row }: { orgSlug: string; row: ProjectRow }) {
	return (
		<li
			className={cx(
				"relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 px-island-pad py-6",
				"transition-[background-color] duration-(--ct-duration-quick) ease-standard hover:bg-well",
				// The row's link covers it; its focus ring is drawn around the whole row, inset 3 px.
				"has-[a:focus-visible]:[outline:var(--ct-size-focus-ring)_solid_var(--ct-focus)] has-[a:focus-visible]:[outline-offset:calc(var(--ct-size-focus-ring)*-2)]"
			)}>
			<div className="min-w-0">
				<h2 className="flex flex-wrap items-baseline gap-x-4 gap-y-1 wrap-anywhere">
					<Link
						href={projectLink(orgSlug, row)}
						prefetch={false}
						className="type-section text-ink [--ct-size-focus-ring:0px] before:absolute before:inset-0">
						{row.name}
					</Link>
					<StateBadge kind="project" state={row.status} />
				</h2>
				<p className="mt-1 type-body text-ink">{countsLine(row.counts)}</p>
				<p className="mt-1 type-small wrap-anywhere text-ink-2">
					<span className="type-mono-data">{row.code}</span> · Your role: {stateOf("role", row.role).label}
				</p>
				{row.description && <p className="mt-1 type-small wrap-anywhere text-ink-2">{row.description}</p>}
			</div>
			<Icon name="chevron-right" size={20} className="shrink-0 text-ink" />
		</li>
	);
}

/** The organization's projects as one island of link rows. */
export function ProjectList({
	orgSlug,
	rows,
	canCreate
}: {
	orgSlug: string;
	rows: readonly ProjectRow[];
	canCreate: boolean;
}) {
	return (
		<Island flush aria-label="Projects">
			{rows.length === 0 ? (
				<Empty canCreate={canCreate} />
			) : (
				<ul className="divide-y divide-rule">
					{rows.map(row => (
						<Row key={row.id} orgSlug={orgSlug} row={row} />
					))}
				</ul>
			)}
		</Island>
	);
}
