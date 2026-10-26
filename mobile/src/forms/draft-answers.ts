import type { Answers, FormDefinition } from "./definition";
import { pruneAnswers } from "./engine";

/** Partial number input is draft text until finite; review must refuse it rather than lose it. */
export function pruneDraftAnswers(form: FormDefinition, input: Answers) {
  return pruneAnswers(form, input, { retainDraftNumberText: true });
}
