import { type Answers, type FormDefinition, isObserverQuestion } from "../forms/definition";
import { pruneAnswers, reviewProblems, visibleQuestions } from "../forms/engine";
import {
  type Coordinate,
  instrumentObservationSchema,
  type Observation,
  type Placement,
  type RoundContext,
} from "./observation";
import type { PackageBinding } from "./package-binding";
import { roundLabel } from "./rounds";

export type ObservationInput = {
  readonly id: string;
  readonly form: FormDefinition;
  readonly answers: Answers;
  readonly coordinates: Coordinate;
  readonly placement: Placement;
  readonly context: RoundContext;
  readonly siteId: string;
  /** The project the site belongs to, so the record uploads there. */
  readonly projectId: string;
  /** The account's initials, for a form that asks no observer question of its own. */
  readonly observer?: string | undefined;
  readonly createdAt: string;
  readonly startedAt: string;
  /** The package the observation is bound to; a record is never made without one. */
  readonly binding: PackageBinding;
};

export type BuildResult =
  | { readonly ok: true; readonly record: Observation }
  | { readonly ok: false; readonly message: string };

function text(answers: Answers, id: string): string {
  const value = answers[id];
  return typeof value === "string" ? value : "";
}

export function buildObservation(input: ObservationInput): BuildResult {
  if (reviewProblems(input.form, input.answers).length > 0)
    return { ok: false, message: "Check the answers against the form requirements." };
  const { answers } = pruneAnswers(input.form, input.answers);
  const shared = {
    id: input.id,
    coordinates: input.coordinates,
    createdAt: input.createdAt,
    startedAt: input.startedAt,
    storageStatus: "pending",
  };
  const active = visibleQuestions(input.form, answers);
  const observerQuestion = active.find((question) =>
    isObserverQuestion(question, input.form.columnNaming),
  );
  const automaticObserver = active.some((question) => question.valueSource === "observerCode");
  const observer = automaticObserver
    ? (input.observer ?? "")
    : observerQuestion
      ? text(answers, observerQuestion.id)
      : (input.observer ?? "");
  if (!observerQuestion && observer.trim() === "")
    return {
      ok: false,
      message: "Add your initials under Account; this form does not ask for them.",
    };
  const parsed = instrumentObservationSchema.safeParse({
    ...shared,
    projectId: input.projectId,
    siteId: input.siteId,
    formVersion: input.form.version,
    observer,
    answers,
    context: input.context,
    binding: input.binding,
    placement: input.placement,
  });
  return parsed.success
    ? { ok: true, record: parsed.data }
    : { ok: false, message: parsed.error.issues[0]?.message ?? "Check the answers." };
}

const SUMMARY_QUESTION = "play_event_summary";

/** The single line a record shows in the device list and in a map callout. */
export function observationSummary(record: Observation): string {
  const summary = record.answers[SUMMARY_QUESTION];
  return typeof summary === "string" && summary !== ""
    ? summary
    : `${record.context.zoneLabel} · ${roundLabel(record.context.roundType)}`;
}
