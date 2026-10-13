"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { useRovingRows } from "@/components/contour/useRovingRows";
import { cx } from "@/lib/cx";

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

/**
 * The observations in view: a table from 768 px up, with one tab stop and arrow-key movement, and a list of
 * row cards below it. Each row carries a real link on its OBS label; a click elsewhere in the row selects it.
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
		<>
			<div className="hidden md:block">
				<Table caption="Observations in this view. Arrow keys move the selection and Enter opens the observation.">
					<THead>
						<tr>
							<Th>Observation</Th>
							<Th>Observed</Th>
							<Th>Site</Th>
							<Th>Zone</Th>
							<Th>Map</Th>
							<Th>Round</Th>
							<Th>Observer</Th>
							<Th>Answer</Th>
						</tr>
					</THead>
					<TBody {...bodyProps}>
						{records.map((record, index) => (
							<Tr key={record.id} {...rowProps(index)} data-record-id={record.id}>
								<Td mono nowrap>
									<Link href={hrefOf(record)} tabIndex={-1} className={LINK}>
										{record.label}
									</Link>
								</Td>
								<Td nowrap>
									<span className="block">{record.day}</span>
									<span className="block type-small text-ink-2">{record.time}</span>
								</Td>
								<Td>{record.siteName}</Td>
								<Td>
									<span className="block">{record.zoneLabel}</span>
									<span className="block type-mono-data text-ink-2">
										{record.wholeZone ? `Whole zone · ${record.zoneCode}` : record.zoneCode}
									</span>
								</Td>
								<Td mono nowrap>
									{record.mapVersion}
								</Td>
								<Td>{record.roundName}</Td>
								<Td mono>{record.observer}</Td>
								<Td className="min-w-48">
									<Answer record={record} />
								</Td>
							</Tr>
						))}
					</TBody>
				</Table>
			</div>

			{/* Below 768 px each row is a card: the label and round on top, then where and when, then the answer. */}
			<ul className="divide-y divide-rule border-t border-rule md:hidden" aria-label="Observations in this view">
				{records.map(record => (
					<li
						key={record.id}
						data-record-id={record.id}
						className={cx("flex flex-col gap-1 px-island-pad py-4", record.id === selectedId && "bg-well")}>
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<Link href={hrefOf(record)} className={cx("type-mono-data", LINK)}>
								{record.label}
							</Link>
							<span className="type-small text-ink-2">{record.roundName}</span>
						</div>
						<p className="type-body">
							{record.when} · {record.zoneLabel}
							{record.wholeZone ? " · whole zone" : ""}
						</p>
						<p className="type-small text-ink-2">
							{record.siteName} · Map {record.mapVersion} · Observer{" "}
							<span className="type-mono-data">{record.observer}</span>
						</p>
						{record.summary && (
							<p className="type-body wrap-anywhere">
								<span className="type-small text-ink-2">{record.summary.label}: </span>
								{record.summary.value}
							</p>
						)}
					</li>
				))}
			</ul>
		</>
	);
}
