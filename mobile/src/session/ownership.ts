import type { PackageBinding } from "../domain/package-binding";
import type { CaptureContext } from "../forms/capture";
/**
 * An observation belongs to the account and the site package that started it.
 *
 * Both bindings are captured when the point is placed and checked before anything is written,
 * because the provider survives a sign-out and a change of study: without them, a signed-out
 * observer's research data could be written under the next account, and an unfinished
 * instrument observation could be saved against another package's form and round context.
 */

export type ObservationIdentity = {
  readonly binding?: PackageBinding;
  readonly capture?: CaptureContext;
  readonly id: string;
  readonly startedAt: string;
  /** The account scope key in force when the observation was started. */
  readonly owner: string;
  readonly packageId: string;
  readonly packageName: string;
};

/** Why this observation may not be written under the given account and package, if it may not. */
export function ownershipProblem(
  identity: ObservationIdentity,
  account: string,
  packageId: string,
): string | null {
  if (identity.owner !== account || identity.packageId !== packageId)
    return "Your account or study changed while this observation was open. It cannot be saved here; its draft is kept for whoever started it.";
  return null;
}

/** Why another study may not be opened right now, if it may not. */
export function packageSwitchProblem(
  identity: ObservationIdentity | null,
  packageId: string,
): string | null {
  if (identity && identity.packageId !== packageId)
    return `An unfinished observation is open in ${identity.packageName}. Resume or discard it before opening another study.`;
  return null;
}

/**
 * Why a recovered draft may not be resumed under this account, if it may not.
 *
 * The account can change while a recovered draft is still held in memory — signing out of an
 * account that had one, into an account that has none, leaves the offer on screen. Resuming it
 * then would bind another observer's answers to whoever is signed in now.
 */
export function recoveryProblem(draftOwner: string, account: string): string | null {
  if (draftOwner !== account)
    return "That draft belongs to a different account. Sign back into the account that started it to resume it.";
  return null;
}

export function validateRecoveredPackage(
  draft: {
    readonly packageId: string;
    readonly siteId: string;
    readonly formVersion: string;
    readonly context: {
      readonly packageVersion: string;
      readonly zoneId: string;
      readonly roundType: string;
    };
    readonly binding?: { readonly packageSha256: string; readonly zoneId: string } | undefined;
  },
  opened: {
    readonly id: string;
    readonly siteId: string;
    readonly version: string;
    readonly formVersion: string;
    readonly inventoryFormVersion: string;
    readonly packageIdentity?: { readonly packageSha256: string };
    readonly zones: readonly {
      readonly id: string;
      readonly zoneId?: string;
      readonly label: string;
    }[];
  },
): "package_missing" | "zone_missing" | "form_missing" | null {
  if (
    opened.id !== draft.packageId ||
    opened.siteId !== draft.siteId ||
    opened.version !== draft.context.packageVersion ||
    (draft.binding && opened.packageIdentity?.packageSha256 !== draft.binding.packageSha256)
  )
    return "package_missing";
  const zone = opened.zones.find((entry) => entry.id === draft.context.zoneId);
  if (!zone || (draft.binding && zone.zoneId !== draft.binding.zoneId)) return "zone_missing";
  const form =
    draft.context.roundType === "inventory" ? opened.inventoryFormVersion : opened.formVersion;
  return form === draft.formVersion ? null : "form_missing";
}
