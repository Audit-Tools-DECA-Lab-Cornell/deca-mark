import { Icon } from "@/components/contour/Icon";
import { Island } from "@/components/contour/Island";
import { TextLink } from "@/components/contour/TextLink";
import { TONE_TEXT } from "@/components/contour/tone";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { plural } from "@/lib/labels";
import type { Failure } from "@/lib/workspace/types";

import type { AttentionItem } from "./model";

export type AttentionIslandProps = {
	items: readonly AttentionItem[];
	/** Reads the checks needed and could not make. While any is here, "nothing needs attention" is not claimed. */
	unchecked: readonly { what: string; failure: Failure }[];
};

/**
 * What needs attention before or during collection: no site, a site without a ready map package, a blocked
 * package, no published form, a published form version that no map names yet, an unpublished draft. Each
 * item with a link takes a manager to the page that fixes it; viewers see the same list without links.
 */
export function AttentionIsland({ items, unchecked }: AttentionIslandProps) {
	return (
		<Island
			id="needs-attention"
			flush
			title="Needs attention"
			meta={items.length > 0 ? plural(items.length, "item") : undefined}
			className="scroll-mt-6">
			{items.length > 0 && (
				<ul className="divide-y divide-rule">
					{items.map(item => (
						<li
							key={item.id}
							className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-island-pad py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
							<Icon
								name={item.tone === "attention" ? "triangle-alert" : "clock"}
								size={20}
								className={`mt-0.5 shrink-0 ${TONE_TEXT[item.tone]}`}
							/>
							<div className="min-w-0">
								<p className="font-semibold text-ink">{item.title}</p>{" "}
								<p className="type-small text-ink-2">{item.detail}</p>
							</div>{" "}
							{item.action && (
								<div className="col-start-2 sm:col-start-3 sm:row-start-1 sm:text-right">
									<TextLink href={item.action.href}>{item.action.label}</TextLink>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
			{items.length === 0 && unchecked.length === 0 && (
				<div className="flex items-start gap-3 px-island-pad py-6">
					<Icon name="circle-check" size={20} className={`mt-0.5 shrink-0 ${TONE_TEXT.saved}`} />
					<div className="min-w-0">
						<p className="font-semibold text-ink">Nothing needs attention.</p>
						<p className="type-small text-ink-2">
							Every site has a ready map package that names the newest published version of its forms, a
							form is published and no draft is waiting.
						</p>
					</div>
				</div>
			)}
			{unchecked.map(entry => (
				<LoadFailure key={entry.what} failure={entry.failure} what={entry.what} bare />
			))}
		</Island>
	);
}
