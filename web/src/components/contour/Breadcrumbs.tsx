import Link from "next/link";

import { cx } from "@/lib/cx";

import { Icon } from "./Icon";
import { LinkPending } from "./LinkPending";

export type Crumb = {
	label: string;
	/** Where the ancestor lives. The last crumb is the current page and is never a link. */
	href?: string;
};

export type BreadcrumbsProps = {
	/** Ancestors first, the current page last: Sites › Riverside › Map packages. */
	items: Crumb[];
	className?: string;
};

/**
 * The trail above a page title, following the URL nesting (project-03, project-10). Ancestors are
 * underlined secondary-ink links; the current page is plain ink text marked aria-current.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
	if (items.length === 0) return null;

	return (
		<nav aria-label="Breadcrumb" className={className}>
			<ol className="flex flex-wrap items-center gap-x-3 gap-y-1 type-small">
				{items.map((item, index) => {
					const last = index === items.length - 1;
					return (
						<li key={`${index}:${item.label}`} className="flex items-center gap-2">
							{index > 0 && <Icon name="chevron-right" size={16} className="shrink-0 text-ink-2" />}
							{last ? (
								<span aria-current="page" className="text-ink">
									{item.label}
								</span>
							) : item.href ? (
								// The ::before box makes the 20 px line a 44 px tall target without moving the text.
								<Link
									href={item.href}
									prefetch={false}
									className={cx(
										"relative text-ink-2 underline decoration-1 underline-offset-4 hover:text-ink hover:decoration-2",
										"transition-[color] duration-(--ct-duration-quick) ease-standard",
										"before:absolute before:inset-x-0 before:-inset-y-3"
									)}>
									{item.label}
									<LinkPending />
								</Link>
							) : (
								<span className="text-ink-2">{item.label}</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
