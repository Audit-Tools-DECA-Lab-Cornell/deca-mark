import type { ProjectedSite } from "../../lib/plan";

/**
 * Plans of map packages the browser has already drawn, so switching back to a map version does not read its
 * archive again (WUI-10). A package never changes once published, so a plan kept under its package is never
 * stale; the site's current version is a pointer and is never kept here. Keys name the signed-in person and
 * the project, so one account never sees a plan read for another (WUI-12). Pure, with relative imports only,
 * so the unit tests load it directly.
 */

/** How many plans one tab keeps; the oldest goes first. */
export const PLAN_MEMO_LIMIT = 8;

/** The key a package's plan is kept under, or null when nobody is signed in (nothing is kept then). */
export function planKey(userId: string | null, projectId: string, packageId: string): string | null {
	return userId ? `${userId}:${projectId}:${packageId}` : null;
}

export type PlanMemo = {
	recall(key: string | null): ProjectedSite | null;
	remember(key: string | null, site: ProjectedSite): void;
};

export function createPlanMemo(limit = PLAN_MEMO_LIMIT): PlanMemo {
	const kept = new Map<string, ProjectedSite>();
	return {
		recall(key) {
			if (key === null) return null;
			const site = kept.get(key);
			if (!site) return null;
			// The plan used last is the one kept longest.
			kept.delete(key);
			kept.set(key, site);
			return site;
		},
		remember(key, site) {
			if (key === null) return;
			kept.delete(key);
			kept.set(key, site);
			while (kept.size > limit) kept.delete(kept.keys().next().value!);
		}
	};
}

/** This tab's plans. */
export const packagePlans = createPlanMemo();
