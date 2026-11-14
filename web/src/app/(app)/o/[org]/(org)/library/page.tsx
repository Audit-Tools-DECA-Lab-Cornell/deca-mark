import type { Metadata } from "next";

import { OrgLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";

export const metadata: Metadata = { title: "Library" };

/** The organization library: Universal and Organization variables. For owners and admins (LIBRARY-UI.md section 3). */
export default async function OrgLibraryPage({ params }: { params: Promise<{ org: string }> }) {
	const { org } = await params;
	return (
		<OrgLibraryGate address={org}>
			<LibraryNotYet
				title="Library"
				lead="Variables and form templates every project in this organization can use."
				place="organization"
			/>
		</OrgLibraryGate>
	);
}
