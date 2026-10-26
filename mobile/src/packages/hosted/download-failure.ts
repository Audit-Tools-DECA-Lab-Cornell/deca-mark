import { ApiError } from "../../data/api/errors";
import { isUnknownSchemaVersion } from "../../forms/definition";
import { InstallationError } from "./installation";
import { PrepareError } from "./prepare";
import { BoundPackageError } from "./verify-bound";

export function downloadFailure(error: unknown) {
  return {
    state:
      isUnknownSchemaVersion(error) ||
      error instanceof BoundPackageError ||
      error instanceof InstallationError ||
      error instanceof PrepareError
        ? ("verify_failed" as const)
        : ("failed" as const),
    unavailable:
      error instanceof ApiError &&
      (error.httpStatus === 404 ||
        error.httpStatus === 403 ||
        error.code === "membership_required" ||
        error.code === "archive_unavailable"),
    message: isUnknownSchemaVersion(error)
      ? "Update DECA Mark to use this form. Installed maps and unfinished work remain on this device."
      : error instanceof Error
        ? error.message
        : "The download stopped. Check the connection and try again.",
  };
}
