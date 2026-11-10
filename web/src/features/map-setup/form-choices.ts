import { isInventoryDefinition, type PublishedVersion } from "@/features/packages/forms";
import type { RawDefinition } from "@/lib/api/types";

export type SetupFormChoices = Readonly<{
	readonly observation: readonly PublishedVersion[];
	readonly inventory: readonly PublishedVersion[];
}>;

/**
 * Separates published form versions for map setup without guessing when a definition read failed.
 * An unread definition remains eligible for observations, matching the legacy package workflow, but
 * inventory requires a definition that is both readable and known to contain only zone-level questions.
 */
export function setupFormChoices(
	published: readonly PublishedVersion[],
	definitions: Readonly<Partial<Record<string, RawDefinition>>>
): SetupFormChoices {
	const inventoryCodes = new Set(
		published
			.filter(form => {
				const definition = definitions[form.code];
				return definition !== undefined && isInventoryDefinition(definition);
			})
			.map(form => form.code)
	);
	return {
		observation: published.filter(form => !inventoryCodes.has(form.code)),
		inventory: published.filter(form => inventoryCodes.has(form.code))
	};
}

/**
 * Names a selected inventory binding that cannot be offered by the loaded eligible definitions.
 * Observation choices intentionally keep their existing unread-definition behavior.
 */
export function unavailableInventoryFormCode(
	selected: string | null,
	inventoryForms: readonly Readonly<{ readonly code: string }>[]
): string | null {
	if (selected === null) return null;
	return inventoryForms.some(form => form.code === selected) ? null : selected;
}
