import type { Metadata } from "next";

import { OrgLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { orgHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "New form template" };

/** A new Organization form template, for owners and admins. */
export default async function OrgNewTemplatePage({ params }: { params: Promise<{ org: string }> }) {
	const { org } = await params;
	return (
		<OrgLibraryGate address={org}>
			<LibraryNotYet
				title="New form template"
				breadcrumbs={[
					{ label: "Library", href: orgHref(org, "library") },
					{ label: "Form templates", href: orgHref(org, "library/templates") },
					{ label: "New form template" }
				]}
				place="organization"
			/>
		</OrgLibraryGate>
	);
}
