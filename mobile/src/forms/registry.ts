import { type FormDefinition, isObserverQuestion } from "./definition";

/**
 * Answers carried into the next observation of a session: the observer code, wherever a form asks
 * for it through its semantic role or historical column. Every event answer starts empty again.
 *
 * Forms are never bundled with the app: a site's forms come with its package, verified when the
 * package installs (`packages/hosted`), so there is no registry of versions to look one up in.
 */
export function carriedQuestionIds(form: FormDefinition): readonly string[] {
  return form.questions
    .filter((question) => isObserverQuestion(question, form.columnNaming))
    .map((question) => question.id);
}
