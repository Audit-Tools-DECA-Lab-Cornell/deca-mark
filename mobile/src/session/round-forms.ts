import type { RoundType } from "../domain/rounds";
import type { FormDefinition } from "../forms/definition";
import type { SitePackage } from "../packages/site-package";

type RoundForms = Pick<SitePackage, "forms">;

/**
 * The form a round asks: the zone inventory in an Inventory round, the site's own form otherwise. Both
 * come from the package the site was installed with; nothing is looked up in the app.
 */
export function formForRound(sitePackage: RoundForms, roundType: RoundType): FormDefinition | null {
  return roundType === "inventory" ? sitePackage.forms.inventory : sitePackage.forms.play;
}

/** Whether a site can offer a round: the package carries that round's form. */
export function offersRound(sitePackage: RoundForms, roundType: RoundType): boolean {
  return formForRound(sitePackage, roundType) !== null;
}
