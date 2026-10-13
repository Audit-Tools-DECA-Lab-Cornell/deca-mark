"use client";

import createClient from "openapi-fetch";

import { saveBlob, saveText } from "@/lib/download";
import { zonesGeoJson } from "@/lib/export/files";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

import { ApiError, apiRequestError, parseApiError } from "./errors";
import { filterQuery, type ObservationFilters } from "./observations";
import type { paths } from "./schema";
import { publicationSchema } from "./sites";
import type { PackageSubmission, ProjectImportRequest, ProjectImportResult, Publication } from "./types";

/**
 * Requests the browser sends to the API itself, as the signed-in person: map package uploads (up to
 * 24 MiB), archive and export downloads, which are larger than a Server Action may carry. The API allows the web
 * app's origin (CORS). Every other read and write goes through the server (`workspace.ts`,
 * `mutations.ts`).
 */

/** A session expiring sooner than this is refreshed before it is sent. */
const REFRESH_WITHIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
/** Uploads and downloads of several megabytes on a slow connection. */
const TRANSFER_TIMEOUT_MS = 180_000;

/** The API's address for the browser, or null when this deployment does not set one. */
export function browserApiUrl(): string | null {
	return process.env.NEXT_PUBLIC_DECAMARK_API_URL || null;
}

/** The signed-in person's access token, refreshed first when it expires within a minute. */
async function accessToken(): Promise<string> {
	let supabase: ReturnType<typeof createSupabaseClient>;
	try {
		supabase = createSupabaseClient();
	} catch {
		throw new ApiError("storage_unavailable", "retry");
	}
	const { data, error } = await supabase.auth.getSession();
	if (error || !data.session) throw new ApiError("token_invalid", "sign-in");
	const expiresAt = data.session.expires_at;
	if (expiresAt !== undefined && expiresAt * 1000 - Date.now() > REFRESH_WITHIN_MS) return data.session.access_token;
	const refreshed = await supabase.auth.refreshSession();
	if (refreshed.error || !refreshed.data.session) throw new ApiError("token_invalid", "sign-in");
	return refreshed.data.session.access_token;
}

/**
 * An API client for the browser. Each request carries a fresh token and its own timeout signal.
 * Throws when this deployment has no browser API address.
 */
export function browserApi(timeoutMs = REQUEST_TIMEOUT_MS) {
	const baseUrl = browserApiUrl();
	if (!baseUrl) throw new ApiError("storage_unavailable", "retry");
	const client = createClient<paths>({
		baseUrl,
		fetch: request => fetch(request, { signal: AbortSignal.timeout(timeoutMs) })
	});
	client.use({
		async onRequest({ request }) {
			request.headers.set("Authorization", `Bearer ${await accessToken()}`);
			return request;
		}
	});
	return client;
}

/**
 * Sends a map package from QGIS layers. DECA Mark checks it, and either publishes it as the site's next
 * version (201) or refuses it with the reasons (a 4xx, thrown). Sending the same request again, with the
 * same `request_id`, returns the original result with `replayed: true` (200), which may no longer be the
 * site's current version.
 */
export async function preparePackage(projectId: string, submission: PackageSubmission): Promise<Publication> {
	try {
		const api = browserApi(TRANSFER_TIMEOUT_MS);
		const { data, error, response } = await api.POST("/v1/projects/{project_id}/packages", {
			params: { path: { project_id: projectId } },
			body: submission
		});
		if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
		const parsed = publicationSchema.safeParse(data);
		if (!parsed.success) throw new ApiError("unknown", "retry");
		return parsed.data;
	} catch (error) {
		throw apiRequestError(error);
	}
}

export async function importQgisProject(
	projectId: string,
	submission: ProjectImportRequest
): Promise<ProjectImportResult> {
	try {
		const api = browserApi(TRANSFER_TIMEOUT_MS);
		const { data, error, response } = await api.POST("/v1/projects/{project_id}/packages/import", {
			params: { path: { project_id: projectId } },
			body: submission
		});
		if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
		return data;
	} catch (error) {
		throw apiRequestError(error);
	}
}

async function sha256Hex(blob: Blob): Promise<string | null> {
	if (typeof crypto === "undefined" || !crypto.subtle) return null;
	const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Downloads a ready package's archive and saves it as `fileName` (name it from the site code and version,
 * e.g. `packageFileName` in `lib/download.ts`; the API's own file name is not readable cross-origin).
 * When the answer carries the archive's SHA-256 (its ETag), the bytes are checked against it first.
 */
export async function downloadPackageArchive(
	projectId: string,
	packageId: string,
	fileName: string
): Promise<{ bytes: number }> {
	try {
		const api = browserApi(TRANSFER_TIMEOUT_MS);
		const { data, error, response } = await api.GET("/v1/projects/{project_id}/packages/{package_id}/archive", {
			params: { path: { project_id: projectId, package_id: packageId } },
			parseAs: "blob"
		});
		if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
		const expected = response.headers.get("ETag")?.replace(/^W\//, "").replaceAll('"', "").toLowerCase();
		if (expected && /^[0-9a-f]{64}$/.test(expected)) {
			const actual = await sha256Hex(data);
			if (actual !== null && actual !== expected) throw new ApiError("unknown", "retry");
		}
		saveBlob(data, fileName);
		return { bytes: data.size };
	} catch (error) {
		throw apiRequestError(error);
	}
}

/**
 * Downloads DECA Mark's export of every observation the filters match (no page, no limit of 500) as a ZIP
 * and saves it as `fileName`. More than 10,000 matching observations are refused (422, with an
 * `export_scope_too_large` issue).
 */
export async function downloadObservationExport(
	projectId: string,
	filters: ObservationFilters,
	format: "csv" | "geojson",
	fileName: string
): Promise<{ bytes: number }> {
	try {
		const api = browserApi(TRANSFER_TIMEOUT_MS);
		const { data, error, response } = await api.GET("/v1/projects/{project_id}/observations/export", {
			params: { path: { project_id: projectId }, query: { ...filterQuery(filters), format } },
			parseAs: "blob"
		});
		if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
		saveBlob(data, fileName);
		return { bytes: data.size };
	} catch (error) {
		throw apiRequestError(error);
	}
}

/** Downloads one map version's zone boundaries and saves them as GeoJSON for QGIS. */
export async function downloadZoneBoundaries(
	projectId: string,
	site: { readonly siteId: string; readonly code: string },
	packageId: string,
	fileName: string
): Promise<void> {
	try {
		const api = browserApi(TRANSFER_TIMEOUT_MS);
		const { data, error, response } = await api.GET("/v1/projects/{project_id}/sites/{site_id}/zones", {
			params: { path: { project_id: projectId, site_id: site.siteId }, query: { package_id: packageId } }
		});
		if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
		saveText(zonesGeoJson(data, site.code), fileName, "application/geo+json");
	} catch (error) {
		throw apiRequestError(error);
	}
}
