import { type Answers, type AnswerValue, type FormDefinition, pruneAnswers } from "@/lib/forms";
import { captureTimeValue } from "@/lib/forms/temporal";

export type PreviewCapture = { instant: string; observer?: { userId: string; code: string } };

export function previewAnswers(form: FormDefinition, answers: Answers, capture: PreviewCapture): Answers {
	const next: Record<string, AnswerValue> = { ...answers };
	for (const question of form.questions) {
		const source = question.valueSource;
		if (source === undefined || source === "manual") continue;
		const value =
			source === "accountId"
				? capture.observer?.userId
				: source === "observerCode"
					? capture.observer?.code
					: question.dateTime
						? captureTimeValue(question.dateTime, capture.instant)
						: undefined;
		if (value) next[question.id] = value;
		else delete next[question.id];
	}
	return pruneAnswers(form, next).answers;
}
