import type { OnlineMap } from "@/lib/api/errors";
import type { ProjectImportResult } from "@/lib/api/types";

export type { OnlineMap };

/** The online background maps Read project marked, in the order it listed them. */
export function markedOnlineMaps(result: Pick<ProjectImportResult, "issues">): OnlineMap[] {
	return result.issues.flatMap(issue =>
		issue.kind === "online_basemap" ? [{ name: issue.layer, host: issue.host ?? null }] : []
	);
}

/** "Satellite (mt1.google.com)", or just the name when the host is not known. */
export function onlineMapName(map: OnlineMap): string {
	return map.host ? `${map.name} (${map.host})` : map.name;
}

/** The slot's line for a marked map. */
export function onlineMapLine(map: OnlineMap): string {
	return `${onlineMapName(map)} is an online background map. It will not be uploaded.`;
}

/** Shown when the manager cancels the question: nothing was sent and the files stay chosen. */
export const ONLINE_MAP_CANCELLED =
	"Not uploaded. Remove the background map from the project in QGIS, or upload without it.";
