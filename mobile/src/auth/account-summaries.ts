import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";

/**
 * What an account left on this device when it signed out (MOB-07 step 5), so welcome can name its
 * records without opening anyone's data (MOB-05 step 1): "5 records waiting on this device for
 * name@example.org". One file per account, `documentDirectory/accounts/{userId}.json`, with the email
 * and counts only. Signing that account in again removes it: its records are in view again.
 *
 * The counts are the account's own queue at sign-out. Nothing uploads or changes an account's records
 * while it is signed out, so they stay true until it signs in again.
 */

const summarySchema = z.object({
  userId: z.uuid(),
  email: z.string().nullable(),
  issuer: z.url(),
  /** Records the server has not acknowledged: on device, needs attention and held. */
  unsent: z.number().int().nonnegative(),
  /** Of those, held for the project. */
  held: z.number().int().nonnegative(),
  /** An observation still being answered. */
  drafts: z.number().int().nonnegative(),
  signedOutAt: z.string(),
});

export type AccountSummary = z.infer<typeof summarySchema>;

function folder() {
  return new Directory(Paths.document, "accounts");
}

function summaryFile(userId: string) {
  return new File(Paths.document, "accounts", `${userId}.json`);
}

/** Writes this account's summary. A failure is reported, never thrown: sign-out goes on regardless. */
export function writeAccountSummary(summary: AccountSummary): boolean {
  try {
    const checked = summarySchema.parse(summary);
    folder().create({ intermediates: true, idempotent: true });
    summaryFile(checked.userId).write(JSON.stringify(checked));
    return true;
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}

/** The account has signed in again (or left this device): its records no longer wait unseen. */
export function removeAccountSummary(userId: string): void {
  try {
    const file = summaryFile(userId);
    if (file.exists) file.delete();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }
}

/**
 * Every signed-out account of this sign-in service with something still on this device, most recent
 * sign-out first. An unreadable file is skipped, never shown as zero.
 */
export function readAccountSummaries(issuer: string): AccountSummary[] {
  try {
    const dir = folder();
    if (!dir.exists) return [];
    const summaries: AccountSummary[] = [];
    for (const entry of dir.list()) {
      if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
      try {
        const parsed = summarySchema.safeParse(JSON.parse(entry.textSync()));
        if (!parsed.success || parsed.data.issuer !== issuer) continue;
        if (parsed.data.unsent + parsed.data.drafts === 0) continue;
        summaries.push(parsed.data);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
    }
    return summaries.sort((a, b) => b.signedOutAt.localeCompare(a.signedOutAt));
  } catch (error) {
    if (error instanceof Error) return [];
    throw error;
  }
}
