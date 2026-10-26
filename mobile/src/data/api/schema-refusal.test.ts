import { expect, it } from "vitest";
import { parseApiError } from "./errors";

it("offers an update action for unknown form schemas while retaining local work", () => {
  const error = parseApiError(409, {
    error: { code: "unknown_schema_version", message: "Unsupported schema", details: {} },
  });
  expect(error.code).toBe("unknown_schema_version");
  expect(error.kind).toBe("rejected");
  expect(error.message).toMatch(/Update DECA Mark/);
  expect(error.message).toMatch(/retained/);
});
