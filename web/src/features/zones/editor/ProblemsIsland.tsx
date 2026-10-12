"use client";

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

export function ProblemsIsland({
	problems,
	onShow
}: {
	problems: readonly EditorProblem[];
	onShow: (problem: EditorProblem) => void;
}) {
	const blocking = problems.filter(problem => problem.kind === "blocking");
	const hints = problems.filter(problem => problem.kind === "hint");
	return (
		<Island
			title="Problems"
			meta={
				problems.length === 0
					? "None found while editing"
					: `Found while editing · ${plural(problems.length, "problem")}`
			}
			flush
			footnote="DECA Mark checks every boundary again before a version is published. These are what the browser found while you edited.">
			{problems.length === 0 ? (
				<p className="px-island-pad py-4 type-body text-ink-2">Nothing found while editing.</p>
			) : (
				<div className="flex flex-col">
					{blocking.length > 0 && (
						<section aria-label="Stops saving">
							<p className="px-island-pad pt-3 pb-2 type-mono-label text-ink-2">Stops saving</p>
							<ul>
								{blocking.map(problem => (
									<ProblemRow key={problem.number} problem={problem} onShow={onShow} />
								))}
							</ul>
						</section>
					)}
					{hints.length > 0 && (
						<section aria-label="Found while editing">
							<p className="px-island-pad pt-3 pb-2 type-mono-label text-ink-2">Found while editing</p>
							<ul>
								{hints.map(problem => (
									<ProblemRow key={problem.number} problem={problem} onShow={onShow} />
								))}
							</ul>
						</section>
					)}
				</div>
			)}
		</Island>
	);
}
