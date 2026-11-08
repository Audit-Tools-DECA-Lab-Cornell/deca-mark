import { parseFormDefinition } from "./definition";

/**
 * A one-question form with a bounded whole number, for the tests of numeric entry and its range
 * check. The janet forms ask no number, and no form is bundled with the app.
 */
export const countForm = parseFormDefinition({
  version: "count-test-v1",
  title: "Count test",
  summary: "One bounded number, for tests.",
  source: "test",
  status: "published",
  inclusion: "test",
  knownExportCollisions: [],
  protocolNotes: [],
  questions: [
    {
      id: "people",
      code: "People",
      exportColumn: "people",
      act: "Social",
      label: "How many people are here?",
      kind: "number",
      options: [],
      columns: 1,
      required: true,
      placeholder: "0–999",
      min: 0,
      max: 999,
      source: "test",
    },
  ],
});
