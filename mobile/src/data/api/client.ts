import ky, { NetworkError, TimeoutError } from "ky";
import type { z } from "zod";
import {
  type FormSummary,
  type FormVersion,
  formSummariesSchema,
  formVersionSchema,
  type HostedSite,
  type PackageDetail,
  packageDetailSchema,
  sitesSchema,
} from "../../packages/hosted/schemas";
import { ApiError, readApiError } from "./errors";
import {
  type Identity,
  type InvitationPreview,
  type InvitationRedeemed,
  identitySchema,
  invitationPreviewSchema,
  invitationRedeemedSchema,
  type Profile,
  type ProfilePatch,
  profileSchema,
} from "./identity";

type Method = "get" | "patch" | "post";

export function createApiClient(apiUrl: string, getToken: () => Promise<string | null>) {
  const origin = apiUrl.replace(/\/$/, "");
  const http = ky.create({
    prefix: origin,
    retry: 0,
    timeout: 10000,
    throwHttpErrors: false,
  });

  /**
   * One authenticated call: a Bearer token from the current session, a typed error for any failure
   * (CON-04), and a runtime check of the success body, which is never trusted unread.
   */
  async function request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    json?: unknown,
  ): Promise<T> {
    const token = await getToken();
    if (!token) throw new ApiError("unauthenticated", "sign-in");
    try {
      const response = await http[method](path, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
        ...(json === undefined ? {} : { json }),
      });
      if (!response.ok) throw await readApiError(response);
      const parsed = schema.safeParse(await response.json<unknown>());
      if (!parsed.success) throw new ApiError("unknown", "retry");
      return parsed.data;
    } catch (error) {
      // No answer, or one that could not be read: ky wraps a dropped connection in NetworkError where it
      // recognises the runtime's fetch failure, and leaves the bare TypeError where it does not.
      if (
        error instanceof NetworkError ||
        error instanceof TimeoutError ||
        error instanceof TypeError ||
        error instanceof SyntaxError
      )
        throw new ApiError("unknown", "retry");
      throw error;
    }
  }

  /**
   * `DELETE /v1/me`. 204: the account is gone. 202: profile and memberships are removed but removing the
   * sign-in did not finish; the request is safe to repeat (BE-08). 503 `storage_unavailable`: deletion
   * is not configured on this server, and nothing was changed.
   */
  async function deleteMe(signal: AbortSignal): Promise<AccountDeletion> {
    const token = await getToken();
    if (!token) throw new ApiError("unauthenticated", "sign-in");
    try {
      const response = await http.delete("v1/me", {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 204) return "deleted";
      if (response.status === 202) return "pending";
      const error = await readApiError(response);
      if (response.status === 503 && error.code === "storage_unavailable") return "unavailable";
      throw error;
    } catch (error) {
      if (
        error instanceof NetworkError ||
        error instanceof TimeoutError ||
        error instanceof TypeError ||
        error instanceof SyntaxError
      )
        throw new ApiError("unknown", "retry");
      throw error;
    }
  }

  return {
    deleteMe,
    me(signal: AbortSignal): Promise<Identity> {
      return request("get", "v1/me", identitySchema, signal);
    },
    /** `PATCH /v1/me`: the display name, observer initials or locale. Returns the saved profile. */
    updateProfile(patch: ProfilePatch, signal: AbortSignal): Promise<Profile> {
      return request("patch", "v1/me", profileSchema, signal, patch);
    },
    /** `POST /v1/invitations/preview`: what a join code opens, without joining. */
    previewInvitation(code: string, signal: AbortSignal): Promise<InvitationPreview> {
      return request("post", "v1/invitations/preview", invitationPreviewSchema, signal, { code });
    },
    /** `POST /v1/invitations/redeem`: joins the organization or project the code opens. */
    redeemInvitation(code: string, signal: AbortSignal): Promise<InvitationRedeemed> {
      return request("post", "v1/invitations/redeem", invitationRedeemedSchema, signal, { code });
    },
    /** `GET /v1/projects/{project}/sites`: the project's sites and each one's current package. */
    sites(projectId: string, signal: AbortSignal): Promise<HostedSite[]> {
      return request("get", `v1/projects/${projectId}/sites`, sitesSchema, signal);
    },
    packageDetail(
      projectId: string,
      packageId: string,
      signal: AbortSignal,
    ): Promise<PackageDetail> {
      return request(
        "get",
        `v1/projects/${projectId}/packages/${packageId}`,
        packageDetailSchema,
        signal,
      );
    },
    /** `GET /v1/projects/{project}/forms`: its forms and their published and retired versions. */
    forms(projectId: string, signal: AbortSignal): Promise<FormSummary[]> {
      return request("get", `v1/projects/${projectId}/forms`, formSummariesSchema, signal);
    },
    /** `GET /v1/projects/{project}/form-versions/{code}`: one version and its definition. */
    formVersion(projectId: string, code: string, signal: AbortSignal): Promise<FormVersion> {
      return request(
        "get",
        `v1/projects/${projectId}/form-versions/${encodeURIComponent(code)}`,
        formVersionSchema,
        signal,
      );
    },
    /**
     * Where a package archive downloads from, with the header that authorizes it. The archive is
     * downloaded to a file natively (`packages/hosted/device.ts`), then read from there to be checked
     * against its digest and unpacked.
     */
    async archiveRequest(projectId: string, packageId: string) {
      const token = await getToken();
      if (!token) throw new ApiError("unauthenticated", "sign-in");
      return {
        url: `${origin}/v1/projects/${projectId}/packages/${packageId}/archive`,
        headers: { Authorization: `Bearer ${token}` },
      };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** What `DELETE /v1/me` answered (see `deleteMe`). */
export type AccountDeletion = "deleted" | "pending" | "unavailable";
