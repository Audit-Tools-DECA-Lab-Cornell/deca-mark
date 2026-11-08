import definition from "../../../contracts/forms/janet-inventory-v1.json";
import { parseFormDefinition } from "./definition";

/** The Inventory round's form: climate and the loose parts available, once for each zone. */
export const janetInventoryV1 = parseFormDefinition(definition);
