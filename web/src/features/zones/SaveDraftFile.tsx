"use client";

import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { useToast } from "@/components/contour/Toast";
import { apiRequestError } from "@/lib/api/errors";
import { type DraftAddress, getZoneDraft } from "@/lib/api/zones-browser";
import { saveText } from "@/lib/download";

import { draftFileName, draftGeoJson } from "./editor/conflict";

/** Saves a draft's zones and change note as a GeoJSON file, read from DECA Mark when pressed. */
export function SaveDraftFile({ address, siteCode }: { address: DraftAddress; siteCode: string }) {
	const { toast } = useToast();
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			const { draft } = await getZoneDraft(address);
			const fileName = draftFileName(siteCode, draft.revision);
			saveText(
				draftGeoJson({ zones: draft.zones, changeNote: draft.change_note }),
				fileName,
				"application/geo+json"
			);
			toast({ title: `Download started: ${fileName}`, tone: "saved" });
		} catch (error) {
			const message =
				error instanceof Error && error.name === "AccountChangedError"
					? "You are signed in as someone else."
					: apiRequestError(error).message;
			toast({ title: "Nothing was downloaded.", description: message, tone: "attention" });
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button
			variant="outline"
			size="sm"
			icon="download"
			busy={busy}
			busyLabel="Preparing the file…"
			onClick={() => void save()}>
			Save as file
		</Button>
	);
}
