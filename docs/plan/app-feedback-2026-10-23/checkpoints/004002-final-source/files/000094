import type { Answers, AnswerValue, FormDefinition } from "./definition";
import { pruneAnswers, visibleQuestions } from "./engine";

/** Partial number input is draft text until finite; review must refuse it rather than lose it. */
export function pruneDraftAnswers(form: FormDefinition, input: Answers) {
  const pruned = pruneAnswers(form, input);
  const answers: Record<string, AnswerValue> = { ...pruned.answers };
  const retained = new Set<string>();
  for (const question of visibleQuestions(form, pruned.answers)) {
    const value = input[question.id];
    if (question.kind === "number" && typeof value === "string" && value.trim() !== "") {
      answers[question.id] = value;
      retained.add(question.id);
    }
  }
  return { answers, dropped: pruned.dropped.filter((question) => !retained.has(question.id)) };
}
