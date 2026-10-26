import type { Condition } from "@/lib/forms";

import { availableOptions } from "./available-options";
import type { RawQuestion } from "./raw";

export function conditionSummary(condition: Condition, questions: readonly RawQuestion[]): string {
	if (condition.kind === "all" || condition.kind === "any")
		return `(${condition.of.map(part => conditionSummary(part, questions)).join(condition.kind === "all" ? " and " : " or ")})`;
	const question = questions.find(candidate => candidate.id === condition.question);
	const label = `“${question?.label || condition.question}”`;
	if (condition.kind === "answered") return `${label} has an answer`;
	const options = availableOptions(question);
	const option = options?.find(candidate => candidate.code === condition.option)?.label ?? condition.option;
	return `${label} ${condition.kind === "equals" ? "is" : condition.kind === "notEquals" ? "is not" : "includes"} “${option}”`;
}
