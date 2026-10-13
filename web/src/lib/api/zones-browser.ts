"use client";

import type { DraftSnapshot } from "@/features/zones/editor/save-queue";
import { type ZoneDraft, zoneDraftSchema, type ZoneValidation, zoneValidationSchema } from "@/lib/zones/schemas";

import { AccountChangedError, browserApi } from "./browser";
import { ApiError, apiRequestError, parseApiError } from "./errors";

/**
 * A draft's requests from the browser (WUI-3): read, replace, check and discard, each sent directly to the
 * API as the signed-in manager. Replace, check and discard carry the draft's ETag as `If-Match`, so a write
 * made against an older revision is refused (412) instead of overwriting someone else's. Every request can
 * be ended by its caller, and none is sent while another account is signed in (WUI-12).
 */

export type DraftAddress = {
	readonly projectId: string;
	readonly siteId: string;
	readonly draftId: string;
	/** The account the editor was opened for. */
	readonly userId: string;
};

export type DraftRead = { readonly draft: ZoneDraft; readonly etag: string; readonly requestId?: string };

type Answer = { readonly response: Response; readonly data?: unknown; readonly error?: unknown };

function path(address: DraftAddress) {
	return { project_id: address.projectId, site_id: address.siteId, draft_id: address.draftId };
}

function requestIdOf(response: Response | undefined): string | undefined {
	return response?.headers.get("X-Request-Id") ?? undefined;
}

/** A draft answer, checked; the ETag header wins over the body's copy of it. */
function readDraft({ response, data, error }: Answer): DraftRead {
	if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
	const parsed = zoneDraftSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry", { status: response.status });
	const etag = response.headers.get("ETag") ?? parsed.data.etag;
	return { draft: { ...parsed.data, etag }, etag, requestId: requestIdOf(response) };
}

export async function getZoneDraft(address: DraftAddress, signal?: AbortSignal): Promise<DraftRead> {
	try {
		const api = browserApi({ signal, expectUser: address.userId });
		return readDraft(
			await api.GET("/v1/projects/{project_id}/sites/{site_id}/zone-drafts/{draft_id}", {
				params: { path: path(address) }
			})
		);
	} catch (error) {
		throw failureOf(error);
	}
}

/** Replaces the whole draft, if it is still at `etag`. */
export async function replaceZoneDraft(
	address: DraftAddress,
	etag: string,
	snapshot: DraftSnapshot,
	signal?: AbortSignal
): Promise<DraftRead> {
	try {
		const api = browserApi({ signal, expectUser: address.userId });
		return readDraft(
			await api.PUT("/v1/projects/{project_id}/sites/{site_id}/zone-drafts/{draft_id}", {
				params: { path: path(address), header: { "if-match": etag } },
				body: {
					zones: snapshot.zones.map(zone => ({
						zone_id: zone.zone_id,
						zone_code: zone.zone_code,
						zone_label: zone.zone_label,
						geometry: zone.geometry as never
					})),
					change_note: snapshot.changeNote
				}
			})
		);
	} catch (error) {
		throw failureOf(error);
	}
}

/** DECA Mark's checks of the draft at `etag`: problems that stop publishing, warnings and each zone's change. */
export async function validateZoneDraft(
	address: DraftAddress,
	etag: string,
	signal?: AbortSignal
): Promise<ZoneValidation> {
	try {
		const api = browserApi({ signal, expectUser: address.userId });
		const { response, data, error } = await api.POST(
			"/v1/projects/{project_id}/sites/{site_id}/zone-drafts/{draft_id}/validate",
			{ params: { path: path(address), header: { "if-match": etag } } }
		);
		if (!response.ok || !data) throw parseApiError(response.status, error, response.headers);
		const parsed = zoneValidationSchema.safeParse(data);
		if (!parsed.success) throw new ApiError("unknown", "retry", { status: response.status });
		return parsed.data;
	} catch (error) {
		throw failureOf(error);
	}
}

/** Discards the draft at `etag`. Nothing published changes. */
export async function discardZoneDraft(address: DraftAddress, etag: string, signal?: AbortSignal): Promise<void> {
	try {
		const api = browserApi({ signal, expectUser: address.userId });
		const { response, error } = await api.DELETE(
			"/v1/projects/{project_id}/sites/{site_id}/zone-drafts/{draft_id}",
			{ params: { path: path(address), header: { "if-match": etag } } }
		);
		if (!response.ok) throw parseApiError(response.status, error, response.headers);
	} catch (error) {
		throw failureOf(error);
	}
}

/** A failed draft request: the account fence and an abort pass through; anything else is an ApiError. */
function failureOf(error: unknown): unknown {
	if (error instanceof AccountChangedError) return error;
	if (error instanceof DOMException && error.name === "AbortError") return error;
	return apiRequestError(error);
}

/** Whether a request was ended by its caller, rather than failing. */
export function wasAborted(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}
