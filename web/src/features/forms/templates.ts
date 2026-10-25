import "server-only";

import zoneInventory from "../../../../contracts/forms/janet-inventory-v1.json";
import behaviourMapping from "../../../../contracts/forms/janet-test-v1.json";
import type { RawDefinition } from "./raw";
import { blankDefinition, startingDefinition, TEMPLATE_IDS, type TemplateId, type TemplateInfo } from "./starter";

/**
 * The forms a new form can start from. Two ship with the product (`contracts/forms/`, the same files the
 * collector's tests read); the third is a blank form with one starter question. The definitions stay on the
 * server: the screen is sent only their names and what they ask, and the action builds the form.
 */

const SHIPPED: Record<Exclude<TemplateId, "blank">, RawDefinition> = {
	"behaviour-mapping": behaviourMapping as unknown as RawDefinition,
	"zone-inventory": zoneInventory as unknown as RawDefinition
};

const DESCRIPTION: Record<Exclude<TemplateId, "blank">, string> = {
	"behaviour-mapping":
		"The child's age range, up to two play types with their kinds of play, how intense it is, wildlife and a description of the play. Asked at each observation.",
	"zone-inventory":
		"Weather, wind and shade, then the natural and manufactured loose parts a zone has. Asked once per zone in an Inventory round."
};

const TITLE: Record<TemplateId, string> = {
	"behaviour-mapping": "Behaviour mapping",
	"zone-inventory": "Zone inventory",
	blank: "Custom"
};

export function listTemplates(): TemplateInfo[] {
	return TEMPLATE_IDS.map(id =>
		id === "blank"
			? {
					id,
					title: TITLE[id],
					description: "Create a custom form with your own questions.",
					questions: 1
				}
			: { id, title: TITLE[id], description: DESCRIPTION[id], questions: SHIPPED[id].questions.length }
	);
}

/** The first draft of a new form: the template under the form's own code and name. */
export function templateDefinition(id: TemplateId, code: string, name: string): RawDefinition {
	return id === "blank" ? blankDefinition(code, name) : startingDefinition(SHIPPED[id], code, name);
}
