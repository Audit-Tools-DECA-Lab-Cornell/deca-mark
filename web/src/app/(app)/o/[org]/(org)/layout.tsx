import type { ReactNode } from "react";

import { ShellMain, ShellTabsRow } from "@/components/shell/ShellMain";
import { OrgTabs } from "@/components/shell/WorkspaceTabs";

/**
 * The organization pages: Projects · Members · Settings (Members and Settings for owners and admins). Each
 * page checks the role itself and shows its own no-access state; this layout never reads them.
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
			<ShellMain afterTabs>{children}</ShellMain>
		</>
	);
}
