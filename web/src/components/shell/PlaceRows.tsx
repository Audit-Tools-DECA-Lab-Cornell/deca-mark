import Link from "next/link";

import { Icon, type IconName } from "@/components/contour/Icon";
import { cx } from "@/lib/cx";

export type PlaceRow = { href: string; icon: IconName; title: string; detail: string };

/**
 * Ruled link rows for a flush island (ListRow, DESIGN §5): an icon in a well disc, a title and a detail line,
 * and a chevron. The whole row is the link.
 */
export function PlaceRows({ rows, label }: { rows: PlaceRow[]; label?: string }) {
	return (
		<ul aria-label={label} className="divide-y divide-rule">
			{rows.map(row => (
				<li key={row.href}>
					<Link
						href={row.href}
						prefetch={false}
						className={cx(
							"flex min-h-touch items-center gap-4 px-island-pad py-3 text-ink hover:bg-ground",
							"[--ct-size-focus-gap:calc(var(--ct-size-focus-ring)*-2)]",
							"transition-[background-color] duration-(--ct-duration-quick) ease-standard"
						)}>
						<span className="grid size-10 shrink-0 place-items-center rounded-pill bg-well text-ink">
							<Icon name={row.icon} size={18} />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block type-body font-semibold">{row.title}</span>
							<span className="block type-small text-ink-2">{row.detail}</span>
						</span>
						<Icon name="chevron-right" size={20} className="shrink-0" />
					</Link>
				</li>
			))}
		</ul>
	);
}
