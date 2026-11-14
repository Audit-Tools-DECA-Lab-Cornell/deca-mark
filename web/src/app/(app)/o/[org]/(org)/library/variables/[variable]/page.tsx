import type { Metadata } from "next";

import { OrgLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { orgHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "Variable" };

/** One Universal or Organization variable, for owners and admins. */
export default async function OrgVariablePage({ params }: { params: Promise<{ org: string }> }) {
	const { org } = await params;
	return (
		<OrgLibraryGate address={org}>
			<LibraryNotYet
				title="Variable"
				breadcrumbs={[{ label: "Library", href: orgHref(org, "library") }, { label: "Variable" }]}
				place="organization"
			/>
		</OrgLibraryGate>
	);
}
