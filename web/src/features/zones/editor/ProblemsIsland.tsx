"use client";

import type { ReactNode } from "react";

import { Island } from "@/components/contour/Island";
import { plural } from "@/lib/labels";

import type { EditorProblem } from "./problems";

/**
 * The Problems island (UI plan 5.3): each problem says what, where and what to do, with "Show on the plan".
 * Problems that stop saving come first. Hints the browser found come under "Found while editing": they are
 * not authoritative, and DECA Mark checks every boundary again before a version is published. The attention
 * colour lives here, never on the plan, where problems are a numbered ink pill (rule 03).
 */

function ProblemRow({ problem, onShow }: { problem: EditorProblem; onShow: (problem: EditorProblem) => void }) {
	return (
		<li className="flex items-start gap-3 border-t border-rule px-island-pad py-3">
			<span
				aria-hidden="true"
				className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-ink type-mono-data text-on-ink">
				{problem.number}
			</span>
			<div className="flex min-w-0 flex-col items-start gap-1">
				<p className="type-body text-ink">
					<span className="sr-only">Problem {problem.number}. </span>
					{problem.text}
				</p>
				{problem.zoneId && (
					<button
						type="button"
						onClick={() => onShow(problem)}
						className="min-h-touch type-body font-semibold text-accent hover:underline">
						Show on the plan
					</button>
				)}
			</div>
		</li>
	);
}

export type ProblemsIslandProps = {
	problems: readonly EditorProblem[];
	onShow: (problem: EditorProblem) => void;
	/** What DECA Mark's last check covers, such as "Checked revision 6 at 11:33 · 2 problems". */
	checkedLine?: string | null;
	/** "Check boundaries", when the page can ask DECA Mark. */
	action?: ReactNode;
};

function Section({
	label,
	problems,
	onShow
}: {
	label: string;
	problems: readonly EditorProblem[];
	onShow: (problem: EditorProblem) => void;
}) {
	if (problems.length === 0) return null;
	return (
		<section aria-label={label}>
			<p className="px-island-pad pt-3 pb-2 type-mono-label text-ink-2">{label}</p>
			<ul>
				{problems.map(problem => (
					<ProblemRow key={problem.number} problem={problem} onShow={onShow} />
				))}
			</ul>
		</section>
	);
}

export function ProblemsIsland({ problems, onShow, checkedLine = null, action }: ProblemsIslandProps) {
	const local = problems.filter(problem => problem.kind === "blocking" || problem.kind === "hint");
	return (
		<Island
			title="Problems"
			meta={
				checkedLine ??
				(local.length === 0
					? "None found while editing"
					: `Found while editing · ${plural(local.length, "problem")}`)
			}
			actions={action}
			flush
			footnote={
				checkedLine
					? "DECA Mark checks the saved draft after a pause in editing and before a version is published."
					: "DECA Mark checks every boundary again before a version is published. These are what the browser found while you edited."
			}>
			{problems.length === 0 ? (
				<p className="px-island-pad py-4 type-body text-ink-2">
					{checkedLine ? "Nothing found." : "Nothing found while editing."}
				</p>
			) : (
				<div className="flex flex-col">
					<Section
						label="Stops saving"
						problems={problems.filter(p => p.kind === "blocking")}
						onShow={onShow}
					/>
					<Section
						label="Stops publishing"
						problems={problems.filter(p => p.kind === "checked")}
						onShow={onShow}
					/>
					<Section label="Warnings" problems={problems.filter(p => p.kind === "warning")} onShow={onShow} />
					<Section
						label="Found while editing"
						problems={problems.filter(p => p.kind === "hint")}
						onShow={onShow}
					/>
				</div>
			)}
		</Island>
	);
}
