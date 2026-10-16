import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { type AccountSummary, readAccountSummaries } from "../../auth/account-summaries";
import { useAccount } from "../../auth/provider";
import { connection } from "../../sync/config";
import { PREVIEW_ACCOUNT, useDataSource, useQueue } from "../preview";
import { useGate } from "./gate";

export type WaitingRecords = {
  /** Records on this device the server has not acknowledged. */
  count: number;
  /** The account they belong to, as the notes name it. */
  owner: string;
  /** The owner's email, when it is known, to fill in on sign-in. */
  email: string | undefined;
};

/**
 * The records waiting on this device for a signed-out account, which the welcome, sign-in and recovery
 * screens name (Mobile 23, 24, 27). Preview shows the designed five for ps2245@cornell.edu. On the
 * device they show only when an account is remembered here: the queue is scoped to that account, so the
 * count and the owner always agree. Null when nothing is waiting, and for a deleted account, whose
 * records wait for nothing (useDeletedAccount).
 */
export function useWaitingRecords(): WaitingRecords | null {
  const { mode } = useDataSource();
  const queue = useQueue();
  const { account } = useAccount();
  const { accountDeleted } = useGate();
  if (accountDeleted) return null;
  if (mode === "preview") {
    return queue.unsent > 0
      ? { count: queue.unsent, owner: PREVIEW_ACCOUNT.email, email: PREVIEW_ACCOUNT.email }
      : null;
  }
  if (!account || queue.loading || queue.unsent === 0) return null;
  return {
    count: queue.unsent,
    owner: account.email ?? "the account last signed in on this device",
    email: account.email,
  };
}

export type DeletedAccount = {
  /** The deleted account's records still on this device, or null while the queue is read. */
  count: number | null;
};

/**
 * The account the server reported deleted, when it is the one on this device: welcome and sign-in say
 * its records stay here and cannot upload. Null otherwise.
 */
export function useDeletedAccount(): DeletedAccount | null {
  const { accountDeleted } = useGate();
  const queue = useQueue();
  if (!accountDeleted) return null;
  return { count: queue.loading ? null : queue.unsent };
}

/**
 * Accounts that signed out of this device with work still here (MOB-05 step 1), from the summaries
 * written at sign-out (account-summaries), read each time the screen comes into view. The account
 * remembered here, if any, is left to `useWaitingRecords`, which counts its live queue.
 */
export function useSignedOutAccounts(): AccountSummary[] {
  const { account } = useAccount();
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const current = account?.id;
  useFocusEffect(
    useCallback(() => {
      const issuer = connection?.supabaseUrl;
      setSummaries(
        issuer ? readAccountSummaries(issuer).filter((summary) => summary.userId !== current) : [],
      );
    }, [current]),
  );
  return summaries;
}
