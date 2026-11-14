import { type Crumb } from "@/components/contour/Breadcrumbs";
import { PageHeader } from "@/components/contour/PageHeader";
import { NotAvailable } from "@/components/shell/NotAvailable";

export type LibraryNotYetProps = {
	title: string;
	lead?: string;
	/** Ancestors first, the current page last: Library › Form templates. */
	breadcrumbs?: Crumb[];
	/** Where forms are built meanwhile: a project's own Forms tab, or each project's from the organization. */
	place: "project" | "organization";
};

/**
 * Every library page until its reads exist (WEB-61): the page's name, then one note that the library is
 * not built yet and where forms are made meanwhile. No list, no button and nothing that looks like data.
 */
export function LibraryNotYet({ title, lead, breadcrumbs, place }: LibraryNotYetProps) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title={title} lead={lead} breadcrumbs={breadcrumbs} />
			<NotAvailable
				title="The library"
				reason="Reusable variables and form templates are still being built."
				instead={
					place === "project"
						? "Until then, add questions to a form on the Forms tab."
						: "Until then, each project builds its forms on its own Forms tab."
				}
			/>
		</div>
	);
}
