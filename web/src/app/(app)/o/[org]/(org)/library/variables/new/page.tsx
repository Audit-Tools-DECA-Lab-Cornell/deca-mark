import type { Metadata } from "next";

import { OrgLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { orgHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "New variable" };

/** A new Organization variable, for owners and admins. */
export default async function OrgNewVariablePage({ params }: { params: Promise<{ org: string }> }) {
	const { org } = await params;
	return (
		<OrgLibraryGate address={org}>
			<LibraryNotYet
				title="New variable"
				breadcrumbs={[{ label: "Library", href: orgHref(org, "library") }, { label: "New variable" }]}
				place="organization"
			/>
		</OrgLibraryGate>
	);
}
