import { ApiError } from "../../data/api/errors";
import type { SiteVersions } from "../zone-model-types";

export function discoveryProblem(error: unknown): NonNullable<SiteVersions["refreshProblem"]> {
  if (error instanceof ApiError) {
    if (error.httpStatus === 404 || error.code === "membership_required") return "no_access";
    if (error.kind === "sign-in") return "signed_out";
    return error.httpStatus === null ? "offline" : "server";
  }
  return "server";
}
