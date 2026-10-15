import { useCallback } from "react";
import { removeAccountSummary, writeAccountSummary } from "../../auth/account-summaries";
import { useAccount } from "../../auth/provider";
import { connection } from "../../sync/config";
import { type LocalWork, nothingWaits } from "./leaving";

/**
 * Signs this account out of this device on purpose (MOB-07): `signOut({scope: "local"})`, which clears
 * the session here even offline. When work is left, the account's summary is written first (email and
 * counts, step 5), so welcome can say what waits for it (MOB-05). Nothing on the device is removed: the
 * records wait here for this account. `null` work (the queue could not be read) writes no summary.
 * Resolves false, writing nothing, when the sign-out did not finish.
 */
export function useSignOutHere(): (work: LocalWork | null) => Promise<boolean> {
  const { account, signOut } = useAccount();
  return useCallback(
    async (work: LocalWork | null) => {
      if (!account) return true;
      const issuer = connection?.supabaseUrl;
      const summarised =
        issuer !== undefined &&
        work !== null &&
        !nothingWaits(work) &&
        writeAccountSummary({
          userId: account.id,
          email: account.email ?? null,
          issuer,
          unsent: work.unsent,
          held: work.held,
          drafts: work.drafts,
          signedOutAt: new Date().toISOString(),
        });
      const { error } = await signOut();
      if (error && summarised) removeAccountSummary(account.id);
      return error === null;
    },
    [account, signOut],
  );
}
