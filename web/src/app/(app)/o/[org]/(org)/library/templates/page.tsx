import type { Metadata } from "next";

import { OrgLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { orgHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "Form templates" };

/** Universal and Organization form templates, for owners and admins. */
export default async function OrgTemplatesPage({ params }: { params: Promise<{ org: string }> }) {
	const { org } = await params;
	return (
		<OrgLibraryGate address={org}>
			<LibraryNotYet
				title="Form templates"
				breadcrumbs={[{ label: "Library", href: orgHref(org, "library") }, { label: "Form templates" }]}
				place="organization"
			/>
		</OrgLibraryGate>
	);
}
