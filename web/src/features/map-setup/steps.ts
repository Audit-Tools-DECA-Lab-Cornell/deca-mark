import { sourceDisposition } from "./model";
import type { Content, SourceLayer } from "./schema";

/**
 * The four tasks of map setup, in the order a manager meets them. `add-map` keeps its address from the
 * earlier three-step flow, so saved links and the resume notice keep working.
 */
export type Step = "add-map" | "outline" | "zones" | "review";

export const STEPS: readonly { readonly key: Step; readonly label: string }[] = [
	{ key: "add-map", label: "Map layers" },
	{ key: "outline", label: "Site outline" },
	{ key: "zones", label: "Zones" },
	{ key: "review", label: "Publish" }
];

/** Reads a step from its address. `boundaries` is the earlier combined outline-and-zones step. */
export function readStep(segment: string | undefined): Step | null {
	if (segment === undefined) return "add-map";
	if (segment === "boundaries") return "zones";
	return STEPS.find(step => step.key === segment)?.key ?? null;
}

export type StepInput = {
	readonly layers: readonly Pick<SourceLayer, "source_id" | "features">[];
	readonly content: Pick<Content, "assignments" | "outline" | "zones">;
	/** Whether the imported layers hold anything that can be drawn as a map. */
	readonly drawable: boolean;
};

/**
 * Why each step cannot be opened yet, in the manager's words, or null when it can. A later step inherits
 * the first unmet requirement before it, so the message always names the next thing to do.
 */
export function stepBlockers(input: StepInput | null): Record<Step, string | null> {
	if (!input) {
		const first = "Choose your QGIS project first.";
		return { "add-map": null, outline: first, zones: first, review: first };
	}
	const undecided = sourceDisposition(input.layers, input.content.assignments);
	const outline = !input.drawable
		? "This project has no map features to draw on. Add its data files first."
		: undecided > 0
			? `Decide how to use ${undecided} more ${undecided === 1 ? "feature" : "features"} first.`
			: null;
	const zones = outline ?? (input.content.outline ? null : "Add the site outline first.");
	const review = zones ?? (input.content.zones.length > 0 ? null : "Add at least one observation zone first.");
	return { "add-map": null, outline, zones, review };
}

/** The step to show for a requested one: the request itself, or the latest earlier step that is open. */
export function resolveStep(requested: Step, blockers: Record<Step, string | null>): Step {
	const order = STEPS.map(step => step.key);
	for (let index = order.indexOf(requested); index > 0; index -= 1) {
		const key = order[index];
		if (key && blockers[key] === null) return key;
	}
	return "add-map";
}

/** Steps whose own work is finished. Publish is finished only by publishing, which leaves this flow. */
export function finishedSteps(input: StepInput | null): Step[] {
	if (!input) return [];
	const blockers = stepBlockers(input);
	const done: Step[] = [];
	if (blockers.outline === null) done.push("add-map");
	if (blockers.zones === null) done.push("outline");
	if (blockers.review === null) done.push("zones");
	return done;
}

export function nextStep(step: Step): Step | null {
	const order = STEPS.map(item => item.key);
	return order[order.indexOf(step) + 1] ?? null;
}

export function previousStep(step: Step): Step | null {
	const order = STEPS.map(item => item.key);
	return order[order.indexOf(step) - 1] ?? null;
}
