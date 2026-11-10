import { type ApiError, apiRequestError, wasRefused } from "@/lib/api/errors";
import type { ProjectImportRequest } from "@/lib/api/types";

import type { Setup } from "./schema";

type ImportFile = ProjectImportRequest["files"][number];
export type InitialImportMode = "project" | "geojson";
export type InitialImportBody = Readonly<{
	readonly files: readonly Readonly<ImportFile>[];
	readonly request_id: string;
	readonly expected_current_package_id: string | null;
	readonly mode: InitialImportMode;
}>;
export type InitialImportAttempt = Readonly<{ readonly body: InitialImportBody }>;
export type InitialImportResult =
	| Readonly<{ readonly status: "accepted"; readonly setup: Setup }>
	| Readonly<{ readonly status: "refused"; readonly failure: ApiError }>
	| Readonly<{ readonly status: "uncertain"; readonly failure: ApiError }>;
export type InitialImportTransport = Readonly<{
	readonly create: (body: InitialImportBody) => Promise<Setup>;
}>;

/**
 * Captures the normalized import bytes and one request identity so every uncertain retry sends exactly
 * the same operation. The copies are frozen because a file picker can no longer reproduce these bytes
 * after its value is cleared.
 */
export function createInitialImportAttempt(
	submission: ProjectImportRequest,
	expectedCurrentPackageId: string | null,
	mode: InitialImportMode,
	requestId: string
): InitialImportAttempt {
	const files = Object.freeze(
		submission.files.map(file => Object.freeze({ file_name: file.file_name, content: file.content }))
	);
	return Object.freeze({
		body: Object.freeze({
			files,
			request_id: requestId,
			expected_current_package_id: expectedCurrentPackageId,
			mode
		})
	});
}

/**
 * Sends one initial import and automatically replays its exact immutable request once after an uncertain
 * answer. Only that request's receipt can recover the upload; a competing active setup remains a refusal.
 */
export async function submitInitialImport(
	attempt: InitialImportAttempt,
	transport: InitialImportTransport
): Promise<InitialImportResult> {
	try {
		return { status: "accepted", setup: await transport.create(attempt.body) };
	} catch (raised) {
		const failure = apiRequestError(raised);
		if (wasRefused(failure)) return { status: "refused", failure };
		try {
			return { status: "accepted", setup: await transport.create(attempt.body) };
		} catch (replayRaised) {
			const replayFailure = apiRequestError(replayRaised);
			if (wasRefused(replayFailure)) return { status: "refused", failure: replayFailure };
			return { status: "uncertain", failure: replayFailure };
		}
	}
}
