import type { Answers, FormDefinition } from "../forms/definition";
import { pruneAnswers, reviewProblems } from "../forms/engine";
import {
  boundShellObservationSchema,
  type Coordinate,
  instrumentObservationSchema,
  isShellObservation,
  type Observation,
  type Placement,
  type RoundContext,
  shellObservationSchema,
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
  /** The project a hosted site belongs to, so the record uploads there. */
  readonly projectId?: string | undefined;
  /** The account's initials, for a form that asks no observer question of its own. */
  readonly observer?: string | undefined;
  readonly createdAt: string;
  readonly binding?: PackageBinding | undefined;
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
    storageStatus: "local-only",
  };
  if (input.form.version === "shell-v1") {
    const { people } = answers;
    const shell = {
      ...shared,
      formVersion: "shell-v1",
      observer: text(answers, "observer"),
      people,
      notes: text(answers, "notes"),
    };
    const parsed = input.binding
      ? boundShellObservationSchema.safeParse({
          ...shell,
          binding: input.binding,
          projectId: input.projectId,
          siteId: input.siteId,
          context: input.context,
          placement: input.placement,
        })
      : shellObservationSchema.safeParse({ ...shell, siteId: "sample-garden" });
    return parsed.success
      ? { ok: true, record: parsed.data }
      : { ok: false, message: parsed.error.issues[0]?.message ?? "Check the answers." };
  }
  {
    const observerQuestion = input.form.questions.find(
      (question) => question.exportColumn === "observer" && question.kind === "text",
    );
    const observer = observerQuestion ? text(answers, observerQuestion.id) : (input.observer ?? "");
    if (!observerQuestion && observer.trim() === "")
      return {
        ok: false,
        message: "Add your initials under Account; this form does not ask for them.",
      };
    const parsed = instrumentObservationSchema.safeParse({
      ...shared,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      siteId: input.siteId,
      formVersion: input.form.version,
      observer,
      answers,
      context: input.context,
      ...(input.binding ? { binding: input.binding } : {}),
      placement: input.placement,
    });
    return parsed.success
      ? { ok: true, record: parsed.data }
      : { ok: false, message: parsed.error.issues[0]?.message ?? "Check the answers." };
  }
}

const SUMMARY_QUESTION = "play_event_summary";

/** The single line a record shows in the device list and in a map callout. */
export function observationSummary(record: Observation): string {
  if (isShellObservation(record))
    return record.notes !== ""
      ? record.notes
      : `${record.people} ${record.people === 1 ? "person" : "people"} observed`;
  const summary = record.answers[SUMMARY_QUESTION];
  return typeof summary === "string" && summary !== ""
    ? summary
    : `${record.context.zoneLabel} · ${roundLabel(record.context.roundType)}`;
}
