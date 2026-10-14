import type { FormDefinition } from "../forms/definition";
import { isAnswered, visibleQuestions } from "../forms/engine";
import { validateRecoveredPackage } from "../session/ownership";
import { formForRound } from "../session/round-forms";
import type { ObservationDraft } from "../storage/draft-store";
import type { SitePackage } from "./site-package";
import type { Recovered } from "./zone-model-types";

/** Only exact package and form snapshots can interpret retained research answers. */
export function recoveredDraftModel(
  draft: ObservationDraft,
  input: {
    readonly package: SitePackage | undefined;
    readonly noAccess: boolean;
    readonly canDownload: boolean;
    readonly bytes: number | null;
    readonly parked: boolean;
  },
): Recovered | null {
  const binding = draft.binding;
  if (!binding) return null;
  const problem = input.noAccess
    ? "package_unavailable"
    : input.package
      ? validateRecoveredPackage(draft, input.package)
      : "package_missing";
  const form: FormDefinition | null =
    input.package && problem === null ? formForRound(input.package, draft.context.roundType) : null;
  const status = problem ?? (form ? "ready" : "form_missing");
  const questions = form ? visibleQuestions(form, draft.answers) : [];
  return {
    draftId: draft.id,
    pinned: {
      packageId: binding.packageId,
      version: binding.packageVersion,
      siteId: binding.siteId,
      zone: { id: binding.zoneId, code: binding.zoneCode, label: binding.zoneLabel },
    },
    placed: draft.coordinates !== null,
    answered: questions.filter((question) => isAnswered(draft.answers[question.id])).length,
    asked: questions.length,
    status,
    parked: input.parked,
    redownload: {
      possible: status === "package_missing" && input.canDownload && !input.noAccess,
      bytes: input.bytes,
    },
  };
}
