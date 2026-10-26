import { describe, expect, it } from "vitest";
import playDefinition from "../../../../contracts/forms/janet-test-v1.json";
import { boundFixture, ids } from "./bound-fixture";
import { cachedForm } from "./form-upgrade";
import { preparePackage, storedForms } from "./prepare";

describe("Retained package schema transition", () => {
  it("converts only known canonical legacy JSON without changing its raw bytes", () => {
    const before = JSON.stringify(playDefinition);
    expect(cachedForm(undefined, playDefinition).version).toBe(playDefinition.version);
    expect(cachedForm(1, playDefinition).version).toBe(playDefinition.version);
    expect(JSON.stringify(playDefinition)).toBe(before);
    expect(() => cachedForm(undefined, { ...playDefinition, futureSetting: true })).toThrow();
    expect(() =>
      cachedForm(undefined, { ...playDefinition, columnNaming: "questionId" }),
    ).toThrow();
    expect(() => cachedForm(99, playDefinition)).toThrow();
  });
  it("preserves served schema metadata and refuses unknown cache or online versions", async () => {
    const f = boundFixture();
    const stored = await preparePackage(ids.project, f.site, f.source);
    expect(stored.formSchemaVersions).toEqual({ play: 2, inventory: null });
    expect(storedForms(stored).play.version).toBe(stored.manifest.forms.play.form_version);
    expect(() =>
      storedForms({ ...stored, formSchemaVersions: { play: 99, inventory: null } }),
    ).toThrow();
    await expect(
      preparePackage(ids.project, f.site, {
        ...f.source,
        formVersion: async (code) => ({
          ...(await f.source.formVersion(code)),
          schema_version: 99,
        }),
      }),
    ).rejects.toThrow();
  });
  it("does not activate a previously ignored observer role during a legacy upgrade", () => {
    const definition = {
      ...playDefinition,
      questions: playDefinition.questions.map((question) => ({
        ...question,
        ...(question.id === "observer_initials" ? { role: "observer" } : {}),
      })),
    };
    for (const version of [undefined, 1]) expect(() => cachedForm(version, definition)).toThrow();
    expect(
      cachedForm(2, definition).questions.find((question) => question.id === "observer_initials")
        ?.role,
    ).toBe("observer");
  });
});
