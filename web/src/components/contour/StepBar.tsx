import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { Icon } from "./Icon";

export type StepBarStep = {
	key: string;
	label: string;
	/** Where the step lives. Only finished steps and the current one link; later steps are never reachable early. */
	href?: string;
};

export type StepBarProps = {
	steps: StepBarStep[];
	/** The key of the step on screen. */
	current: string;
	/** Keys of finished steps. They show a check and stay clickable. */
	done: string[];
	/** Names the navigation landmark: "Map package steps". */
	label: string;
	className?: string;
};

type StepState = "done" | "current" | "upcoming";

const STATE: Record<StepState, string> = {
	done: "font-semibold text-ink",
	current: "bg-ink font-semibold text-on-ink",
	upcoming: "font-medium text-ink-2"
};

/**
 * The steps of a web flow on one wide track, such as the map package steps (project-10). A
 * finished step shows a check and its label, the current step is an ink pill ("2 Project"), and later
 * steps show their number in secondary ink. On narrow screens the steps fall into two columns rather
 * than cutting a label.
 */
export function StepBar({ steps, current, done, label, className }: StepBarProps) {
	const total = steps.length;

	return (
		<nav aria-label={label} className={className}>
			<ol
				className={cx(
					"grid grid-cols-2 gap-1 rounded-panel border border-line bg-island p-1",
					"md:auto-cols-fr md:grid-flow-col md:grid-cols-none md:rounded-pill"
				)}>
				{steps.map((step, index) => {
					const state: StepState =
						step.key === current ? "current" : done.includes(step.key) ? "done" : "upcoming";
					const content: ReactNode = (
						<>
							<span className="sr-only">
								Step {index + 1} of {total},{" "}
							</span>
							{state === "done" ? (
								<Icon name="check" size={18} className="shrink-0" />
							) : (
								<span aria-hidden="true" className="tnum">
									{index + 1}
								</span>
							)}
							<span>{step.label}</span>
							{state === "done" && <span className="sr-only">, done</span>}
						</>
					);
					const classes = cx(
						"flex h-full min-h-control items-center justify-center gap-2 rounded-pill px-4 py-2 text-center type-body",
						STATE[state]
					);

					return (
						<li key={step.key}>
							{step.href && state !== "upcoming" ? (
								<Link
									href={step.href}
									prefetch={false}
									aria-current={state === "current" ? "step" : undefined}
									className={cx(
										classes,
										"transition-[color,background-color,opacity] duration-(--ct-duration-quick) ease-standard",
										state === "done" ? "hover:bg-well active:bg-ledge" : "active:opacity-90"
									)}>
									{content}
								</Link>
							) : (
								<span aria-current={state === "current" ? "step" : undefined} className={classes}>
									{content}
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
