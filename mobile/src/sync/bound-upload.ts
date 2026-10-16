import ky, { NetworkError, TimeoutError } from "ky";
import { ApiError } from "../data/api/errors";
import { isBoundObservation } from "../domain/observation";
import { receiptSchema, type SyncScope, type Upload } from "./contracts";
import { receiptMatches } from "./receipt";
import { readUploadFailure } from "./upload-failure";
import { uploadBodyMatches } from "./wire-body";

export function createBoundUpload(apiUrl: string, scope: SyncScope): Upload {
  const http = ky.create({
    prefix: apiUrl.replace(/\/$/, ""),
    retry: 0,
    timeout: 15000,
    throwHttpErrors: false,
  });
  return async (record, token, signal, body) => {
    try {
      if (
        !isBoundObservation(record) ||
        record.binding.issuer !== scope.issuer ||
        signal.aborted ||
        !uploadBodyMatches(body, record)
      )
        throw new ApiError("unknown", "retry");
      const response = await http.put(
        `v1/projects/${record.binding.projectId}/observations/${record.id}`,
        {
          signal,
          body,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        },
      );
      if (!response.ok) return await readUploadFailure(response, record);
      const value: unknown = await response.json();
      if (!receiptMatches(value, record, scope)) throw new ApiError("unknown", "retry");
      return { kind: "accepted", receipt: receiptSchema.parse(value) };
    } catch (error) {
      if (error instanceof ApiError)
        return {
          kind: error.kind,
          code: error.code,
          message: error.message,
          retryAfter: error.retryAfter,
        };
      if (
        error instanceof NetworkError ||
        error instanceof TimeoutError ||
        error instanceof TypeError ||
        error instanceof SyntaxError ||
        (error instanceof Error && error.name === "AbortError")
      )
        return {
          kind: "retry",
          code: "unknown",
          message: new ApiError("unknown", "retry").message,
        };
      throw error;
    }
  };
}
