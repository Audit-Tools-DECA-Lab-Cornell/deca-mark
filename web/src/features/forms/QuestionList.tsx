"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { Icon } from "@/components/contour/Icon";
import { IconButton } from "@/components/contour/IconButton";
import { StateBadge } from "@/components/contour/StateBadge";
import { cx } from "@/lib/cx";

import { questionNumber } from "./model";
import type { RawQuestion } from "./raw";

type Drag = { id: string; start: number; target: number; active: boolean };

export function QuestionList({
	questions,
	selectedId,
	changed,
	unsaved,
	refused,
	onSelect,
	readOnly = true,
	onMove
}: {
	questions: readonly RawQuestion[];
	selectedId: string | null;
	changed: ReadonlySet<string>;
	unsaved: ReadonlySet<string>;
	refused: ReadonlySet<string>;
	onSelect: (id: string) => void;
	readOnly?: boolean;
	onMove?: (id: string, target: number) => string | null;
}) {
	const listRef = useRef<HTMLUListElement>(null);
	const drag = useRef<Drag | null>(null);
	const [dropAt, setDropAt] = useState<number | null>(null);
	const [message, setMessage] = useState("");
	const selectedIndex = questions.findIndex(question => question.id === selectedId);
	const tabStop = selectedIndex >= 0 ? selectedIndex : 0;
	const movable = !readOnly && onMove !== undefined;

	function move(id: string, target: number) {
		if (!onMove) return;
		const problem = onMove(id, target);
		setMessage(problem ?? `Question moved to position ${target + 1}.`);
	}

	function navigate(event: KeyboardEvent<HTMLUListElement>) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		if (!(event.target instanceof HTMLElement) || !event.target.closest("[data-question-select]")) return;
		let next: number;
		switch (event.key) {
			case "ArrowDown":
			case "j":
				next = Math.min(tabStop + 1, questions.length - 1);
				break;
			case "ArrowUp":
			case "k":
				next = Math.max(tabStop - 1, 0);
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = questions.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		const question = questions[next];
		if (!question) return;
		onSelect(question.id);
		listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"] [data-question-select]`)?.focus();
	}

	function startDrag(event: PointerEvent<HTMLButtonElement>, id: string, index: number) {
		if (!event.isPrimary || event.button !== 0) return;
		onSelect(id);
		drag.current = { id, start: event.clientY, target: index, active: false };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function dragOver(event: PointerEvent<HTMLButtonElement>) {
		const current = drag.current;
		if (!current) return;
		if (!current.active && Math.abs(event.clientY - current.start) < 8) return;
		const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-index]") ?? []);
		const target = rows.findIndex(row => event.clientY < row.getBoundingClientRect().bottom);
		current.target = target < 0 ? questions.length - 1 : target;
		current.active = true;
		setDropAt(current.target);
	}

	function endDrag() {
		const current = drag.current;
		drag.current = null;
		setDropAt(null);
		if (current?.active) move(current.id, current.target);
	}

	return (
		<>
			{movable && (
				<p className="px-5 pt-4 type-small text-ink-2">Drag a handle to reorder, or use the move buttons.</p>
			)}
			<ul
				ref={listRef}
				aria-label="Questions in this version"
				onKeyDown={navigate}
				className="divide-y divide-rule">
				{questions.map((question, index) => {
					const selected = index === selectedIndex;
					return (
						<li
							key={question.id}
							data-index={index}
							className={cx(
								"relative flex items-start gap-1 px-3 py-2",
								selected ? "bg-well selected-bar" : "hover:bg-ground"
							)}>
							{dropAt === index && (
								<span
									aria-hidden="true"
									className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-ink"
								/>
							)}
							{movable && (
								<IconButton
									icon="grip-vertical"
									label={`Drag ${question.label} to reorder`}
									className="touch-none cursor-grab active:cursor-grabbing"
									onPointerDown={event => startDrag(event, question.id, index)}
									onPointerMove={dragOver}
									onPointerUp={endDrag}
									onPointerCancel={() => {
										drag.current = null;
										setDropAt(null);
									}}
								/>
							)}
							<div className="min-w-0 grow">
								<button
									type="button"
									data-question-select
									aria-current={selected ? "step" : undefined}
									tabIndex={index === tabStop ? 0 : -1}
									onClick={() => onSelect(question.id)}
									onFocus={() => {
										if (!selected) onSelect(question.id);
									}}
									className="grid min-h-11 w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-2 rounded-control px-2 py-1 text-left text-ink">
									<span className="type-mono-data text-ink-2">{questionNumber(index)}</span>
									<span className="min-w-0">
										<span className="block type-body font-semibold">
											{question.label || "No question text yet"}
										</span>
										<span className="flex flex-wrap items-baseline gap-x-3 type-small text-ink-2">
											<span>
												{question.required ? "Required" : "Optional"} ·{" "}
												{question.dependsOn ? "Conditional" : "Always visible"}
											</span>
											{changed.has(question.id) && (
												<StateBadge kind="form" state="draft" label="Changed" size="sm" />
											)}
											{unsaved.has(question.id) && (
												<span className="font-semibold text-ink">Unsaved</span>
											)}
											{refused.has(question.id) && (
												<span className="inline-flex items-center gap-1.5 font-semibold text-attention">
													<Icon name="triangle-alert" size={16} />
													Needs fixing
												</span>
											)}
										</span>
									</span>
								</button>
								{selected && movable && (
									<div className="flex justify-end gap-2">
										<IconButton
											icon="arrow-up"
											label={`Move ${question.label} up`}
											disabled={index === 0}
											onClick={() => move(question.id, index - 1)}
										/>
										<IconButton
											icon="arrow-down"
											label={`Move ${question.label} down`}
											disabled={index === questions.length - 1}
											onClick={() => move(question.id, index + 1)}
										/>
									</div>
								)}
							</div>
						</li>
					);
				})}
			</ul>
			<p role="status" className={cx("px-5 type-small text-ink-2", message ? "pb-4" : "sr-only")}>
				{message}
			</p>
		</>
	);
}
