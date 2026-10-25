"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { useRovingRows } from "@/components/contour/useRovingRows";

import type { DataRecord } from "./view";

export type DataTableProps = {
	records: readonly DataRecord[];
	/** The record's address. */
	hrefOf: (record: DataRecord) => string;
	selectedId: string | null;
	onSelect: (id: string) => void;
};

const LINK = "font-semibold text-ink underline decoration-1 underline-offset-4 hover:decoration-2";

/** The answer a row shows, with the question it answers under it. */
function Answer({ record }: { record: DataRecord }) {
	if (!record.summary) return <span className="text-ink-2">No answers</span>;
	return (
		<>
			<span className="block wrap-anywhere">{record.summary.value}</span>
			<span className="block type-small text-ink-2">{record.summary.label}</span>
		</>
	);
}

/*
 * Below md each row is a card: the label on a line of its own, then the facts in a wrapping line (day and time,
 * zone, site, map, round, observer), then the answer. The same cells serve both layouts, and the card is
 * styled once from the table, not per cell, so 500 rows stay light. `!` beats the rule, padding and height the
 * table's own cells set with variants of their own. The column labels stay for assistive technology
 * (`sr-only` on the header), and the explicit roles keep it a table where it is no longer laid out as one.
 */
const AS_CARDS = [
	"max-md:block",
	"max-md:[&_thead]:sr-only",
	"max-md:[&_tbody]:block",
	"max-md:[&_tbody>tr]:flex max-md:[&_tbody>tr]:flex-wrap max-md:[&_tbody>tr]:items-baseline",
	"max-md:[&_tbody>tr]:gap-x-4 max-md:[&_tbody>tr]:gap-y-1 max-md:[&_tbody>tr]:px-island-pad max-md:[&_tbody>tr]:py-4",
	"max-md:[&_tbody>tr]:border-t max-md:[&_tbody>tr]:border-rule",
	"max-md:[&_tbody_td]:block max-md:[&_tbody_td]:h-auto! max-md:[&_tbody_td]:border-0! max-md:[&_tbody_td]:p-0!",
	"max-md:[&_tbody_td]:shadow-none!",
	// Observation: a line of its own. Then day and time, zone, site, map, round, observer, and the answer.
	"max-md:[&_td:nth-child(1)]:order-1 max-md:[&_td:nth-child(1)]:basis-full",
	"max-md:[&_td:nth-child(2)]:order-2 max-md:[&_td:nth-child(2)_span]:inline",
	"max-md:[&_td:nth-child(4)]:order-3 max-md:[&_td:nth-child(4)_span]:inline",
	"max-md:[&_td:nth-child(3)]:order-4",
	"max-md:[&_td:nth-child(5)]:order-5 max-md:[&_td:nth-child(5)]:before:type-small",
	"max-md:[&_td:nth-child(5)]:before:text-ink-2 max-md:[&_td:nth-child(5)]:before:content-['Map_']",
	"max-md:[&_td:nth-child(6)]:order-6",
	"max-md:[&_td:nth-child(7)]:order-7 max-md:[&_td:nth-child(7)]:before:type-small",
	"max-md:[&_td:nth-child(7)]:before:text-ink-2 max-md:[&_td:nth-child(7)]:before:content-['Observer_']",
	"max-md:[&_td:nth-child(8)]:order-8 max-md:[&_td:nth-child(8)]:basis-full max-md:[&_td:nth-child(8)]:min-w-0!"
].join(" ");

/**
 * The observations in view: one table. From 768 px up it has columns, one tab stop and arrow-key movement;
 * below it each row restyles as a card, the same elements and no second list. Each row carries a real
 * link on its OBS label; a click elsewhere in the row selects it.
 */
export function DataTable({ records, hrefOf, selectedId, onSelect }: DataTableProps) {
	const router = useRouter();
	const selectedIndex = records.findIndex(record => record.id === selectedId);
	const { bodyProps, rowProps } = useRovingRows({
		count: records.length,
		selectedIndex,
		onSelect: index => {
			const record = records[index];
			if (record) onSelect(record.id);
		},
		onOpen: index => {
			const record = records[index];
			if (record) router.push(hrefOf(record));
		}
	});

	return (
		<Table
			role="table"
			className={AS_CARDS}
			caption="Observations in this view. Arrow keys move the selection and Enter opens the observation.">
			<THead role="rowgroup">
				<tr role="row">
					<Th role="columnheader">Observation</Th>
					<Th role="columnheader">Observed</Th>
					<Th role="columnheader">Site</Th>
					<Th role="columnheader">Zone</Th>
					<Th role="columnheader">Map</Th>
					<Th role="columnheader">Round</Th>
					<Th role="columnheader">Observer</Th>
					<Th role="columnheader">Answer</Th>
				</tr>
			</THead>
			<TBody role="rowgroup" {...bodyProps}>
				{records.map((record, index) => (
					<Tr key={record.id} role="row" {...rowProps(index)} data-record-id={record.id}>
						<Td role="cell" mono nowrap>
							<Link prefetch={false} href={hrefOf(record)} tabIndex={-1} className={LINK}>
								{record.label}
							</Link>
						</Td>
						<Td role="cell" nowrap>
							<span className="block">{record.day}</span>{" "}
							<span className="block type-small text-ink-2">{record.time}</span>
						</Td>
						<Td role="cell">{record.siteName}</Td>
						<Td role="cell">
							<span className="block">{record.zoneLabel}</span>{" "}
							<span className="block type-mono-data text-ink-2">
								{record.wholeZone ? `Whole zone · ${record.zoneCode}` : record.zoneCode}
							</span>
						</Td>
						<Td role="cell" mono nowrap>
							{record.mapVersion}
						</Td>
						<Td role="cell">{record.roundName}</Td>
						<Td role="cell" mono>
							{record.observer}
						</Td>
						<Td role="cell" className="min-w-48">
							<Answer record={record} />
						</Td>
					</Tr>
				))}
			</TBody>
		</Table>
	);
}
