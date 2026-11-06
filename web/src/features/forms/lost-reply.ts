import { sameDefinition } from "./model";
import type { RawDefinition } from "./raw";

/**
 * Which of the saves this page sent without hearing back is the one the draft holds now, if any (WEB-44).
 *
 * A Save whose reply was lost may have been committed. The next Save then meets a 412, because the page
 * still holds the etag from before. That 412 proves nothing by itself: another manager may have saved in
 * between. Only the stored content can say, so the page reads the draft back and compares: when it equals
 * one of the definitions this page sent, that earlier save went through. Otherwise it is someone else's
 * version, and the page keeps its wording and offers the normal conflict choice.
 *
 * A draft that is no longer a draft (published or retired meanwhile) is never reported as saved here.
 */
export function landedSave(
	stored: { readonly state: string; readonly definition: unknown },
	unconfirmed: readonly RawDefinition[]
): RawDefinition | null {
	if (stored.state !== "draft") return null;
	return unconfirmed.find(sent => sameDefinition(stored.definition, sent)) ?? null;
}
