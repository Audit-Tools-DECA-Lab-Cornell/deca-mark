import { type ReactNode, Suspense } from "react";

import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";
import { ShellMain, ShellTabsRow } from "@/components/shell/ShellMain";
import { OrgTabs } from "@/components/shell/WorkspaceTabs";

/**
 * The organization pages: Projects · Members · Settings (Members and Settings for owners and admins). Each
 * page checks the role itself and shows its own no-access state; this layout never reads them.
 *
 * Like the project layout, it holds the one loading Suspense, so a tab switch keeps its boundary (WEB-50).
 */
export default async function OrgPagesLayout({
	children,
	params
}: Readonly<{ children: ReactNode; params: Promise<{ org: string }> }>) {
	const { org } = await params;
	return (
		<>
			<ShellTabsRow>
				<OrgTabs org={org} />
			</ShellTabsRow>
			<ShellMain afterTabs>
				<Suspense
					fallback={
						<Island flush divided={false}>
							<ScreenState kind="loading" loadingLabel="Loading the organization…" rows={4} />
						</Island>
					}>
					{children}
				</Suspense>
			</ShellMain>
		</>
	);
}
