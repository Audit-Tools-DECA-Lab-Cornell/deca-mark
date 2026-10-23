import { offersRound, formForRound } from "/home/user/deca-mark/mobile/src/session/round-forms";
import { initialSyncState } from "/home/user/deca-mark/mobile/src/storage/observation-store";
import { isShellObservation, isBoundObservation } from "/home/user/deca-mark/mobile/src/domain/observation";
import { isUploadableRecord } from "/home/user/deca-mark/mobile/src/forms/registry";

test("practice garden: rounds offered and record states", () => {
  // Values copied from src/packages/bundled.ts:104-115 (const practice, id sample-garden), no projectId.
  const pkg = { formVersion: "shell-v1", inventoryFormVersion: "janet-inventory-v1" };
  for (const r of ["standard", "reliability", "inventory"] as const)
    console.log("offersRound", r, offersRound(pkg as any, r), formForRound(pkg as any, r)?.version);
  const inv = { formVersion: "janet-inventory-v1" } as any;
  console.log("unbound janet-inventory-v1: isShell", isShellObservation(inv), "bound", isBoundObservation(inv), "uploadable", isUploadableRecord(inv), "initialSyncState", initialSyncState(inv, "owner"));
  const shell = { formVersion: "shell-v1" } as any;
  console.log("unbound shell-v1: isShell", isShellObservation(shell), "initialSyncState", initialSyncState(shell, "owner"));
});
